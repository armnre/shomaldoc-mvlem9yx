// Browser replacement for `zitejs/upload`: stores files on the self-hosted server.
import { useState } from 'react';

export function useUpload() {
  const [isUploading, setUploading] = useState(false);
  const upload = async (file: File | Blob, filename?: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file, filename ?? (file as File).name ?? 'file');
      const res = await fetch('/api/_upload', { method: 'POST', body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.userFacingMessage ?? 'بارگذاری فایل ناموفق بود.');
      return { url: body.url as string };
    } finally {
      setUploading(false);
    }
  };
  return { upload, isUploading };
}
