import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { saveThesisDraft, type ThesisDetailOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { errMsg } from '../../lib/format';
import { useSession } from '../../lib/session';

const schema = z.object({
  titleFa: z.string().trim().min(5, 'عنوان فارسی حداقل ۵ نویسه').max(300),
  titleEn: z.string().trim().max(300),
  keywords: z.string().trim().min(2, 'حداقل یک کلیدواژه وارد کنید'),
  problemStatement: z.string().trim().min(30, 'شرح مسئله حداقل ۳۰ نویسه'),
  objectives: z.string().trim().min(20, 'اهداف حداقل ۲۰ نویسه'),
});
type F = z.infer<typeof schema>;

export default function TopicForm({ thesis, onSaved }: { thesis: ThesisDetailOutputType['thesis']; onSaved: () => void }) {
  const { token } = useSession();
  const { register, handleSubmit, formState: { errors, isSubmitting, isValid, isDirty } } = useForm<F>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      titleFa: thesis?.titleFa ?? '', titleEn: thesis?.titleEn ?? '', keywords: thesis?.keywords ?? '',
      problemStatement: thesis?.problemStatement ?? '', objectives: thesis?.objectives ?? '',
    },
  });
  const onSubmit = async (v: F) => {
    try {
      await saveThesisDraft({ token, ...v });
      toast.success('پیش‌نویس موضوع ذخیره شد.');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const err = (k: keyof F) => errors[k] && <p className="text-xs text-destructive">{errors[k]?.message}</p>;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">مشخصات موضوع پیشنهادی</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="tf">عنوان فارسی</Label><Input id="tf" {...register('titleFa')} />{err('titleFa')}</div>
          <div className="space-y-1.5"><Label htmlFor="te">عنوان انگلیسی</Label><Input id="te" dir="ltr" {...register('titleEn')} />{err('titleEn')}</div>
          <div className="space-y-1.5"><Label htmlFor="kw">کلیدواژه‌ها (با ویرگول جدا کنید)</Label><Input id="kw" {...register('keywords')} />{err('keywords')}</div>
          <div className="space-y-1.5"><Label htmlFor="ps">شرح مسئله</Label><Textarea id="ps" rows={5} {...register('problemStatement')} />{err('problemStatement')}</div>
          <div className="space-y-1.5"><Label htmlFor="ob">اهداف</Label><Textarea id="ob" rows={4} {...register('objectives')} />{err('objectives')}</div>
          <Button type="submit" disabled={!isValid || isSubmitting || (!!thesis && !isDirty)}>{isSubmitting ? 'در حال ذخیره…' : 'ذخیره پیش‌نویس'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
