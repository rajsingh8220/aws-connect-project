import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ConnectStack } from '../lib/stacks/connect-stack';

describe('ConnectStack', () => {
  test('synthesizes DynamoDB table and business Lambdas', () => {
    const app = new cdk.App();
    const stack = new ConnectStack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.resourceCountIs('AWS::Lambda::Function', 4);
    template.resourceCountIs('AWS::Connect::IntegrationAssociation', 2);
    template.resourceCountIs('AWS::Connect::ContactFlow', 1);
  });
});
