import * as fs from 'fs';
import { projectPath } from './project-paths';

export interface ContactFlowTemplateVariables {
  readonly accountLookupLambdaArn: string;
  readonly vanityNumberLambdaArn: string;
}

/**
 * Loads a contact flow JSON file from contact_flows/, substitutes template
 * placeholders, and returns minified content for AWS::Connect::ContactFlow.
 */
export function loadContactFlow(
  filename: string,
  variables?: ContactFlowTemplateVariables,
): string {
  const flowPath = projectPath('contact_flows', filename);

  if (!fs.existsSync(flowPath)) {
    throw new Error(`Contact flow not found: ${flowPath}`);
  }

  let raw = fs.readFileSync(flowPath, 'utf-8');

  if (variables) {
    raw = raw
      .split('{{ACCOUNT_LOOKUP_LAMBDA_ARN}}')
      .join(variables.accountLookupLambdaArn)
      .split('{{VANITY_NUMBER_LAMBDA_ARN}}')
      .join(variables.vanityNumberLambdaArn);
  }

  const parsed = JSON.parse(raw) as unknown;
  return JSON.stringify(parsed);
}
