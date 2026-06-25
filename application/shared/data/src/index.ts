// @shared is server-only: it must never be bundled into client/browser code.
if ('window' in globalThis) {
  throw new Error(
    '@shared/data is server-only and must not run in the browser.',
  );
}

export const regions = ['eu-central-1', 'eu-west-1'] as const;

export type Region = (typeof regions)[number];

export {
  type User,
  type NewUser,
  findUser,
  createUser,
  isValidPassword,
} from './user';
export {
  type Pause,
  type TimeRecord,
  type TimeRecordChanges,
  type TimeRecordErrorCode,
  TimeRecordError,
  findActiveTimeRecord,
  findCompletedTimeRecords,
  updateTimeRecord,
  deleteTimeRecord,
  startTimeRecord,
  pauseTimeRecord,
  resumeTimeRecord,
  stopTimeRecord,
} from './time-record';
