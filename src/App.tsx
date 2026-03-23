import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppRoleProvider } from './context/AppRoleContext';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { useAppRole } from './context/AppRoleContext';
import { isSupabaseConfigured } from './lib/supabase';
import LoadingLine from './components/LoadingLine';
import { NotificationProvider } from './context/NotificationContext';
import { preloadCoreRoutesOnIdle } from './lib/routePreloaders';
import { enableHorizontalMouseDrag } from './lib/enableHorizontalMouseDrag';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const BriefFlowOverview = lazy(() => import('./pages/BriefFlowOverview'));
const PartnerNetwork = lazy(() => import('./pages/PartnerNetwork'));
const ActivityMonitor = lazy(() => import('./pages/ActivityMonitor'));
const WorkspaceDetail = lazy(() => import('./pages/WorkspaceDetail'));
const UnitDetail = lazy(() => import('./pages/UnitDetail'));
const Team = lazy(() => import('./pages/Team'));
const Channels = lazy(() => import('./pages/Channels'));
const Settings = lazy(() => import('./pages/Settings'));
const Auth = lazy(() => import('./pages/Auth'));

function ActivityDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/activity/${id}` : '/activity'} replace />;
}

function AppRoutes() {
  const { canAccessAdminUi } = useAppRole();

  return (
    <Layout>
      <Suspense
        fallback={
          <div className="min-h-[40vh] flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
              <LoadingLine label="Loading page…" />
            </div>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={canAccessAdminUi ? <Dashboard /> : <Navigate to="/activity" replace />} />
          <Route path="/dashboard" element={canAccessAdminUi ? <Dashboard /> : <Navigate to="/activity" replace />} />
          <Route path="/activity" element={<ActivityMonitor />} />
          <Route path="/activity/:id" element={<WorkspaceDetail />} />
          <Route path="/channels" element={canAccessAdminUi ? <Channels /> : <Navigate to="/activity" replace />} />
          <Route path="/channels-fallback" element={<Navigate to="/channels" replace />} />
          <Route path="/brief-flow" element={canAccessAdminUi ? <BriefFlowOverview /> : <Navigate to="/activity" replace />} />
          <Route path="/contacts" element={canAccessAdminUi ? <PartnerNetwork /> : <Navigate to="/activity" replace />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={canAccessAdminUi ? <Settings /> : <Navigate to="/activity" replace />} />
          <Route path="/distribution" element={<Navigate to="/dashboard" replace />} />
          <Route path="/leaderboard" element={<Navigate to="/dashboard" replace />} />
          <Route path="/units" element={canAccessAdminUi ? <ActivityMonitor /> : <Navigate to="/activity" replace />} />
          <Route path="/units/:id" element={canAccessAdminUi ? <UnitDetail /> : <Navigate to="/activity" replace />} />
          <Route path="/accounting" element={<Navigate to={canAccessAdminUi ? '/channels' : '/activity'} replace />} />
          <Route path="/admin/diagnostics" element={<Navigate to="/settings" replace />} />
          <Route path="/workspaces/:id" element={<ActivityDetailRedirect />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const { loading: roleLoading } = useAppRole();

  useEffect(() => {
    return preloadCoreRoutesOnIdle();
  }, []);

  useEffect(() => {
    return enableHorizontalMouseDrag();
  }, []);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <LoadingLine label="Initializing session…" />
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
              <LoadingLine label="Loading page…" />
            </div>
          </div>
        }
      >
        <Routes>
          <Route
            path="/auth"
            element={(!isSupabaseConfigured || !user) ? <Auth /> : <Navigate to="/" replace />}
          />
          <Route
            path="/*"
            element={(isSupabaseConfigured && !user) ? <Navigate to="/auth" replace /> : <AppRoutes />}
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoleProvider>
          <NotificationProvider>
            <DataProvider>
              <AppShell />
            </DataProvider>
          </NotificationProvider>
        </AppRoleProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
