terraform {
  required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } }
}
provider "aws" { region = var.region }

resource "aws_s3_bucket" "ota" {
  bucket        = var.bucket
  force_destroy = true
}

resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "kivyx-ota-oac"
  description                       = "OAC for OTA bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled = true
  origins {
    domain_name              = aws_s3_bucket.ota.bucket_regional_domain_name
    origin_id                = "ota_s3_origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }
  default_cache_behavior {
    allowed_methods        = ["GET","HEAD"]
    cached_methods         = ["GET","HEAD"]
    target_origin_id       = "ota_s3_origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    forwarded_values { query_string = false }
    min_ttl     = 0
    default_ttl = 60
    max_ttl     = 300
  }
  price_class = "PriceClass_100"
  restrictions { geo_restriction { restriction_type = "none" } }
  viewer_certificate { cloudfront_default_certificate = true }
}

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    sid     = "AllowCloudFrontOAC"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.ota.arn}/*"]
    principals { type = "Service" identifiers = ["cloudfront.amazonaws.com"] }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}
resource "aws_s3_bucket_policy" "ota_policy" {
  bucket = aws_s3_bucket.ota.id
  policy = data.aws_iam_policy_document.bucket_policy.json
}

resource "aws_kms_key" "signing" {
  description              = "Kivyx OTA signing key"
  key_usage                = "SIGN_VERIFY"
  customer_master_key_spec = "ECC_NIST_P256"
  deletion_window_in_days  = 30
}
resource "aws_kms_alias" "signing_alias" {
  name          = "alias/kivyx-ota-prod-v1"
  target_key_id = aws_kms_key.signing.key_id
}

# DynamoDB for dynamic control plane
resource "aws_dynamodb_table" "releases" {
  name         = "kivyx_releases"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute { name = "pk" type = "S" }
  attribute { name = "sk" type = "N" }
}

# Placeholders for API Gateway + Lambda (implementation & packaging handled in CI)
# module "api" { source = "./modules/api" ... }

# Telemetry table (append-only)
resource "aws_dynamodb_table" "telemetry" {
  name         = "kivyx_telemetry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute { name = "pk" type = "S" }
  attribute { name = "sk" type = "S" }
}


