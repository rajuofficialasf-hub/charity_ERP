#!/bin/sh
# Creates the development buckets of FILES_AND_DOCUMENTS.md section 8. Safe to run repeatedly.
set -eu

until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "waiting for minio..."
  sleep 1
done

for bucket in documents photos vouchers profiles media exports; do
  mc mb --ignore-existing "local/$bucket"
done

# Versioning on documents and photos (ADR-005); exports are regenerable and expire after 30 days (O-30).
mc version enable local/documents
mc version enable local/photos
if ! mc ilm rule export local/exports >/dev/null 2>&1; then
  mc ilm rule add --expire-days 30 local/exports
fi

# No bucket is public: files are only reached through signed, expiring URLs (BR-204).
for bucket in documents photos vouchers profiles media exports; do
  mc anonymous set none "local/$bucket"
done

echo "minio buckets ready"
