import type { ConnectContactFlowEvent } from 'aws-lambda';
import { generateVanityCandidates, handler, scoreVanity } from './handler';

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const send = jest.fn().mockResolvedValue({});
  return {
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({ send })),
    },
    BatchWriteCommand: jest.fn().mockImplementation((input: unknown) => input),
    __mockSend: send,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mockSend } = require('@aws-sdk/lib-dynamodb') as { __mockSend: jest.Mock };

const baseEvent = {} as ConnectContactFlowEvent;

function connectEvent(details: Record<string, unknown>): ConnectContactFlowEvent {
  return { ...baseEvent, Details: details } as ConnectContactFlowEvent;
}

describe('vanity-number utilities', () => {
  test('scoreVanity prefers more letters over digits', () => {
    expect(scoreVanity('ABCDEFGHIJ')).toBeGreaterThan(scoreVanity('1234567890'));
  });

  test('generateVanityCandidates returns ranked options from phone digits', () => {
    const candidates = generateVanityCandidates('+12143473847', 5);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);
    expect(candidates[0]).toMatch(/[A-Z0-9-]+/);
  });
});

describe('vanity-number handler', () => {
  beforeEach(() => {
    __mockSend.mockClear();
  });

  test('returns error when no phone number is provided', async () => {
    const result = await handler(baseEvent);

    expect(result).toEqual({
      vanitySuccess: 'false',
      errorMessage: 'phone number is required',
    });
    expect(__mockSend).not.toHaveBeenCalled();
  });

  test('writes top 5 vanity numbers and returns top 3', async () => {
    const result = await handler(
      connectEvent({
        Parameters: { accountPhoneNumber: '+12143473847' },
        ContactData: {
          CustomerEndpoint: { Address: '+15551234567', Type: 'TELEPHONE_NUMBER' },
        },
      }),
    );

    expect(__mockSend).toHaveBeenCalledTimes(1);
    const writePayload = __mockSend.mock.calls[0][0] as {
      RequestItems: Record<string, { PutRequest: { Item: Record<string, unknown> } }[]>;
    };
    const writes = writePayload.RequestItems['ttec-vanity-numbers'];

    expect(writes).toHaveLength(5);
    expect(writes[0].PutRequest.Item).toMatchObject({
      callerPhoneNumber: '+15551234567',
      sourcePhoneNumber: '+12143473847',
      rank: 1,
    });

    expect(result.vanityOption1).toBeTruthy();
    expect(result.vanityOption2).toBeTruthy();
    expect(result.vanityOption3).toBeTruthy();
    expect(result.vanityOptions).toContain(result.vanityOption1);
  });
});
