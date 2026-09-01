import type { ConnectContactFlowEvent, ConnectContactFlowResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.VANITY_TABLE_NAME ?? 'ttec-vanity-numbers';
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DIGIT_TO_LETTERS: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
};

/**
 * Score vanity candidates: prefer more letters (fewer digits), readable words,
 * and US-style 1-800-XXX-XXXX grouping when possible.
 */
export function scoreVanity(vanity: string): number {
  const letters = (vanity.match(/[A-Z]/gi) ?? []).length;
  const digits = (vanity.match(/[0-9]/g) ?? []).length;
  const hasTriple = /([A-Z])\1\1/i.test(vanity) ? -2 : 0;
  return letters * 10 - digits * 3 + hasTriple;
}

export function generateVanityCandidates(phoneNumber: string, limit = 20): string[] {
  const digits = phoneNumber.replace(/\D/g, '').slice(-10);
  const candidates = new Set<string>();

  const baseLetters = digits
    .split('')
    .map((d) => DIGIT_TO_LETTERS[d] ?? d)
    .join('');

  candidates.add(baseLetters);
  candidates.add(baseLetters.slice(0, 3) + '-' + baseLetters.slice(3, 6) + '-' + baseLetters.slice(6));
  candidates.add('1-' + baseLetters);

  for (let i = 0; i < digits.length; i++) {
    const options = DIGIT_TO_LETTERS[digits[i]];
    if (!options) continue;
    for (const letter of options) {
      const variant = baseLetters.substring(0, i) + letter + baseLetters.substring(i + 1);
      candidates.add(variant);
    }
  }

  return [...candidates]
    .sort((a, b) => scoreVanity(b) - scoreVanity(a))
    .slice(0, limit);
}

/**
 * Connect contact-flow Lambda: converts account phone to vanity numbers,
 * persists top 5 in DynamoDB, returns top 3 for the caller.
 */
export const handler = async (
  event: ConnectContactFlowEvent,
): Promise<ConnectContactFlowResult> => {
  console.log('Vanity number event', JSON.stringify(event));

  const accountPhoneNumber =
    event.Details?.Parameters?.accountPhoneNumber ??
    event.Details?.ContactData?.Attributes?.accountPhoneNumber;

  const callerPhoneNumber =
    event.Details?.Parameters?.callerPhoneNumber ??
    event.Details?.ContactData?.CustomerEndpoint?.Address;

  const sourcePhone = accountPhoneNumber ?? callerPhoneNumber;

  if (!sourcePhone) {
    return {
      vanitySuccess: 'false',
      errorMessage: 'phone number is required',
    };
  }

  const ranked = generateVanityCandidates(sourcePhone);
  const topFive = ranked.slice(0, 5);
  const topThree = topFive.slice(0, 3);

  const timestamp = new Date().toISOString();
  const writeRequests = topFive.map((vanity, index) => ({
    PutRequest: {
      Item: {
        callerPhoneNumber: callerPhoneNumber ?? sourcePhone,
        rank: index + 1,
        vanityNumber: vanity,
        sourcePhoneNumber: sourcePhone,
        createdAt: timestamp,
        score: scoreVanity(vanity),
      },
    },
  }));

  await docClient.send(
    new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: writeRequests,
      },
    }),
  );

  return {
    vanitySuccess: 'true',
    vanityOption1: topThree[0] ?? '',
    vanityOption2: topThree[1] ?? '',
    vanityOption3: topThree[2] ?? '',
    vanityOptions: topThree.join(', '),
  };
};
