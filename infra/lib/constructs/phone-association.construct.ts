import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { projectPath } from '../utils/project-paths';

export interface PhoneAssociationConstructProps {
  readonly instanceId: string;
  readonly phoneNumberId: string;
  readonly contactFlowId: string;
}

/**
 * CloudFormation has no native resource to associate a phone number with a
 * contact flow. This construct deploys a small custom-resource Lambda.
 */
export class PhoneAssociationConstruct extends Construct {
  constructor(scope: Construct, id: string, props: PhoneAssociationConstructProps) {
    super(scope, id);

    const associateRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    associateRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'connect:AssociatePhoneNumberContactFlow',
          'connect:DisassociatePhoneNumberContactFlow',
        ],
        resources: ['*'],
      }),
    );

    const associateFunction = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(projectPath('lambda/phone-associate')),
      role: associateRole,
      timeout: cdk.Duration.seconds(120),
    });

    associateFunction.addPermission('CloudFormationInvoke', {
      principal: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    const association = new cdk.CfnResource(this, 'Association', {
      type: 'Custom::AssociatePhoneWithFlow',
      properties: {
        ServiceToken: associateFunction.functionArn,
        InstanceId: props.instanceId,
        PhoneNumberId: props.phoneNumberId,
        ContactFlowId: props.contactFlowId,
      },
    });
    association.node.addDependency(associateFunction.node.defaultChild as cdk.CfnResource);
  }
}
