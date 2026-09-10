"""Evidence object storage (PRD 30 - S3 in production, filesystem locally)."""

from __future__ import annotations

import hashlib
from pathlib import Path


def sha256_hex(data: bytes) -> str:
    """PRD FR-02 - every artifact carries a content hash."""
    return hashlib.sha256(data).hexdigest()


class LocalObjectStore:
    """Writes artifacts under a directory and serves them through the API."""

    def __init__(self, root: str | Path, url_prefix: str = "/api/evidence/blob") -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.url_prefix = url_prefix.rstrip("/")

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not str(path).startswith(str(self.root.resolve())):
            raise ValueError(f"key escapes object store root: {key}")
        return path

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"{self.url_prefix}/{key}"

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def signed_url(self, key: str, expires_in: int = 900) -> str:
        """Local mode serves through an authenticated API route instead."""
        return f"{self.url_prefix}/{key}"


class S3ObjectStore:
    """Amazon S3 adapter. Requires the aws extra (boto3)."""

    def __init__(self, bucket: str, prefix: str = "evidence", region: str | None = None) -> None:
        import boto3  # imported lazily so local mode has no AWS dependency

        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.client = boto3.client("s3", region_name=region)

    def _key(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str:
        extra = {"ContentType": content_type} if content_type else {}
        self.client.put_object(Bucket=self.bucket, Key=self._key(key), Body=data, **extra)
        return f"s3://{self.bucket}/{self._key(key)}"

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=self._key(key))["Body"].read()

    def signed_url(self, key: str, expires_in: int = 900) -> str:
        """PRD 34 - evidence is reached through short-lived signed URLs."""
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": self._key(key)},
            ExpiresIn=expires_in,
        )
