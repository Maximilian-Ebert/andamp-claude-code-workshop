import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { greet } from '@lib';
import { regions, type Region } from '@data';

const primary: Region = regions[0];

export const handler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 200,
  body: JSON.stringify({ message: greet(primary) }),
});
