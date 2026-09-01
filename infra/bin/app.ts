#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ConnectStack } from '../lib/stacks/connect-stack';

const app = new cdk.App();

new ConnectStack(app, 'TtecConnectStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'TTEC Acme Financial - Amazon Connect, Lambdas, and contact flow',
});
