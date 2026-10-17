import { createContext,ReactNode,useCallback,useContext,useEffect,useMemo,useRef,useState } from 'react';
import { AccountRefreshGate } from '../lib/accountRefresh';
import { safeJson } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { sessionFetch as fetch } from '../lib/session';
import { useAuth } from './AuthContext';

import { AlertTriangle,Bell,CheckCircle2,X } from 'lucide-react';
import { AnimatePresence,motion } from 'motion/react';

export interface NotificationItem {
  id: string;
  marketChat?: boolean;
  adminMessage?: boolean;
  messageId?: string;
  buyerId?: string;
  sellerStoreId?: string;
  orderId?: string;
  productId?: string;
  scope?: string;
  category?: string;
  link?: string;
  module?: string;
  marketRatingId?: string;
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'info' | 'error' | string;
  date?: string;
  read?: boolean;
  studentId?: string;
  userId?: string;
  userEmail?: string;
  recipientEmail?: string;
}

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  type: 'success' | 'warning' | 'info' | 'error';
  timestamp: number;
}

export interface RegisteredAccountsState {
  managerAccount: any | null;
  residentAccount: any | null;
  merchantAccount?: any | null;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  registeredAccounts: RegisteredAccountsState;
  toasts: ToastItem[];
  pushToast: (title: string, message?: string, type?: 'success' | 'warning' | 'info' | 'error') => void;
  dismissToast: (id: string) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

// Singleton storage tracking seen keys and read IDs with localStorage persistence
class NotificationDeduplicatorService {
  private static instance: NotificationDeduplicatorService;
  private seenKeys: Set<string> = new Set();
  private readNotificationIds: Set<string> = new Set();

  private constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const storedSeen = localStorage.getItem('pinevela_seen_toast_keys');
      if (storedSeen) {
        const arr = JSON.parse(storedSeen);
        if (Array.isArray(arr)) {
          arr.forEach((k: string) => this.seenKeys.add(k));
        }
      }
      const storedRead = localStorage.getItem('pinevela_read_notification_ids');
      if (storedRead) {
        const arr = JSON.parse(storedRead);
        if (Array.isArray(arr)) {
          arr.forEach((id: string) => this.readNotificationIds.add(id));
        }
      }
    } catch (e) {
      console.warn("Error loading notification cache from storage:", e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem('pinevela_seen_toast_keys', JSON.stringify(Array.from(this.seenKeys).slice(-500)));
      localStorage.setItem('pinevela_read_notification_ids', JSON.stringify(Array.from(this.readNotificationIds).slice(-1000)));
    } catch (e) {}
  }

  public static getInstance(): NotificationDeduplicatorService {
    if (!NotificationDeduplicatorService.instance) {
      NotificationDeduplicatorService.instance = new NotificationDeduplicatorService();
    }
    return NotificationDeduplicatorService.instance;
  }

  public isNotificationRead(id: string, accountKey: string): boolean {
    return Boolean(id && this.readNotificationIds.has(JSON.stringify([accountKey, id])));
  }

  public markNotificationRead(id: string, accountKey: string) {
    if (!id) return;
    this.readNotificationIds.add(JSON.stringify([accountKey, id]));
    this.saveToStorage();
  }

  public shouldFireNotification(notif: NotificationItem, isPrimaryAccount: boolean, accountKey: string): boolean {
    if (!notif) return false;
    // Popups are strictly restricted to the user's primary account (not manager, staff, or sub-accounts)
    if (!isPrimaryAccount) return false;

    // If marked as read or recorded as read, NEVER popup
    if (notif.read || this.isNotificationRead(notif.id, accountKey)) {
      return false;
    }

    const key = `${accountKey}_notif_${notif.id || ''}_${(notif.title || '').trim().toLowerCase()}_${(notif.message || '').trim().toLowerCase()}`;
    if (this.seenKeys.has(key)) {
      return false;
    }
    this.seenKeys.add(key);
    this.saveToStorage();
    return true;
  }

  public resetSeen() {
    // Keep read IDs intact, preserve across sessions
  }
}

export const notificationServiceSingleton = NotificationDeduplicatorService.getInstance();

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, apiFetch } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [registeredAccounts, setRegisteredAccounts] = useState<RegisteredAccountsState>({
    managerAccount: null,
    residentAccount: null,
  });

  const isFirstLoadRef = useRef<boolean>(true);

  // Check if current user session is strictly the Primary Account (not manager, staff, student/resident, or sub-account)
  const userRole = (user?.role || '').toLowerCase().trim();
  const notificationAccountKey = JSON.stringify([userRole, user?.id || '']);
  const activeAccountRef = useRef(notificationAccountKey);
  activeAccountRef.current = notificationAccountKey;
  const generationRef = useRef(0);
  const requestRef = useRef(0);
  const refreshGate = useRef(new AccountRefreshGate());
  const [stateAccountKey, setStateAccountKey] = useState(notificationAccountKey);
  const isPrimaryAccount = Boolean(
    user && (userRole === 'user' || userRole === '')
  );

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushToast = useCallback((title: string, message?: string, type: 'success' | 'warning' | 'info' | 'error' = 'info') => {
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastItem = { id: toastId, title, message, type, timestamp: Date.now() };

    setToasts(prev => {
      // Prevent duplicate toasts with same title within 3 seconds
      const existsRecent = prev.some(t => t.title === title && Date.now() - t.timestamp < 3000);
      if (existsRecent) return prev;
      return [newToast, ...prev].slice(0, 5); // Keep max 5 toasts
    });

    // Auto-dismiss after 4.5s
    setTimeout(() => {
      dismissToast(toastId);
    }, 4500);
  }, [dismissToast]);

  const refreshNotifications = async () => {
    if (!user) {
      setNotifications(prev => prev.length === 0 ? prev : []);
      setRegisteredAccounts(prev => {
        if (!prev.managerAccount && !prev.residentAccount && !prev.merchantAccount) return prev;
        return { managerAccount: null, residentAccount: null, merchantAccount: null };
      });
      return;
    }

    if (document.hidden) return;
    const generation = generationRef.current;
    if (activeAccountRef.current !== notificationAccountKey) return;
    return refreshGate.current.run(notificationAccountKey, generation, async signal => {
      const request = ++requestRef.current;
      const isCurrentAccount = () => !signal.aborted && activeAccountRef.current === notificationAccountKey && generationRef.current === generation && requestRef.current === request;

      // Registered portals belong to the primary view. They must not delay the inbox.
      const registered = (async () => {
        if (!isPrimaryAccount) return;
        try {
          const regData = (await queryClient.fetchQuery({
              queryKey: ['userData', 'registration', user.id],
              queryFn: async ({ signal: querySignal }) => {
                const response = await fetch('/api/users/my-registered-accounts', {
                  signal: AbortSignal.any([querySignal, AbortSignal.timeout(30000)]),
                  headers: { 'X-PineVela-Profile-Context': user.id },
                });
                const data = await safeJson(response);
                if (!response.ok || !data || Array.isArray(data) || !('managerAccount' in data))
                  throw new Error('Could not check registered accounts.');
                return data;
              },
            }));
          if (regData) {
            if (!isCurrentAccount()) return;
            const mgrAccount = regData.managerAccount || null;
            const mktAccount = regData.merchantAccount || null;

            setRegisteredAccounts(prev => {
              if (
                JSON.stringify(prev.managerAccount) === JSON.stringify(mgrAccount) &&
                JSON.stringify(prev.residentAccount) === JSON.stringify(regData.residentAccount || null) &&
                JSON.stringify(prev.merchantAccount) === JSON.stringify(mktAccount)
              ) {
                return prev;
              }
              return {
                managerAccount: mgrAccount,
                residentAccount: regData.residentAccount || null,
                merchantAccount: mktAccount,
              };
            });
          }
        } catch (e) {
          if (!signal.aborted) console.warn("NotificationService: Error fetching registered accounts:", e);
        }
      })();

      // 2. Fetch Notifications list
      let loaded = false;
      try {
        if (!isCurrentAccount()) return;
        const notifs: NotificationItem[] = await apiFetch('/api/notifications', { signal });
        if (!isCurrentAccount()) return;
        if (Array.isArray(notifs)) {
          // Deduplicate notifications list
          const uniqueNotifs: NotificationItem[] = [];
          const seenMap = new Set<string>();

          for (const rawNotif of notifs) {
            // Server read state is authoritative and specific to the current account.
            const isRead = Boolean(rawNotif.read);
            const notif: NotificationItem = { ...rawNotif, read: isRead };
            if (isRead && rawNotif.id) {
              notificationServiceSingleton.markNotificationRead(rawNotif.id, notificationAccountKey);
            }

            const key = `id_${notif.id}_key_${(notif.title || '').toLowerCase()}_${(notif.message || '').toLowerCase()}`;
            if (!seenMap.has(key)) {
              seenMap.add(key);
              uniqueNotifs.push(notif);

              // Popups strictly ONLY fire in the primary user account for brand new unread notifications
              if (!notif.adminMessage && notif.category !== 'system_announcement' && isPrimaryAccount && !notif.read && notificationServiceSingleton.shouldFireNotification(notif, isPrimaryAccount, notificationAccountKey) && !isFirstLoadRef.current) {
                pushToast(notif.title, notif.message, notif.type === 'success' ? 'success' : notif.type === 'warning' ? 'warning' : 'info');
              }
            }
          }

          setNotifications(prev => {
            if (JSON.stringify(prev) === JSON.stringify(uniqueNotifs)) {
              return prev;
            }
            return uniqueNotifs;
          });
          loaded = true;
        }
      } catch (e) {
        if (!signal.aborted) console.warn("NotificationService: Error fetching notifications:", e);
      } finally {
        if (loaded && isCurrentAccount() && isFirstLoadRef.current) {
          isFirstLoadRef.current = false;
        }
      }
      await registered;
    });
  };

  const markAsRead = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      if (activeAccountRef.current !== notificationAccountKey) return;
      notificationServiceSingleton.markNotificationRead(id, notificationAccountKey);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (e) {
      console.warn("Failed to mark notification as read:", e);
    }
  }, [apiFetch, notificationAccountKey]);

  const markAllAsRead = useCallback(async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PUT' });
      if (activeAccountRef.current !== notificationAccountKey) return;
      notifications.forEach(n => {
        if (n.id) notificationServiceSingleton.markNotificationRead(n.id, notificationAccountKey);
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.warn("Failed to mark all notifications as read:", e);
    }
  }, [apiFetch, notifications, notificationAccountKey]);

  // Centralized background real-time polling loop (every 6s) & window focus refresh
  useEffect(() => {
    generationRef.current += 1;
    setStateAccountKey(notificationAccountKey);
    setNotifications([]);
    setToasts([]);
    setRegisteredAccounts({ managerAccount: null, residentAccount: null, merchantAccount: null });
    isFirstLoadRef.current = true;
    refreshNotifications();

    const interval = setInterval(() => {
      refreshNotifications();
    }, 6000);

    const handleFocus = () => {
      if (document.hidden) refreshGate.current.cancel();
      else void refreshNotifications();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pinevela-data-change', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      generationRef.current += 1;
      refreshGate.current.cancel();
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pinevela-data-change', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user?.id, user?.email, user?.role]);

  const currentNotifications = stateAccountKey === notificationAccountKey ? notifications : [];
  const currentToasts = stateAccountKey === notificationAccountKey ? toasts : [];
  const currentRegisteredAccounts = stateAccountKey === notificationAccountKey ? registeredAccounts : { managerAccount: null, residentAccount: null, merchantAccount: null };
  const unreadCount = currentNotifications.filter(n => !n.read).length;

  const providerValue = useMemo(() => ({
    notifications: currentNotifications,
    unreadCount,
    registeredAccounts: currentRegisteredAccounts,
    toasts: currentToasts,
    pushToast,
    dismissToast,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  }), [currentNotifications, unreadCount, currentRegisteredAccounts, currentToasts, pushToast, dismissToast, markAsRead, markAllAsRead, refreshNotifications]);

  return (
    <NotificationContext.Provider value={providerValue}>
      {children}
      <NotificationToastContainer toasts={currentToasts} dismissToast={dismissToast} />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

// Global Toast UI Container
function NotificationToastContainer({ toasts, dismissToast }: { toasts: ToastItem[]; dismissToast: (id: string) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-start gap-3 text-xs ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-50 shadow-emerald-950/40'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-50 shadow-amber-950/40'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-50 shadow-rose-950/40'
                : 'bg-slate-900/90 border-slate-700/60 text-slate-100 shadow-slate-950/40'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400" />}
              {toast.type === 'info' && <Bell className="w-5 h-5 text-blue-400" />}
            </div>

            <div className="flex-1 space-y-0.5">
              <h5 className="font-extrabold text-xs tracking-tight">{toast.title}</h5>
              {toast.message && (
                <p className="opacity-90 leading-relaxed font-medium">{toast.message}</p>
              )}
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white/70 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
