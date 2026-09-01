/** Shared project constants (API, Connect, DynamoDB). */
export const PROJECT_CONFIG = {
  connect: {
    instanceAliasPrefix: 'shaileshdemo-connect',
    contactFlowName: 'ttec-inbound-flow',
    contactFlowFile: 'ttec-inbound-flow.json',
    /** Pre-provisioned inbound DID — managed outside CDK (claimed and associated manually). */
    inboundPhoneNumber: '+15055393849',
    inboundPhoneNumberId: '9e353661-694f-49cc-8320-75e9ddb01e79',
  },
  api: {
    baseUrl: 'https://d3ot99cmewuv1b.cloudfront.net',
    accountLookupPath: '/accountLookup',
    allAccountNumbersPath: '/allAccountNumbers',
  },
  dynamodb: {
    vanityTableName: 'ttec-vanity-numbers',
  },
  lambda: {
    accountLookupName: 'ttec-account-lookup',
    vanityNumberName: 'ttec-vanity-number',
  },
} as const;
