import { needsApprovalKey } from '../../adminApprovalSecurity';
import { requestKeyedApproval } from '../lib/approvalPrompt';
import { sessionFetch as fetch, clearLegacySessionStorage, advanceSessionGeneration } from '../lib/session';
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { SessionRestoration, SessionCheckUnavailable } from '../lib/sessionRestoration';
import { safeJson } from '../lib/api';
import { invalidateAllQueries } from '../lib/queryClient';

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
  login: (usernameOrEmail: string, password: string, portal?: { accountKind: 'resident' | 'seller'; portalPin: string }) => Promise<AuthenticatedUser>;
  setSessionUser: (user: AuthenticatedUser,expectedAccountId?:string) => void;
  updateUser?: (updatedFields: Partial<AuthenticatedUser>,expectedAccountId?:string) => void;
  logout: () => Promise<boolean>;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const restoration = useRef(new SessionRestoration<AuthenticatedUser>()).current;
  const userRef = useRef(user);
  userRef.current = user;
  const [restorationError, setRestorationError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

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
      invalidateAllQueries();
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

  const login = async (usernameOrEmail: string, password: string, portal?: { accountKind: 'resident' | 'seller'; portalPin: string }): Promise<AuthenticatedUser> => {
    supersedeRestoration();
    const generation = restoration.generation;
    await restoration.settled();
    if (generation !== restoration.generation) throw new Error('Sign-in was superseded by another account action.');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usernameOrEmail, password, ...portal })
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
      throw error;
    }

    const userData: AuthenticatedUser = await safeJson(res);
    let hasApprovedHostel = false;
    let hostelStatus = 'None';

    if (userData && userData.role === 'manager') {
      try {
        const hostelRes = await fetch('/api/manager/my-hostel', {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        if (hostelRes.ok) {
          const hostelData = await safeJson(hostelRes);
          if (hostelData?.hostel) {
            const h = hostelData.hostel;
            const isApproved = h.isApproved === true || h.isApproved === 'true' || h.approvalStatus === 'Approved' || h.approvalStatus === 'approved' || h.status === 'Approved' || h.status === 'approved' || h.status === 'Active' || h.status === 'active' || h.status === 'Open' || h.status === 'open';
            hasApprovedHostel = isApproved;
            hostelStatus = h.approvalStatus || h.status || 'Pending';
          }
        }
      } catch (e) {
        console.error("Error prefetching hostel status during login:", e);
      }
    }

    const resolvedAvatar = userData.avatar || userData.photo || userData.photoUrl || userData.avatarUrl || userData.profilePicture || undefined;

    const finalUser = {
      ...userData,
      token: '',
      hasApprovedHostel,
      hostelStatus,
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

  const logout = async (): Promise<boolean> => {
    supersedeRestoration();
    const generation = restoration.generation;
    await restoration.settled();
    if (generation !== restoration.generation) return false;
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', keepalive: true });
      if (!res.ok) throw new Error('Server did not confirm sign out.');
      if (generation !== restoration.generation) return false;
      userRef.current = null;
      clearLegacySessionStorage();
      setUser(null);
      invalidateAllQueries();
      const channel = new BroadcastChannel('pinevela-session');
      channel.postMessage('logout');
      channel.close();
      return true;
    } catch {
      window.alert('Could not sign out of the server. Please check your connection and try again.');
      return false;
    }
  };

  const apiFetch = async (url: string, options: RequestInit = {}): Promise<any> => {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;
    if (user?.role === 'admin' && needsApprovalKey(options.method || 'GET', url, body) && !body?.privateKey) {
      return requestKeyedApproval(key => apiFetch(url, { ...options, body: JSON.stringify({ ...body, privateKey: key }) }));
    }
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    try {
      const res = await fetch(url, {
        ...options,
        headers
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Gracefully return empty array on 401 for background fetch queries
          return [];
        }
        const errData = await safeJson(res);
        throw Object.assign(new Error(errData.error || errData.message || `HTTP error ${res.status}`), { status: res.status });
      }

      const data = await safeJson(res);

      // Invalidate query caches when data changes through Express API
      const method = (options.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        invalidateAllQueries();
      }

      return data;
    } catch (err) {
      console.warn("API fetch warning:", err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, restorationError, retrySession: () => setRetry(value => value + 1), login, setSessionUser, updateUser, logout, apiFetch }}>
      {children}
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
  if (data.role === 'manager') {
    try {
      const response = await fetch('/api/manager/my-hostel', { headers: { 'Content-Type': 'application/json' } });
      if (response.ok) {
        const {hostel} = await response.json();
        if (hostel) {
          hasApprovedHostel = hostel.isApproved === true || hostel.isApproved === 'true' || ['Approved', 'approved'].includes(hostel.approvalStatus) || ['Approved', 'approved', 'Active', 'active', 'Open', 'open'].includes(hostel.status);
          hostelStatus = hostel.approvalStatus || hostel.status || 'Pending';
        }
      }
    } catch { /* Optional hostel status does not invalidate a verified login. */ }
  }
  const avatar = data.avatar || data.photo || data.photoUrl || data.avatarUrl || data.profilePicture || undefined;
  return { ...data, token: '', hasApprovedHostel, hostelStatus, avatar, photo: avatar, photoUrl: avatar, avatarUrl: avatar, profilePicture: avatar };
}
