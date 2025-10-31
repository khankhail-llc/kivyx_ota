# Kivyx OTA Monorepo

Workspaces:
- `@kivyx-ota/client-react-native`: React Native OTA client SDK
- `@kivyx-ota/publisher`: CLI to build, sign, and publish updates
- `@kivyx-ota/schemas`: JSON schemas for manifests and channel index
- `@kivyx-ota/server`: Lambda handlers for dynamic control plane (optional)
- `@kivyx-ota/dashboard`: Next.js admin UI
- `infra/terraform`: AWS infra (S3 + CloudFront + KMS) minimal-cost static control plane

Quick start:
1) Install pnpm: https://pnpm.io/installation
2) `pnpm install`
3) Deploy infra: see `infra/terraform`
4) Configure env and publish: see `packages/publisher`

Server & Dashboard
- Server Lambdas (Node/TS) under `packages/server`:
  - `get_update`: compute device-eligible update
  - `list_releases`: list releases for a channel
  - `set_rollout`: update rollout percentage
- Infra adds DynamoDB `kivyx_releases`; wire API Gateway + Lambdas in your preferred deployment.
- Dashboard `apps/dashboard` consumes `NEXT_PUBLIC_API_BASE` to call the API.


