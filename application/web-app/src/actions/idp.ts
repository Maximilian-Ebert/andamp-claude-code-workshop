import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { findUser, isValidPassword } from '@data';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@lib';

export const login = defineAction({
  accept: 'form',
  input: z.object({
    email: z.email('Enter a valid email address.').trim(),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
  }),
  handler: async ({ email, password }, { cookies }) => {
    const user = await findUser(email);

    const isInavlid = !user || !isValidPassword(password, user.passwordHash);
    if (isInavlid) {
      throw new ActionError({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password.',
      });
    }

    const token = await createSessionToken({
      email: user.email,
      name: user.name,
    });
    cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

    return { name: user.name };
  },
});

export const logout = defineAction({
  accept: 'form',
  handler: async (_input, { cookies }) => {
    cookies.delete(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  },
});
