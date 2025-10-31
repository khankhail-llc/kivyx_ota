import { Platform } from "react-native";
import * as RNFS from "react-native-fs";
import semverSatisfies from "semver/functions/satisfies.js";
import { b64sha256 } from "./hash";
import { verifySignedJson } from "./verify";
import { getState, setState, getActiveDir } from "./storage";
import { unzipTo } from "./zip";

export type OtaParams = {
  app: string;
  channel?: string;
  binaryVersion: string;
  runtimeVersion?: string;
  deviceId: string;
  cdnBase: string;
  publicKeys: { [keyId: string]: { rawPubHex: string } };
  rnVersion?: string;
  arch?: string; // e.g., arm64-v8a, arm64
};

function cohortPercent(deviceId: string, versionCode: number) {
  const s = `${deviceId}:${versionCode}`;
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h / 0xffffffff) * 100;
}

function matchesTarget(targeting: any, rnVersion?: string, arch?: string) {
  if (!targeting) return true;
  if (targeting.rn && rnVersion) {
    try { if (!(require("semver/functions/satisfies.js").default(rnVersion, targeting.rn))) return false; } catch {}
  }
  if (targeting.arch && arch) {
    if (Array.isArray(targeting.arch) && !targeting.arch.includes(arch)) return false;
    if (typeof targeting.arch === "string" && targeting.arch !== arch) return false;
  }
  return true;
}

export async function checkAndApply(params: OtaParams) {
  const { app, channel = "Production", binaryVersion, runtimeVersion, deviceId, cdnBase, publicKeys, rnVersion, arch } = params;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const idxUrl = `${cdnBase}/${app}/${platform}/${channel}/index.json`;

  const st = await getState();
  const idxHeaders: any = { "Cache-Control": "no-cache" } as any;
  if (st.etagIndex) idxHeaders["If-None-Match"] = st.etagIndex;
  const idxRes = await fetch(idxUrl, { headers: idxHeaders });
  if (!idxRes.ok) throw new Error(`Index fetch failed: ${idxRes.status}`);
  let index: any;
  if (idxRes.status === 304) {
    // ETag matched; no change. If 304 and we don't have cached index content locally, proceed without change detection.
    return { updated: false } as const;
  } else {
    index = await idxRes.json();
    const et = idxRes.headers.get("ETag");
    await setState({ ...st, etagIndex: et || st.etagIndex });
  }
  if (!verifySignedJson(index, publicKeys)) throw new Error("Index signature invalid");

  const candidates = (index.releases || [])
    .filter((r: any) => r.version_code > (st.currentVersionCode || 0))
    .filter((r: any) => {
      if (runtimeVersion && r.runtime_version) {
        return r.runtime_version === runtimeVersion;
      }
      return semverSatisfies(binaryVersion, r.binary_version);
    })
    .filter((r: any) => matchesTarget(r.targeting, rnVersion, arch));

  let chosen: any | undefined;
  for (const r of candidates) {
    const effectiveRollout = r.mandatory ? 100 : (r.rollout ?? 0);
    if (cohortPercent(deviceId, r.version_code) <= effectiveRollout) { chosen = r; break; }
  }
  if (!chosen) return { updated: false } as const;

  const manHeaders: any = { "Cache-Control": "no-cache" } as any;
  const st2 = await getState();
  if (st2.etagManifest && st2.etagManifest[chosen.version_code]) manHeaders["If-None-Match"] = st2.etagManifest[chosen.version_code];
  const manRes = await fetch(chosen.manifest_url, { headers: manHeaders });
  if (!manRes.ok) throw new Error(`Manifest fetch failed: ${manRes.status}`);
  const manifest = await manRes.json();
  const met = manRes.headers.get("ETag");
  await setState({ ...st2, etagManifest: { ...(st2.etagManifest || {}), [manifest.version_code]: met || (st2.etagManifest || {})[manifest.version_code] } });
  if (!verifySignedJson(manifest, publicKeys)) throw new Error("Manifest signature invalid");

  const tmpDir = `${RNFS.CachesDirectoryPath}/kivyx_ota`;
  await RNFS.mkdir(tmpDir);
  const zipPath = `${tmpDir}/bundle.zip`;
  const dl = await RNFS.downloadFile({ fromUrl: manifest.artifact.url, toFile: zipPath });
  const { statusCode } = await dl.promise;
  if (statusCode !== 200) throw new Error("Download failed");

  const fileBase64 = await RNFS.readFile(zipPath, "base64");
  const ok = b64sha256(Buffer.from(fileBase64, "base64")) === manifest.artifact.sha256;
  if (!ok) throw new Error("Artifact hash mismatch");

  const dest = getActiveDir(manifest.version_code);
  await unzipTo(zipPath, dest);
  // crash-safe: mark pending and remember last good before switching
  const lastGood = st.currentVersionCode || 0;
  await setState({ currentVersionCode: manifest.version_code, lastGoodVersionCode: lastGood, pendingVersionCode: manifest.version_code, appliedAt: new Date().toISOString(), pendingTimeoutMs: st.pendingTimeoutMs || 600000 });

  // Verify assets integrity if provided
  if (Array.isArray(manifest.assets) && manifest.assets.length > 0) {
    for (const a of manifest.assets) {
      try {
        const filePath = `${dest}/${a.path}`.replace(/\\/g, "/");
        const dataB64 = await RNFS.readFile(filePath, "base64");
        const ok = b64sha256(Buffer.from(dataB64, "base64")) === a.sha256;
        if (!ok) throw new Error(`Asset hash mismatch: ${a.path}`);
      } catch (e) {
        throw new Error(`Asset verify failed: ${a.path}`);
      }
    }
  }

  return { updated: true, versionCode: manifest.version_code, dir: dest } as const;
}


