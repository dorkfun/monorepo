#!/bin/bash
set -e

# dork.fun - Web Static Deploy Script (S3 + CloudFront)
#
# Builds the web app and deploys static files to AWS S3,
# then invalidates the CloudFront distribution cache.
#
# Prerequisites:
#   - AWS CLI installed
#   - AWS credentials configured
#   - pnpm installed
#
# Usage:
#   ./deploy-web.sh --cf-dist-id <CLOUDFRONT_DISTRIBUTION_ID> [OPTIONS]
#
# Options:
#   --cf-dist-id <ID>   CloudFront distribution ID (required)
#   --skip-build        Skip building (deploy existing dist files)

S3_BUCKET="dork.fun"
CF_DIST_ID=""
SKIP_BUILD=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --cf-dist-id)
            CF_DIST_ID="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./deploy-web.sh --cf-dist-id <ID> [--skip-build]"
            exit 1
            ;;
    esac
done

if [ -z "$CF_DIST_ID" ]; then
    echo "Error: --cf-dist-id is required."
    echo "Usage: ./deploy-web.sh --cf-dist-id <CLOUDFRONT_DISTRIBUTION_ID>"
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIST="$PROJECT_DIR/apps/web/dist"

echo "========================================"
echo "dork.fun"
echo "Web Static Deploy (S3 + CloudFront)"
echo "========================================"
echo ""
echo "S3 Bucket:      $S3_BUCKET"
echo "CloudFront ID:  $CF_DIST_ID"
echo ""

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."

    if ! command -v aws &> /dev/null; then
        echo "Error: AWS CLI is not installed."
        echo "Install it with: brew install awscli"
        exit 1
    fi

    # Verify AWS credentials are configured
    if ! aws sts get-caller-identity &> /dev/null; then
        echo "Error: AWS credentials are not configured."
        exit 1
    fi

    if ! command -v pnpm &> /dev/null; then
        echo "Error: pnpm is not installed."
        exit 1
    fi

    echo "All prerequisites met."
    echo ""
}

# Build the web app
build() {
    if [ "$SKIP_BUILD" = true ]; then
        echo "Skipping build (--skip-build specified)"
        echo ""
        return 0
    fi

    echo "Building web app..."
    cd "$PROJECT_DIR"
    pnpm --filter @dorkfun/web build
    echo ""
    echo "Build complete."
    echo ""
}

# Deploy to S3
deploy_s3() {
    echo "Deploying to S3 bucket: $S3_BUCKET..."
    aws s3 sync "$WEB_DIST" "s3://$S3_BUCKET" --delete
    echo ""
    echo "S3 deploy complete."
    echo ""
}

# Invalidate CloudFront cache
invalidate_cache() {
    echo "Invalidating CloudFront distribution: $CF_DIST_ID..."
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$CF_DIST_ID" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)
    echo "Invalidation created: $INVALIDATION_ID"
    echo ""
}

# Main
main() {
    check_prerequisites
    build
    deploy_s3
    invalidate_cache

    echo "========================================"
    echo "Deployment complete!"
    echo "========================================"
    echo ""
    echo "Site: https://dork.fun"
    echo ""
    echo "Note: CloudFront cache invalidation may take a few minutes to propagate."
    echo ""
}

main
