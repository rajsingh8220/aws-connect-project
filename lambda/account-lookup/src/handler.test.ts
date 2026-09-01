import type { ConnectContactFlowEvent } from 'aws-lambda';
import { handler } from './handler';

const baseEvent = {} as ConnectContactFlowEvent;

function connectEvent(details: Partial<ConnectContactFlowEvent['Details']>): ConnectContactFlowEvent {
  return { ...baseEvent, Details: details } as ConnectContactFlowEvent;
}

describe('account-lookup handler', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('returns error when account number is missing', async () => {
    const result = await handler(baseEvent);

    expect(result).toEqual({
      lookupSuccess: 'false',
      errorMessage: 'accountNumber is required',
    });
  });

  test('reads account number from contact flow parameters', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accountNumber: '108',
        balance: 892.15,
        firstName: 'Carlos',
        lastName: 'Test',
        phoneNumber: '+12143473847',
        status: 'active',
      }),
    }) as typeof fetch;

    const result = await handler(
      connectEvent({ Parameters: { accountNumber: '108' } }),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://d3ot99cmewuv1b.cloudfront.net/accountLookup?accountNumber=108',
    );
    expect(result).toEqual({
      lookupSuccess: 'true',
      firstName: 'Carlos',
      balance: '892.15',
      phoneNumber: '+12143473847',
      accountNumber: '108',
      lastName: 'Test',
      status: 'active',
    });
  });

  test('returns not found for 404 responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as typeof fetch;

    const result = await handler(
      connectEvent({ Parameters: { accountNumber: '999' } }),
    );

    expect(result).toEqual({
      lookupSuccess: 'false',
      errorMessage: 'Account not found',
    });
  });

  test('throws when API returns a non-404 error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as typeof fetch;

    await expect(
      handler(
        connectEvent({ Parameters: { accountNumber: '108' } }),
      ),
    ).rejects.toThrow('Account lookup failed with status 500');
  });
});
