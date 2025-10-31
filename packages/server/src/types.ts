export type ReleaseItem = {
  pk: string; // app#platform#channel
  sk: number; // version_code
  version_code: number;
  version: string;
  binary_version: string;
  rollout: number;
  manifest_url: string;
};


