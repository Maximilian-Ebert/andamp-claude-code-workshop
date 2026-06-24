import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SignJWT, jwtVerify } from 'jose';
import { secretsManagerClient } from './aws';

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const ALG = 'HS256';
const EXPIRES_IN = '7d';

export type SessionUser = {
  email: string;
  name: string;
};

let keyPromise: Promise<Uint8Array> | undefined;
function signingKey(): Promise<Uint8Array> {
  keyPromise ??= (async () => {
    const secretId = process.env.JWT_SECRET_ARN;
    if (!secretId) {
      throw new Error('JWT_SECRET_ARN is not set');
    }
    const result = await secretsManagerClient().send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    if (!result.SecretString) {
      throw new Error('JWT signing secret has no SecretString');
    }
    return new TextEncoder().encode(result.SecretString);
  })();
  return keyPromise;
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.email)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(await signingKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, await signingKey(), {
      algorithms: [ALG],
    });
    if (typeof payload.sub !== 'string' || typeof payload.name !== 'string') {
      return null;
    }
    return { email: payload.sub, name: payload.name };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: !process.env.AWS_ENDPOINT_URL,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  } as const;
}
