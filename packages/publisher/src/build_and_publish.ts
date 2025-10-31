import { execSync } from "child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { KMSClient, SignCommand, GetPublicKeyCommand } from "@aws-sdk/client-kms";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const BUCKET = process.env.BUCKET!;
const CDN_BASE = process.env.CDN_BASE!; // https://<cloudfront-domain> or https://cdn.example.com
const KMS_KEY_ID = process.env.KMS_KEY_ID!;
const KEY_ALIAS = process.env.KEY_ALIAS!; // alias/kivyx-ota-prod-v1

const s3 = new S3Client({});
const kms = new KMSClient({});

function b64sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("base64");
}
async function signJson(obj: any) {
  const unsigned = { ...obj, signature: "" };
  const data = Buffer.from(JSON.stringify(unsigned));
  const res = await kms.send(new SignCommand({
    KeyId: KMS_KEY_ID,
    Message: data,
    MessageType: "RAW",
    SigningAlgorithm: "ECDSA_SHA_256"
  }));
  return Buffer.from(res.Signature as Uint8Array).toString("base64");
}
async function putJson(key: string, obj: any, cache: string) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: JSON.stringify(obj),
    ContentType: "application/json", CacheControl: cache
  }));
}
async function putBin(key: string, buf: Buffer, contentType: string, cache: string) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: buf,
    ContentType: contentType, CacheControl: cache
  }));
}
async function getPublicKeySpkiBase64() {
  const r = await kms.send(new GetPublicKeyCommand({ KeyId: KMS_KEY_ID }));
  return Buffer.from(r.PublicKey as Uint8Array).toString("base64");
}

async function main() {
  const [ , , app, platform, channel, version, versionCodeStr, entryFile, runtimeVersionArg, mandatoryArg ] = process.argv;
  if (!app || !platform || !version || !versionCodeStr || !entryFile) {
    console.error("Usage: pnpm start <app> <ios|android> <channel> <version> <version_code> <entryFile> [runtimeVersion] [mandatory:true|false]");
    process.exit(2);
  }
  const version_code = Number(versionCodeStr);
  const runtime_version = runtimeVersionArg && runtimeVersionArg !== "-" ? runtimeVersionArg : undefined;
  const mandatory = String(mandatoryArg || "false").toLowerCase() === "true";

  const dist = path.resolve("dist");
  if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });

  execSync(`npx react-native bundle --entry-file ${entryFile} --bundle-output ${dist}/index.${platform}.bundle --assets-dest ${dist} --platform ${platform} --dev false`, { stdio: "inherit" });

  const zipPath = path.join(dist, "bundle.zip");
  const zipCmd = process.platform === "win32"
    ? `powershell -NoP -C "if (Test-Path '${zipPath}') { Remove-Item '${zipPath}' -Force }; Compress-Archive -Path '${dist}\\*' -DestinationPath '${zipPath}'"`
    : `cd ${dist} && rm -f bundle.zip && zip -r -q bundle.zip .`;
  execSync(zipCmd, { stdio: "inherit" });

  const zipBuf = fs.readFileSync(zipPath);
  const sha256 = b64sha256(zipBuf);
  const hashKey = `${sha256.slice(0, 16)}`; // prefix for content addressing

  const manifest = {
    schema: "kivyx.manifest.v1",
    app, platform, channel,
    binary_version: ">=1.0.0",
    version, version_code,
    created_at: new Date().toISOString(),
    runtime_version,
    artifact: {
      url: `${CDN_BASE}/${app}/${platform}/${version}/bundle.zip`,
      url_by_hash: `${CDN_BASE}/${app}/${platform}/by-hash/${hashKey}/bundle.zip`,
      size: zipBuf.length,
      sha256,
      encoding: "identity"
    },
    assets: [],
    mandatory,
    provenance: {
      attestation_url: `${CDN_BASE}/${app}/${platform}/${version}/attestation.json`
    },
    key_id: KEY_ALIAS,
    signature: ""
  } as any;
  // Optional delta generation stub
  const baseVersion = process.env.BASE_VERSION_CODE ? Number(process.env.BASE_VERSION_CODE) : undefined;
  if (baseVersion) {
    manifest.delta = { base_version_code: baseVersion };
  }
  manifest.signature = await signJson(manifest);
  // COSE-like fields (sign1 = base64 DER ECDSA; header carries alg & kid)
  (manifest as any).cose = {
    alg: "ES256",
    kid: KEY_ALIAS,
    sign1: manifest.signature
  };

  await putBin(`${app}/${platform}/${version}/bundle.zip`, zipBuf, "application/zip", "public, max-age=31536000, immutable");
  await putBin(`${app}/${platform}/by-hash/${hashKey}/bundle.zip`, zipBuf, "application/zip", "public, max-age=31536000, immutable");
  await putJson(`${app}/${platform}/${version}/manifest.json`, manifest, "public, max-age=31536000, immutable");
  // simple attestation: subject sha256 + metadata, signed separately in future
  const attestation = { subject_sha256: sha256, version, version_code, created_at: manifest.created_at };
  await putJson(`${app}/${platform}/${version}/attestation.json`, attestation, "public, max-age=31536000, immutable");
  // Optional transparency log id (if provided by CI after Rekor submit)
  const tlog = process.env.TRANSPARENCY_LOG_ID;
  if (tlog) {
     (manifest as any).provenance = { ...(manifest as any).provenance, transparency_log_id: tlog };
     await putJson(`${app}/${platform}/${version}/manifest.json`, manifest, "public, max-age=31536000, immutable");
  }

  const index = {
    schema: "kivyx.channel.v1",
    app, platform, channel,
    created_at: new Date().toISOString(),
    releases: [
      {
        version, version_code,
        binary_version: manifest.binary_version,
        runtime_version,
        rollout: mandatory ? 100 : 1,
        targeting: {},
        mandatory,
        manifest_url: `${CDN_BASE}/${app}/${platform}/${version}/manifest.json`
      }
    ],
    keys: [KEY_ALIAS],
    key_id: KEY_ALIAS,
    signature: ""
  } as any;
  index.signature = await signJson(index);

  await putJson(`${app}/${platform}/${channel}/index.json`, index, "public, max-age=60");

  console.log("Published", { app, platform, channel, version, version_code });
  void getPublicKeySpkiBase64();
}

main().catch(err => { console.error(err); process.exit(1); });


