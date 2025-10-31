# Runbook

1) Deploy infra
- cd infra/terraform
- terraform init
- terraform apply -var="region=us-east-1" -var="bucket=kivyx-ota-<acct>-<region>"
- Note outputs: distribution_domain, kms_key_id, kms_key_alias

2) Configure publisher env (PowerShell)
- $env:BUCKET="kivyx-ota-<acct>-<region>"
- $env:CDN_BASE="https://<distribution_domain>"
- $env:KMS_KEY_ID="<kms_key_id>"
- $env:KEY_ALIAS="alias/kivyx-ota-prod-v1"

3) Install
- pnpm install

4) Publish an OTA
- cd packages/publisher
- pnpm start com.kivyx.app ios Production 1.0.0 1 index.ios.js

5) Integrate client
- In your RN app, call the SDK on startup:

```
import { checkAndApply } from "@kivyx-ota/client-react-native";
await checkAndApply({
  app: "com.kivyx.app",
  channel: "Production",
  binaryVersion: "1.0.0",
  deviceId: "<stable-uuid>",
  cdnBase: "https://<cdn-domain>",
  publicKeys: { "alias/kivyx-ota-prod-v1": { rawPubHex: "<P256-UNCOMPRESSED-HEX>" } }
});
```

6) Rollout
- Re-run publisher to regenerate channel index with higher rollout

7) Rotate keys
- Create new alias v2, add to index `keys`, ship new app with v2 key, switch sign to v2, remove v1.

