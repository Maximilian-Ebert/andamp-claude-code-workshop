// Server-only: AWS clients must never reach the browser bundle.
if ('window' in globalThis) {
  throw new Error(
    '@shared/lib/aws is server-only and must not run in the browser.',
  );
}

import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// LocalStack — and Lambdas running inside it — expose AWS_ENDPOINT_URL; real AWS
// does not, so its presence is what switches us to local emulation.
const endpoint = process.env.AWS_ENDPOINT_URL;
const isLocal = Boolean(endpoint);
const region = process.env.AWS_REGION ?? 'eu-central-1';

function baseConfig() {
  // Real AWS: region only — the SDK's default credential chain (IAM role) applies.
  // LocalStack: override endpoint + dummy creds it accepts.
  return isLocal
    ? {
        region,
        endpoint,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      }
    : { region };
}

let s3: S3Client | undefined;
export function s3Client(): S3Client {
  // forcePathStyle: LocalStack can't resolve virtual-host bucket subdomains on localhost.
  s3 ??= new S3Client({ ...baseConfig(), forcePathStyle: isLocal });
  return s3;
}

let sqs: SQSClient | undefined;
export function sqsClient(): SQSClient {
  sqs ??= new SQSClient(baseConfig());
  return sqs;
}

let ddb: DynamoDBDocumentClient | undefined;
export function dynamoDocClient(): DynamoDBDocumentClient {
  ddb ??= DynamoDBDocumentClient.from(new DynamoDBClient(baseConfig()));
  return ddb;
}

let secrets: SecretsManagerClient | undefined;
export function secretsManagerClient(): SecretsManagerClient {
  secrets ??= new SecretsManagerClient(baseConfig());
  return secrets;
}
