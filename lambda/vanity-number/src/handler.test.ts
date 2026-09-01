import { findWordMatches, normalizePhoneDigits, toSpeakablePhrase, wordToT9 } from './t9';
import { generateVanityCandidates, scoreVanity } from './vanity-engine';
import { handler } from './handler';

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

const baseEvent = {} as import('aws-lambda').ConnectContactFlowEvent;

function connectEvent(details: Record<string, unknown>): import('aws-lambda').ConnectContactFlowEvent {
  return { ...baseEvent, Details: details } as import('aws-lambda').ConnectContactFlowEvent;
}

describe('t9 utilities', () => {
  test('wordToT9 encodes dictionary words', () => {
    expect(wordToT9('CASH')).toBe('2274');
    expect(wordToT9('DIS')).toBe('347');
  });

  test('toSpeakablePhrase spells words and speaks digits', () => {
    expect(toSpeakablePhrase('1-DIS-847')).toBe('one, D I S, eight four seven');
    expect(toSpeakablePhrase('1-CASH-274')).toBe('one, C A S H, two seven four');
  });
});

describe('vanity engine', () => {
  test('findWordMatches locates DIS in account phone digits', () => {
    const digits = normalizePhoneDigits('+12143473847');
    const matches = findWordMatches(digits);

    expect(matches.some((match) => match.word === 'DIS')).toBe(true);
  });

  test('generateVanityCandidates prefers real words over random letters', () => {
    const candidates = generateVanityCandidates('+12143473847', 5);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].display).toMatch(/^1-[A-Z]+-/);
    expect(candidates[0].speak).toContain(' ');
    expect(candidates[0].display).not.toMatch(/^[A-Z]{8,}$/);
  });

  test('scoreVanity rewards more word segments', () => {
    expect(scoreVanity('1-CASH-BANK')).toBeGreaterThan(scoreVanity('1-CASH-847'));
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

  test('writes top 5 vanity numbers and returns speakable top 3', async () => {
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
      vanitySpeak: expect.any(String),
    });

    expect(result.vanityOption1).toBeTruthy();
    expect(result.vanityOption1Speak).toContain(' ');
    expect(result.vanityOption2Speak).toBeTruthy();
    expect(result.vanityOption3Speak).toBeTruthy();
    expect(result.vanityOptions).toContain(result.vanityOption1);
  });
});
