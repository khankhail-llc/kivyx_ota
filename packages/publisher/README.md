# Publisher CLI

## Usage

```bash
pnpm start <app> <ios|android> <channel> <version> <version_code> <entryFile> [runtimeVersion] [mandatory:true|false]
```

## Environment Variables

- `BUCKET` - S3 bucket name
- `CDN_BASE` - CloudFront/CDN base URL
- `KMS_KEY_ID` - KMS key ID for signing
- `KEY_ALIAS` - KMS key alias (e.g., `alias/kivyx-ota-prod-v1`)
- `BASE_VERSION_CODE` - (Optional) Base version code for delta generation
- `REKOR_ENABLED` - (Optional) Set to `"true"` to enable Rekor submission
- `TRANSPARENCY_LOG_ID` - (Optional) Pre-computed transparency log ID

## Delta Updates

Set `BASE_VERSION_CODE` to generate a delta patch. The publisher will:
1. Download the base bundle from S3
2. Generate a delta patch
3. Only use delta if it's < 60% of full bundle size
4. Upload delta to S3 alongside full bundle

## Rekor Integration

Set `REKOR_ENABLED=true` to automatically submit attestations to Sigstore Rekor. Requires `@sigstore/rekor` package.

