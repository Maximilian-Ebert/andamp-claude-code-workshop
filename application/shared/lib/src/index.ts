// @shared is server-only: it must never be bundled into client/browser code.
if ('window' in globalThis) {
  throw new Error(
    '@shared/lib is server-only and must not run in the browser.',
  );
}

export function greet(region: string): string {
  return `Hello from time-tracking-app, region ${region}`;
}

export { s3Client, sqsClient, dynamoDocClient } from './aws';
export {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionUser,
  createSessionToken,
  verifySessionToken,
  sessionCookieOptions,
} from './auth';
