import type { ProposalFormOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import JalaliDatePicker from './JalaliDatePicker';

export type FormField = ProposalFormOutputType['fields'][number];

/** Client-side mirror of the server validation in lib/server.ts → validateAnswers. Returns error per key. */
export function fieldErrors(fields: FormField[], a: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = (a[f.key] ?? '').trim();
    if (!v) { if (f.required) out[f.key] = 'الزامی است'; continue; }
    if (f.minLength && v.length < f.minLength) out[f.key] = `حداقل ${f.minLength.toLocaleString('fa-IR')} نویسه`;
    else if (f.maxLength && v.length > f.maxLength) out[f.key] = `حداکثر ${f.maxLength.toLocaleString('fa-IR')} نویسه`;
    else if (f.type === 'number' && isNaN(Number(v))) out[f.key] = 'باید عدد باشد';
  }
  return out;
}

export default function DynamicForm({ fields, value, onChange, showErrors }: { fields: FormField[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void; showErrors: boolean }) {
  const errs = fieldErrors(fields, value);
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`df-${f.key}`}>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
          {f.type === 'textarea' && <Textarea id={`df-${f.key}`} rows={5} value={value[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />}
          {(f.type === 'text' || f.type === 'number') && <Input id={`df-${f.key}`} dir={f.type === 'number' ? 'ltr' : undefined} inputMode={f.type === 'number' ? 'decimal' : undefined} value={value[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />}
          {f.type === 'select' && (
            <Select value={value[f.key] || undefined} onValueChange={(v) => set(f.key, v)}>
              <SelectTrigger id={`df-${f.key}`}><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
              <SelectContent>{f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {f.type === 'date' && <JalaliDatePicker value={value[f.key] ? new Date(value[f.key]) : undefined} onChange={(d) => set(f.key, d ? d.toISOString() : '')} />}
          {f.helpText && <p className="text-xs text-muted-foreground">{f.helpText}</p>}
          {showErrors && errs[f.key] && <p className="text-xs text-destructive">{errs[f.key]}</p>}
        </div>
      ))}
    </div>
  );
}
