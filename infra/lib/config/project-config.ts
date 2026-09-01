/** Shared project constants (API, Connect, DynamoDB). */
export const PROJECT_CONFIG = {
  connect: {
    instanceAliasPrefix: 'shaileshdemo-connect',
    contactFlowName: 'ttec-inbound-flow',
    contactFlowFile: 'ttec-inbound-flow.json',
    phoneCountryCode: 'US',
    phoneNumberPrefix: '+1505',
    phoneType: 'DID' as const,
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
