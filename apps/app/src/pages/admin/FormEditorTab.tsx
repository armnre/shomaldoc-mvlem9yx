import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { proposalForm, type ProposalFormInputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import { Textarea } from '@project/components/ui/textarea';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import DynamicForm from '../../components/DynamicForm';
import { useSession } from '../../lib/session';
import { errMsg } from '../../lib/format';

type F = NonNullable<ProposalFormInputType['save']>['fields'][number] & { uid: string };
const TYPES: Record<F['type'], string> = { text: 'متن کوتاه', textarea: 'متن بلند', number: 'عدد', select: 'انتخابی', date: 'تاریخ (شمسی)' };
const uid = () => Math.random().toString(36).slice(2);

export default function FormEditorTab() {
  const { token } = useSession();
  const [name, setName] = useState('');
  const [fields, setFields] = useState<F[] | null>(null);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  useEffect(() => {
    proposalForm({ token }).then((r) => {
      setName(r.name || 'فرم پروپوزال');
      setFields(r.fields.map((f) => ({ uid: uid(), label: f.label, key: f.key, type: f.type as F['type'], required: f.required, options: f.options, minLength: f.minLength, maxLength: f.maxLength, helpText: f.helpText })));
    }).catch((e) => toast.error(errMsg(e)));
  }, [token]);
  if (!fields) return <Skeleton className="h-80" />;
  const upd = (u: string, patch: Partial<F>) => setFields(fields.map((f) => (f.uid === u ? { ...f, ...patch } : f)));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = fields.map((f) => f.uid);
    setFields(arrayMove(fields, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  const save = async () => {
    setBusy(true);
    try {
      await proposalForm({ token, save: { name, fields: fields.map(({ uid: _u, ...f }) => f) } });
      toast.success('فرم پروپوزال ذخیره شد. از این پس دانشجویان همین فرم را می‌بینند.');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ویرایشگر فرم پروپوزال</CardTitle>
          <p className="text-sm text-muted-foreground">فیلدها را بکشید تا ترتیب تغییر کند. اگر فرم خالی باشد، دانشجو فرم متنی ساده را می‌بیند.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="نام فرم" />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={fields.map((f) => f.uid)} strategy={verticalListSortingStrategy}>
              {fields.map((f) => <FieldRow key={f.uid} f={f} upd={(p) => upd(f.uid, p)} remove={() => setFields(fields.filter((x) => x.uid !== f.uid))} />)}
            </SortableContext>
          </DndContext>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFields([...fields, { uid: uid(), label: '', key: `field_${fields.length + 1}`, type: 'textarea', required: true, options: [], minLength: null, maxLength: null, helpText: '' }])}><Plus className="h-4 w-4" />افزودن فیلد</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ فرم'}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">پیش‌نمایش (همان چیزی که دانشجو می‌بیند)</CardTitle></CardHeader>
        <CardContent>
          {fields.length ? <DynamicForm fields={fields.map((f, i) => ({ ...f, id: f.uid, order: i }))} value={preview} onChange={setPreview} showErrors /> : <p className="text-sm text-muted-foreground">فیلدی تعریف نشده است.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldRow({ f, upd, remove }: { f: F; upd: (p: Partial<F>) => void; remove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: f.uid });
  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.floor(Number(s)) || 0));
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <button type="button" className="cursor-grab touch-none text-muted-foreground" aria-label="جابه‌جایی" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
        <Input placeholder="عنوان فیلد" value={f.label} onChange={(e) => upd({ label: e.target.value })} />
        <Select value={f.type} onValueChange={(v) => upd({ type: v as F['type'] })}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={remove} aria-label="حذف فیلد"><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input dir="ltr" placeholder="key" value={f.key} onChange={(e) => upd({ key: e.target.value })} />
        <Input dir="ltr" inputMode="numeric" placeholder="حداقل طول" value={f.minLength ?? ''} onChange={(e) => upd({ minLength: num(e.target.value) })} />
        <Input dir="ltr" inputMode="numeric" placeholder="حداکثر طول" value={f.maxLength ?? ''} onChange={(e) => upd({ maxLength: num(e.target.value) || null })} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.required} onCheckedChange={(c) => upd({ required: c })} />اجباری</label>
      </div>
      <Input placeholder="راهنمای فیلد (اختیاری)" value={f.helpText} onChange={(e) => upd({ helpText: e.target.value })} />
      {f.type === 'select' && <Textarea rows={3} placeholder="گزینه‌ها (هر گزینه در یک خط)" value={f.options.join('\n')} onChange={(e) => upd({ options: e.target.value.split('\n') })} />}
    </div>
  );
}
