import ManagerSecretKey from './components/ManagerSecretKey';
import AdminMessageNotice from './components/AdminMessageNotice';
import ApprovalKeyPrompt from './components/ApprovalKeyPrompt';
import FormFeedback from './components/FormFeedback';
import { PlatformSettingsProvider, PlatformAccessBoundary } from './context/PlatformSettingsContext';
import { sessionFetch as fetch } from './lib/session';
import React, { useState, useEffect, useLayoutEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, invalidateAllQueries, setupRealtimeQuerySync } from './lib/queryClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import RouteSkeleton from './components/RouteSkeleton';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ThemeProvider } from './context/ThemeContext';
import AccountAccessNotice from './components/AccountAccessNotice';
import ThemeEnvironment from './components/ThemeEnvironment';
import { ThemeDock } from './components/ThemeToggle';

// Component imports
import Page1Public from './components/Page1Public';
import PagePublicResidence from './components/PagePublicResidence';
const PagePublicStore = lazy(() => import('./components/PagePublicStore'));
const PagePublicMarket = lazy(() => import('./components/PagePublicMarket'));
const PagePaymentReturn = lazy(() => import('./components/PagePaymentReturn'));
const PageStaffInvitation = lazy(() => import('./components/PageStaffInvitation'));
const PageAdminInvitation = lazy(() => import('./components/PageAdminInvitation'));
import PageUnifiedLogin from './components/PageUnifiedLogin';
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

function PageWrapper({ children, noAnimation = false, smoothEntry = false, loadingFallback = <RouteSkeleton /> }: { children: React.ReactNode; noAnimation?: boolean; smoothEntry?: boolean; loadingFallback?: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  // AnimatePresence keeps the outgoing page mounted until its fade finishes.
  // Reset public-page scrolling only when the incoming page actually mounts.
  useLayoutEffect(() => {
    if (smoothEntry) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [smoothEntry]);
  if (noAnimation) {
    return (
      <div className="flex-1 flex flex-col w-full min-h-screen">
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
      className="flex-1 flex flex-col w-full min-h-screen"
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
    if (location.pathname === '/' || location.pathname === '/login') return;
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

  // Initialize real-time synchronization from Express API (SSE)
  useEffect(() => {
    setupRealtimeQuerySync();
  }, []);

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

        <Route path="/pineresidence" element={<PageWrapper><PagePublicResidence /></PageWrapper>} />
        <Route path="/pinemarket/stores/:storeId" element={<PageWrapper><PagePublicStore /></PageWrapper>} />
        <Route path="/pinemarket" element={<PageWrapper loadingFallback={<p role="status" className="p-8 text-center text-sm text-slate-500">Loading PineMarket…</p>}><PagePublicMarket /></PageWrapper>} />

        <Route path="/staff-invitation" element={<PageWrapper><PageStaffInvitation /></PageWrapper>} />

        {/* 2. UNIFIED LOGIN ROUTE */}
        <Route
          path="/login"
          element={
            <PageWrapper smoothEntry>
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
        <Route path="/payments/return" element={<PageWrapper><PagePaymentReturn /></PageWrapper>} />
        <Route path="/admin-invitation" element={<PageWrapper><PageAdminInvitation /></PageWrapper>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <PlatformSettingsProvider>
            <HashRouter>
              <PlatformAccessBoundary>
                <NotificationProvider>
                  <div className="app-canvas min-h-screen flex flex-col relative overflow-hidden">
                    <ThemeEnvironment />
                    <ThemeDock />
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
            </HashRouter>
          </PlatformSettingsProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
