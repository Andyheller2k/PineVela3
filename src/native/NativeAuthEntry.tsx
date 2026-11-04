import { Navigate, useLocation } from 'react-router-dom';
import PageUnifiedLogin from '../components/PageUnifiedLogin';
import { useAuth } from '../context/AuthContext';
import { loginContinuation } from '../lib/publicContinuation';
import NativeWelcome from './NativeWelcome';
import { nativeSignedInDestination } from './signedInDestination';

/** Presentation only. The existing provider still verifies every session. */
export default function NativeAuthEntry() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || (location.state as { mode?: string } | null)?.mode;
  // Keep explicit form, onboarding, continuation and provider-error links intact.
  // The ordinary signed-out entry is the mobile welcome screen.
  if (mode || params.has('verify_room_key') || params.has('next') || params.has('google_error') || params.has('mobile')) {
    return <PageUnifiedLogin />;
  }
  if (user && !loading) return <Navigate to={nativeSignedInDestination(user, loginContinuation(location.search))} replace />;
  return <NativeWelcome restoringSession={loading} />;
}
