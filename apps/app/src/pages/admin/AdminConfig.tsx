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
      <h1 className="text-xl font-extrabold sm:text-2xl">پیکربندی سامانه</h1>
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v })} dir="rtl">
        <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <TabsList className="inline-flex h-auto w-max min-w-full justify-start gap-1 sm:min-w-0">
          <TabsTrigger className="whitespace-nowrap" value="structure">ساختار آموزشی</TabsTrigger>
          <TabsTrigger className="whitespace-nowrap" value="form">فرم پروپوزال</TabsTrigger>
          <TabsTrigger className="whitespace-nowrap" value="reminders">یادآوری و ارتقا</TabsTrigger>
          <TabsTrigger className="whitespace-nowrap" value="templates">قالب‌ها و لاگ اعلان‌ها</TabsTrigger>
        </TabsList>
        </div>
        <TabsContent value="structure"><StructureTab /></TabsContent>
        <TabsContent value="form"><FormEditorTab /></TabsContent>
        <TabsContent value="reminders"><RemindersTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
