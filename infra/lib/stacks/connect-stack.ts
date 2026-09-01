import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PROJECT_CONFIG } from '../config/project-config';
import { BusinessLambdasConstruct } from '../constructs/business-lambdas.construct';
import { ConnectInstanceConstruct } from '../constructs/connect-instance.construct';
import { ConnectLambdaRegistrationConstruct } from '../constructs/connect-lambda-registration.construct';
import { ContactFlowConstruct } from '../constructs/contact-flow.construct';
import { PhoneAssociationConstruct } from '../constructs/phone-association.construct';
import { PhoneNumberConstruct } from '../constructs/phone-number.construct';

export class ConnectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const instanceAlias = `${PROJECT_CONFIG.connect.instanceAliasPrefix}-${this.account}`;

    const connectInstance = new ConnectInstanceConstruct(this, 'Connect', {
      instanceAlias,
    });

    const businessLambdas = new BusinessLambdasConstruct(this, 'BusinessLambdas', {
      connectInstanceArn: connectInstance.instanceArn,
      apiBaseUrl: PROJECT_CONFIG.api.baseUrl,
    });

    const lambdaRegistration = new ConnectLambdaRegistrationConstruct(this, 'LambdaRegistration', {
      instanceArn: connectInstance.instanceArn,
      functionArns: [
        businessLambdas.accountLookupFunction.functionArn,
        businessLambdas.vanityNumberFunction.functionArn,
      ],
    });
    lambdaRegistration.registrations.forEach((registration) => {
      registration.addDependency(connectInstance.instance);
      registration.addDependency(
        businessLambdas.accountLookupFunction.node.defaultChild as cdk.CfnResource,
      );
      registration.addDependency(
        businessLambdas.vanityNumberFunction.node.defaultChild as cdk.CfnResource,
      );
    });

    const contactFlow = new ContactFlowConstruct(this, 'InboundFlow', {
      instanceArn: connectInstance.instanceArn,
      name: PROJECT_CONFIG.connect.contactFlowName,
      flowFileName: PROJECT_CONFIG.connect.contactFlowFile,
      description: 'TTEC Acme Financial inbound flow',
      templateVariables: {
        accountLookupLambdaArn: businessLambdas.accountLookupFunction.functionArn,
        vanityNumberLambdaArn: businessLambdas.vanityNumberFunction.functionArn,
      },
    });
    contactFlow.contactFlow.addDependency(connectInstance.instance);
    lambdaRegistration.registrations.forEach((registration) => {
      contactFlow.contactFlow.addDependency(registration);
    });

    const phoneNumber = new PhoneNumberConstruct(this, 'InboundDid', {
      instanceId: connectInstance.instanceId,
      instanceArn: connectInstance.instanceArn,
      countryCode: PROJECT_CONFIG.connect.phoneCountryCode,
      prefix: PROJECT_CONFIG.connect.phoneNumberPrefix,
    });
    phoneNumber.claimResource.addDependency(connectInstance.instance);

    new PhoneAssociationConstruct(this, 'PhoneAssociation', {
      instanceId: connectInstance.instanceId,
      phoneNumberId: phoneNumber.claimResource.getAtt('PhoneNumberId').toString(),
      contactFlowId: contactFlow.contactFlowId,
    });

    new cdk.CfnOutput(this, 'ConnectInstanceArn', {
      value: connectInstance.instanceArn,
      description: 'Amazon Connect instance ARN',
    });

    new cdk.CfnOutput(this, 'ConnectInstanceAlias', {
      value: instanceAlias,
      description: 'Amazon Connect instance alias',
    });

    new cdk.CfnOutput(this, 'ContactFlowArn', {
      value: contactFlow.contactFlowArn,
      description: 'Inbound contact flow ARN',
    });

    new cdk.CfnOutput(this, 'InboundPhoneNumber', {
      value: phoneNumber.phoneNumberAddress,
      description: 'Dial this DID to reach the contact flow',
    });

    new cdk.CfnOutput(this, 'AccountLookupLambdaArn', {
      value: businessLambdas.accountLookupFunction.functionArn,
      description: 'Lambda ARN for account lookup',
    });

    new cdk.CfnOutput(this, 'VanityNumberLambdaArn', {
      value: businessLambdas.vanityNumberFunction.functionArn,
      description: 'Lambda ARN for vanity number generation',
    });

    new cdk.CfnOutput(this, 'VanityNumbersTableName', {
      value: businessLambdas.vanityTable.tableName,
      description: 'DynamoDB table storing top vanity numbers per caller',
    });
  }
}
