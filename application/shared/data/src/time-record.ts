import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDocClient } from '@lib';

export type Pause = {
  startedAt: string;
  endedAt?: string;
};

export type TimeRecord = {
  userEmail: string;
  startedAt: string;
  endedAt?: string;
  pauses: Pause[];
};

export type TimeRecordChanges = {
  startedAt: string;
  endedAt: string;
  pauses: Pause[];
};

export type TimeRecordErrorCode = 'NOT_FOUND' | 'CONFLICT';

export class TimeRecordError extends Error {
  readonly code: TimeRecordErrorCode;

  constructor(code: TimeRecordErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'TimeRecordError';
  }
}

function tableName(): string {
  const name = process.env.TIME_RECORD_TABLE_NAME;
  if (!name) {
    throw new Error('TIME_RECORD_TABLE_NAME is not set');
  }
  return name;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function nowIso(): string {
  return new Date().toISOString();
}

function openPause(record: TimeRecord): Pause | undefined {
  const last = record.pauses.at(-1);
  return last && !last.endedAt ? last : undefined;
}

async function save(record: TimeRecord): Promise<TimeRecord> {
  await dynamoDocClient().send(
    new PutCommand({ TableName: tableName(), Item: record }),
  );

  return record;
}

export async function findActiveTimeRecord(
  email: string,
): Promise<TimeRecord | undefined> {
  // Find the unfinished record directly: a past entry edited to a future
  // startedAt can sort newer, so "newest by sort key" is not reliable here.
  const result = await dynamoDocClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'userEmail = :email',
      FilterExpression: 'attribute_not_exists(endedAt)',
      ExpressionAttributeValues: { ':email': normalizeEmail(email) },
      ScanIndexForward: false,
    }),
  );

  return result.Items?.[0] as TimeRecord | undefined;
}

export async function findCompletedTimeRecords(
  email: string,
): Promise<TimeRecord[]> {
  const result = await dynamoDocClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'userEmail = :email',
      FilterExpression: 'attribute_exists(endedAt)',
      ExpressionAttributeValues: { ':email': normalizeEmail(email) },
      ScanIndexForward: false,
    }),
  );

  return (result.Items ?? []) as TimeRecord[];
}

async function getTimeRecord(
  owner: string,
  startedAt: string,
): Promise<TimeRecord | undefined> {
  const result = await dynamoDocClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { userEmail: owner, startedAt },
    }),
  );

  return result.Item as TimeRecord | undefined;
}

function isTransactionCancelled(error: unknown): boolean {
  return (
    error instanceof Error && error.name === 'TransactionCanceledException'
  );
}

// startedAt is the sort key, so changing it must atomically delete the old
// row and create the new one — never two rows, never a gap.
async function replaceTimeRecord(
  owner: string,
  originalStartedAt: string,
  updated: TimeRecord,
): Promise<void> {
  try {
    await dynamoDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName(),
              Item: updated,
              ConditionExpression: 'attribute_not_exists(startedAt)',
            },
          },
          {
            Delete: {
              TableName: tableName(),
              Key: { userEmail: owner, startedAt: originalStartedAt },
            },
          },
        ],
      }),
    );
  } catch (error) {
    if (isTransactionCancelled(error)) {
      throw new TimeRecordError(
        'CONFLICT',
        'Another entry already starts at that time.',
      );
    }
    throw error;
  }
}

export async function updateTimeRecord(
  email: string,
  originalStartedAt: string,
  changes: TimeRecordChanges,
): Promise<TimeRecord> {
  const owner = normalizeEmail(email);

  const existing = await getTimeRecord(owner, originalStartedAt);
  if (!existing) {
    throw new TimeRecordError('NOT_FOUND', 'Time entry not found.');
  }
  if (!existing.endedAt) {
    throw new TimeRecordError(
      'CONFLICT',
      'The running entry cannot be edited from the history.',
    );
  }

  // findActiveTimeRecord relies on the running entry having the newest
  // startedAt; a past entry must never be moved to or past it.
  const active = await findActiveTimeRecord(owner);
  if (active && changes.startedAt >= active.startedAt) {
    throw new TimeRecordError(
      'CONFLICT',
      'Start time must stay before the running entry.',
    );
  }

  const updated: TimeRecord = { userEmail: owner, ...changes };

  if (changes.startedAt === originalStartedAt) {
    return save(updated);
  }

  await replaceTimeRecord(owner, originalStartedAt, updated);
  return updated;
}

export async function deleteTimeRecord(
  email: string,
  startedAt: string,
): Promise<void> {
  const owner = normalizeEmail(email);

  const existing = await getTimeRecord(owner, startedAt);
  if (!existing) {
    throw new TimeRecordError('NOT_FOUND', 'Time entry not found.');
  }
  if (!existing.endedAt) {
    throw new TimeRecordError(
      'CONFLICT',
      'The running entry cannot be deleted from the history.',
    );
  }

  await dynamoDocClient().send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { userEmail: owner, startedAt },
    }),
  );
}

export async function startTimeRecord(email: string): Promise<TimeRecord> {
  const record: TimeRecord = {
    userEmail: normalizeEmail(email),
    startedAt: nowIso(),
    pauses: [],
  };

  return save(record);
}

export async function pauseTimeRecord(record: TimeRecord): Promise<TimeRecord> {
  if (!openPause(record)) {
    record.pauses.push({ startedAt: nowIso() });
  }

  return save(record);
}

export async function resumeTimeRecord(
  record: TimeRecord,
): Promise<TimeRecord> {
  const pause = openPause(record);
  if (pause) {
    pause.endedAt = nowIso();
  }

  return save(record);
}

export async function stopTimeRecord(record: TimeRecord): Promise<TimeRecord> {
  const pause = openPause(record);
  if (pause) {
    pause.endedAt = nowIso();
  }
  record.endedAt = nowIso();

  return save(record);
}
