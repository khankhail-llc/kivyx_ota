import { execSync } from "child_process";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { KMSClient, SignCommand, GetPublicKeyCommand } from "@aws-sdk/client-kms";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { generateDelta } from "./delta.js";
import { submitToRekor } from "./rekor.js";

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
    console.error("Environment vars: BASE_VERSION_CODE (number), BASE_VERSION (string) for delta generation");
    process.exit(2);
  }
  const version_code = Number(versionCodeStr);
  if (isNaN(version_code) || version_code <= 0) {
    console.error("ERROR: version_code must be a positive number");
    process.exit(2);
  }
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

  // Delta generation if base version provided
  const baseVersionCode = process.env.BASE_VERSION_CODE ? Number(process.env.BASE_VERSION_CODE) : undefined;
  const baseVersion = process.env.BASE_VERSION || undefined; // Version string for S3 path
  let deltaInfo: any = undefined;
  if (baseVersionCode && baseVersion) {
    try {
      // Download base bundle from S3 (using version string in path)
      const baseKey = `${app}/${platform}/${baseVersion}/bundle.zip`;
      const baseRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: baseKey }));
      const baseBuf = Buffer.from(await baseRes.Body!.transformToByteArray());
      const basePath = path.join(dist, "base.zip");
      fs.writeFileSync(basePath, baseBuf);
      
      const deltaPath = path.join(dist, "delta.patch");
      const delta = await generateDelta(basePath, zipPath, deltaPath);
      const deltaBuf = fs.readFileSync(deltaPath);
      
      // Only use delta if it's significantly smaller (60% threshold)
      if (delta.size < zipBuf.length * 0.6) {
        const deltaKey = `${app}/${platform}/${version}/delta-from-${baseVersionCode}.patch`;
        await putBin(deltaKey, deltaBuf, "application/octet-stream", "public, max-age=31536000, immutable");
        deltaInfo = {
          base_version_code: baseVersionCode,
          url: `${CDN_BASE}/${deltaKey}`,
          size: delta.size,
          sha256: delta.sha256
        };
        console.log(`Delta generated: ${delta.size} bytes (${Math.round((delta.size / zipBuf.length) * 100)}% of full)`);
      }
    } catch (e) {
      console.warn("Delta generation failed, using full bundle:", e);
    }
  }

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
    delta: deltaInfo,
    provenance: {
      attestation_url: `${CDN_BASE}/${app}/${platform}/${version}/attestation.json`
    },
    key_id: KEY_ALIAS,
    signature: ""
  } as any;
  
  // Sign with KMS (DER format)
  const unsigned = { ...manifest, signature: "", cose: undefined };
  const sigDer = await signJson(unsigned);
  
  // COSE Sign1 structure (ready for full CBOR encoding later)
  // For now, store DER signature in COSE-compatible format
  // Full production: encode as proper CBOR COSE Sign1 message
  const headers = {
    alg: "ES256",
    kid: KEY_ALIAS
  };
  
  // Store COSE structure with embedded signature
  // In production, this would be a proper CBOR-encoded COSE Sign1 message
  const coseStructure = {
    protected: Buffer.from(JSON.stringify(headers)).toString("base64"),
    signature: sigDer // DER signature from KMS
  };
  
  (manifest as any).cose = {
    alg: "ES256",
    kid: KEY_ALIAS,
    sign1: Buffer.from(JSON.stringify(coseStructure)).toString("base64") // Simplified; full COSE uses CBOR
  };
  
  // Legacy signature (for compatibility and current verification)
  manifest.signature = sigDer;

  await putBin(`${app}/${platform}/${version}/bundle.zip`, zipBuf, "application/zip", "public, max-age=31536000, immutable");
  await putBin(`${app}/${platform}/by-hash/${hashKey}/bundle.zip`, zipBuf, "application/zip", "public, max-age=31536000, immutable");
  await putJson(`${app}/${platform}/${version}/manifest.json`, manifest, "public, max-age=31536000, immutable");
  // Attestation for Rekor
  const attestation = { subject_sha256: sha256, version, version_code, created_at: manifest.created_at };
  await putJson(`${app}/${platform}/${version}/attestation.json`, attestation, "public, max-age=31536000, immutable");
  
  // Submit to Rekor if enabled
  let tlog: string | undefined = process.env.TRANSPARENCY_LOG_ID;
  if (!tlog && process.env.REKOR_ENABLED === "true") {
    try {
      const pubKeyB64 = await getPublicKeySpkiBase64();
      tlog = await submitToRekor(
        `${app}/${platform}/${version}/attestation.json`,
        pubKeyB64
      );
    } catch (e) {
      console.warn("Rekor submission failed:", e);
    }
  }
  
  if (tlog) {
    (manifest as any).provenance = { ...(manifest as any).provenance, transparency_log_id: tlog };
    await putJson(`${app}/${platform}/${version}/manifest.json`, manifest, "public, max-age=31536000, immutable");
  }

  // Load existing index and merge (don't overwrite)
  const indexKey = `${app}/${platform}/${channel}/index.json`;
  let index: any = {
    schema: "kivyx.channel.v1",
    app, platform, channel,
    created_at: new Date().toISOString(),
    releases: [],
    keys: [KEY_ALIAS],
    key_id: KEY_ALIAS,
    signature: ""
  };
  
  try {
    // Try to fetch existing index from S3
    const existingRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: indexKey }));
    const existingBuf = Buffer.from(await existingRes.Body!.transformToByteArray());
    const existing = JSON.parse(existingBuf.toString());
    // Merge releases (remove existing release with same version_code, then add new)
    const otherReleases = (existing.releases || []).filter((r: any) => r.version_code !== version_code);
    index.releases = [...otherReleases, {
      version, version_code,
      binary_version: manifest.binary_version,
      runtime_version,
      rollout: mandatory ? 100 : 1,
      targeting: {},
      mandatory,
      manifest_url: `${CDN_BASE}/${app}/${platform}/${version}/manifest.json`
    }].sort((a: any, b: any) => b.version_code - a.version_code); // Sort descending
    // Preserve existing keys if present
    if (existing.keys && Array.isArray(existing.keys)) {
      index.keys = [...new Set([...existing.keys, KEY_ALIAS])];
    }
  } catch {
    // No existing index, create new
    index.releases = [{
      version, version_code,
      binary_version: manifest.binary_version,
      runtime_version,
      rollout: mandatory ? 100 : 1,
      targeting: {},
      mandatory,
      manifest_url: `${CDN_BASE}/${app}/${platform}/${version}/manifest.json`
    }];
  }
  
  index.created_at = new Date().toISOString();
  index.signature = await signJson(index);

  await putJson(indexKey, index, "public, max-age=60");

  console.log("Published", { app, platform, channel, version, version_code });
  void getPublicKeySpkiBase64();
}

main().catch(err => { console.error(err); process.exit(1); });


