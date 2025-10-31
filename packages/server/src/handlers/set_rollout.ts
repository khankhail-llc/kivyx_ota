import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { ddb, TABLE } from "../ddb";

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "method" });
  const body = JSON.parse(event.body || "{}");
  const { app, platform, channel = "Production", version_code, rollout } = body;
  if (!app || !platform || !version_code || rollout == null) return resp(400, { error: "missing" });
  const pk = `${app}#${platform}#${channel}`;
  await ddb.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { pk: { S: pk }, sk: { N: String(version_code) } },
    UpdateExpression: "SET rollout = :r",
    ExpressionAttributeValues: { ":r": { N: String(rollout) } }
  }));
  return resp(200, { ok: true });
};

function resp(code: number, body: any) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}


