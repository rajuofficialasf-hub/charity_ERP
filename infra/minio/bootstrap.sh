#!/bin/sh
# Creates the development buckets of docs/architecture/FILES_AND_DOCUMENTS.md, "Storage layout
# (buckets and keys)". Safe to run repeatedly.
set -eu

until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "waiting for minio..."
  sleep 1
done

for bucket in documents photos vouchers profiles media exports uploads; do
  mc mb --ignore-existing "local/$bucket"
done

# Versioning on documents and photos (docs/architecture/ADR/ADR-005-minio-object-storage.md);
# exports are regenerable and expire after 30 days.
mc version enable local/documents
mc version enable local/photos
if ! mc ilm rule export local/exports >/dev/null 2>&1; then
  mc ilm rule add --expire-days 30 local/exports
fi
# the parts of uploads in progress: never versioned, anything left after two days goes
if ! mc ilm rule export local/uploads >/dev/null 2>&1; then
  mc ilm rule add --expire-days 2 local/uploads
fi

# No bucket is public: files are only reached through the API, which streams them.
for bucket in documents photos vouchers profiles media exports uploads; do
  mc anonymous set none "local/$bucket"
done

echo "minio buckets ready"
