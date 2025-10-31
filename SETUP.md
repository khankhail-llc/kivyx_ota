# Complete Local Setup Guide for Kivyx OTA

This guide will help you set up the entire Kivyx OTA solution locally from scratch. Follow each step carefully.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Install Required Software](#step-1-install-required-software)
3. [Step 2: Clone and Setup Repository](#step-2-clone-and-setup-repository)
4. [Step 3: AWS Account Setup](#step-3-aws-account-setup)
5. [Step 4: Configure AWS Credentials](#step-4-configure-aws-credentials)
6. [Step 5: Deploy Infrastructure](#step-5-deploy-infrastructure)
7. [Step 6: Setup Publisher Locally](#step-6-setup-publisher-locally)
8. [Step 7: Setup Client SDK](#step-7-setup-client-sdk)
9. [Step 8: Setup Server (Optional)](#step-8-setup-server-optional)
10. [Step 9: Setup Dashboard (Optional)](#step-9-setup-dashboard-optional)
11. [Step 10: Test End-to-End](#step-10-test-end-to-end)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:
- A computer with Windows, macOS, or Linux
- Administrator access (for software installation)
- An AWS account (free tier is sufficient)
- A code editor (VS Code recommended)
- Basic command line knowledge

**Estimated Time**: 2-3 hours for first-time setup

---

## Step 1: Install Required Software

### 1.1 Install Node.js

1. Visit [https://nodejs.org/](https://nodejs.org/)
2. Download the **LTS version** (Long Term Support)
3. Run the installer:
   - **Windows**: Run `.msi` file, click Next through all prompts
   - **macOS**: Run `.pkg` file, follow installation wizard
   - **Linux**: Use your package manager (e.g., `sudo apt install nodejs npm` on Ubuntu)

4. Verify installation:
   ```bash
   node --version
   npm --version
   ```
   You should see versions like `v20.x.x` and `10.x.x`

### 1.2 Install pnpm

**Option A: Using npm (Recommended)**
```bash
npm install -g pnpm
```

**Option B: Using standalone installer**
- Visit [https://pnpm.io/installation](https://pnpm.io/installation)
- Follow instructions for your OS

Verify installation:
```bash
pnpm --version
```
You should see version `9.x.x` or higher

### 1.3 Install Git

1. Visit [https://git-scm.com/downloads](https://git-scm.com/downloads)
2. Download for your operating system
3. Run installer with default options
4. Verify installation:
   ```bash
   git --version
   ```

### 1.4 Install Terraform

1. Visit [https://developer.hashicorp.com/terraform/downloads](https://developer.hashicorp.com/terraform/downloads)
2. Download for your OS
3. **Windows**:
   - Extract zip file
   - Add terraform.exe to your PATH (or use installer)
4. **macOS**: Use Homebrew: `brew install terraform`
5. **Linux**: Download and extract, add to PATH

Verify installation:
```bash
terraform --version
```

### 1.5 Install AWS CLI

1. Visit [https://aws.amazon.com/cli/](https://aws.amazon.com/cli/)
2. **Windows**: Download `.msi` installer
3. **macOS**: Use Homebrew: `brew install awscli`
4. **Linux**: Follow instructions for your distribution

Verify installation:
```bash
aws --version
```

### 1.6 (Optional) Install React Native CLI

Only needed if testing client SDK in a React Native app:

```bash
npm install -g react-native-cli
```

---

## Step 2: Clone and Setup Repository

### 2.1 Clone the Repository

Open a terminal/command prompt and navigate to where you want the project:

```bash
# Navigate to your projects folder
cd ~/projects  # macOS/Linux
# or
cd D:\projects  # Windows

# Clone the repository
git clone https://github.com/khankhail-llc/kivyx_ota.git

# Navigate into the project
cd kivyx_ota
```

### 2.2 Install Dependencies

```bash
# Install all dependencies for all packages
pnpm install
```

This will take 2-5 minutes. You should see output like:
```
Packages: +XXX
++++++++++++++++++++++++++++++++++++++++++
```

### 2.3 Verify Setup

```bash
# List all workspaces
pnpm list --depth=0

# Build all packages
pnpm build
```

If everything works, you'll see build outputs without errors.

---

## Step 3: AWS Account Setup

### 3.1 Create AWS Account

1. Visit [https://aws.amazon.com/](https://aws.amazon.com/)
2. Click "Create an AWS Account"
3. Follow the signup process (requires credit card, but free tier available)
4. Wait for account activation (usually instant)

### 3.2 Access AWS Console

1. Go to [https://console.aws.amazon.com/](https://console.aws.amazon.com/)
2. Sign in with your credentials
3. Navigate to **IAM** (Identity and Access Management)

### 3.3 Create IAM User for Local Development

1. In IAM console, click **Users** → **Create user**
2. Username: `kivyx-ota-dev` (or your preference)
3. Check **"Provide user access to the AWS Management Console"**
4. Select **"Programmatic access"**
5. Click **Next**

6. **Attach policies**:
   - Search and select: `AmazonS3FullAccess`
   - Search and select: `CloudFrontFullAccess`
   - Search and select: `AWSKeyManagementServicePowerUser`
   - Search and select: `AmazonDynamoDBFullAccess`
   - Search and select: `IAMFullAccess` (for Terraform)

7. Click **Next** through tags, then **Create user**

8. **IMPORTANT**: Save these credentials:
   - **Access Key ID**: Copy this
   - **Secret Access Key**: Copy this (only shown once!)

**Security Note**: For production, use minimal required permissions. These broad permissions are for development only.

### 3.4 Note Your AWS Account ID

1. In AWS Console, click your username (top right)
2. Your **Account ID** is displayed (12-digit number)
3. Write this down: `123456789012`

---

## Step 4: Configure AWS Credentials

### 4.1 Configure AWS CLI

```bash
aws configure
```

You'll be prompted for:
```
AWS Access Key ID [None]: <paste your Access Key ID>
AWS Secret Access Key [None]: <paste your Secret Access Key>
Default region name [None]: us-east-1
Default output format [None]: json
```

### 4.2 Verify AWS Configuration

```bash
# Test AWS access
aws sts get-caller-identity
```

You should see your account ID and user name. If you see an error, check your credentials.

### 4.3 Set Environment Variables (Optional)

**Windows PowerShell:**
```powershell
$env:AWS_ACCESS_KEY_ID="your-access-key"
$env:AWS_SECRET_ACCESS_KEY="your-secret-key"
$env:AWS_DEFAULT_REGION="us-east-1"
```

**macOS/Linux:**
```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
```

---

## Step 5: Deploy Infrastructure

### 5.1 Navigate to Terraform Directory

```bash
cd infra/terraform
```

### 5.2 Create Terraform Variables File

Create a file named `terraform.tfvars`:

```hcl
region = "us-east-1"
bucket = "kivyx-ota-123456789012-us-east-1"
```

Replace `123456789012` with your AWS Account ID.

**Note**: S3 bucket names must be globally unique. If you get an error, try:
```
bucket = "kivyx-ota-123456789012-<your-name>-us-east-1"
```

### 5.3 Initialize Terraform

```bash
terraform init
```

You should see:
```
Initializing the backend...
Initializing provider plugins...
Terraform has been successfully initialized!
```

### 5.4 Plan Infrastructure

```bash
terraform plan
```

This shows what will be created. Review the output:
- S3 bucket
- CloudFront distribution
- KMS key
- DynamoDB tables (optional, for dynamic mode)

### 5.5 Apply Infrastructure

```bash
terraform apply
```

Type `yes` when prompted. This takes 5-10 minutes.

**What's being created:**
- S3 bucket (private, for storing artifacts)
- CloudFront distribution (CDN for public access)
- KMS key (for signing manifests)
- DynamoDB tables (for dynamic control plane)

### 5.6 Save Output Values

After successful deployment, save the outputs:

```bash
terraform output
```

You'll see something like:
```
bucket = "kivyx-ota-123456789012-us-east-1"
distribution_domain = "d1234567890.cloudfront.net"
kms_key_id = "12345678-1234-1234-1234-123456789012"
kms_key_alias = "alias/kivyx-ota-prod-v1"
```

**IMPORTANT**: Copy these values. You'll need them in the next steps.

### 5.7 Extract KMS Public Key

Create a script to extract the public key:

```bash
# Create get-public-key.js
cat > ../scripts/get-public-key.js << 'EOF'
const { KMSClient, GetPublicKeyCommand } = require("@aws-sdk/client-kms");

const kms = new KMSClient({ region: process.env.AWS_REGION || "us-east-1" });
const keyId = process.argv[2] || process.env.KMS_KEY_ID;

async function main() {
  const pubKey = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }));
  console.log("Public Key (SPKI Base64):");
  console.log(Buffer.from(pubKey.PublicKey).toString("base64"));
  console.log("\nNote: For client, convert SPKI to uncompressed P-256 point (64 bytes hex)");
}

main().catch(console.error);
EOF

# Run it
node ../scripts/get-public-key.js <your-kms-key-id>
```

**Note**: Converting SPKI to uncompressed P-256 requires additional steps. For now, note the SPKI value.

---

## Step 6: Setup Publisher Locally

### 6.1 Navigate to Publisher Package

```bash
cd ../../packages/publisher
```

### 6.2 Create Environment Variables File

**Windows PowerShell:**
```powershell
$env:BUCKET="kivyx-ota-123456789012-us-east-1"
$env:CDN_BASE="https://d1234567890.cloudfront.net"
$env:KMS_KEY_ID="<from-terraform-output>"
$env:KEY_ALIAS="alias/kivyx-ota-prod-v1"
```

**macOS/Linux:**
Create `.env` file:
```bash
cat > .env << EOF
BUCKET=kivyx-ota-123456789012-us-east-1
CDN_BASE=https://d1234567890.cloudfront.net
KMS_KEY_ID=<from-terraform-output>
KEY_ALIAS=alias/kivyx-ota-prod-v1
EOF
```

### 6.3 Verify Publisher Setup

```bash
# Check dependencies
pnpm list

# Try running (will show usage if not enough args)
pnpm start
```

You should see the usage message.

### 6.4 Test Publisher (Requires React Native Project)

**Note**: This step requires a React Native project. If you don't have one:

1. Create a test React Native project:
```bash
npx react-native init TestApp
cd TestApp
```

2. Build a bundle:
```bash
npx react-native bundle --entry-file index.js --bundle-output test.bundle --platform ios --dev false
```

3. Use the publisher (from kivyx_ota/packages/publisher):
```bash
# Copy test.bundle to dist/ first, or adjust paths
pnpm start com.test.app ios Production 1.0.0 1 index.js
```

**For production use**, you'll run this from your actual React Native project directory.

---

## Step 7: Setup Client SDK

### 7.1 Navigate to Client Package

```bash
cd ../../packages/client-react-native
```

### 7.2 Build the Package

```bash
pnpm build
```

This creates the `dist/` folder with compiled TypeScript.

### 7.3 Link to Your React Native App

**Option A: Using npm link (Local Development)**

```bash
# In client-react-native directory
cd dist
npm link

# In your React Native app
cd /path/to/your/rn-app
npm link @kivyx-ota/client-react-native
```

**Option B: Install from Local Path**

In your React Native app's `package.json`:
```json
{
  "dependencies": {
    "@kivyx-ota/client-react-native": "file:../../kivyx_ota/packages/client-react-native"
  }
}
```

Then:
```bash
npm install
```

### 7.4 Add Peer Dependencies to Your App

Your React Native app needs these dependencies:

```bash
npm install react-native-fs react-native-zip-archive @noble/curves @noble/hashes semver
```

For iOS:
```bash
cd ios
pod install
cd ..
```

### 7.5 Verify Client SDK Import

In your React Native app, create a test file:

```typescript
// App.tsx or index.js
import { checkAndApply } from "@kivyx-ota/client-react-native";

console.log("OTA SDK loaded:", checkAndApply);
```

Run your app - you should not see import errors.

---

## Step 8: Setup Server (Optional)

The server is optional - you can use static control plane (S3 only) for most use cases.

### 8.1 Navigate to Server Package

```bash
cd ../../packages/server
```

### 8.2 Build Server

```bash
pnpm build
```

### 8.3 Setup Local Lambda Testing (Optional)

Install SAM CLI for local Lambda testing:
- Visit [https://aws.amazon.com/serverless/sam/](https://aws.amazon.com/serverless/sam/)

Or use Docker to run Lambdas locally.

**Note**: For development, you can test server endpoints directly if deployed to AWS Lambda via API Gateway.

### 8.4 Deploy Server Functions (When Ready)

Deploy using:
- AWS SAM
- Serverless Framework
- Terraform modules
- AWS Console (manual)

---

## Step 9: Setup Dashboard (Optional)

### 9.1 Navigate to Dashboard

```bash
cd ../../apps/dashboard
```

### 9.2 Install Dependencies

```bash
pnpm install
```

### 9.3 Configure Environment

Create `.env.local`:
```bash
NEXT_PUBLIC_API_BASE=http://localhost:3000/api
```

Or if using deployed API:
```bash
NEXT_PUBLIC_API_BASE=https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod
```

### 9.4 Run Dashboard

```bash
pnpm dev
```

Open [http://localhost:4000](http://localhost:4000)

You should see the dashboard UI. If API is not connected, you'll see errors in the console (expected if not using dynamic mode).

---

## Step 10: Test End-to-End

### 10.1 Create Test React Native App

```bash
cd ~/projects  # or D:\projects on Windows
npx react-native init OtaTestApp
cd OtaTestApp
```

### 10.2 Install Client SDK

Follow Step 7 to install the client SDK.

### 10.3 Add Test Code

In your app's entry file (`App.tsx` or `index.js`):

```typescript
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { checkAndApply, ensureHealthyOrRollback, markHealthy } from '@kivyx-ota/client-react-native';

// Get a stable device ID (use a UUID library or device ID)
const DEVICE_ID = 'test-device-123'; // In production, use a real UUID

function App() {
  useEffect(() => {
    async function testOTA() {
      try {
        // Step 1: Check for rollback on startup
        await ensureHealthyOrRollback();
        
        // Step 2: Check for updates
        const result = await checkAndApply({
          app: 'com.test.app',
          channel: 'Production',
          binaryVersion: '1.0.0',
          deviceId: DEVICE_ID,
          cdnBase: 'https://<your-cloudfront-domain>.cloudfront.net',
          publicKeys: {
            'alias/kivyx-ota-prod-v1': {
              rawPubHex: '<64-byte-hex-public-key>'
            }
          }
        });

        if (result.updated) {
          console.log('✅ Update applied! Version:', result.versionCode);
        } else {
          console.log('ℹ️ No updates available');
        }

        // Step 3: Mark healthy after stable operation
        setTimeout(async () => {
          await markHealthy();
          console.log('✅ Marked as healthy');
        }, 30000); // After 30 seconds

      } catch (error) {
        console.error('❌ OTA Error:', error);
      }
    }

    testOTA();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>OTA Test App</Text>
    </View>
  );
}

export default App;
```

### 10.4 Publish a Test Update

1. Create a simple bundle:
```bash
cd packages/publisher
# Make sure env vars are set (Step 6.2)
pnpm start com.test.app ios Production 1.0.1 2 index.js
```

2. Run your test app and check logs for update detection.

### 10.5 Verify Update Applied

Check your app logs:
- Should see "Update applied! Version: 2"
- Check app filesystem: `${RNFS.DocumentDirectoryPath}/kivyx_ota/2/`

---

## Troubleshooting

### Common Issues

#### Issue: "AWS credentials not found"
**Solution**:
```bash
aws configure
# Enter your credentials again
aws sts get-caller-identity  # Verify
```

#### Issue: "S3 bucket already exists"
**Solution**: 
- Bucket names must be globally unique
- Change bucket name in `terraform.tfvars`
- Use a unique suffix like your name

#### Issue: "Terraform state locked"
**Solution**:
```bash
terraform force-unlock <lock-id>
```
Or delete `.terraform/terraform.tfstate` (loses state, recreate infra)

#### Issue: "pnpm: command not found"
**Solution**:
```bash
npm install -g pnpm
# Restart terminal
```

#### Issue: "Module not found: @kivyx-ota/client-react-native"
**Solution**:
- Make sure you linked the package (Step 7.3)
- Run `npm install` in your React Native app
- Check `node_modules/@kivyx-ota/client-react-native` exists

#### Issue: "KMS signing failed"
**Solution**:
- Verify `KMS_KEY_ID` matches terraform output
- Check IAM user has KMS permissions
- Verify key is in same region as specified

#### Issue: "Delta generation failed"
**Solution**:
- Ensure `BASE_VERSION` (string) and `BASE_VERSION_CODE` (number) both set
- Verify base version bundle exists in S3
- Check base version path format matches: `${app}/${platform}/${BASE_VERSION}/bundle.zip`

#### Issue: "CloudFront distribution not ready"
**Solution**:
- CloudFront deployment takes 10-15 minutes
- Wait and check status: `terraform output distribution_domain`
- Use `https://` prefix in `CDN_BASE`

#### Issue: "State file corruption"
**Solution**:
- Client automatically recovers with default state
- Manually delete: `${RNFS.DocumentDirectoryPath}/kivyx_ota/state.json`
- App will reset to version 0

### Getting Help

1. Check logs:
   - Publisher: Console output shows detailed errors
   - Client: React Native logs show OTA operations
   - Terraform: `terraform plan` shows what will happen

2. Verify each step:
   - Go back and verify prerequisites
   - Check AWS Console for created resources
   - Verify environment variables are set

3. Check documentation:
   - `README.md` - General overview
   - `docs/runbook.md` - Operational procedures
   - `VERIFICATION_COMPLETE.md` - Known issues and fixes

---

## Next Steps

After successful setup:

1. **Read the README**: Understand all features
2. **Try publishing**: Create multiple releases
3. **Test rollouts**: Use dashboard to adjust percentages
4. **Test deltas**: Publish version 1.0.0, then 1.0.1 with delta
5. **Test rollback**: Simulate crash and verify rollback
6. **Monitor**: Set up CloudWatch alarms

---

## Quick Reference

### Key Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Publish update
cd packages/publisher
pnpm start <app> <platform> <channel> <version> <version_code> <entryFile>

# Run dashboard
cd apps/dashboard
pnpm dev

# Terraform commands
cd infra/terraform
terraform init
terraform plan
terraform apply
terraform output
terraform destroy  # Clean up everything
```

### Important Paths

- Publisher config: `packages/publisher/.env` (or env vars)
- Client SDK: `packages/client-react-native/dist/`
- Infrastructure: `infra/terraform/`
- Terraform state: `infra/terraform/.terraform/`

### Environment Variables Summary

**Publisher:**
- `BUCKET` - S3 bucket name
- `CDN_BASE` - CloudFront URL
- `KMS_KEY_ID` - KMS key ID
- `KEY_ALIAS` - KMS key alias
- `BASE_VERSION_CODE` - For delta (optional)
- `BASE_VERSION` - For delta (optional)

**Client:**
- Configure in code: `cdnBase`, `publicKeys`

**Dashboard:**
- `NEXT_PUBLIC_API_BASE` - API Gateway URL

---

**Setup Complete!** 🎉

You now have a fully functional OTA system running locally. Start experimenting and building!

