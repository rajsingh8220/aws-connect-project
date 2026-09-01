import * as cdk from 'aws-cdk-lib';
import * as connect from 'aws-cdk-lib/aws-connect';
import { Construct } from 'constructs';

export interface ConnectInstanceConstructProps {
  readonly instanceAlias: string;
}

export class ConnectInstanceConstruct extends Construct {
  readonly instance: connect.CfnInstance;

  constructor(scope: Construct, id: string, props: ConnectInstanceConstructProps) {
    super(scope, id);

    this.instance = new connect.CfnInstance(this, 'Instance', {
      identityManagementType: 'CONNECT_MANAGED',
      instanceAlias: props.instanceAlias,
      attributes: {
        inboundCalls: true,
        outboundCalls: true,
      },
    });
  }

  get instanceArn(): string {
    return this.instance.attrArn;
  }

  get instanceId(): string {
    return this.instance.attrId;
  }
}
