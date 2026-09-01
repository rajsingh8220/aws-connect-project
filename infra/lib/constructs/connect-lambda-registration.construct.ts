import * as connect from 'aws-cdk-lib/aws-connect';
import { Construct } from 'constructs';

export interface ConnectLambdaRegistrationConstructProps {
  readonly instanceArn: string;
  readonly functionArns: string[];
}

/** Registers Lambda functions with Connect using native CloudFormation integration associations. */
export class ConnectLambdaRegistrationConstruct extends Construct {
  readonly registrations: connect.CfnIntegrationAssociation[];

  constructor(scope: Construct, id: string, props: ConnectLambdaRegistrationConstructProps) {
    super(scope, id);

    this.registrations = props.functionArns.map((functionArn, index) => {
      const registration = new connect.CfnIntegrationAssociation(this, `Lambda${index + 1}`, {
        instanceId: props.instanceArn,
        integrationType: 'LAMBDA_FUNCTION',
        integrationArn: functionArn,
      });
      return registration;
    });
  }
}
