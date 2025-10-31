import { sha256 } from "@noble/hashes/sha256";

export function b64sha256(buf: Uint8Array) {
  const out = sha256(buf);
  return Buffer.from(out).toString("base64");
}


