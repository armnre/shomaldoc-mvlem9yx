import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Label } from '@project/components/ui/label';
import { cn } from '@project/components/lib/utils';
import { STEP_LABELS } from '../lib/format';

function StepItem({ id, index, onRemove }: { id: string; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 rounded-lg border bg-card p-2.5 shadow-sm', isDragging && 'z-10 ring-2 ring-primary')}>
      <button type="button" className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing" aria-label="جابه‌جایی" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{(index + 1).toLocaleString('fa-IR')}</span>
      <span className="flex-1 text-sm font-medium">{STEP_LABELS[id] ?? id}</span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} aria-label="حذف مرحله"><X className="h-4 w-4" /></Button>
    </div>
  );
}

/** Graphical approval-chain editor: drag to reorder, add/remove steps. Value is a comma-separated chain. */
export default function ChainEditor({ label, value, onChange, steps }: { label: string; value: string; onChange: (v: string) => void; steps: string[] }) {
  const chain = value.split(',').filter(Boolean);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onChange(arrayMove(chain, chain.indexOf(String(active.id)), chain.indexOf(String(over.id))).join(','));
  };
  const unused = steps.filter((s) => !chain.includes(s));
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <Label>{label}</Label>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={chain} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {chain.map((s, i) => <StepItem key={s} id={s} index={i} onRemove={() => onChange(chain.filter((x) => x !== s).join(','))} />)}
          </div>
        </SortableContext>
      </DndContext>
      {!chain.length && <p className="text-xs text-destructive">حداقل یک مرحله لازم است.</p>}
      {unused.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unused.map((s) => <Button key={s} type="button" size="sm" variant="outline" onClick={() => onChange([...chain, s].join(','))}><Plus className="h-3.5 w-3.5" />{STEP_LABELS[s]}</Button>)}
        </div>
      )}
    </div>
  );
}
