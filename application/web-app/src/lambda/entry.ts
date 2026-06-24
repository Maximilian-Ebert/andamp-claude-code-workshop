// TODO(adapter): replace this @astrojs/node middleware-mode bridge with a custom
// Astro adapter that uses `astro/app`'s `App.render(Request): Response` directly.
// That drops the Node-http shimming below (toNodeRequest / CapturingResponse) in
// favour of web-standard Request/Response and likely lets the SSR Lambda stop
// shipping client/. Reverses ADR 0006's "node + bridge" sub-decision, so land a
// proposed ADR first. Run /refactor-astro-adapter to scope/execute.
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Handler,
} from 'aws-lambda';
import { Readable, Writable } from 'node:stream';
// Built by `astro build` (Node adapter, middleware mode). Resolved at bundle time.
import { handler as astroHandler } from '../../dist/server/entry.mjs';

type ConnectMiddleware = (
  req: unknown,
  res: unknown,
  next: (err?: unknown) => void,
) => void;

// REST API (payload v1) event → a minimal Node IncomingMessage that Astro's
// `createRequest` understands (it reads method/url/headers/socket + the body stream).
function toNodeRequest(event: APIGatewayProxyEvent): Readable {
  const headers: Record<string, string> = {};
  // multiValueHeaders is the complete view; fall back to single-valued headers.
  if (event.multiValueHeaders) {
    for (const [key, values] of Object.entries(event.multiValueHeaders)) {
      if (values) headers[key.toLowerCase()] = values.join(', ');
    }
  } else {
    for (const [key, value] of Object.entries(event.headers ?? {})) {
      if (value !== undefined) headers[key.toLowerCase()] = value;
    }
  }

  // Rebuild the query string from the (multi-valued) parameters REST API parsed out.
  const params = new URLSearchParams();
  if (event.multiValueQueryStringParameters) {
    for (const [key, values] of Object.entries(
      event.multiValueQueryStringParameters,
    )) {
      for (const value of values ?? []) params.append(key, value);
    }
  } else if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined) params.append(key, value);
    }
  }
  const query = params.toString();
  const url = `${event.path}${query ? `?${query}` : ''}`;

  const body =
    event.body === null
      ? undefined
      : Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');

  const req = Readable.from(body ? [body] : []);
  return Object.assign(req, {
    method: event.httpMethod,
    url,
    headers,
    socket: {
      remoteAddress: event.requestContext?.identity?.sourceIp,
      encrypted: false,
    },
  });
}

type Captured = {
  statusCode: number;
  headers: Record<string, number | string | string[]>;
  body: Buffer;
};

// Minimal ServerResponse: Astro's `writeResponse` only needs writeHead + a Writable.
class CapturingResponse extends Writable {
  statusCode = 200;
  statusMessage = '';
  headersSent = false;
  #headers: Record<string, number | string | string[]> = {};
  #chunks: Buffer[] = [];
  readonly done: Promise<Captured>;
  #resolve!: (value: Captured) => void;

  constructor() {
    super();
    this.done = new Promise<Captured>((resolve) => {
      this.#resolve = resolve;
    });
    this.on('finish', () => {
      this.#resolve({
        statusCode: this.statusCode,
        headers: this.#headers,
        body: Buffer.concat(this.#chunks),
      });
    });
  }

  writeHead(
    status: number,
    headers?: Record<string, number | string | string[]>,
  ): this {
    this.statusCode = status;
    this.headersSent = true;
    if (headers) this.#headers = headers;
    return this;
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.#chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }
}

function toResult(captured: Captured): APIGatewayProxyResult {
  const headers: Record<string, string> = {};
  const multiValueHeaders: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(captured.headers)) {
    // Multi-valued headers (e.g. several Set-Cookie) go in multiValueHeaders.
    if (Array.isArray(value)) {
      multiValueHeaders[key] = value.map(String);
    } else {
      headers[key] = String(value);
    }
  }
  // base64 body + isBase64Encoded handles text and binary uniformly (the API has
  // `binaryMediaTypes: ['*/*']`, so API Gateway decodes it back to bytes).
  return {
    statusCode: captured.statusCode,
    headers,
    multiValueHeaders,
    body: captured.body.toString('base64'),
    isBase64Encoded: true,
  };
}

export const handler: Handler<
  APIGatewayProxyEvent,
  APIGatewayProxyResult
> = async (event) => {
  const req = toNodeRequest(event);
  const res = new CapturingResponse();
  (astroHandler as unknown as ConnectMiddleware)(req, res, (err) => {
    if (!res.headersSent) {
      res.writeHead(err ? 500 : 404, { 'content-type': 'text/plain' });
      res.end(err ? 'Internal Server Error' : 'Not Found');
    }
  });
  return toResult(await res.done);
};
