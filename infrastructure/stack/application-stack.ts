import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { StaticAssets } from '../component/static-assets';
import { UserTable } from '../component/user-table';
import { TimeRecordTable } from '../component/time-record-table';
import { AuthSecret } from '../component/auth-secret';
import { AstroServer } from '../component/astro-server';
import { ApiFront } from '../component/api-front';

export interface ApplicationStackProps extends cdk.StackProps {
  readonly isLocal: boolean;
}

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);
    const { isLocal } = props;

    const assets = new StaticAssets(this, 'StaticAssets', { isLocal });
    const users = new UserTable(this, 'Users', { isLocal });
    const timeRecords = new TimeRecordTable(this, 'TimeRecords', { isLocal });
    const auth = new AuthSecret(this, 'Auth', { isLocal });

    const astroServer = new AstroServer(this, 'AstroServer', {
      userTable: users.table,
      timeRecordTable: timeRecords.table,
      bucket: assets.bucket,
      jwtSecret: auth.secret,
    });

    const front = new ApiFront(this, 'Front', {
      isLocal,
      bucket: assets.bucket,
      astroServer: astroServer.fn,
    });

    new cdk.CfnOutput(this, 'APIGatewayURL', { value: front.url });
    new cdk.CfnOutput(this, 'UserTableName', { value: users.table.tableName });
    new cdk.CfnOutput(this, 'TimeRecordTableName', {
      value: timeRecords.table.tableName,
    });
    new cdk.CfnOutput(this, 'BucketName', { value: assets.bucket.bucketName });
    new cdk.CfnOutput(this, 'JwtSecretArn', { value: auth.secret.secretArn });
  }
}
