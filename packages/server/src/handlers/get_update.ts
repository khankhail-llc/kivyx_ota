import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import semverSatisfies from "semver/functions/satisfies.js";
import crypto from "crypto";
import { ddb, TABLE } from "../ddb";
import { QueryCommand as DdbQuery } from "@aws-sdk/client-dynamodb";

export const handler = async (event: any) => {
  const q = event.queryStringParameters || {};
  const { app, platform, channel = "Production", binary_version, runtime_version, current_version_code = "0", device_id = "", rn, arch } = q;
  if (!app || !platform || (!binary_version && !runtime_version)) return resp(400, { error: "missing params" });

  const pk = `${app}#${platform}#${channel}`;
  const releases = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": { S: pk } },
    ScanIndexForward: false,
    Limit: 20
  }));

  const items = (releases.Items || []).map(unmarshall) as any[];
  // Guardrail: if recent crash rate for latest release exceeds threshold, skip it
  const CRASH_THRESHOLD = Number(process.env.GUARDRAIL_CRASH_PCT || 5); // %
  const lookbackMinutes = Number(process.env.GUARDRAIL_LOOKBACK_MIN || 30);
  async function isHealthy(it: any) {
    try {
      const pkv = `${app}#${platform}#${channel}#${it.version_code}`;
      const sinceIso = new Date(Date.now() - lookbackMinutes * 60000).toISOString();
      const tele = await ddb.send(new DdbQuery({
        TableName: process.env.TELEMETRY_TABLE!,
        KeyConditionExpression: "pk = :pk AND sk >= :since",
        ExpressionAttributeValues: { ":pk": { S: pkv }, ":since": { S: sinceIso } },
        Limit: 1000,
        ScanIndexForward: true
      }));
      const events = (tele.Items || []).map(unmarshall);
      const total = events.length || 1;
      const crashes = events.filter((e: any) => e.event === "crash").length;
      return (crashes / total) * 100 < CRASH_THRESHOLD;
    } catch { return true; }
  }
  const eligible = await (async () => { for (const it of items) {
    if (!(Number(it.version_code) > Number(current_version_code))) return false;
    const rvOk = runtime_version ? (it.runtime_version ? it.runtime_version === runtime_version : false) : true;
    const bvOk = !runtime_version && binary_version ? semverSatisfies(binary_version, it.binary_version) : true;
    if (!(rvOk && bvOk)) return false;
    // targeting
    const t = it.targeting || {};
    if (t.rn && rn) { try { if (!semverSatisfies(rn, t.rn)) return false; } catch {} }
    if (t.arch) {
      if (Array.isArray(t.arch) && arch && !t.arch.includes(arch)) return false;
      if (typeof t.arch === 'string' && arch && t.arch !== arch) return false;
    }
    const effectiveRollout = it.mandatory ? 100 : Number(it.rollout || 0);
    if (!rolloutAllows(effectiveRollout, String(device_id), Number(it.version_code))) continue;
    if (!(await isHealthy(it))) continue;
    return it;
  } return undefined; })();

  if (!eligible) return { statusCode: 204, body: "" };

  // Return manifest url or inline manifest; here we proxy the manifest by fetching and returning it
  return resp(200, { manifest_url: eligible.manifest_url });
};

function rolloutAllows(rollout: number, deviceId: string, seed: number) {
  const h = crypto.createHash("sha256").update(`${deviceId}:${seed}`).digest();
  const val = h.readUInt32BE(0) / 0xffffffff;
  return val * 100 < rollout;
}

function resp(code: number, body: any) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) };
}


