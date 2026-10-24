import React, { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RouteSkeleton from './RouteSkeleton';
import SessionRestorationNotice from './SessionRestorationNotice';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import { useInstalledAppMode } from '../lib/appMode';
import RouteLoadingSpinner from './RouteLoadingSpinner';
import { AppLaunchReady } from './AppLaunchLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('student' | 'manager' | 'admin' | 'staff' | 'user' | 'merchant' | 'verification_team' | 'officer' | 'field_officer')[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading, restorationError, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const installedApp = useInstalledAppMode();

  if (loading && restorationError) return <SessionRestorationNotice />;

  if (loading) {
    return installedApp ? <RouteLoadingSpinner /> : <RouteSkeleton />;
  }

  if (!user) {
    // Redirect to login page if unauthenticated
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles) {
    const isPermitted = allowedRoles.includes(user.role);

    if (!isPermitted) {
      // Show a high-fidelity "Access Denied" view
    return (
      <div className="page-canvas min-h-screen flex flex-col items-center justify-center font-sans p-6 text-left">
        <AppLaunchReady />
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-100 shadow-2xl p-8 space-y-6 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-600" />
          
          <div className="mx-auto w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 border-4 border-rose-100 shadow-inner">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Access Denied</h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              You are signed in as <span className="font-bold text-blue-900">{user.name}</span> with the role of <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded font-bold text-[10px] uppercase text-slate-600">{user.role}</span>. This workspace is restricted.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs space-y-1">
            <div className="flex justify-between font-medium">
              <span className="text-slate-400">Required Clearances:</span>
              <span className="font-bold text-slate-700 font-mono uppercase text-[10px]">{allowedRoles.join(' | ')}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-slate-400">Your Clearance:</span>
              <span className="font-bold text-rose-600 font-mono uppercase text-[10px]">{user.role}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <NavigateToRoleDashboard role={user.role} />
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Sign out and change account
            </button>
          </div>
        </div>

        <LogoutConfirmationModal
          isOpen={showLogoutConfirm}
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={logout}
          userRole={user.role}
          userName={user.name}
        />
      </div>
    );
    }
  }

  return <>{children}</>;
}

// Small helper component to direct users back to their corresponding dashboards
function NavigateToRoleDashboard({ role }: { role: string }) {
  let path = '/';
  let label = 'Return to Dashboard';

  if (role === 'verification_team' || role === 'officer' || role === 'field_officer') {
    path = '/field-officer';
    label = 'Go to Field Officer Dashboard';
  } else if (role === 'merchant') {
    path = '/digital-market';
    label = 'Go to Digital Market Platform';
  } else if (role === 'student' || role === 'user') {
    path = '/student/dashboard';
    label = 'Go to Student Residence Desk';
  } else if (role === 'manager') {
    path = '/manager/dashboard';
    label = 'Go to Hostel Manager Desk';
  } else if (role === 'admin') {
    path = '/admin/dashboard';
    label = 'Go to System Administrator Desk';
  } else if (role === 'staff') {
    path = '/staff/dashboard';
    label = 'Go to Staff Job Desk';
  }

  return (
    <Link
      to={path}
      className="block w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl text-xs text-center shadow-lg transition-all"
    >
      {label}
    </Link>
  );
}
