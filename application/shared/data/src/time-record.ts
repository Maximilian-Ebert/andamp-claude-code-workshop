import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
  const result = await dynamoDocClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'userEmail = :email',
      ExpressionAttributeValues: { ':email': normalizeEmail(email) },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );

  const latest = result.Items?.[0] as TimeRecord | undefined;
  return latest && !latest.endedAt ? latest : undefined;
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
