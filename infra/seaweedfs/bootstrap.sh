#!/bin/sh
# Creates the buckets of docs/architecture/FILES_AND_DOCUMENTS.md, "Storage layout (buckets and
# keys)", on the local SeaweedFS (development and CI only). Safe to run repeatedly: a bucket that
# exists is left as it is. Runs in the AWS CLI image with the one identity of s3.json
# (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) and S3_ENDPOINT, the store's URL.
#
# No bucket gets an ACL, a policy or anonymous access: files are only reached through the API,
# which streams them, and SeaweedFS refuses an unsigned request once an identity is configured.
#
# No bucket versioning and no bucket expiry are set here, on purpose: keeping old versions of
# `documents` and `photos` is a backup concern of the production store (docs/ops/DEPLOYMENT.md,
# "Configuration", the start-up order), and the app's own sweeps already expire `exports` and
# `uploads` (apps/api/src/jobs/export-sweep.ts, apps/api/src/jobs/upload-sweep.ts).
set -eu

: "${S3_ENDPOINT:?the store's URL, for example http://seaweedfs:8333}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
# checksums only where S3 requires them, as the API's client sends them
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

s3api() {
  aws --endpoint-url "$S3_ENDPOINT" s3api "$@"
}

tries=0
until s3api list-buckets >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "SeaweedFS did not answer at $S3_ENDPOINT" >&2
    s3api list-buckets
    exit 1
  fi
  echo "waiting for SeaweedFS..."
  sleep 1
done

for bucket in documents photos vouchers profiles media exports uploads; do
  if s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    echo "bucket $bucket exists"
  else
    s3api create-bucket --bucket "$bucket" >/dev/null
    echo "bucket $bucket created"
  fi
done

echo "SeaweedFS buckets ready"
