import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface InboundPhoneAssociationConstructProps {
  readonly instanceId: string;
  readonly phoneNumberId: string;
  readonly contactFlowId: string;
}

/**
 * Ensures the pre-provisioned inbound DID routes to the contact flow on every deploy.
 * Uses AwsCustomResource (no standalone Lambda in lambda/).
 */
export class InboundPhoneAssociationConstruct extends Construct {
  constructor(scope: Construct, id: string, props: InboundPhoneAssociationConstructProps) {
    super(scope, id);

    const physicalResourceId = `${props.phoneNumberId}-${props.contactFlowId}`;
    const parameters = {
      InstanceId: props.instanceId,
      PhoneNumberId: props.phoneNumberId,
      ContactFlowId: props.contactFlowId,
    };

    new cr.AwsCustomResource(this, 'Associate', {
      onCreate: {
        service: 'Connect',
        action: 'associatePhoneNumberContactFlow',
        parameters,
        physicalResourceId: cr.PhysicalResourceId.of(physicalResourceId),
      },
      onUpdate: {
        service: 'Connect',
        action: 'associatePhoneNumberContactFlow',
        parameters,
        physicalResourceId: cr.PhysicalResourceId.of(physicalResourceId),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }
}
