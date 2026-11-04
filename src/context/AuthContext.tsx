import { createContext,ReactNode,useContext,useEffect,useRef,useState } from 'react';
import { needsApprovalKey } from '../lib/administratorApproval';
import { apiFetch as requestApi, safeJson } from '../lib/api';
import { requestKeyedApproval } from '../lib/approvalPrompt';
import { queryClient } from '../lib/queryClient';
import SignOutProgress from '../components/SignOutProgress';
import { advanceSessionGeneration,clearLegacySessionStorage,sessionFetch as fetch } from '../lib/session';
import { SessionCheckUnavailable,SessionRestoration } from '../lib/sessionRestoration';
import { nativePreviewUnavailable } from '../native/environment';


export interface AuthenticatedUser {
  id: string;
  name: string;
  role: 'student' | 'manager' | 'admin' | 'staff' | 'user' | 'merchant' | 'verification_team' | 'officer' | 'field_officer';
  token: string;
  username?: string;
  email?: string;
  phone?: string;
  nationalId?: string;
  organization?: string;
  roleTitle?: string;
  experienceYears?: number;
  address?: string;
  isVerified?: boolean;
  verificationStatus?: string;
  photo?: string;
  avatar?: string;
  photoUrl?: string;
  avatarUrl?: string;
  profilePicture?: string;
  hasApprovedHostel?: boolean;
  hostelStatus?: string;
  studentId?: string;
  residentType?: 'student' | 'resident' | 'other' | string;
  programOfStudy?: string;
  department?: string;
  institution?: string;
  roomKey?: string;
  hostelId?: string;
  hostelName?: string;
  blockName?: string;
  roomNumber?: string;
  managerId?: string;
  managerName?: string;
  managerPhone?: string;
  managerEmail?: string;
  isApprovedMerchant?: boolean;
  hasApprovedMerchantStore?: boolean;
  merchantStoreId?: string;
  merchantStoreName?: string;
  merchantSetupCompleted?: boolean;
  merchantRegistrationFeePaid?: boolean;
  targetRedirect?: string;
  studentEmail?: string;
  isDigitalMarketOnly?: boolean;
  registeredAccounts?: {
    residentAccount?: any;
    managerAccount?: any;
    [key: string]: any;
  };
  plainPassword?: string;
  password?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  loading: boolean;
  restorationError: string | null;
  retrySession: () => void;
  login: (usernameOrEmail: string, password: string, portal?: { accountKind: 'resident' | 'seller'; portalPin: string }, captchaToken?: string) => Promise<AuthenticatedUser>;
  setSessionUser: (user: AuthenticatedUser,expectedAccountId?:string) => void;
  updateUser?: (updatedFields: Partial<AuthenticatedUser>,expectedAccountId?:string) => void;
  logout: () => Promise<boolean>;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Step 2 has no native session transport. It never restores or invents a session. */
export function NativePreviewAuthProvider({ children }: { children: ReactNode }) {
  const unavailable = async (): Promise<never> => nativePreviewUnavailable();
  return <AuthContext.Provider value={{
    user: null, loading: false, restorationError: null,
    retrySession: nativePreviewUnavailable, login: unavailable,
    setSessionUser: nativePreviewUnavailable, updateUser: nativePreviewUnavailable,
    logout: unavailable, apiFetch: unavailable,
  }}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const restoration = useRef(new SessionRestoration<AuthenticatedUser>()).current;
  const userRef = useRef(user);
  userRef.current = user;
  const [restorationError, setRestorationError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [signingOut,setSigningOut]=useState(false);
  const pendingLogout=useRef<Promise<boolean>|null>(null);

  useEffect(() => {
    const changing = () => {
      restoration.invalidate();
      advanceSessionGeneration();
      setRestorationError(null);
      userRef.current = null;
      setUser(null);
      queryClient.clear();
      setLoading(true);
    };
    const complete = () => setRetry(value => value + 1);
    window.addEventListener('pinevela-native-auth-changing', changing);
    window.addEventListener('pinevela-native-auth-complete', complete);
    return () => {
      window.removeEventListener('pinevela-native-auth-changing', changing);
      window.removeEventListener('pinevela-native-auth-complete', complete);
    };
  }, [restoration]);

  function supersedeRestoration() {
    restoration.invalidate();
    advanceSessionGeneration();
    setRestorationError(null);
    setLoading(false);
  }

  useEffect(() => {
    const clear = () => {
      supersedeRestoration();
      clearLegacySessionStorage();
      userRef.current = null;
      setUser(null);
      queryClient.clear();
    };
    const channel = new BroadcastChannel('pinevela-session');
    channel.onmessage = event => { if (event.data === 'logout') clear(); };
    window.addEventListener('pinevela-session-expired', clear);
    return () => { channel.close(); window.removeEventListener('pinevela-session-expired', clear); };
  }, [restoration]);

  // StrictMode subscribers share one check. Cleanup detaches the subscriber,
  // rather than aborting a server response that may rotate HttpOnly cookies.
  useEffect(() => {
    let active = true;
    const generation = restoration.generation;
    const current = () => active && generation === restoration.generation;
    setLoading(true);
    setRestorationError(null);
    clearLegacySessionStorage();
    const deadline = window.setTimeout(() => {
      if (current()) setRestorationError('Checking your sign-in is taking longer than usual. Please check your connection and retry.');
    }, 45000);
    restoration.run(readSessionUser).then(result => {
      if (!current() || result.kind === 'superseded') return;
      window.clearTimeout(deadline);
      if (result.kind === 'unavailable') {
        setRestorationError('We could not check your sign-in. Please check your connection and retry.');
        return;
      }
      const restoredUser = result.kind === 'restored' ? result.user : null;
      userRef.current = restoredUser;
      setUser(restoredUser);
      setRestorationError(null);
      setLoading(false);
    });
    return () => { active = false; window.clearTimeout(deadline); };
  }, [restoration, retry]);

  const login = async (usernameOrEmail: string, password: string, portal?: { accountKind: 'resident' | 'seller'; portalPin: string }, captchaToken?: string): Promise<AuthenticatedUser> => {
    supersedeRestoration();
    const generation = restoration.generation;
    await restoration.settled();
    if (generation !== restoration.generation) throw new Error('Sign-in was superseded by another account action.');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usernameOrEmail, password, ...portal, captchaToken })
    });

    if (!res.ok) {
      const errData = await safeJson(res);
      const error: any = new Error(errData.error || 'Authentication failed');
      error.code = errData.code;
      error.isPendingApproval = Boolean(errData.isPendingApproval);
      error.isBlocked = Boolean(errData.isBlocked);
      error.restrictionReason = errData.restrictionReason || errData.reason || errData.adminNotes;
      error.managerName = errData.managerName;
      error.managerEmail = errData.managerEmail;
      error.status = res.status;
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = Math.ceil(retryAfter);
      }
      throw error;
    }

    const userData: AuthenticatedUser = await safeJson(res);
    let hasApprovedHostel = false;
    let hostelStatus = 'None';

    // Native setup eligibility is loaded by the manager dashboard. Do not hold
    // an already verified sign-in behind a second, duplicate property read.


    const resolvedAvatar = userData.avatar || userData.photo || userData.photoUrl || userData.avatarUrl || userData.profilePicture || undefined;

    const finalUser = {
      ...userData,
      token: '',
      ...(({})),
      avatar: resolvedAvatar,
      photo: resolvedAvatar,
      photoUrl: resolvedAvatar,
      avatarUrl: resolvedAvatar,
      profilePicture: resolvedAvatar
    };

    if (generation !== restoration.generation) throw new Error('Sign-in was superseded by another account action.');
    userRef.current = finalUser;
    setUser(finalUser);
    return finalUser;
  };

  const setSessionUser = (newSessionUser: AuthenticatedUser,expectedAccountId?:string) => {
    if (expectedAccountId !== undefined && userRef.current?.id !== expectedAccountId) return;
    supersedeRestoration();
    clearLegacySessionStorage();
    const nextUser = { ...newSessionUser, token: '' };
    userRef.current = nextUser;
    setUser(nextUser);
  };

  const updateUser = (updatedFields: Partial<AuthenticatedUser>,expectedAccountId?:string) => {
    setUser(prev => {
      if (!prev) return null;
      if(expectedAccountId!==undefined && prev.id!==expectedAccountId)return prev;
      const updated = { ...prev, ...updatedFields };
      return updated;
    });
  };

  const logout = (): Promise<boolean> => {
    if(pendingLogout.current)return pendingLogout.current;
    const pending=(async()=>{
      setSigningOut(true);
      supersedeRestoration();
      const generation = restoration.generation;
      try {
        await restoration.settled();
        if (generation !== restoration.generation) return false;
        const res = await fetch('/api/auth/logout', { method: 'POST', keepalive: true });
        if (!res.ok) throw new Error('Server did not confirm sign out.');
        if (generation !== restoration.generation) return false;
        userRef.current = null;
        clearLegacySessionStorage();
        setUser(null);
        // Discard private cached results without starting fresh dashboard reads
        // while the just-signed-out components are still unmounting.
        queryClient.clear();
        const channel = new BroadcastChannel('pinevela-session');
        channel.postMessage('logout');
        channel.close();
        return true;
      } catch {
        window.alert('Could not sign out of the server. Please check your connection and try again.');
        return false;
      }finally{setSigningOut(false);}
    })();
    pendingLogout.current=pending;
    void pending.finally(()=>{if(pendingLogout.current===pending)pendingLogout.current=null;});
    return pending;
  };

  const apiFetch = async (url: string, options: RequestInit = {}): Promise<any> => {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;
    if (user?.role === 'admin' && needsApprovalKey(options.method || 'GET', url, body) && !body?.privateKey) {
      return requestKeyedApproval(key => apiFetch(url, { ...options, body: JSON.stringify({ ...body, privateKey: key }) }));
    }
    return requestApi(url, options);
  };

  return (
    <AuthContext.Provider value={{ user, loading, restorationError, retrySession: () => setRetry(value => value + 1), login, setSessionUser, updateUser, logout, apiFetch }}>
      {children}
      {signingOut&&<SignOutProgress />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

async function readSessionUser(): Promise<AuthenticatedUser | null> {
  let res: Response;
  try {
    res = await fetch('/api/auth/me', { headers: { 'Content-Type': 'application/json' } });
  } catch {
    throw new SessionCheckUnavailable('Session check could not reach the server.');
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) {
    if ([408, 425, 429].includes(res.status) || res.status >= 500) throw new SessionCheckUnavailable('Session check is temporarily unavailable.');
    throw new Error('Session check did not return a verified identity.');
  }
  const data = await res.json();
  const roles: AuthenticatedUser['role'][] = ['student', 'manager', 'admin', 'staff', 'user', 'merchant', 'verification_team', 'officer', 'field_officer'];
  if (!data || typeof data.id !== 'string' || !data.id || !roles.includes(data.role)) throw new Error('Session check did not return a verified identity.');
  let hasApprovedHostel = false, hostelStatus = 'None';

  const avatar = data.avatar || data.photo || data.photoUrl || data.avatarUrl || data.profilePicture || undefined;
  return { ...data, token: '', ...(({})), avatar, photo: avatar, photoUrl: avatar, avatarUrl: avatar, profilePicture: avatar };
}
