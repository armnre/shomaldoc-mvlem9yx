import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { saveThesisDraft, type ThesisDetailOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { errMsg } from '../../lib/format';
import { useSession } from '../../lib/session';

/** First stage: only the thesis topic. Literature review and proposal are unlocked by later workflow stages. */
const schema = z.object({
  titleFa: z.string().trim().min(5, 'موضوع پایان‌نامه حداقل ۵ نویسه').max(300, 'حداکثر ۳۰۰ نویسه'),
  titleEn: z.string().trim().max(300, 'حداکثر ۳۰۰ نویسه'),
});
type F = z.infer<typeof schema>;

export default function TopicForm({ thesis, onSaved }: { thesis: ThesisDetailOutputType['thesis']; onSaved: () => void }) {
  const { token } = useSession();
  const { register, handleSubmit, formState: { errors, isSubmitting, isValid, isDirty } } = useForm<F>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { titleFa: thesis?.titleFa ?? '', titleEn: thesis?.titleEn ?? '' },
  });
  const onSubmit = async (v: F) => {
    try {
      await saveThesisDraft({ token, ...v });
      toast.success('موضوع پایان‌نامه ذخیره شد. اکنون استاد راهنما را انتخاب کنید.');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">مرحلهٔ ۱: موضوع پایان‌نامه</CardTitle>
        <CardDescription>در این مرحله فقط موضوع لازم است. پیشینهٔ تحقیق و پروپوزال پس از تأیید موضوع فعال می‌شوند.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="tf">موضوع پایان‌نامه (فارسی)</Label>
            <Input id="tf" aria-invalid={!!errors.titleFa} aria-describedby="tf-err" {...register('titleFa')} />
            {errors.titleFa && <p id="tf-err" className="text-xs text-destructive">{errors.titleFa.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="te">عنوان انگلیسی (اختیاری)</Label>
            <Input id="te" dir="ltr" {...register('titleEn')} />
            {errors.titleEn && <p className="text-xs text-destructive">{errors.titleEn.message}</p>}
          </div>
          <Button type="submit" disabled={!isValid || isSubmitting || (!!thesis && !isDirty)}>{isSubmitting ? 'در حال ذخیره…' : 'ذخیرهٔ موضوع'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
