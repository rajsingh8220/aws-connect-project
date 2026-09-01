import { findWordMatches, normalizePhoneDigits, toSpeakablePhrase, wordToT9 } from './t9';
import { generateNameVanityCandidates, nameSimilarity, spellDigitsTowardName } from './name-vanity';
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
    expect(wordToT9('CARLOS')).toBe('227567');
  });

  test('toSpeakablePhrase spells words and speaks digits', () => {
    expect(toSpeakablePhrase('1-CARLOS-847')).toBe('one, C A R L O S, eight four seven');
  });
});

describe('name vanity', () => {
  test('nameSimilarity favors matching prefixes', () => {
    expect(nameSimilarity('CARLOS', 'Carlos')).toBeGreaterThan(nameSimilarity('DIS', 'Carlos'));
  });

  test('generateNameVanityCandidates uses the first name in vanity options', () => {
    const candidates = generateNameVanityCandidates('+12143473847', 'Carlos', 5);

    expect(candidates[0].display).toContain('CARLOS');
    expect(candidates[0].speak).toContain('C A R L O S');
  });

  test('spellDigitsTowardName biases keypad letters toward the first name', () => {
    const spelling = spellDigitsTowardName('2143473847', 'Carlos');
    expect(nameSimilarity(spelling, 'Carlos')).toBeGreaterThan(0.2);
  });
});

describe('vanity engine', () => {
  test('generateVanityCandidates prioritizes first-name options', () => {
    const candidates = generateVanityCandidates('+12143473847', 'Carlos', 5);

    expect(candidates[0].display).toMatch(/CARLOS/);
    expect(candidates[0].score).toBeGreaterThan(800);
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

  test('writes personalized vanity numbers when first name is provided', async () => {
    const result = await handler(
      connectEvent({
        Parameters: {
          accountPhoneNumber: '+12143473847',
          firstName: 'Carlos',
        },
        ContactData: {
          Attributes: { firstName: 'Carlos', accountPhoneNumber: '+12143473847' },
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
      firstName: 'Carlos',
      vanitySpeak: expect.stringContaining('C A R L O S'),
    });

    expect(result.vanityOption1).toContain('CARLOS');
    expect(result.vanityOption1Speak).toContain('C A R L O S');
    expect(result.vanityOption2Speak).toBeTruthy();
    expect(result.vanityOption3Speak).toBeTruthy();
  });
});
