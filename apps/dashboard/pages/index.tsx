import { useEffect, useState } from "react";

type Release = {
  version: string;
  version_code: number;
  binary_version: string;
  runtime_version?: string;
  rollout: number;
  mandatory?: boolean;
  manifest_url: string;
  provenance?: { attestation_url?: string; transparency_log_id?: string };
};

export default function Home() {
  const [app, setApp] = useState("com.kivyx.app");
  const [platform, setPlatform] = useState("ios");
  const [channel, setChannel] = useState("Production");
  const [items, setItems] = useState<Release[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiBase, setApiBase] = useState("");

  useEffect(() => {
    setApiBase(process.env.NEXT_PUBLIC_API_BASE || "");
  }, []);

  async function load() {
    setLoading(true);
    try {
      const url = `${apiBase}/releases?app=${encodeURIComponent(app)}&platform=${platform}&channel=${encodeURIComponent(channel)}`;
      const res = await fetch(url);
      const json = await res.json();
      setItems(json.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function setRollout(version_code: number, rollout: number) {
    await fetch(`${apiBase}/rollout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app, platform, channel, version_code, rollout })
    });
    await load();
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h2>Kivyx OTA Dashboard</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={app} onChange={e => setApp(e.target.value)} placeholder="app id" />
        <select value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="ios">ios</option>
          <option value="android">android</option>
        </select>
        <input value={channel} onChange={e => setChannel(e.target.value)} placeholder="channel" />
        <button onClick={load} disabled={loading}>{loading ? "Loading..." : "Load"}</button>
      </div>
      <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Version</th>
            <th align="left">Code</th>
            <th align="left">Binary/Runtime</th>
            <th align="left">Rollout</th>
            <th align="left">Mandatory</th>
            <th align="left">Provenance</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(r => (
            <tr key={r.version_code}>
              <td>{r.version}</td>
              <td>{r.version_code}</td>
              <td>{r.runtime_version || r.binary_version}</td>
              <td>{r.rollout}%</td>
              <td>{r.mandatory ? "Yes" : "No"}</td>
              <td>
                {r.provenance?.attestation_url && (<a href={r.provenance.attestation_url} target="_blank" rel="noreferrer">attestation</a>)}
                {r.provenance?.transparency_log_id && (<span style={{ marginLeft: 8 }}>rekor: {r.provenance.transparency_log_id.slice(0,8)}…</span>)}
              </td>
              <td>
                {[0,1,5,25,50,100].map(p => (
                  <button key={p} onClick={() => setRollout(r.version_code, p)} style={{ marginRight: 6 }}>{p}%</button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


