import { useSession } from '../../lib/session';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { proposalForm, submitDocument, type SubmitDocumentInputType } from 'zitejs/api';
import DynamicForm, { fieldErrors, type FormField } from '../../components/DynamicForm';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import FileUploader, { type UploadedFile } from '../../components/FileUploader';
import { errMsg, fa } from '../../lib/format';

const META = {
  topic: { title: 'ارسال مجدد موضوع اصلاح‌شده', label: 'شرح اصلاحات انجام‌شده', hint: '' },
  literature: { title: 'ثبت پیشینه تحقیق', label: 'متن پیشینه تحقیق', hint: 'مرور مطالعات مرتبط، منابع کلیدی و شکاف پژوهشی را بنویسید.' },
  final: { title: 'ارسال نسخهٔ نهایی پایان‌نامه', label: 'چکیدهٔ پایان‌نامه و شرح تغییرات نسبت به نسخهٔ قبل', hint: 'بارگذاری فایل کامل پایان‌نامه (PDF یا Word) الزامی است. پس از ارسال، استاد راهنما آن را بررسی می‌کند.' },
  proposal: { title: 'ارسال پروپوزال', label: 'خلاصه پروپوزال (روش تحقیق، سوالات/فرضیه‌ها، زمان‌بندی)', hint: 'بارگذاری فایل کامل پروپوزال (Word یا PDF) الزامی است.' },
};

export default function DocumentSubmit({ kind, lastComment, onDone }: { kind: SubmitDocumentInputType['kind']; lastComment?: string; onDone: () => void }) {
  const { token } = useSession();
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (kind === 'proposal') proposalForm({ token }).then((r) => setFields(r.fields)).catch((e) => toast.error(errMsg(e))); }, [kind, token]);
  const m = META[kind];
  const dynamic = kind === 'proposal' && fields.length > 0;
  const formOk = !dynamic || Object.keys(fieldErrors(fields, answers)).length === 0;
  const valid = (dynamic ? formOk : content.trim().length >= 20) && ((kind !== 'proposal' && kind !== 'final') || files.length > 0);
  const submit = async () => {
    setBusy(true);
    try {
      await submitDocument({ token, kind, content, files, formAnswers: dynamic ? answers : undefined });
      toast.success('ارسال شد و نسخهٔ جدید ثبت گردید.');
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.title}</CardTitle>
        {m.hint && <p className="text-sm text-muted-foreground">{m.hint}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {lastComment && <div className="rounded-md border border-amber-300 bg-accent p-3 text-sm text-accent-foreground">نظر بررسی‌کننده: {lastComment}</div>}
        {dynamic && <div onBlur={() => setTouched(true)}><DynamicForm fields={fields} value={answers} onChange={setAnswers} showErrors={touched} /></div>}
        <div className="space-y-1.5">
          <Label htmlFor="dc">{dynamic ? 'توضیحات تکمیلی (اختیاری)' : m.label}</Label>
          <Textarea id="dc" rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
          {!dynamic && <p className="text-xs text-muted-foreground">{fa(content.trim().length)} نویسه (حداقل ۲۰)</p>}
        </div>
        <FileUploader files={files} onChange={setFiles} />
        <Button disabled={!valid || busy} onClick={submit}>{busy ? 'در حال ارسال…' : 'ارسال'}</Button>
      </CardContent>
    </Card>
  );
}
