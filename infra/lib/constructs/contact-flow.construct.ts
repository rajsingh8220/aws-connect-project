import * as cdk from 'aws-cdk-lib';
import * as connect from 'aws-cdk-lib/aws-connect';
import { Construct } from 'constructs';
import { ContactFlowTemplateVariables, loadContactFlow } from '../utils/contact-flow-loader';

export interface ContactFlowConstructProps {
  readonly instanceArn: string;
  readonly name: string;
  readonly flowFileName: string;
  readonly description?: string;
  readonly templateVariables: ContactFlowTemplateVariables;
}

export class ContactFlowConstruct extends Construct {
  readonly contactFlow: connect.CfnContactFlow;

  constructor(scope: Construct, id: string, props: ContactFlowConstructProps) {
    super(scope, id);

    const template = loadContactFlow(props.flowFileName);
    const [beforeLookup, afterLookup] = template.split('{{ACCOUNT_LOOKUP_LAMBDA_ARN}}');
    const [middle, afterVanity] = afterLookup.split('{{VANITY_NUMBER_LAMBDA_ARN}}');

    const content = cdk.Fn.join('', [
      beforeLookup,
      props.templateVariables.accountLookupLambdaArn,
      middle,
      props.templateVariables.vanityNumberLambdaArn,
      afterVanity,
    ]);

    this.contactFlow = new connect.CfnContactFlow(this, 'ContactFlow', {
      instanceArn: props.instanceArn,
      name: props.name,
      type: 'CONTACT_FLOW',
      description: props.description ?? 'TTEC inbound contact flow',
      content,
    });
  }

  get contactFlowArn(): string {
    return this.contactFlow.attrContactFlowArn;
  }

  get contactFlowId(): string {
    return cdk.Fn.select(1, cdk.Fn.split('contact-flow/', this.contactFlow.attrContactFlowArn));
  }
}
