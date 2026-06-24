import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const serverBundleDir = path.resolve(
  __dirname,
  '../../application/web-app/dist/lambda',
);
const astroNodeAdapterHandler = 'server/index.handler';

export interface AstroServerProps {
  readonly userTable: dynamodb.Table;
  readonly timeRecordTable: dynamodb.Table;
  readonly bucket: s3.Bucket;
  readonly jwtSecret: secretsmanager.ISecret;
}

export class AstroServer extends Construct {
  readonly fn: lambda.Function;

  constructor(scope: Construct, id: string, props: AstroServerProps) {
    super(scope, id);
    const { userTable, timeRecordTable, bucket, jwtSecret } = props;

    this.fn = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: astroNodeAdapterHandler,
      code: lambda.Code.fromAsset(serverBundleDir),
      environment: {
        USER_TABLE_NAME: userTable.tableName,
        TIME_RECORD_TABLE_NAME: timeRecordTable.tableName,
        BUCKET: bucket.bucketName,
        JWT_SECRET_ARN: jwtSecret.secretArn,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    userTable.grantReadWriteData(this.fn);
    timeRecordTable.grantReadWriteData(this.fn);
    bucket.grantRead(this.fn);
    jwtSecret.grantRead(this.fn);
  }
}
