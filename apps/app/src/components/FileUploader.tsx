import { useRef } from 'react';
import { useUpload } from 'zitejs/upload';
import { toast } from 'sonner';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';

export type UploadedFile = { url: string; filename: string };

const ALLOWED = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
const MAX_MB = 20;

export default function FileUploader({ files, onChange }: { files: UploadedFile[]; onChange: (f: UploadedFile[]) => void }) {
  const { upload, isUploading } = useUpload();
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED.includes(ext)) return toast.error('فقط فایل‌های PDF، Word و تصویر (JPG/PNG) مجاز است.');
    if (f.size > MAX_MB * 1024 * 1024) return toast.error(`حداکثر حجم فایل ${MAX_MB} مگابایت است.`);
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
    const isZip = head[0] === 0x50 && head[1] === 0x4b;
    const isOle = head[0] === 0xd0 && head[1] === 0xcf;
    const isJpg = head[0] === 0xff && head[1] === 0xd8;
    const isPng = head[0] === 0x89 && head[1] === 0x50;
    if (((ext === 'jpg' || ext === 'jpeg') && !isJpg) || (ext === 'png' && !isPng) || (ext === 'pdf' && !isPdf) || (ext === 'docx' && !isZip) || (ext === 'doc' && !isOle))
      return toast.error('محتوای فایل با پسوند آن مطابقت ندارد.');
    try {
      const { url } = await upload(f);
      onChange([...files, { url, filename: f.name }]);
    } catch {
      toast.error('بارگذاری فایل ناموفق بود.');
    }
  };
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={pick} />
      <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => ref.current?.click()}>
        <Paperclip className="ml-2 h-4 w-4" /> {isUploading ? 'در حال بارگذاری…' : 'افزودن فایل (PDF، Word، تصویر)'}
      </Button>
      {files.map((f, i) => (
        <div key={f.url} className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
          <span className="truncate">{f.filename}</span>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="حذف فایل" onClick={() => onChange(files.filter((_, j) => j !== i))}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
