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
import { ConfirmProvider } from './context/ConfirmContext';
import { preloadCoreRoutesOnIdle } from './lib/routePreloaders';
import { enableHorizontalMouseDrag } from './lib/enableHorizontalMouseDrag';
import { useData } from './context/DataContext';
import { LABELS } from './lib/labels';
import { StaleChunkBoundary } from './components/StaleChunkBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ActivityOverview = lazy(() => import('./pages/ActivityOverview'));
const Collaborations = lazy(() => import('./pages/CollaborationNetwork'));
const Activities = lazy(() => import('./pages/Activities'));
const ActivityDetail = lazy(() => import('./pages/ActivityDetail'));
const Entities = lazy(() => import('./pages/Entities'));
const EntityDetail = lazy(() => import('./pages/EntityDetail'));
const RosterPage = lazy(() => import('./pages/RosterPage'));
const Channels = lazy(() => import('./pages/Channels'));
const Settings = lazy(() => import('./pages/Settings'));
const Auth = lazy(() => import('./pages/Auth'));
const WaitingAssignment = lazy(() => import('./pages/WaitingAssignment'));

function ActivityDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/activity/${id}` : '/activity'} replace />;
}

function AppRoutes() {
  const { canAccessAdminUi } = useAppRole();
  const { user } = useAuth();
  const { 
    activeOrgId, 
    loading: dataLoading,
  } = useData();
  const { loading: roleLoading } = useAppRole();

  if ((dataLoading || roleLoading) && !activeOrgId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <LoadingLine label={LABELS.actions.loadingWorkspace} />
        </div>
      </div>
    );
  }

  // If not initial loading, not data loading, no active org, and no admin access, show WaitingAssignment
  if (!activeOrgId && !canAccessAdminUi) {
    return <WaitingAssignment />;
  }

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
          <Route path="/activity" element={<Activities />} />
          <Route path="/activity/:id" element={<ActivityDetail />} />
          <Route path="/channels" element={canAccessAdminUi ? <Channels /> : <Navigate to="/activity" replace />} />
          <Route path="/channels-fallback" element={<Navigate to="/channels" replace />} />
          <Route path="/overview" element={canAccessAdminUi ? <ActivityOverview /> : <Navigate to="/activity" replace />} />
          <Route path="/collaborations" element={canAccessAdminUi ? <Collaborations /> : <Navigate to="/activity" replace />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/team" element={<Navigate to="/roster" replace />} />
          <Route path="/team-members" element={<Navigate to="/roster" replace />} />
          <Route
            path="/settings"
            element={user && activeOrgId ? <Settings /> : <Navigate to="/activity" replace />}
          />
          <Route path="/distribution" element={<Navigate to="/dashboard" replace />} />
          <Route path="/leaderboard" element={<Navigate to="/dashboard" replace />} />
          <Route path="/entities" element={canAccessAdminUi ? <Entities /> : <Navigate to="/activity" replace />} />
          <Route path="/entities/:id" element={canAccessAdminUi ? <EntityDetail /> : <Navigate to="/activity" replace />} />
          <Route path="/accounting" element={<Navigate to={canAccessAdminUi ? '/channels' : '/activity'} replace />} />
          <Route path="/admin/diagnostics" element={<Navigate to="/settings" replace />} />
          <Route path="/activities/:id" element={<ActivityDetailRedirect />} />

          <Route path="/waiting-assignment" element={<WaitingAssignment />} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
      <StaleChunkBoundary>
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
              element={(!isSupabaseConfigured || !user) ? <Navigate to="/auth" replace /> : <AppRoutes />}
            />
          </Routes>
        </Suspense>
      </StaleChunkBoundary>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoleProvider>
          <NotificationProvider>
            <ConfirmProvider>
              <DataProvider>
                <AppShell />
              </DataProvider>
            </ConfirmProvider>
          </NotificationProvider>
        </AppRoleProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
