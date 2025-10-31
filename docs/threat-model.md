# Threat Model

- Tampering: ECDSA signatures on index and manifest; client verifies before apply.
- Rollback: client enforces monotonic version_code.
- Transport MITM: HTTPS + signature verification; HSTS on CDN domain.
- Key compromise: rotate to v2 key; overlap trust window via `keys` list.
- CDN poisoning: immutable artifact URLs + SHA-256 verification of artifact.
- Infra exposure: S3 private with CloudFront OAC; least-privilege IAM.

