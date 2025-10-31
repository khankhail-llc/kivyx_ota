import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { ddb, TABLE } from "../ddb";

export const handler = async (event: any) => {
  const q = event.queryStringParameters || {};
  const { app, platform, channel = "Production" } = q;
  if (!app || !platform) return resp(400, { error: "missing params" });

  const pk = `${app}#${platform}#${channel}`;
  const releases = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": { S: pk } },
    ScanIndexForward: false,
    Limit: 100
  }));
  const items = (releases.Items || []).map(unmarshall);
  return resp(200, { items });
};

function resp(code: number, body: any) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}


