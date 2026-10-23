import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import StructureTab from './StructureTab';
import FormEditorTab from './FormEditorTab';
import RemindersTab from './RemindersTab';
import TemplatesTab from './TemplatesTab';

export default function AdminConfig() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'structure';
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">پیکربندی سامانه</h1>
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v })} dir="rtl">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="structure">ساختار آموزشی</TabsTrigger>
          <TabsTrigger value="form">فرم پروپوزال</TabsTrigger>
          <TabsTrigger value="reminders">یادآوری و ارتقا</TabsTrigger>
          <TabsTrigger value="templates">قالب‌ها و لاگ اعلان‌ها</TabsTrigger>
        </TabsList>
        <TabsContent value="structure"><StructureTab /></TabsContent>
        <TabsContent value="form"><FormEditorTab /></TabsContent>
        <TabsContent value="reminders"><RemindersTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
