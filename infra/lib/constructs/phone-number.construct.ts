import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { projectPath } from '../utils/project-paths';

export interface PhoneNumberConstructProps {
  readonly instanceId: string;
  readonly instanceArn: string;
  readonly countryCode: string;
  readonly description?: string;
  readonly prefix?: string;
}

/**
 * Claims an available Connect phone number using search + claim APIs so deploys
 * can recover when CloudFormation's first random pick is unavailable.
 */
export class PhoneNumberConstruct extends Construct {
  readonly phoneNumberAddress: string;
  readonly phoneNumberArn: string;
  readonly claimResource: cdk.CfnResource;

  constructor(scope: Construct, id: string, props: PhoneNumberConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'connect:SearchAvailablePhoneNumbers',
          'connect:ClaimPhoneNumber',
          'connect:ReleasePhoneNumber',
        ],
        resources: ['*'],
      }),
    );

    const claimFunction = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(projectPath('lambda/phone-claim')),
      role,
      timeout: cdk.Duration.seconds(120),
    });

    claimFunction.addPermission('CloudFormationInvoke', {
      principal: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    this.claimResource = new cdk.CfnResource(this, 'Claim', {
      type: 'Custom::ConnectPhoneClaim',
      properties: {
        ServiceToken: claimFunction.functionArn,
        InstanceId: props.instanceId,
        InstanceArn: props.instanceArn,
        CountryCode: props.countryCode,
        PhoneNumberType: 'DID',
        Prefix: props.prefix ?? '',
        Description: props.description ?? 'Inbound DID for TTEC contact flow',
      },
    });

    this.phoneNumberAddress = this.claimResource.getAtt('PhoneNumber').toString();
    this.phoneNumberArn = this.claimResource.getAtt('PhoneNumberArn').toString();
  }
}
