import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Button } from '@project/components/ui/button';
import { Label } from '@project/components/ui/label';
import { X } from 'lucide-react';

export type Prof = { id: string; name: string; rank: string };

/** One supervisor/advisor slot: pick only from real professor profiles; ids already used in other slots are excluded. */
export default function ProfessorSlot(props: { label: string; value: string; profs: Prof[]; taken: string[]; onChange: (id: string) => void; onRemove?: () => void; error?: string }) {
  const options = props.profs.filter((p) => p.id === props.value || !props.taken.includes(p.id));
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      <div className="flex gap-2">
        <Select value={props.value || undefined} onValueChange={props.onChange}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="انتخاب استاد از فهرست اعضای گروه" /></SelectTrigger>
          <SelectContent>{options.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.rank ? ` — ${p.rank}` : ''}</SelectItem>)}</SelectContent>
        </Select>
        {props.onRemove && <Button type="button" variant="outline" size="icon" onClick={props.onRemove} aria-label="حذف جایگاه"><X className="h-4 w-4" /></Button>}
      </div>
      {props.error && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  );
}
