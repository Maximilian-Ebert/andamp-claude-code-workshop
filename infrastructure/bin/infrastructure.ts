#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ApplicationStack } from '../stack/application-stack';
import { BootstrapStack } from '../stack/bootstrap-stack';

const app = new cdk.App();

const isLocal = app.node.tryGetContext('localstack') === 'true';

new ApplicationStack(app, 'ApplicationStack', { isLocal });

const isDeployingToRealAws = !isLocal;
if (isDeployingToRealAws) {
  new BootstrapStack(app, 'BootstrapStack');
}
