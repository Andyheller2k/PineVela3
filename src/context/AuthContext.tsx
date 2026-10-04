import { sessionFetch as fetch, clearLegacySessionStorage } from '../lib/session';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  login: (usernameOrEmail: string, password: string) => Promise<AuthenticatedUser>;
  setSessionUser: (user: AuthenticatedUser) => void;
  updateUser?: (updatedFields: Partial<AuthenticatedUser>) => void;
  logout: () => Promise<boolean>;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
// Uploaded data URLs are too large for reliable localStorage caching. The API persists them; local cache is reserved for presets and ordinary URLs.
const cacheAvatar = (email: string | undefined, avatar?: string) => {
  if (!avatar || avatar.startsWith("data:image/")) return;
  try {
    const cleanEmail = (email || "").toLowerCase().trim();
    if (cleanEmail) localStorage.setItem("pinevela_avatar_" + cleanEmail, avatar);
  } catch (error) {
    console.warn("[Auth] Avatar could not be cached locally:", error);
  }
};


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Restore only through the server-validated HttpOnly session cookie.
  useEffect(() => {
    const initAuth = async () => {
      clearLegacySessionStorage();
      {
        try {
          const res = await fetch('/api/auth/me', {
            headers: {
              'Content-Type': 'application/json'
            }
          });
          if (res.ok) {
            const text = await res.text();
            let userData;
            try {
              userData = JSON.parse(text);
            } catch (e) {
              console.error("Failed to parse auth me JSON:", e, "Raw response:", text.substring(0, 100));
              throw new Error("Invalid response from auth service");
            }
            
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
                  const hText = await hostelRes.text();
                  try {
                    const hostelData = JSON.parse(hText);
                    if (hostelData?.hostel) {
                      const h = hostelData.hostel;
                      const isApproved = h.isApproved === true || h.isApproved === 'true' || h.approvalStatus === 'Approved' || h.approvalStatus === 'approved' || h.status === 'Approved' || h.status === 'approved' || h.status === 'Active' || h.status === 'active' || h.status === 'Open' || h.status === 'open';
                      hasApprovedHostel = isApproved;
                      hostelStatus = h.approvalStatus || h.status || 'Pending';
                    }
                  } catch (e) {
                    console.error("Failed to parse manager hostel JSON:", e);
                  }
                }
              } catch (e) {
                console.error("Error prefetching hostel status during auth init:", e);
              }
            }

            // Restore avatar from localStorage if the server didn't return one
            const cleanEmail = (userData.email || '').toLowerCase().trim();
            const avatarKey = cleanEmail ? `pinevela_avatar_${cleanEmail}` : null;
            const storedAvatar = avatarKey ? localStorage.getItem(avatarKey) : null;
            const resolvedAvatar = userData.avatar || userData.photo || userData.photoUrl || userData.avatarUrl || userData.profilePicture || storedAvatar || undefined;
            setUser({
              ...userData,
              token: '',
              hasApprovedHostel,
              hostelStatus,
              avatar: resolvedAvatar,
              photo: resolvedAvatar,
              photoUrl: resolvedAvatar,
              avatarUrl: resolvedAvatar,
              profilePicture: resolvedAvatar
            });
          } else {
            // Token is invalid/expired
            clearLegacySessionStorage();
          }
        } catch (err) {
          console.error("Auth sync error:", err);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  useEffect(() => {
    const clear = () => { clearLegacySessionStorage(); setUser(null); invalidateAllQueries(); };
    const channel = new BroadcastChannel('pinevela-session');
    channel.onmessage = event => { if (event.data === 'logout') clear(); };
    window.addEventListener('pinevela-session-expired', clear);
    return () => { channel.close(); window.removeEventListener('pinevela-session-expired', clear); };
  }, []);

  const login = async (usernameOrEmail: string, password: string): Promise<AuthenticatedUser> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usernameOrEmail, password })
    });

    if (!res.ok) {
      const errData = await safeJson(res);
      const error: any = new Error(errData.error || 'Authentication failed');
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

    // Restore avatar from localStorage if the server didn't return one
    const cleanEmail = (userData.email || '').toLowerCase().trim();
    const avatarKey = cleanEmail ? `pinevela_avatar_${cleanEmail}` : null;
    const storedAvatar = avatarKey ? localStorage.getItem(avatarKey) : null;
    const resolvedAvatar = userData.avatar || userData.photo || userData.photoUrl || userData.avatarUrl || userData.profilePicture || storedAvatar || undefined;

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

    cacheAvatar(cleanEmail, resolvedAvatar);
    setUser(finalUser);
    return finalUser;
  };

  const setSessionUser = (newSessionUser: AuthenticatedUser) => {
    const newPic = newSessionUser?.avatar || newSessionUser?.photo || newSessionUser?.photoUrl || newSessionUser?.avatarUrl || newSessionUser?.profilePicture;
    cacheAvatar(newSessionUser?.email, newPic);
    clearLegacySessionStorage();
    setUser({ ...newSessionUser, token: '' });
  };

  const updateUser = (updatedFields: Partial<AuthenticatedUser>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updatedFields };
      const newPic = updated.avatar || updated.photo || updated.photoUrl || updated.avatarUrl || updated.profilePicture;
      if (newPic) cacheAvatar(updated.email, newPic);
      return updated;
    });
  };

  const logout = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', keepalive: true });
      if (!res.ok) throw new Error('Server did not confirm sign out.');
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
        throw new Error(errData.error || errData.message || `HTTP error ${res.status}`);
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
    <AuthContext.Provider value={{ user, loading, login, setSessionUser, updateUser, logout, apiFetch }}>
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
