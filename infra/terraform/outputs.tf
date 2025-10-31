output "bucket" { value = aws_s3_bucket.ota.bucket }
output "distribution_domain" { value = aws_cloudfront_distribution.cdn.domain_name }
output "kms_key_id" { value = aws_kms_key.signing.key_id }
output "kms_key_alias" { value = aws_kms_alias.signing_alias.name }
output "releases_table" { value = aws_dynamodb_table.releases.name }
output "telemetry_table" { value = aws_dynamodb_table.telemetry.name }


