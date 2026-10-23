import { QueryClientProvider } from '@tanstack/react-query';
import React,{ lazy,Suspense,useEffect,useLayoutEffect } from 'react';
import { HashRouter,Navigate,Route,Routes,useLocation,useNavigate,useSearchParams } from 'react-router-dom';
import AdminMessageNotice from './components/AdminMessageNotice';
import ApprovalKeyPrompt from './components/ApprovalKeyPrompt';
import FormFeedback from './components/FormFeedback';
import ManagerSecretKey from './components/ManagerSecretKey';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider,useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { PlatformAccessBoundary,PlatformSettingsProvider } from './context/PlatformSettingsContext';
import { queryClient,setupRealtimeQuerySync } from './lib/queryClient';

import { AnimatePresence,motion,useReducedMotion } from 'motion/react';
import AccountAccessNotice from './components/AccountAccessNotice';
import RouteSkeleton from './components/RouteSkeleton';
import ThemeEnvironment from './components/ThemeEnvironment';
import MobileNavigationLayout from './components/MobileNavigationLayout';
import { ThemeProvider } from './context/ThemeContext';
import { portalRoles } from './lib/portalRoles';
import { installedAppRedirect,useInstalledAppMode } from './lib/appMode';

// Component imports
const Page1Public = lazy(() => import('./components/Page1Public'));
const PagePublicResidence = lazy(() => import('./components/PagePublicResidence'));
const PagePublicStore = lazy(() => import('./components/PagePublicStore'));
const PagePublicMarket = lazy(() => import('./components/PagePublicMarket'));
const PagePaymentReturn = lazy(() => import('./components/PagePaymentReturn'));
const PageStaffInvitation = lazy(() => import('./components/PageStaffInvitation'));
const PageOfficerInvitation = lazy(() => import('./components/PageOfficerInvitation'));
const PageAdminInvitation = lazy(() => import('./components/PageAdminInvitation'));
const PageFAQ = lazy(() => import('./components/PageFAQ'));
const PageWhyUs = lazy(() => import('./components/PageWhyUs'));
const PageHelp = lazy(() => import('./components/PageHelp'));
const PageSupportInvitation = lazy(() => import('./components/PageSupportInvitation'));
const PageCustomerService = lazy(() => import('./components/PageCustomerService'));
const PageUnifiedLogin = lazy(() => import('./components/PageUnifiedLogin'));
const PageManagerOnboarding = lazy(() => import('./components/PageManagerOnboarding'));
const ManagerGoogleResult = lazy(() => import('./components/ManagerGoogleResult'));
const PageAdminDashboard = lazy(() => import('./components/PageAdminDashboard'));
const PageManagerDashboard = lazy(() => import('./components/PageManagerDashboard'));
const PageStaffDashboard = lazy(() => import('./components/PageStaffDashboard'));
const PageUserDashboard = lazy(() => import('./components/PageUserDashboard'));
const PageResidentDashboard = lazy(() => import('./components/PageResidentDashboard'));
const PageDigitalMarket = lazy(() => import('./components/PageDigitalMarket'));
const PageDigitalMarketOnboard = lazy(() => import('./components/PageDigitalMarketOnboard'));
const PageVerificationTeamPortal = lazy(() => import('./components/PageVerificationTeamPortal'));

// Elegant wrapper for transition animations
class RouteLoadBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="page-canvas flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-slate-900">
      <p>This page could not load. Check your connection and try again.</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Reload page</button>
    </div>;
    return this.props.children;
  }
}

function PageWrapper({ children, noAnimation = false, smoothEntry = false, loadingFallback = <RouteSkeleton /> }: { children: React.ReactNode; noAnimation?: boolean; smoothEntry?: boolean; loadingFallback?: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  // AnimatePresence keeps the outgoing page mounted until its fade finishes.
  // Reset public-page scrolling only when the incoming page actually mounts.
  useLayoutEffect(() => {
    if (smoothEntry) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [smoothEntry]);
  if (noAnimation) {
    return (
      <div className="page-canvas flex-1 flex flex-col w-full min-h-screen">
        <RouteLoadBoundary><Suspense fallback={loadingFallback}>{children}</Suspense></RouteLoadBoundary>
      </div>
    );
  }
  return (
    <motion.div
      initial={smoothEntry ? (reducedMotion ? false : { opacity: 0 }) : { opacity: 0, y: 6 }}
      animate={smoothEntry ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={smoothEntry ? { opacity: reducedMotion ? 1 : 0 } : { opacity: 0, y: -6 }}
      transition={smoothEntry ? { duration: reducedMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] } : { duration: 0.12, ease: 'easeOut' }}
      className="page-canvas flex-1 flex flex-col w-full min-h-screen"
    >
      <RouteLoadBoundary><Suspense fallback={loadingFallback}>{children}</Suspense></RouteLoadBoundary>
    </motion.div>
  );
}

function StudentDashboardRouter() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');

  // Primary user accounts always render PageUserDashboard
  if (user?.role === 'user') {
    return (
      <PageUserDashboard key={`${user?.role}:${user?.id}`}
        initialTab={requestedTab === 'digital-market' ? 'digital-market' : 'home'} 
        initialMarketMode="vendor" 
      />
    );
  }

  // If user is authenticated as a merchant or has approved digital market store:
  const isMerchant = user?.role === 'merchant';

  if (isMerchant) {
    if (user?.merchantSetupCompleted === false || !user?.merchantRegistrationFeePaid) {
      return <Navigate to="/digital-market/onboard" replace />;
    }
    return <Navigate to="/digital-market" replace />;
  }

  return <PageResidentDashboard key={`${user?.role}:${user?.id}`} />;
}

// Inner component to handle router-aware states and logic
function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, apiFetch } = useAuth();
  const installedApp = useInstalledAppMode();

  // Scroll to top on route change
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/login') return;
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    });
  }, [location.pathname]);

  // Verified account changes close the previous event stream and retry timer.
  const realtimeAccount = (user?.id);
  useEffect(() => {
    if (!realtimeAccount) return;
    return setupRealtimeQuerySync();
  }, [realtimeAccount]);

  const appRedirect = installedApp ? installedAppRedirect(location.pathname) : undefined;
  if (appRedirect) return <Navigate to={appRedirect} replace />;

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* 1. PUBLIC ROUTE */}
        <Route
          path="/"
          element={
            <PageWrapper smoothEntry loadingFallback={<p role="status" className="p-8 text-center text-sm text-slate-500">Loading PineVela…</p>}>
              <Page1Public />
            </PageWrapper>
          }
        />

        <Route path="/pineresidence" element={<PageWrapper loadingFallback={<p role="status" className="p-8 text-center text-sm text-slate-500">Loading residences…</p>}><PagePublicResidence /></PageWrapper>} />
        <Route path="/pinemarket/stores/:storeId" element={<PageWrapper><PagePublicStore /></PageWrapper>} />
        <Route path="/pinemarket" element={<PageWrapper loadingFallback={<p role="status" className="p-8 text-center text-sm text-slate-500">Loading PineMarket…</p>}><PagePublicMarket /></PageWrapper>} />
        <Route path="/faq" element={<PageWrapper smoothEntry loadingFallback={<p role="status" className="p-8 text-center text-sm text-slate-500">Loading frequently asked questions…</p>}><PageFAQ /></PageWrapper>} />
        <Route path="/why-us" element={<PageWrapper smoothEntry loadingFallback={<p role="status" className="p-8 text-center text-sm text-slate-500">Loading Why PineVela…</p>}><PageWhyUs /></PageWrapper>} />
        <Route path="/help" element={<PageWrapper smoothEntry loadingFallback={<p role="status" className="p-8 text-center text-sm text-slate-500">Loading Help…</p>}><PageHelp /></PageWrapper>} />
        <Route path="/support-invitation" element={<PageWrapper><PageSupportInvitation /></PageWrapper>} />
        <Route path="/customer-service" element={<ProtectedRoute allowedRoles={['user', 'admin']}><PageWrapper><PageCustomerService key={user?.id} /></PageWrapper></ProtectedRoute>} />

        <Route path="/staff-invitation" element={<PageWrapper><PageStaffInvitation /></PageWrapper>} />
        <Route path="/officer-invitation" element={<PageWrapper><PageOfficerInvitation /></PageWrapper>} />

        {/* 2. UNIFIED LOGIN ROUTE */}
        <Route
          path="/login"
          element={
            <PageWrapper smoothEntry loadingFallback={<p role="status" className="p-8 text-center text-sm text-slate-500">Loading sign in…</p>}>
              <PageUnifiedLogin />
            </PageWrapper>
          }
        />

        <Route path="/manager-google-result" element={<PageWrapper><ManagerGoogleResult/></PageWrapper>}/>
        {/* 2B. MANAGER ONBOARDING PAGE */}
        <Route
          path="/register-manager"
          element={
            <PageWrapper>
              {(<ProtectedRoute allowedRoles={['user']}><PageManagerOnboarding key={`${user?.role}:${user?.id}`} /></ProtectedRoute>)}
            </PageWrapper>
          }
        />

        {/* 2C. ADMIN DASHBOARD ROUTE */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <PageWrapper>
                <PageAdminDashboard key={`${user?.role}:${user?.id}`} />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2D. MANAGER DASHBOARD ROUTE */}
        <Route
          path="/manager/dashboard"
          element={
            <ProtectedRoute allowedRoles={portalRoles('manager')}>
              <PageWrapper>
                <PageManagerDashboard key={`${user?.role}:${user?.id}`} />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2E. STAFF REGISTRATION ROUTE */}
        {/* 2F. STAFF DASHBOARD ROUTE */}
        <Route
          path="/staff/dashboard"
          element={
            <ProtectedRoute allowedRoles={portalRoles('staff')}>
              <PageWrapper>
                <PageStaffDashboard key={`${user?.role}:${user?.id}`} />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2G. STAFF APPLY ALIAS */}
        {/* 2H. STUDENT CONSOLE ROUTE */}
        <Route
          path="/student/dashboard"
          element={
            <ProtectedRoute allowedRoles={portalRoles('student-alias')}>
              <PageWrapper>
                <StudentDashboardRouter />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2I. USER CONSOLE ROUTE */}
        <Route
          path="/user/dashboard"
          element={
            <ProtectedRoute allowedRoles={portalRoles('primary')}>
              <PageWrapper>
                <PageUserDashboard key={`${user?.role}:${user?.id}`} />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2I-2. DEDICATED DIGITAL MARKET SELLER PLATFORM ROUTES */}
        <Route
          path="/digital-market"
          element={
            <ProtectedRoute allowedRoles={['merchant']}>
              <PageWrapper>
                <PageDigitalMarket key={`${user?.role}:${user?.id}`} />
              </PageWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/digital-market/onboard"
          element={
            <ProtectedRoute allowedRoles={['merchant']}>
              <PageWrapper>
                <PageDigitalMarketOnboard key={`${user?.role}:${user?.id}`} />
              </PageWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/merchant/platform"
          element={<Navigate to="/digital-market" replace />}
        />
        <Route
          path="/merchant/dashboard"
          element={<Navigate to="/digital-market" replace />}
        />
        <Route
          path="/store"
          element={<Navigate to="/digital-market" replace />}
        />

        <Route
          path="/market"
          element={
            <ProtectedRoute allowedRoles={portalRoles('primary')}>
              <PageWrapper>
                <PageUserDashboard key={`${user?.role}:${user?.id}`} initialTab="digital-market" initialMarketMode="vendor" />
              </PageWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/market"
          element={<Navigate to="/market" replace />}
        />

        {/* 2J. RESIDENT CONSOLE ROUTE */}
        <Route
          path="/resident/dashboard"
          element={
            <ProtectedRoute allowedRoles={portalRoles('resident')}>
              <PageWrapper>
                <PageResidentDashboard key={`${user?.role}:${user?.id}`} />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2K. VERIFICATION TEAM & FIELD OFFICER CONSOLE ROUTE */}
        <Route
          path="/verification-team"
          element={
            <PageWrapper>
              <PageVerificationTeamPortal />
            </PageWrapper>
          }
        />
        <Route
          path="/field-officer"
          element={
            <PageWrapper>
              <PageVerificationTeamPortal />
            </PageWrapper>
          }
        />
        <Route
          path="/officer/dashboard"
          element={
            <PageWrapper>
              <PageVerificationTeamPortal />
            </PageWrapper>
          }
        />
        <Route
          path="/verification-portal"
          element={
            <PageWrapper>
              <PageVerificationTeamPortal />
            </PageWrapper>
          }
        />

        <Route
          path="/student"
          element={<Navigate to="/student/dashboard" replace />}
        />

        {/* FALLBACK REDIRECT */}
        <Route path="/payments/return" element={<PageWrapper><PagePaymentReturn /></PageWrapper>} />
        <Route path="/admin-invitation" element={<PageWrapper><PageAdminInvitation /></PageWrapper>} />
        <Route path="*" element={<Navigate to={installedApp ? '/login' : '/'} replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <ThemeProvider>
            <PlatformSettingsProvider>
              <PlatformAccessBoundary>
                <NotificationProvider>
                  <div className="app-canvas min-h-screen flex flex-col relative overflow-hidden">
                    <ThemeEnvironment />
                    <MobileNavigationLayout />
                    <FormFeedback />
                    <ApprovalKeyPrompt />
                    <AdminMessageNotice />
                    <ManagerSecretKey />
                    <AccountAccessNotice />
                    <div className="flex-1 z-10 flex flex-col">
                      <AppContent />
                    </div>
                  </div>
                </NotificationProvider>
              </PlatformAccessBoundary>
            </PlatformSettingsProvider>
          </ThemeProvider>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
