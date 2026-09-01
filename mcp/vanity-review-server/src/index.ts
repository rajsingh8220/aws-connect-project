import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TABLE_NAME = process.env.VANITY_TABLE_NAME ?? 'ttec-vanity-numbers';
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

export interface VanityRecord {
  callerPhoneNumber: string;
  rank: number;
  vanityNumber: string;
  vanitySpeak?: string;
  firstName?: string;
  sourcePhoneNumber?: string;
  score?: number;
  createdAt?: string;
}

function sortByRecency(items: VanityRecord[]): VanityRecord[] {
  return [...items].sort((a, b) => {
    const timeA = a.createdAt ? Date.parse(a.createdAt) : 0;
    const timeB = b.createdAt ? Date.parse(b.createdAt) : 0;
    return timeB - timeA || a.rank - b.rank;
  });
}

async function scanAll(limit = 50): Promise<VanityRecord[]> {
  const items: VanityRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  while (items.length < limit) {
    const page = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: Math.min(limit - items.length, 25),
        ExclusiveStartKey: lastKey,
      }),
    );

    items.push(...((page.Items as VanityRecord[]) ?? []));
    lastKey = page.LastEvaluatedKey;
    if (!lastKey) break;
  }

  return sortByRecency(items).slice(0, limit);
}

async function queryByCaller(callerPhoneNumber: string): Promise<VanityRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'callerPhoneNumber = :phone',
      ExpressionAttributeValues: { ':phone': callerPhoneNumber },
    }),
  );

  return ((result.Items as VanityRecord[]) ?? []).sort((a, b) => a.rank - b.rank);
}

const server = new McpServer({
  name: 'ttec-vanity-review',
  version: '1.0.0',
});

server.tool(
  'describe_vanity_table',
  'Describe the vanity numbers DynamoDB table and how reviewers should use these tools.',
  {},
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            tableName: TABLE_NAME,
            region: AWS_REGION,
            partitionKey: 'callerPhoneNumber',
            sortKey: 'rank',
            purpose:
              'Stores top 5 vanity number suggestions per inbound call (rank 1–5). Written by ttec-vanity-number Lambda.',
            fields: [
              'callerPhoneNumber',
              'rank',
              'vanityNumber',
              'vanitySpeak',
              'firstName',
              'sourcePhoneNumber',
              'score',
              'createdAt',
            ],
          },
          null,
          2,
        ),
      },
    ],
  }),
);

server.tool(
  'list_recent_vanity_results',
  'List recent vanity number records from DynamoDB (newest first). Use after placing a test call.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max records to return (default 20)'),
  },
  async ({ limit = 20 }) => {
    const items = await scanAll(limit);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              tableName: TABLE_NAME,
              count: items.length,
              items,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'get_vanity_results_for_caller',
  'Get all vanity suggestions (ranks 1–5) for a specific caller phone number.',
  {
    callerPhoneNumber: z
      .string()
      .describe('Caller phone in E.164 format, e.g. +15551234567'),
  },
  async ({ callerPhoneNumber }) => {
    const items = await queryByCaller(callerPhoneNumber);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              callerPhoneNumber,
              count: items.length,
              items,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'search_vanity_by_first_name',
  'Find vanity records personalized for a caller first name (e.g. Carlos).',
  {
    firstName: z.string().describe('Account first name from account lookup'),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async ({ firstName, limit = 20 }) => {
    const normalized = firstName.trim();
    const scanned = await scanAll(100);
    const items = scanned
      .filter((item) => item.firstName?.toLowerCase() === normalized.toLowerCase())
      .slice(0, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              firstName: normalized,
              count: items.length,
              items,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
