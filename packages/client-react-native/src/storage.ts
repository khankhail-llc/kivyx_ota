import * as RNFS from "react-native-fs";

const BASE = `${RNFS.DocumentDirectoryPath}/kivyx_ota`;
const STATE = `${BASE}/state.json`;

export type OtaState = {
  currentVersionCode: number;
  lastGoodVersionCode?: number;
  pendingVersionCode?: number;
  appliedAt?: string;
  etagIndex?: string;
  etagManifest?: Record<number, string>;
  pendingTimeoutMs?: number;
};

export async function getState(): Promise<OtaState> {
  try {
    const content = await RNFS.readFile(STATE, "utf8");
    const parsed = JSON.parse(content);
    // Validate state structure
    if (typeof parsed.currentVersionCode !== "number" || parsed.currentVersionCode < 0) {
      return { currentVersionCode: 0 };
    }
    return parsed;
  } catch {
    return { currentVersionCode: 0 };
  }
}
export async function setState(s: OtaState) {
  await RNFS.mkdir(BASE);
  await RNFS.writeFile(STATE, JSON.stringify(s), "utf8");
}
export function getActiveDir(versionCode: number) {
  return `${BASE}/${versionCode}`;
}
export function getHealthMarker(versionCode: number) {
  return `${getActiveDir(versionCode)}/_healthy`;
}
export async function markHealthy() {
  const st = await getState();
  const v = st.currentVersionCode;
  await RNFS.writeFile(getHealthMarker(v), "ok", "utf8");
  await setState({ currentVersionCode: v, lastGoodVersionCode: v });
}
export async function ensureHealthyOrRollback() {
  const st = await getState();
  if (st.pendingVersionCode && st.currentVersionCode === st.pendingVersionCode) {
    const marker = getHealthMarker(st.pendingVersionCode);
    const exists = await RNFS.exists(marker);
    if (!exists) {
      const rollbackTo = st.lastGoodVersionCode || 0;
      // If pending window exceeded, rollback immediately
      const timeoutMs = st.pendingTimeoutMs || 600000; // 10 minutes default
      if (st.appliedAt) {
        const applied = Date.parse(st.appliedAt);
        if (!isNaN(applied) && Date.now() - applied > timeoutMs) {
          await setState({ currentVersionCode: rollbackTo, lastGoodVersionCode: rollbackTo });
          return;
        }
      }
    }
  }
}


