import type { APIRoute } from 'astro';
import { greet } from '@lib';
import { regions } from '@data';

// Prerendered at build time (server-side) — shared code stays off the client.
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ regions, message: greet(regions[0]) }), {
    headers: { 'Content-Type': 'application/json' },
  });
