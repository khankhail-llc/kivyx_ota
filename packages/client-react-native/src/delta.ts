import * as RNFS from "react-native-fs";
import { b64sha256 } from "./hash";

// Simple delta apply (production: use proper bsdiff library)
export async function applyDelta(basePath: string, deltaPath: string, outputPath: string): Promise<void> {
  const baseBase64 = await RNFS.readFile(basePath, "base64");
  const base = Buffer.from(baseBase64, "base64");
  
  const deltaBase64 = await RNFS.readFile(deltaPath, "base64");
  const zlib = await import("zlib");
  const compressed = Buffer.from(deltaBase64, "base64");
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
  
  await RNFS.writeFile(outputPath, result.toString("base64"), "base64");
}

