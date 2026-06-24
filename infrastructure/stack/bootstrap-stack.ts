import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

export type BootstrapStackProps = cdk.StackProps;

export class BootstrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: BootstrapStackProps) {
    super(scope, id, props);
  }
}
