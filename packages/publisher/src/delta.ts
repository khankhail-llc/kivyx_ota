import crypto from "crypto";
import fs from "fs";

// Simple binary delta using zlib compression + XOR (production: use bsdiff/xdelta)
export async function generateDelta(basePath: string, newPath: string, outputPath: string): Promise<{ size: number; sha256: string }> {
  const base = fs.readFileSync(basePath);
  const updated = fs.readFileSync(newPath);
  
  // Simple approach: for production, integrate bsdiff/xdelta binary
  // Here we use a placeholder that stores compressed diff
  // In production, call: bsdiff <base> <new> <patch> or use bsdiff-node library
  const patch = Buffer.concat([
    Buffer.from([base.length & 0xff, (base.length >> 8) & 0xff, (base.length >> 16) & 0xff, (base.length >> 24) & 0xff]),
    Buffer.from([updated.length & 0xff, (updated.length >> 8) & 0xff, (updated.length >> 16) & 0xff, (updated.length >> 24) & 0xff]),
    // XOR diff (simple; production uses bsdiff)
    Buffer.from(Array.from({ length: Math.max(base.length, updated.length) }, (_, i) => {
      const b = i < base.length ? base[i] : 0;
      const n = i < updated.length ? updated[i] : 0;
      return b ^ n;
    }).slice(0, updated.length))
  ]);
  
  const zlib = await import("zlib");
  const compressed = zlib.default.brotliCompressSync(patch);
  fs.writeFileSync(outputPath, compressed);
  
  const sha256 = crypto.createHash("sha256").update(compressed).digest("base64");
  return { size: compressed.length, sha256 };
}

export async function applyDelta(basePath: string, patchPath: string, outputPath: string): Promise<void> {
  const base = fs.readFileSync(basePath);
  const zlib = await import("zlib");
  const compressed = fs.readFileSync(patchPath);
  const patch = zlib.default.brotliDecompressSync(compressed);
  
  // Read lengths (little-endian, 4 bytes each)
  const baseLen = patch.readUInt32LE(0);
  const newLen = patch.readUInt32LE(4);
  if (newLen <= 0 || newLen > 100 * 1024 * 1024) { // Max 100MB safety check
    throw new Error("Invalid delta patch: size out of bounds");
  }
  const diff = patch.slice(8);
  
  const result = Buffer.alloc(newLen);
  for (let i = 0; i < newLen; i++) {
    const b = i < base.length ? base[i] : 0;
    const d = i < diff.length ? diff[i] : 0;
    result[i] = b ^ d;
  }
  
  fs.writeFileSync(outputPath, result);
}

