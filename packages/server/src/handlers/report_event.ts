import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { ddb } from "../ddb";

const TELEMETRY_TABLE = process.env.TELEMETRY_TABLE as string;

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "method" });
  const body = JSON.parse(event.body || "{}");
  const { app, platform, channel, version_code, device_id, event_type, ts } = body;
  if (!TELEMETRY_TABLE) return resp(500, { error: "server" });
  if (!app || !platform || !channel || !version_code || !device_id || !event_type) return resp(400, { error: "missing" });

  const now = ts || new Date().toISOString();
  await ddb.send(new PutItemCommand({
    TableName: TELEMETRY_TABLE,
    Item: {
      pk: { S: `${app}#${platform}#${channel}#${version_code}` },
      sk: { S: `${now}#${device_id}` },
      event: { S: event_type }
    }
  }));
  return resp(200, { ok: true });
};

function resp(code: number, body: any) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}


