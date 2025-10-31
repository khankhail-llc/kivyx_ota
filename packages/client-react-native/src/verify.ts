import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";

function decodeDerEcdsa(der: Uint8Array) {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("DER: not SEQ");
  const _len = der[i++];
  if (der[i++] !== 0x02) throw new Error("DER: no r");
  const rlen = der[i++];
  const r = der.slice(i, i + rlen); i += rlen;
  if (der[i++] !== 0x02) throw new Error("DER: no s");
  const slen = der[i++];
  const s = der.slice(i, i + slen);
  const r32 = new Uint8Array(32); r32.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length));
  const s32 = new Uint8Array(32); s32.set(s.slice(Math.max(0, s.length - 32)), 32 - Math.min(32, s.length));
  const sig = new Uint8Array(64); sig.set(r32, 0); sig.set(s32, 32);
  return sig;
}

export function verifySignedJson(obj: any, publicKeys: Record<string, { rawPubHex: string }>) {
  if (!obj) return false;
  // Prefer COSE if present
  if (obj.cose?.sign1 && obj.cose?.kid) {
    const { sign1, kid } = obj.cose;
    const cfg = publicKeys[kid];
    if (!cfg?.rawPubHex) return false;
    const { cose, signature, ...unsigned } = obj;
    const msg = new TextEncoder().encode(JSON.stringify(unsigned));
    const digest = sha256(msg);
    const sigDer = Buffer.from(sign1, "base64");
    const sig64 = decodeDerEcdsa(sigDer);
    const pub = Buffer.from(cfg.rawPubHex, "hex");
    return p256.verify(sig64, digest, pub);
  }
  // Legacy signature
  const { signature, key_id, ...unsigned } = obj || {};
  if (!signature || !key_id) return false;
  const cfg = publicKeys[key_id];
  if (!cfg?.rawPubHex) return false;
  const msg = new TextEncoder().encode(JSON.stringify(unsigned));
  const digest = sha256(msg);
  const sigDer = Buffer.from(signature, "base64");
  const sig64 = decodeDerEcdsa(sigDer);
  const pub = Buffer.from(cfg.rawPubHex, "hex");
  return p256.verify(sig64, digest, pub);
}


