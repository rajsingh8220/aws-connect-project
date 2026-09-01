import type { ConnectContactFlowEvent, ConnectContactFlowResult } from 'aws-lambda';

const API_BASE_URL = process.env.API_BASE_URL ?? 'https://d3ot99cmewuv1b.cloudfront.net';

interface AccountLookupResponse {
  accountNumber: string;
  balance: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  status: string;
}

/**
 * Connect contact-flow Lambda: looks up account number via TTEC API.
 * Returns attributes consumed by the contact flow via $.External.* references.
 */
export const handler = async (
  event: ConnectContactFlowEvent,
): Promise<ConnectContactFlowResult> => {
  console.log('Account lookup event', JSON.stringify(event));

  const accountNumber =
    event.Details?.Parameters?.accountNumber?.trim() ??
    event.Details?.ContactData?.Attributes?.accountNumber?.trim();

  if (!accountNumber) {
    return {
      lookupSuccess: 'false',
      errorMessage: 'accountNumber is required',
    };
  }

  const url = `${API_BASE_URL}/accountLookup?accountNumber=${encodeURIComponent(accountNumber)}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return {
      lookupSuccess: 'false',
      errorMessage: 'Account not found',
    };
  }

  if (!response.ok) {
    throw new Error(`Account lookup failed with status ${response.status}`);
  }

  const account = (await response.json()) as AccountLookupResponse;

  return {
    lookupSuccess: 'true',
    firstName: account.firstName,
    balance: String(account.balance),
    phoneNumber: account.phoneNumber,
    accountNumber: account.accountNumber,
    lastName: account.lastName,
    status: account.status,
  };
};
