import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, verifySessionToken } from '@lib';

const PROTECTED_PREFIXES = ['/dashboard'];

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) {
    return next();
  }

  const token = context.cookies.get(SESSION_COOKIE)?.value;
  context.locals.user = token
    ? ((await verifySessionToken(token)) ?? undefined)
    : undefined;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    context.url.pathname.startsWith(prefix),
  );
  if (isProtected && !context.locals.user) {
    return context.redirect('/login');
  }

  return next();
});
