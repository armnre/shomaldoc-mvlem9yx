import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { me as fetchMe, logout, type MeOutputType } from 'zitejs/api';
import { Toaster } from '@project/components/ui/sonner';
import { Skeleton } from '@project/components/ui/skeleton';
import { SessionContext } from './lib/session';
import { clearToken, getToken } from './lib/token';
import Layout from './components/Layout';
import LoginScreen from './pages/LoginScreen';
import ForcePasswordChange from './pages/ForcePasswordChange';
import Home from './pages/Home';
import ThesisDetailPage from './pages/ThesisDetailPage';
import ThesesPage from './pages/ThesesPage';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDepartments from './pages/admin/AdminDepartments';
import AdminSettings from './pages/admin/AdminSettings';
import AdminAudit from './pages/admin/AdminAudit';
import AdminTerms from './pages/admin/AdminTerms';
import ProfilePage from './pages/ProfilePage';
import ReportsPage from './pages/ReportsPage';

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [me, setMe] = useState<MeOutputType | null>(null);
  const [role, setRoleState] = useState('');

  useEffect(() => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'fa';
    document.title = 'شمال‌داک | سامانه مدیریت پایان‌نامه دانشگاه شمال';
    if (localStorage.getItem('shomaldoc-theme') === 'dark') document.documentElement.classList.add('dark');
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const m = await fetchMe({ token });
      setMe(m);
      const saved = localStorage.getItem('shomaldoc-role') ?? '';
      setRoleState((r) => (m.roles.includes(r) ? r : m.roles.includes(saved) ? saved : m.roles[0] ?? ''));
    } catch {
      clearToken();
      setTokenState('');
      setMe(null);
    }
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    await logout({ token }).catch(() => undefined);
    clearToken();
    setMe(null);
    setTokenState('');
  }, [token]);

  const setRole = (r: string) => {
    localStorage.setItem('shomaldoc-role', r);
    setRoleState(r);
  };

  if (!token) return <><LoginScreen onSignedIn={() => setTokenState(getToken())} /><Toaster position="top-center" dir="rtl" /></>;
  if (!me) return <FullSkeleton />;

  const value = { token, me, role, setRole, refresh, signOut };
  if (me.mustChangePassword)
    return <SessionContext.Provider value={value}><ForcePasswordChange /><Toaster position="top-center" dir="rtl" /></SessionContext.Provider>;

  return (
    <SessionContext.Provider value={value}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/theses" element={<ThesesPage />} />
            <Route path="/thesis/:id" element={<ThesisDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
 <Route path="/reports" element={<ReportsPage />} />
            <Route path="/terms" element={<AdminTerms />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/departments" element={<AdminDepartments />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      <Toaster position="top-center" dir="rtl" />
    </SessionContext.Provider>
  );
}

function FullSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-8" dir="rtl">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
