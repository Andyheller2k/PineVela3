import { PlatformSettingsProvider, PlatformAccessBoundary } from './context/PlatformSettingsContext';
import { sessionFetch as fetch } from './lib/session';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { queryClient, invalidateAllQueries, setupRealtimeQuerySync } from './lib/queryClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import RouteSkeleton from './components/RouteSkeleton';
import { Hostel, IssueReport } from './types';
import { safeJson } from './lib/api';
import { motion, AnimatePresence } from 'motion/react';

// Component imports
import Page1Public from './components/Page1Public';
const PageAdminInvitation = lazy(() => import('./components/PageAdminInvitation'));
const PageUnifiedLogin = lazy(() => import('./components/PageUnifiedLogin'));
const PageManagerOnboarding = lazy(() => import('./components/PageManagerOnboarding'));
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
    if (this.state.failed) return <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-slate-900">
      <p>This page could not load. Check your connection and try again.</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Reload page</button>
    </div>;
    return this.props.children;
  }
}

function PageWrapper({ children, noAnimation = false }: { children: React.ReactNode; noAnimation?: boolean }) {
  if (noAnimation) {
    return (
      <div className="flex-1 flex flex-col w-full min-h-screen">
        <RouteLoadBoundary><Suspense fallback={<RouteSkeleton />}>{children}</Suspense></RouteLoadBoundary>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="flex-1 flex flex-col w-full min-h-screen"
    >
      <RouteLoadBoundary><Suspense fallback={<RouteSkeleton />}>{children}</Suspense></RouteLoadBoundary>
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
      <PageUserDashboard 
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

  return <PageResidentDashboard />;
}

// Inner component to handle router-aware states and logic
function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, apiFetch } = useAuth();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    });
  }, [location.pathname]);

  // Ensure fresh page loads/reloads default directly to the Public Landing Page ('/')
  useEffect(() => {
    // If not authenticated and on root path, stay on root
  }, []);

  // Selected public hostel drawer state
  const [selectedPublicHostel, setSelectedPublicHostel] = useState<Hostel | null>(null);

  // Initialize real-time synchronization from Express API (SSE)
  useEffect(() => {
    setupRealtimeQuerySync();
  }, []);

  // TanStack Query: Hostels query for public explorer
  const { data: qHostels } = useQuery<Hostel[]>({
    queryKey: ['hostels'],
    queryFn: async () => {
      const res = await fetch('/api/hostels');
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data)) return data;
        } catch (e) {}
      }
      return [];
    },
    refetchInterval: 10000,
  });

  const hostels = qHostels || [];

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* 1. PUBLIC ROUTE */}
        <Route
          path="/"
          element={
            <PageWrapper>
              <Page1Public
                hostels={hostels.filter(h => {
                  if (h.isDeleted) return false;
                  const isApproved = h.isApproved === true || h.approvalStatus === 'Approved' || (h as any).status === 'Approved';
                  const isExplicitPending = (h.approvalStatus === 'Pending Approval' || (h as any).status === 'Pending Approval') && h.isApproved !== true;
                  return isApproved && !isExplicitPending;
                })}
                selectedHostel={selectedPublicHostel}
                onSelectHostel={(hostel) => setSelectedPublicHostel(hostel)}
                onCloseDrawer={() => setSelectedPublicHostel(null)}
                onNavigate={(screen) => {
                  navigate('/login');
                }}
              />
            </PageWrapper>
          }
        />

        {/* 2. UNIFIED LOGIN ROUTE */}
        <Route
          path="/login"
          element={
            <PageWrapper>
              <PageUnifiedLogin />
            </PageWrapper>
          }
        />

        {/* 2B. MANAGER ONBOARDING PAGE */}
        <Route
          path="/register-manager"
          element={
            <PageWrapper>
              <PageManagerOnboarding />
            </PageWrapper>
          }
        />

        {/* 2C. ADMIN DASHBOARD ROUTE */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <PageWrapper>
                <PageAdminDashboard />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2D. MANAGER DASHBOARD ROUTE */}
        <Route
          path="/manager/dashboard"
          element={
            <ProtectedRoute allowedRoles={['manager', 'admin', 'student', 'user']}>
              <PageWrapper>
                <PageManagerDashboard />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2E. STAFF REGISTRATION ROUTE */}
        {/* 2F. STAFF DASHBOARD ROUTE */}
        <Route
          path="/staff/dashboard"
          element={
            <ProtectedRoute allowedRoles={['staff', 'manager', 'admin', 'student', 'user']}>
              <PageWrapper>
                <PageStaffDashboard />
              </PageWrapper>
            </ProtectedRoute>
          }
        />

        {/* 2G. STAFF APPLY ALIAS */}
        {/* 2H. STUDENT CONSOLE ROUTE */}
        <Route
          path="/student/dashboard"
          element={
            <ProtectedRoute allowedRoles={['student', 'admin', 'manager', 'user', 'merchant']}>
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
            <ProtectedRoute allowedRoles={['student', 'admin', 'manager', 'user', 'merchant']}>
              <PageWrapper>
                <PageUserDashboard />
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
                <PageDigitalMarket />
              </PageWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/digital-market/onboard"
          element={
            <ProtectedRoute allowedRoles={['merchant']}>
              <PageWrapper>
                <PageDigitalMarketOnboard />
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
            <ProtectedRoute allowedRoles={['merchant', 'student', 'admin', 'manager', 'user']}>
              <PageWrapper>
                <PageUserDashboard initialTab="digital-market" initialMarketMode="vendor" />
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
            <ProtectedRoute allowedRoles={['student', 'admin', 'manager']}>
              <PageWrapper>
                <PageResidentDashboard />
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
        <Route path="/admin-invitation" element={<PageWrapper><PageAdminInvitation /></PageWrapper>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function BubbleBackground() {
  const bubbles = [
    { id: 1, size: 'w-72 h-72 md:w-96 md:h-96', color: 'bg-blue-400/35', left: '5%', top: '15%', x: [0, 80, -40, 0], y: [0, 100, 50, 0], duration: 25 },
    { id: 2, size: 'w-96 h-96 md:w-[450px] md:h-[450px]', color: 'bg-indigo-300/30', left: '60%', top: '10%', x: [0, -100, 50, 0], y: [0, 120, -60, 0], duration: 32 },
    { id: 3, size: 'w-64 h-64 md:w-80 md:h-80', color: 'bg-sky-400/40', left: '15%', top: '55%', x: [0, 120, -50, 0], y: [0, -110, 40, 0], duration: 28 },
    { id: 4, size: 'w-80 h-80 md:w-96 md:h-96', color: 'bg-blue-400/30', left: '65%', top: '60%', x: [0, -80, 80, 0], y: [0, -100, -50, 0], duration: 30 },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Animated blurred colour blobs */}
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className={`absolute rounded-full blur-[100px] ${b.size} ${b.color}`}
          animate={{
            x: b.x,
            y: b.y,
          }}
          transition={{
            duration: b.duration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            left: b.left,
            top: b.top,
          }}
        />
      ))}

      {/* Fixed PineVela logo watermark — stays pinned, never scrolls */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <svg
          width="520"
          height="520"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.045 }}
          className="select-none"
        >
          {/* Crown/Spikes */}
          <path d="M32 2L36 12L32 18L28 12L32 2Z" fill="#EF4444" />
          <path d="M24 6L29 13L26 18L19 12L24 6Z" fill="#3B82F6" />
          <path d="M40 6L35 13L38 18L45 12L40 6Z" fill="#10B981" />
          {/* Pineapple body */}
          <rect x="16" y="18" width="32" height="38" rx="12" fill="#F59E0B" stroke="#D97706" strokeWidth="2" />
          {/* Windows */}
          <rect x="22" y="24" width="6" height="6" rx="1.5" fill="#1E3A8A" />
          <rect x="36" y="24" width="6" height="6" rx="1.5" fill="#1E3A8A" />
          <rect x="22" y="34" width="6" height="6" rx="1.5" fill="#1E3A8A" />
          <rect x="36" y="34" width="6" height="6" rx="1.5" fill="#1E3A8A" />
          {/* Door */}
          <path d="M28 56V47C28 44.7909 29.7909 43 32 43C34.2091 43 36 44.7909 36 47V56H28Z" fill="#1E3A8A" />
        </svg>
      </div>
    </div>
  );
}


export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlatformSettingsProvider>
          <HashRouter>
            <PlatformAccessBoundary>
              <NotificationProvider>
                <div className="min-h-screen flex flex-col relative overflow-hidden bg-slate-50">
                  <BubbleBackground />
                  <div className="flex-1 z-10 flex flex-col">
                    <AppContent />
                  </div>
                </div>
              </NotificationProvider>
            </PlatformAccessBoundary>
          </HashRouter>
        </PlatformSettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
