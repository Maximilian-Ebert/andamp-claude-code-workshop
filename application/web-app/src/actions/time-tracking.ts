import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import {
  findActiveTimeRecord,
  findCompletedTimeRecords,
  startTimeRecord,
  pauseTimeRecord,
  resumeTimeRecord,
  stopTimeRecord,
  updateTimeRecord,
  deleteTimeRecord,
  TimeRecordError,
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

const editSchema = z
  .object({
    originalStartedAt: z.iso.datetime(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    pauses: z.array(
      z.object({
        startedAt: z.iso.datetime(),
        endedAt: z.iso.datetime(),
      }),
    ),
  })
  .superRefine((value, ctx) => {
    const start = Date.parse(value.startedAt);
    const end = Date.parse(value.endedAt);

    if (end <= start) {
      ctx.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'End must be after start.',
      });
    }

    value.pauses.forEach((pause, index) => {
      const pauseStart = Date.parse(pause.startedAt);
      const pauseEnd = Date.parse(pause.endedAt);

      if (pauseStart < start) {
        ctx.addIssue({
          code: 'custom',
          path: ['pauses', index, 'startedAt'],
          message: 'Pause starts before the entry.',
        });
      }

      if (pauseEnd > end) {
        ctx.addIssue({
          code: 'custom',
          path: ['pauses', index, 'endedAt'],
          message: 'Pause ends after the entry.',
        });
      }

      if (pauseEnd <= pauseStart) {
        ctx.addIssue({
          code: 'custom',
          path: ['pauses', index, 'endedAt'],
          message: 'Pause end must be after its start.',
        });
      }

      const previous = value.pauses[index - 1];
      if (previous && Date.parse(previous.endedAt) > pauseStart) {
        ctx.addIssue({
          code: 'custom',
          path: ['pauses', index, 'startedAt'],
          message: 'Pauses must not overlap.',
        });
      }
    });
  });

export const listPastEntries = defineAction({
  handler: async (_input, { locals }) => {
    const email = requireEmail(locals);
    return findCompletedTimeRecords(email);
  },
});

export const saveTimeRecordEdit = defineAction({
  input: editSchema,
  handler: async (
    { originalStartedAt, startedAt, endedAt, pauses },
    { locals },
  ) => {
    const email = requireEmail(locals);
    const changes = { startedAt, endedAt, pauses };

    try {
      return await updateTimeRecord(email, originalStartedAt, changes);
    } catch (error) {
      if (error instanceof TimeRecordError) {
        throw new ActionError({ code: error.code, message: error.message });
      }
      throw error;
    }
  },
});

export const deleteTimeRecordEntry = defineAction({
  input: z.object({ startedAt: z.iso.datetime() }),
  handler: async ({ startedAt }, { locals }) => {
    const email = requireEmail(locals);

    try {
      await deleteTimeRecord(email, startedAt);
      return { ok: true };
    } catch (error) {
      if (error instanceof TimeRecordError) {
        throw new ActionError({ code: error.code, message: error.message });
      }
      throw error;
    }
  },
});

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
