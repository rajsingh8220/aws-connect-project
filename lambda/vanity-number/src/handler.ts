import type { ConnectContactFlowEvent, ConnectContactFlowResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { generateVanityCandidates, scoreVanity } from './vanity-engine';

const TABLE_NAME = process.env.VANITY_TABLE_NAME ?? 'ttec-vanity-numbers';
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Connect contact-flow Lambda: converts account phone to vanity numbers,
 * persists top 5 in DynamoDB, returns top 3 display + speakable phrases.
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

  const firstName =
    event.Details?.Parameters?.firstName?.trim() ??
    event.Details?.ContactData?.Attributes?.firstName?.trim();

  const sourcePhone = accountPhoneNumber ?? callerPhoneNumber;

  if (!sourcePhone) {
    return {
      vanitySuccess: 'false',
      errorMessage: 'phone number is required',
    };
  }

  const ranked = generateVanityCandidates(sourcePhone, firstName);
  const topFive = ranked.slice(0, 5);
  const topThree = topFive.slice(0, 3);

  const timestamp = new Date().toISOString();
  const writeRequests = topFive.map((vanity, index) => ({
    PutRequest: {
      Item: {
        callerPhoneNumber: callerPhoneNumber ?? sourcePhone,
        rank: index + 1,
        vanityNumber: vanity.display,
        vanitySpeak: vanity.speak,
        firstName: firstName ?? '',
        sourcePhoneNumber: sourcePhone,
        createdAt: timestamp,
        score: vanity.score,
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
    vanityOption1: topThree[0]?.display ?? '',
    vanityOption2: topThree[1]?.display ?? '',
    vanityOption3: topThree[2]?.display ?? '',
    vanityOption1Speak: topThree[0]?.speak ?? '',
    vanityOption2Speak: topThree[1]?.speak ?? '',
    vanityOption3Speak: topThree[2]?.speak ?? '',
    vanityOptions: topThree.map((option) => option.display).join(', '),
  };
};

export { generateVanityCandidates, scoreVanity };
