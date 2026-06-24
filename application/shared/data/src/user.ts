import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocClient } from '@lib';

export type User = {
  email: string;
  name: string;
  passwordHash: string;
};

export type NewUser = {
  email: string;
  name: string;
  password: string;
};

function tableName(): string {
  const name = process.env.USER_TABLE_NAME;
  if (!name) {
    throw new Error('USER_TABLE_NAME is not set');
  }
  return name;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);

  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function isValidPassword(
  password: string,
  passwordHash: string,
): boolean {
  const [saltHex, derivedHex] = passwordHash.split(':');
  if (!saltHex || !derivedHex) {
    return false;
  }

  const expected = Buffer.from(derivedHex, 'hex');
  const actual = scryptSync(
    password,
    Buffer.from(saltHex, 'hex'),
    expected.length,
  );

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function findUser(email: string): Promise<User | undefined> {
  const result = await dynamoDocClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { email: normalizeEmail(email) },
    }),
  );

  return result.Item as User | undefined;
}

export async function createUser(input: NewUser): Promise<User> {
  const user: User = {
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    passwordHash: hashPassword(input.password),
  };

  await dynamoDocClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: user,
      ConditionExpression: 'attribute_not_exists(email)',
    }),
  );

  return user;
}
