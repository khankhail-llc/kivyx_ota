import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export const ddb = new DynamoDBClient({});
export const TABLE = process.env.TABLE as string;


