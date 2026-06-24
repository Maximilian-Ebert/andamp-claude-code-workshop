import { defineAction, ActionError } from 'astro:actions';
import {
  findActiveTimeRecord,
  startTimeRecord,
  pauseTimeRecord,
  resumeTimeRecord,
  stopTimeRecord,
  type TimeRecord,
} from '@data';

function requireEmail(locals: App.Locals): string {
  const email = locals.user?.email;
  if (!email) {
    throw new ActionError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to track time.',
    });
  }
  return email;
}

async function requireActive(email: string): Promise<TimeRecord> {
  const record = await findActiveTimeRecord(email);
  if (!record) {
    throw new ActionError({
      code: 'NOT_FOUND',
      message: 'No stopwatch is currently running.',
    });
  }
  return record;
}

export const startStopwatch = defineAction({
  handler: async (_input, { locals }) => {
    const email = requireEmail(locals);
    return startTimeRecord(email);
  },
});

export const pauseStopwatch = defineAction({
  handler: async (_input, { locals }) => {
    const email = requireEmail(locals);
    const record = await requireActive(email);
    return pauseTimeRecord(record);
  },
});

export const resumeStopwatch = defineAction({
  handler: async (_input, { locals }) => {
    const email = requireEmail(locals);
    const record = await requireActive(email);
    return resumeTimeRecord(record);
  },
});

export const stopStopwatch = defineAction({
  handler: async (_input, { locals }) => {
    const email = requireEmail(locals);
    const record = await requireActive(email);
    return stopTimeRecord(record);
  },
});
