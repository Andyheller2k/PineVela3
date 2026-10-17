import SupportNotificationLink from './SupportNotificationLink';
import HelpLink from './HelpLink';
import AppearanceSettings from './AppearanceSettings';

import {
AlertCircle,
Bell,
Briefcase,
Camera,Check,
CheckCircle2,
ChevronRight,
Clock,
Loader2,
LogOut as LogOutIcon,
PanelLeftClose,PanelLeftOpen,
RefreshCw,
Scale,
Settings,
ShieldCheck,
Wrench,
X,
XCircle
} from 'lucide-react';
import { AnimatePresence,motion } from 'motion/react';
import React,{ useEffect,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AccountRefreshGate } from '../lib/accountRefresh';
import { apiFetch,} from '../lib/api';
import { routePopupFeedback } from '../lib/feedback';
import { activateOnKeyboard } from '../lib/keyboardActivation';
import { uploadMaintenancePhoto } from '../lib/maintenanceMedia';
import { saveNavigationLayout,usesTopNavigation } from '../lib/navigationLayout';
import { } from '../lib/queryClient';
import { } from '../utils/pdfHelper';
import DashboardOverlay from './DashboardOverlay';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import MobileNavigation from './MobileNavigation';
import PineLogo from './PineLogo';
import TopNavBadge from './TopNavBadge';

interface StaffBargain {
  id: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  hostelId: string;
  hostelName: string;
  managerId?: string;
  role: string;
  currentShift?: string;
  currentBlock?: string;
  reasonToQuit: string;
  isBargain: boolean;
  bargainProposal?: {
    type: string;
    title: string;
    proposedTerms: string;
    notes?: string;
  };
  status: 'pending' | 'accepted' | 'rejected' | 'quit_confirmed' | 'stay_confirmed' | string;
  managerResponseNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

interface NotificationItem {
  category?: string;
  link?: string;
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  date?: string;
  read?: boolean;
}

export default function PageStaffDashboard() {
  const { user, logout, updateUser } = useAuth();
  const account = React.useRef(user?.id); account.current = user?.id;
  const mounted = React.useRef(true);
  const profileReadVersion = React.useRef(0);
  const issueReads = React.useRef(new AccountRefreshGate()), bargainReads = React.useRef(new AccountRefreshGate());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; issueReads.current.cancel(); bargainReads.current.cancel(); }; }, []);
  const navigate = useNavigate();
  const [isSidebarTopNav, setIsSidebarTopNav] = useState(usesTopNavigation);

  useEffect(() => {
    saveNavigationLayout(isSidebarTopNav);
  }, [isSidebarTopNav]);

  // Data States
  const [staffRecord, setStaffRecord] = useState<any | null>(null);

  // Staff maintenance, notifications and account settings.
  const [activeTab, setActiveTab] = useState<'notifications' | 'settings' | 'maintenance'>('maintenance');
  // Collapsible sidebar state (Disabled minimizing to prevent glitched overlapping)
  const isSidebarCollapsed = false;
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Maintenance Workflow States
  const [assignedIssues, setAssignedIssues] = useState<any[]>([]);
  const [showDeclineModal, setShowDeclineModal] = useState<any | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [showRescheduleModal, setShowRescheduleModal] = useState<any | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleTimeframe, setRescheduleTimeframe] = useState("24h");
  const [showCompleteModal, setShowCompleteModal] = useState<any | null>(null);
  const [isSubmittingComplete, setIsSubmittingComplete] = useState<boolean>(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionPhoto, setCompletionPhoto] = useState("");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Settings / Profile Form States
  const [settingsName, setSettingsName] = useState<string>(user?.name || '');
  const [settingsUsername, setSettingsUsername] = useState<string>(user?.username || user?.email || '');
  const [settingsEmail, setSettingsEmail] = useState<string>(user?.email || '');
  const [settingsPhone, setSettingsPhone] = useState<string>(user?.phone || '');
  const [settingsPhoto, setSettingsPhoto] = useState<string>(user?.profilePicture || user?.photo || user?.avatar || '');
  const [profileDirty, setProfileDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    if (profileDirty) return;
    setSettingsName(staffRecord?.name ?? user?.name ?? '');
    setSettingsUsername(staffRecord?.username ?? user?.username ?? staffRecord?.email ?? user?.email ?? '');
    setSettingsEmail(staffRecord?.email ?? user?.email ?? '');
    setSettingsPhone(staffRecord?.phone ?? user?.phone ?? '');
    setSettingsPhoto(staffRecord?.profilePicture ?? staffRecord?.photo ?? staffRecord?.avatar ?? user?.profilePicture ?? user?.photo ?? user?.avatar ?? '');
  }, [staffRecord, user, profileDirty]);

  const triggerToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (routePopupFeedback(text, type)) return;
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 1500);
  };
  const fetchStaffBargains = (fresh = false) => {
    if (fresh) bargainReads.current.cancel();
    const accountId = user?.id;
    return bargainReads.current.run(accountId || '', 0, async cancellation => {
      const rows = await apiFetch('/api/staff-bargains', {
        signal: AbortSignal.any([cancellation, AbortSignal.timeout(30000)]),
        headers: { 'X-PineVela-Profile-Context': accountId! },
      });
      if (mounted.current && !cancellation.aborted && account.current === accountId && Array.isArray(rows)) setStaffBargains(rows);
    });
  };
  const loadData = async () => {
    const accountId = user?.id, version = ++profileReadVersion.current;
    const current = () => mounted.current && account.current === accountId && profileReadVersion.current === version;
    setLoading(true);
    try {
      const [allStaff, notifs, bargains] = await Promise.all([apiFetch('/api/staff'), apiFetch('/api/notifications'),
        (fetchStaffBargains(true))]);
      if (!current()) return;
      setStaffRecord(Array.isArray(allStaff) ? allStaff.find(s => (s.userId || s.id) === user?.id) || null : null);
      setNotifications(Array.isArray(notifs) ? notifs : []);

    } catch (error: any) { if (current()) triggerToast(error.message || 'Could not load your staff account.', 'error'); }
    finally { if (current()) setLoading(false); }
  };

  const fetchAssignedIssuesRead = async (cancellation?: AbortSignal) => {
    const accountId = user?.id;
    try {
      const res = await apiFetch('/api/issue-reports', ({
        signal: cancellation ? AbortSignal.any([cancellation, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
        headers: { 'X-PineVela-Profile-Context': accountId! },
      }));
      if (!mounted.current || cancellation?.aborted || account.current !== accountId) return;
      if (Array.isArray(res)) {
        const cleanEmail = (user?.email || '').toLowerCase().trim();
        const userId = user?.id;
        const myIssues = (res);
        setAssignedIssues(myIssues);
      }
    } catch (err) {
      if (mounted.current && !cancellation?.aborted && account.current === accountId) console.error("Error fetching assigned issues:", err);
    }
  };
  const fetchAssignedIssues = (fresh = false) => {

    if (fresh) issueReads.current.cancel();
    return issueReads.current.run(user?.id || '', 0, signal => fetchAssignedIssuesRead(signal));
  };

  const handleAcceptAssignment = async (issueId: string) => {
    try {
      await apiFetch(`/api/issue-reports/${issueId}/accept-assignment`, {
        method: 'POST'
      });
      triggerToast("Work order accepted! Marked as In Progress.", "success");
      void fetchAssignedIssues(true);
    } catch (err: any) {
      triggerToast(err.message || "Failed to accept work order.", "error");
    }
  };

  const handleDeclineAssignment = async () => {
    if (!showDeclineModal) return;
    if (!declineReason.trim()) {
      triggerToast("Please provide a reason for declining.", "error");
      return;
    }
    try {
      await apiFetch(`/api/issue-reports/${showDeclineModal.id}/staff-decline`, {
        method: 'POST',
        body: JSON.stringify({ reason: declineReason })
      });
      triggerToast("Assignment decline submitted to manager.", "success");
      setShowDeclineModal(null);
      setDeclineReason("");
      void fetchAssignedIssues(true);
    } catch (err: any) {
      triggerToast(err.message || "Failed to decline.", "error");
    }
  };

  const handleReschedule = async () => {
    if (!showRescheduleModal) return;
    if (!rescheduleReason.trim()) {
      triggerToast("Please provide a reason for rescheduling.", "error");
      return;
    }
    try {
      await apiFetch(`/api/issue-reports/${showRescheduleModal.id}/staff-reschedule`, {
        method: 'POST',
        body: JSON.stringify({
          reason: rescheduleReason,
          requestedTimeframe: rescheduleTimeframe
        })
      });
      triggerToast("SLA extension request sent to manager.", "success");
      setShowRescheduleModal(null);
      setRescheduleReason("");
      void fetchAssignedIssues(true);
    } catch (err: any) {
      triggerToast(err.message || "Failed to submit request.", "error");
    }
  };

  const handleCompleteWorkOrder = async () => {
    if (!showCompleteModal) return;
    setIsSubmittingComplete(true);
    try {
      const uploadedPhoto = completionPhoto ? await uploadMaintenancePhoto(apiFetch,completionPhoto,showCompleteModal.id) : '';
      setCompletionPhoto(uploadedPhoto);
      const payload = {
        completionNotes: (completionNotes.trim()),
        completionPhoto: uploadedPhoto || undefined
      };
      await apiFetch(`/api/issue-reports/${showCompleteModal.id}/staff-complete`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      triggerToast("Work order marked completed! Sent to resident for verification.", "success");
      setShowCompleteModal(null);
      setCompletionNotes("");
      setCompletionPhoto("");
      await fetchAssignedIssues(true);
    } catch (err: any) {
      console.error("Error completing work order:", err);
      triggerToast(err.message || "Failed to mark complete.", "error");
    } finally {
      setIsSubmittingComplete(false);
    }
  };

  const handleStaffCompletionPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      triggerToast("Photo size exceeds 2MB limit.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setCompletionPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  // Current manager-created employment
  const employment = (staffRecord && staffRecord.hostelId && (staffRecord.status === 'Active' || staffRecord.status === 'Approved' || !staffRecord.status) ? {
    id: staffRecord.id,
    role: staffRecord.role,
    hostelId: staffRecord.hostelId,
    hostelName: staffRecord.hostelName,
    shift: staffRecord.shift || '',
    assignedBlock: staffRecord.assignedBlock || '',
    status: 'Approved',
    appliedAt: staffRecord.createdAt
  } as any : null);

  // Initial data loading & periodic sync
  useEffect(() => {
    if (user) {
      loadData();
      fetchAssignedIssues();
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if ((document.hidden)) return;
      void fetchAssignedIssues();
      void fetchStaffBargains().catch(() => {});
    };
    const interval = setInterval(refresh, 8000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, [user?.id, user?.email]);

  // Staff Bargains & Resignation State
  const [staffBargains, setStaffBargains] = useState<StaffBargain[]>([]);
  const [showResignModal, setShowResignModal] = useState(false);
  const [quitReason, setQuitReason] = useState('');
  const [quitMode, setQuitMode] = useState<'bargain' | 'direct'>('bargain');
  const [bargainType, setBargainType] = useState<string>('salary');
  const [bargainTerms, setBargainTerms] = useState('');
  const [bargainNotes, setBargainNotes] = useState('');
  const [submittingQuitOrBargain, setSubmittingQuitOrBargain] = useState(false);
  const [retentionChoice, setRetentionChoice] = useState<{proposal: StaffBargain; decision: 'stay' | 'quit'} | null>(null);
  const [savingRetentionChoice, setSavingRetentionChoice] = useState(false);
  const handleRetentionChoice = async () => {
    if (!retentionChoice || savingRetentionChoice) return;
    setSavingRetentionChoice(true);
    try {
      const result = await apiFetch(`/api/staff-bargains/${retentionChoice.proposal.id}/staff-decision`, {
        method:'POST',body:JSON.stringify({decision:retentionChoice.decision})
      });
      if (!result.success) throw new Error(result.error || 'Could not save your choice.');
      setRetentionChoice(null);
      if (result.quit) { await logout(); navigate('/login', {replace:true}); return; }
      triggerToast('Your choice to stay has been sent to your manager.', 'success');
      await loadData();
    } catch (error:any) { triggerToast(error.message || 'Could not save your choice.', 'error'); }
    finally { setSavingRetentionChoice(false); }
  };

  // Staff voluntary quit / bargain proposal submit handler
  const handleSubmitQuitOrBargain = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quitReason.trim() || quitReason.trim().length < 5) {
      triggerToast('A mandatory reason for wanting to quit is required (minimum 5 characters).', 'error');
      return;
    }

    if (quitMode === 'bargain' && (!bargainTerms.trim() || bargainTerms.trim().length < 3)) {
      triggerToast('Please provide your proposed deal or terms that would convince you to stay.', 'error');
      return;
    }

    setSubmittingQuitOrBargain(true);
    try {
      const payload: any = {
        reasonToQuit: quitReason.trim(),
        isBargain: quitMode === 'bargain'
      };

      if (quitMode === 'bargain') {
        payload.bargainProposal = {
          type: bargainType,
          title: bargainType === 'salary' ? 'Salary & Wage Adjustment' :
                 bargainType === 'shift' ? 'Shift Schedule Modification' :
                 bargainType === 'wing' ? 'Block & Wing Reassignment' :
                 bargainType === 'workload' ? 'Workload & Scope Balancing' : 'Custom Deal Terms',
          proposedTerms: bargainTerms.trim(),
          notes: bargainNotes.trim()
        };
      }

      const directResignation = (quitMode !== 'bargain');
      const res = await apiFetch(directResignation ? '/api/staff/resign' : '/api/staff-bargains', {
        method: 'POST',
        body: JSON.stringify(directResignation ? {reason:quitReason.trim()} : payload)
      });

      if (res.success) {
        if (directResignation) {
          setShowResignModal(false);
          await logout();
          navigate('/login', {replace:true});
          return;
        }
        if (res.directQuit) {
          triggerToast('Your resignation has been submitted to your residence manager.', 'success');
        } else {
          triggerToast('Retention proposal sent to manager! Awaiting their response.', 'success');
        }
        setShowResignModal(false);
        setQuitReason('');
        setBargainTerms('');
        setBargainNotes('');
        await loadData();
      } else {
        triggerToast(res.error || 'Failed to submit proposal', 'error');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to submit proposal', 'error');
    } finally {
      setSubmittingQuitOrBargain(false);
    }
  };

  const handleProfilePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      triggerToast("Image file size should be less than 3MB.", 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setProfileDirty(true);
      setSettingsPhoto(result);
      triggerToast("New profile picture preview loaded. Tap Save to apply.", 'info');
    };
    reader.readAsDataURL(file);
  };

  // Save Settings: Directly updates user credentials and updates manager's staff directory
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!settingsEmail) {
      triggerToast("Email address is required.", 'error');
      return;
    }

    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/staff/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: settingsName,
          phone: settingsPhone,
          ...(({}))
        })
      });

      if (!res.success || !res.user) throw new Error('Your profile could not be saved. Please sign in again.');
      setStaffRecord(res.staffRecord || null);
      setProfileDirty(false);
      if (updateUser) {
        updateUser(res.user);
      }

      triggerToast("Profile updated successfully! All contact details are directly synchronized with your manager's staff directory.", 'success');
      await loadData();
    } catch (err: any) {
      triggerToast(err?.message || "Failed to update profile settings.", 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="page-canvas min-h-screen flex flex-col lg:flex-row relative text-slate-900" data-staff-dashboard>
      {/* Toast Notification */}
      {toastMessage && (
        <div role="status" className="ux-dashboard-toast fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-slate-950/95 text-white border border-slate-800/80 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-semibold backdrop-blur-md">
            <div className={`w-1.5 h-1.5 rounded-full ${
              toastMessage.type === 'success' ? 'bg-emerald-400' : toastMessage.type === 'error' ? 'bg-rose-400' : 'bg-blue-400'
            }`} />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <LogoutConfirmationModal
          isOpen={showLogoutConfirm}
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={async () => {
            if (!await logout()) return;
            navigate('/login');
          }}
        />
      )}



      
      {/* MOBILE HEADER (lg:hidden) */}
      <header data-portal-navigation="header" className="lg:hidden flex items-center justify-between px-5 py-3 bg-sky-100/60 backdrop-blur-xl border-b border-white/70 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <PineLogo size={24} />
          <div>
            <h1 className="text-xs font-black tracking-tight text-blue-950 leading-tight">PineVela Staff</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <HelpLink compact className="!px-2" />
          <button onClick={() => setShowLogoutConfirm(true)} className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg" title="Sign Out">
            <LogOutIcon className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* MOBILE BOTTOM NAV (lg:hidden) */}
      <MobileNavigation label="Staff navigation" activeTab={activeTab} onSelect={id => setActiveTab(id as any)} items={[
            { id: 'notifications', icon: Bell, label: 'Alerts', badge: notifications.filter(n => !n.read).length },
            { id: 'settings', icon: Settings, label: 'Settings' },
            ...(employment ? [
              { id: 'maintenance', icon: Wrench, label: 'Orders', badge: assignedIssues.filter(i => !i.withdrawn && i.status !== 'Resolved' && !i.staffCompleted).length }
            ] : [])
          ]} />

      {/* LEFT SIDEBAR NAVIGATION */}

      {isSidebarTopNav && <nav data-portal-navigation="top" className="hidden lg:block fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(780px,calc(100vw-3rem))] bg-sky-100/70 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg"><div className="flex items-center gap-1 px-2 py-1.5">
        {/* Profile avatar button — left end */}
        <button onClick={() => setActiveTab('settings')} title="Profile & Settings" className="shrink-0 flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl hover:bg-white/70 cursor-pointer">
          {settingsPhoto || user?.photo || user?.avatar ? (
            <img src={settingsPhoto || user?.photo || user?.avatar} alt="Profile" className="w-6 h-6 rounded-full object-cover ring-2 ring-white shadow-sm" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-900 text-white flex items-center justify-center font-black text-[9px] shadow-sm">{user?.name?.[0] || 'S'}</div>
          )}
          <span className="text-[9px] font-bold text-slate-500">Profile</span>
        </button>
        <div className="w-px h-6 bg-slate-200/70 shrink-0" />
        {[{ id: 'maintenance', label: 'Fixes', icon: Wrench, badge: employment ? assignedIssues.filter(i => !i.withdrawn && i.status !== 'Resolved' && !i.staffCompleted).length : 0 }, { id: 'notifications', label: 'Alerts', icon: Bell, badge: notifications.length }, { id: 'settings', label: 'Settings', icon: Settings }].map(tab => <button aria-current={activeTab === tab.id ? 'page' : undefined} key={tab.id} onClick={() => setActiveTab(tab.id as any)} aria-label={`${tab.label}${tab.badge ? ` (${tab.badge})` : ''}`} className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[9px] font-bold cursor-pointer ${activeTab === tab.id ? 'text-blue-700 bg-blue-100/65' : 'text-slate-500 hover:bg-white/70'}`}><span className="relative inline-flex"><tab.icon className="w-4 h-4" /><TopNavBadge count={tab.badge} /></span><span className="truncate max-w-full">{tab.label}</span></button>)}<button onClick={() => setShowLogoutConfirm(true)} title="Sign Out" className="shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 text-[9px] font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"><LogOutIcon className="w-4 h-4" /><span>Sign Out</span></button><button onClick={() => setIsSidebarTopNav(false)} title="Show sidebar" className="p-2 text-slate-500 hover:text-blue-700 cursor-pointer"><PanelLeftOpen className="w-4 h-4" /></button><HelpLink compact className="!px-2" /></div></nav>}
      {!isSidebarTopNav && <aside data-portal-navigation="sidebar" className={`hidden lg:flex ${isSidebarCollapsed ? 'w-20 p-4' : 'w-72 p-6'} my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl flex flex-col justify-between shrink-0 overflow-y-auto z-20 transition-all duration-300 relative`}>
        <button onClick={() => setIsSidebarTopNav(true)} title="Use top navigation" className="absolute top-3 right-3 p-2 rounded-xl text-slate-500 hover:text-blue-700 hover:bg-white/70 cursor-pointer"><PanelLeftClose className="w-4 h-4" /></button>

        <div className="space-y-6">
          {/* Logo & Header */}
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3 px-2'}`}>
            <PineLogo size={isSidebarCollapsed ? 30 : 36} hideText={isSidebarCollapsed} />
            {!isSidebarCollapsed && (
              <div>
                <h1 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-blue-900 to-cyan-800 bg-clip-text text-transparent">
                  PineVela Staff
                </h1>
                <p className="text-[10px] font-medium text-blue-600/70 uppercase tracking-widest">Team Operations</p>
              </div>
            )}
          </div>

          {/* Staff Member Profile Card */}
          <div className={`p-3.5 bg-sky-50/60 border border-white/80 rounded-2xl flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} shadow-sm overflow-hidden`}>
            <div className="flex items-center gap-3 overflow-hidden">
              {settingsPhoto || user?.photo || user?.avatar ? (
                <img 
                  src={settingsPhoto || user?.photo || user?.avatar} 
                  alt="Staff Avatar" 
                  className="w-10 h-10 rounded-xl object-cover border border-blue-200 shadow-sm shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';
                  }}
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-blue-900 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
                  {user?.name?.[0] || 'S'}
                </div>
              )}
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-slate-900 truncate">{user?.name || 'Staff Member'}</div>
                  <div className="text-[10px] font-semibold text-blue-700 flex items-center gap-1">
                    {employment ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 inline shrink-0" />
                        <span className="truncate text-emerald-700 font-bold">{employment.role || 'Enrolled Staff'}</span>
                      </>
                    ) :(
                      <>
                        <Briefcase className="w-3 h-3 text-slate-500 inline shrink-0" />
                        <span className="truncate text-slate-600 font-medium">Ready to Apply</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && (
              <button
                onClick={() => setActiveTab('settings')}
                title="Staff Profile Settings"
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100/50 rounded-lg transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="space-y-2">
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Staff Portal</p>
            )}
            
            {/* Tab TOP: Assigned Maintenance Work Orders (Highlighted First) */}
            <button
              onClick={() => setActiveTab('maintenance')}
              title="Assigned Work Orders"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-3.5'} rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-md ${
                activeTab === 'maintenance'
                  ? 'bg-gradient-to-r from-blue-700 to-sky-800 text-white shadow-blue-900/30 border border-blue-400'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white hover:from-emerald-700 hover:to-teal-800 border border-emerald-400/60'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Wrench className={`w-4 h-4 shrink-0 ${activeTab === 'maintenance' ? 'text-amber-300' : 'text-amber-200'} animate-bounce`} />
                {!isSidebarCollapsed && (
                  <div className="text-left overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-black truncate">Assigned Work Orders</span>
                      {assignedIssues.filter(i => !i.withdrawn && i.status !== 'Resolved' && !i.staffCompleted).length > 0 && (
                        <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded text-[9px] font-black uppercase animate-pulse shrink-0">
                          {assignedIssues.filter(i => !i.withdrawn && i.status !== 'Resolved' && !i.staffCompleted).length} NEW
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] font-medium truncate ${activeTab === 'maintenance' ? 'text-blue-200' : 'text-emerald-100'}`}>
                      Priority maintenance & repair tasks
                    </div>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && assignedIssues.filter(i => !i.withdrawn && i.status !== 'Resolved' && !i.staffCompleted).length > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-sm animate-ping shrink-0">
                  !
                </span>
              )}
            </button>


            {/* Tab: Job Offers */}

            <button
              onClick={() => setActiveTab('notifications')}
              title="Notifications"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-3'} rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-blue-900 text-white shadow-lg shadow-blue-900/25'
                  : 'bg-white/40 hover:bg-white/80 text-slate-700 border border-slate-200/40'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Bell className={`w-4 h-4 shrink-0 ${activeTab === 'notifications' ? 'text-amber-300' : 'text-blue-700'}`} />
                {!isSidebarCollapsed && (
                  <div className="text-left overflow-hidden">
                    <div className="truncate">Notifications</div>
                    <div className={`text-[10px] font-normal truncate ${activeTab === 'notifications' ? 'text-blue-200' : 'text-slate-500'}`}>
                      Management alerts & updates
                    </div>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && notifications.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black shrink-0 ${
                  activeTab === 'notifications' ? 'bg-amber-400 text-slate-950' : 'bg-blue-900 text-white'
                }`}>
                  {notifications.length}
                </span>
              )}
            </button>

            {/* Tab 3: Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              title="Staff Settings"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-3'} rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-blue-900 text-white shadow-lg shadow-blue-900/25'
                  : 'bg-white/40 hover:bg-white/80 text-slate-700 border border-slate-200/40'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-amber-300' : 'text-blue-700'}`} />
                {!isSidebarCollapsed && (
                  <div className="text-left overflow-hidden">
                    <div className="truncate">Staff Settings</div>
                    <div className={`text-[10px] font-normal truncate ${activeTab === 'settings' ? 'text-blue-200' : 'text-slate-500'}`}>
                      Profile & directory sync
                    </div>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'settings' ? 'text-blue-300' : 'text-slate-400'}`} />}
            </button>

            {/*  */}


          </nav>
        </div>

        {/* Footer Actions */}
        <div className="pt-6 border-t border-sky-200/80 space-y-3">
          {!isSidebarCollapsed && (
            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/40 text-[11px] text-blue-900 font-medium">
              <div className="font-bold flex items-center gap-1.5 text-blue-950">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>PineVela Staff Network</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-0.5">Accredited student housing personnel system.</p>
            </div>
          )}

          <button
            onClick={() => setShowLogoutConfirm(true)}
            title="Log Out"
            className={`w-full flex items-center justify-center ${isSidebarCollapsed ? 'p-2.5' : 'gap-2 px-4 py-2.5'} bg-white/60 hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200/60 rounded-xl text-xs font-bold transition-all cursor-pointer`}
          >
            <LogOutIcon className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span>Log Out</span>}
          </button>
        <div className="flex justify-center pt-3"><HelpLink compact={isSidebarCollapsed} /></div>
        </div>

      </aside>}


      {/* MAIN WORKSPACE CONTENT */}
      <main className={`dashboard-centered-content min-w-0 flex-1 m-4 mb-24 lg:mb-6 lg:my-6 lg:mr-6 h-auto lg:h-[calc(100vh-3rem)] overflow-y-auto pb-24 lg:pb-8 bg-gradient-to-br from-sky-100/65 via-blue-100/45 to-indigo-100/35 backdrop-blur-2xl border border-white/70 shadow-2xl shadow-blue-950/10 rounded-3xl p-6 md:p-8 space-y-8 relative z-10 ${isSidebarTopNav ? 'lg:pt-24 lg:w-[calc(100vw-22rem)] lg:max-w-[calc(100vw-22rem)] lg:mx-auto' : ''}`}>
        {/* TOP STATUS BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-emerald-100 text-emerald-900 rounded-md border border-emerald-200">
                Staff Console
              </span>
              {employment && <span className="text-xs text-blue-900 font-semibold">Hostel: {employment.hostelName}</span>}
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mt-1">
              {activeTab === 'notifications' && 'Operational Notifications'}
              {activeTab === 'settings' && 'Staff Account & Profile Settings'}
              {activeTab === 'maintenance' && 'Maintenance Work Orders'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 hover:text-blue-900 rounded-xl shadow-xs hover:shadow transition-all cursor-pointer"
              title="Refresh console state"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-900">{user?.name}</div>
              <div className="text-[11px] text-slate-500 font-mono">@{user?.username || 'staff'}</div>
            </div>
          </div>
        </div>



        {/* ========================================================================= */}
        {/* TAB 2: NOTIFICATIONS (APPLICATION UPDATES, NOTICES & DECISIONS) */}
        {/* ========================================================================= */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Notifications & Decisions</h3>
                <p className="text-xs text-slate-500 font-medium">Updates from your residence manager about maintenance assignments and employment requests.</p>
              </div>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                {notifications.length} Total Notices
              </span>
            </div>

            {(staffBargains.length > 0) && (
              <section aria-label="Your retention proposals" className="space-y-4">
                <h3 className="text-lg font-black text-slate-900">Your Retention Proposals</h3>
                {staffBargains.map(proposal => (
                  <article key={proposal.id} className="rounded-2xl border border-slate-200 bg-white/75 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-900">{proposal.bargainProposal?.title}</h4>
                      <span className="text-xs font-semibold text-blue-800">{proposal.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{proposal.bargainProposal?.proposedTerms}</p>
                    {proposal.managerResponseNote && <p className="text-sm text-slate-600 whitespace-pre-wrap">Manager response: {proposal.managerResponseNote}</p>}
                    {proposal.status === 'rejected' && (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-700">Your manager declined this proposal. Choose whether to stay on current terms or resign.</p>
                        <div className="flex flex-wrap gap-3">
                          <button type="button" onClick={() => setRetentionChoice({proposal,decision:'stay'})} className="rounded-xl bg-blue-700 text-white font-bold px-4 py-3">Stay on current terms</button>
                          <button type="button" onClick={() => setRetentionChoice({proposal,decision:'quit'})} className="rounded-xl border border-red-300 text-red-700 font-bold px-4 py-3">Resign</button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            )}

            {notifications.length === 0 ? (
              <div className="p-12 text-center bg-sky-50/55 backdrop-blur-xl border border-white/80 rounded-3xl space-y-3">
                <Bell className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-base font-bold text-slate-800">No New Notifications</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Updates from your residence manager and maintenance assignments will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => {
                  const isSuccess = n.type === 'success' || n.title?.toLowerCase().includes('approved');
                  const isWarning = n.type === 'warning' || n.title?.toLowerCase().includes('reject');

                  return (
                    <div
                      key={n.id}
                      className={`p-5 bg-sky-50/55 backdrop-blur-xl border rounded-2xl shadow-xs transition-all space-y-2 ${
                        isSuccess ? 'border-emerald-200 bg-emerald-50/30' : isWarning ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-xl shrink-0 ${
                            isSuccess ? 'bg-emerald-100 text-emerald-700' : isWarning ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {isSuccess ? <CheckCircle2 className="w-4 h-4" /> : isWarning ? <XCircle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900">{n.title}</h4>
                            <span className="text-[10px] text-slate-400 font-semibold">{n.date || 'Today'}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed pl-10">
                        {n.message}
                      </p>
                      <SupportNotificationLink notification={n} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}



        {/* ========================================================================= */}
        {/* TAB 3: SETTINGS (PROFILE, USERNAME, EMAIL, PHONE, PICTURE -> MANAGER SYNC) */}
        {/* ========================================================================= */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-sky-50/55 backdrop-blur-xl border border-white/80 rounded-3xl p-6 md:p-8 shadow-sm shadow-blue-950/5 space-y-6">
            <AppearanceSettings />
            <div className="border-b pb-4">
              <h3 className="text-lg font-black text-slate-900">Staff Account Settings</h3>
              <p className="text-xs text-slate-500 font-medium">
                {('Update your display name and contact phone. Your verified work email stays tied to this staff account.')}
              </p>
            </div>

            <form aria-label="Staff profile" onSubmit={handleSaveSettings} className="space-y-6">
              {/* Profile Picture Upload & Preview */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-4 bg-blue-100/45 rounded-2xl border border-white/80">
                <div className="relative">
                  {settingsPhoto ? (
                    <img 
                      src={settingsPhoto} 
                      alt="Profile Preview" 
                      className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-200 shadow-md"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-blue-900 text-white flex items-center justify-center font-black text-xl shadow-md">
                      {settingsName?.[0] || 'S'}
                    </div>
                  )}
                  {false}
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-900">Profile Picture</h4>
                  <p className="text-[10px] text-slate-500">{('Your saved photo appears on the manager roster.')}</p>
                  {false}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label htmlFor="staff-profile-name" className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <input aria-label="Full Name"
                    id="staff-profile-name"
                    type="text"
                    value={settingsName}
                    onChange={(e) => { setProfileDirty(true); setSettingsName(e.target.value); }}
                    placeholder="e.g. Kwame Mensah"
                    className="w-full px-3.5 py-2.5 bg-white/65 border border-blue-200/70 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Username */}
                <div>
                  <label htmlFor="staff-profile-username" className="block text-xs font-bold text-slate-700 mb-1">Username (Login ID)</label>
                  <input aria-label="Username (Login ID)"
                    id="staff-profile-username"
                    type="text"
                    readOnly={true}
                    value={settingsUsername}
                    onChange={(e) => { setProfileDirty(true); setSettingsUsername(e.target.value); }}
                    placeholder="e.g. kwame_staff"
                    className="w-full px-3.5 py-2.5 bg-white/65 border border-blue-200/70 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Contact Phone */}
                <div>
                  <label htmlFor="staff-profile-phone" className="block text-xs font-bold text-slate-700 mb-1">Phone Number (Direct Line)</label>
                  <input aria-label="Phone Number (Direct Line)"
                    id="staff-profile-phone"
                    type="text"
                    value={settingsPhone}
                    onChange={(e) => { setProfileDirty(true); setSettingsPhone(e.target.value); }}
                    placeholder="+233 24 123 4567"
                    className="w-full px-3.5 py-2.5 bg-white/65 border border-blue-200/70 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label htmlFor="staff-profile-email" className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input aria-label="Email Address"
                    id="staff-profile-email"
                    type="email"
                    readOnly={true}
                    value={settingsEmail}
                    onChange={(e) => { setProfileDirty(true); setSettingsEmail(e.target.value); }}
                    placeholder="kwame@example.com"
                    className="w-full px-3.5 py-2.5 bg-white/65 border border-blue-200/70 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>
              </div>


              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {savingSettings ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Synchronizing Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save & Synchronize Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SECURE ENCRYPTED CHAT SYSTEM                                       */}
        {/* ========================================================================= */}

      {/* ========================================================================= */}
      {/* TAB 6: ASSIGNED MAINTENANCE WORK ORDERS (VOCATIONAL STAFF WORKFLOW) */}
      {/* ========================================================================= */}
      {activeTab === 'maintenance' && employment && (
        <div className="space-y-6 pt-3">
          <div className="space-y-4">
            {assignedIssues.length === 0 ? (
              <div className="text-center py-16 bg-sky-50/50 backdrop-blur-xl border border-dashed border-blue-200 rounded-3xl p-8 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 mx-auto border border-slate-200 shadow-sm">
                  <Wrench className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-slate-800">No repair tickets on your desk</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">Whenever the hostel manager assigns a work order, it will appear here for your immediate diagnostics.</p>
                </div>
              </div>
            ) : (
              assignedIssues.map(issue => {
                const isTaskCompleted = !issue.withdrawn && (issue.status === 'Resolved' || issue.status === 'Closed' || issue.staffCompleted || issue.closedByManager || issue.isClosed);
                const isOverdue = !issue.withdrawn && !isTaskCompleted && issue.deadline && new Date() > new Date(issue.deadline);
                
                // Calculate countdown
                let countdownText = 'No strict deadline';
                if (issue.deadline) {
                  const diff = new Date(issue.deadline).getTime() - Date.now();
                  if (diff <= 0) {
                    countdownText = '⚠️ SLA TIME EXCEEDED';
                  } else {
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    if (hours > 24) {
                      const days = Math.floor(hours / 24);
                      countdownText = `${days}d ${hours % 24}h remaining`;
                    } else {
                      countdownText = `${hours}h ${mins}m remaining`;
                    }
                  }
                }

                return (
                  <div key={issue.id} className="p-5 sm:p-6 bg-sky-50/55 backdrop-blur-xl border border-white/80 rounded-3xl shadow-xs hover:shadow-md transition-all space-y-4">
                    
                    {/* Urgencies, High-Contrast Status Badge & Deadline Countdown */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* High-Contrast Visual Status Badge */}
                        <span className={`text-xs font-black px-3 py-1 rounded-xl shadow-sm ${
                          isTaskCompleted ? 'bg-emerald-600 text-white' :
                          issue.status === 'In Progress' ? 'bg-blue-600 text-white' :
                          'bg-amber-600 text-white'
                        }`}>
                          ● {isTaskCompleted ? 'Complete' : issue.status}
                        </span>
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${
                          issue.urgency === 'Emergency' ? 'bg-rose-600 text-white' :
                          issue.urgency === 'High' ? 'bg-orange-600 text-white' :
                          'bg-slate-700 text-white'
                        }`}>
                          {issue.urgency} Urgency
                        </span>
                        <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          {issue.category}
                        </span>
                        <span className="text-[10px] font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200">
                          Room {issue.roomNumber}
                        </span>
                      </div>
                      
                      {/* Clear Deadline Countdown Timer Badge (Removed when task is complete) */}
                      {issue.withdrawn ? (
                        <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700">
                          Withdrawn after a reviewed closure. Repair evidence is retained.
                        </div>
                      ) : isTaskCompleted ? (
                        <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-3.5 py-1.5 rounded-xl border border-emerald-200 shadow-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-black uppercase tracking-wide">Task Completed</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-slate-900 text-white px-3.5 py-1.5 rounded-xl shadow-sm border border-slate-700">
                          <Clock className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                          <div className="text-right">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Deadline Countdown:</span>
                            <span className={`text-xs font-black ${isOverdue ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>
                              {countdownText}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Main content info */}
                    <div className="space-y-1.5">
                      <h4 className="text-sm font-black text-slate-900">{issue.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">{issue.description}</p>
                    </div>

                    {/* Photos attached by Student */}
                    {issue.photos && issue.photos.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student Proof Attachments ({issue.photos.length}):</span>
                        <div className="flex gap-2 flex-wrap">
                          {issue.photos.map((photo: string, index: number) => (
                            <img role="button" tabIndex={0} aria-label="View reported issue photograph" onKeyDown={activateOnKeyboard}
                              key={index}
                              src={photo}
                              alt="Student proof"
                              className="w-16 h-16 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-85 transition-all"
                              onClick={() => setZoomedImage(photo)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SLA Penalty Tracker */}
                    {issue.deadline && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs">
                          <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Assigned SLA Deadline:</span>
                          <span className="font-bold text-slate-800">{new Date(issue.deadline).toLocaleString()}</span>
                        </div>
                        {isOverdue ? (
                          <span className="text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 px-3 py-1 rounded-full animate-pulse">
                            ⚠️ SLA EXCEEDED (DELAY PENALTY ACTIVE)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                            ✓ SLA Safe Limit active
                          </span>
                        )}
                      </div>
                    )}

                    {/* Pending Request Badges */}
                    <div className="flex flex-wrap gap-2">
                      {issue.staffDeclineRequested && (
                        <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-3 py-1 rounded-full font-bold">
                          🕒 Decline requested - awaiting manager reassignment
                        </span>
                      )}
                      {!issue.withdrawn && issue.rescheduleRequested && (
                        <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full font-bold">
                          🕒 SLA Timeframe Extension pending manager approval
                        </span>
                      )}
                    </div>

                    {/* ACTIVE FLOW BUTTONS */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-3">
                      {/* Case A: Dispatch Not Acknowledged yet */}
                      {!issue.staffAccepted && !issue.staffCompleted && !issue.staffDeclined && !issue.closedByManager && !issue.staffRescheduleRequested && ['Open', 'Pending', 'Assigned', 'In Progress'].includes(issue.status) && (
                        <div className="w-full flex flex-col sm:flex-row gap-3">
                          <button
                            onClick={() => handleAcceptAssignment(issue.id)}
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            <span>Acknowledge & Set In Progress</span>
                          </button>

                          <button
                            onClick={() => setShowDeclineModal(issue)}
                            className="py-3 px-4 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                          >
                            Decline Work Order
                          </button>
                        </div>
                      )}

                      {/* Case B: Work In Progress */}
                      {issue.status === 'In Progress' && issue.staffAccepted && !issue.staffCompleted && !issue.staffDeclined && !issue.staffRescheduleRequested && !issue.closedByManager && (
                        <div className="w-full flex flex-col sm:flex-row gap-3">
                          <button
                            onClick={() => setShowCompleteModal(issue)}
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4.5 h-4.5" />
                            <span>Mark Resolved (Awaiting Sign-off)</span>
                          </button>
                          {!issue.rescheduleRequested && (
                            <button
                              onClick={() => setShowRescheduleModal(issue)}
                              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                            >
                              Request SLA Extension
                            </button>
                          )}
                        </div>
                      )}

                      {/* Case C: Completed awaiting signature */}
                      {issue.staffCompleted && (
                        <div className="w-full p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>{issue.withdrawn ? 'Recorded repair submission · Withdrawn' : issue.closedByManager ? 'Work order closed' : issue.studentConfirmed ? 'Repair confirmed by resident' : (!issue.requiresResidentSignoff) ? 'Repair completed · Awaiting management closure' : 'Repair submitted · Awaiting resident sign-off'}</span>
                            </span>
                            {issue.staffCompletedAt && (
                              <span className="text-[10px] text-emerald-700 font-semibold">
                                {new Date(issue.staffCompletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          {issue.staffCompletionNotes && (
                            <p className="text-xs text-slate-700 bg-white/70 p-2.5 rounded-xl border border-emerald-100 italic">
                              "{issue.staffCompletionNotes}"
                            </p>
                          )}
                          {issue.staffCompletionPhoto && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[10px] font-bold text-slate-500">Submitted Proof:</span>
                              <img role="button" tabIndex={0} aria-label="View repair completion photograph" onKeyDown={activateOnKeyboard}
                                src={issue.staffCompletionPhoto} 
                                alt="Resolution Proof" 
                                onClick={() => setZoomedImage(issue.staffCompletionPhoto)}
                                className="w-12 h-12 object-cover rounded-lg border border-emerald-200 cursor-pointer hover:opacity-80 transition-opacity" 
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      </main>

      {/* Decline Dialog Modal */}
      {showDeclineModal && (
        <DashboardOverlay aria-label="Decline Work Order Assignment" onClose={() => setShowDeclineModal(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-55 animate-fadeIn">
          <div data-popup-card className="bg-blue-50/90 backdrop-blur-xl rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-200/80 space-y-5">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Decline Work Order Assignment</h3>
              <button aria-label="Close dialog" onClick={() => setShowDeclineModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                State why you cannot attend to this issue at this time. The manager will be instantly notified to reassign the repair.
              </p>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">REASON FOR DECLINING <span className="text-rose-500">*</span></label>
                <textarea aria-label="REASON FOR DECLINING"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. Schedule conflicts, missing diagnostic tools, or lack of components..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowDeclineModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button onClick={handleDeclineAssignment} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md">
                Decline & Send
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* Reschedule/SLA Extension Modal */}
      {showRescheduleModal && (
        <DashboardOverlay aria-label="Request SLA Timeframe Extension" onClose={() => setShowRescheduleModal(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-55 animate-fadeIn">
          <div data-popup-card className="bg-blue-50/90 backdrop-blur-xl rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-200/80 space-y-5">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Request SLA Timeframe Extension</h3>
              <button aria-label="Close dialog" onClick={() => setShowRescheduleModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                If the repair requires more time due to diagnostics, delivery delay of replacement components, or external technician support, ask for an SLA extension.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">REQUESTED TIME LIMIT</label>
                  <select aria-label="REQUESTED TIME LIMIT"
                    value={rescheduleTimeframe}
                    onChange={(e) => setRescheduleTimeframe(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600"
                  >
                    <option value="12h">12 Hours Extension</option>
                    <option value="24h">24 Hours (1 Day)</option>
                    <option value="48h">48 Hours (2 Days)</option>
                    <option value="3d">3 Days Extension</option>
                    <option value="5d">5 Days Extension</option>
                    <option value="7d">7 Days Extension</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">REASON FOR EXTENSION <span className="text-rose-500">*</span></label>
                  <textarea aria-label="REASON FOR EXTENSION"
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="Provide details about the diagnostic complexity, lack of spare parts, or class schedules..."
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowRescheduleModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button onClick={handleReschedule} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md">
                Send Request
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* Completion Signoff Modal with Image attachment upload */}
      {showCompleteModal && (
        <DashboardOverlay aria-label="Submit Repair Resolution Details" onClose={() => setShowCompleteModal(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-55 animate-fadeIn">
          <div data-popup-card className="bg-blue-50/90 backdrop-blur-xl rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-200/80 space-y-5">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Submit Repair Resolution Details</h3>
              <button aria-label="Close dialog" onClick={() => setShowCompleteModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Provide comprehensive remarks about what repairs were carried out, along with a picture proof if applicable, to allow resident verification.
              </p>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">COMPLETION REMARKS <span className="text-rose-500">*</span></label>
                <textarea aria-label="COMPLETION REMARKS"
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Describe the diagnostics and corrective actions (e.g., Replaced sink trap pipe, verified seals)..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">RESOLUTION PICTURE PROOF (OPTIONAL)</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex flex-col items-center justify-center px-4 py-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl cursor-pointer hover:bg-slate-100/70 transition-all">
                    <Camera className="w-5 h-5 text-slate-400 mb-1" />
                    <span className="text-[10px] font-bold text-slate-500">Upload Action Proof</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleStaffCompletionPhotoUpload} 
                    />
                  </label>
                  {completionPhoto && (
                    <div className="relative">
                      <img src={completionPhoto} alt="Upload Preview" className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
                      <button aria-label="Remove photograph"
                        onClick={() => setCompletionPhoto('')}
                        className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-0.5 shadow-md"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button 
                type="button"
                disabled={isSubmittingComplete}
                onClick={() => setShowCompleteModal(null)} 
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={isSubmittingComplete}
                onClick={handleCompleteWorkOrder} 
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isSubmittingComplete ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Completed</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* ZOOMED IMAGE OVERLAY */}
      <AnimatePresence>
        {zoomedImage && (
          <DashboardOverlay aria-label="Image preview" onClose={() => setZoomedImage(null)}
            onClick={() => setZoomedImage(null)}
            className="fixed inset-0 bg-black/90 z-60 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              src={zoomedImage}
              alt="Zoomed preview"
              className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
            />
            <button aria-label="Close dialog"
              onClick={() => setZoomedImage(null)}
              className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </DashboardOverlay>
        )}
      </AnimatePresence>

      {retentionChoice && (
        <DashboardOverlay aria-label="Confirm retention choice" onClose={() => {if (!savingRetentionChoice) setRetentionChoice(null);}} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div data-popup-card className="w-full max-w-md rounded-3xl bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-lg">{retentionChoice.decision === 'quit' ? 'Confirm resignation' : 'Confirm staying'}</h3>
              <button type="button" aria-label="Close dialog" disabled={savingRetentionChoice} onClick={() => setRetentionChoice(null)} className="p-3"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-700">{retentionChoice.decision === 'quit' ? 'This ends your staff employment and signs you out. Your manager receives your previously submitted resignation reason.' : 'You will continue working on current terms. Your manager receives your choice.'}</p>
            {retentionChoice.decision === 'quit' && <p className="text-sm text-slate-700 whitespace-pre-wrap">Reason: {retentionChoice.proposal.reasonToQuit}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" disabled={savingRetentionChoice} onClick={() => setRetentionChoice(null)} className="rounded-xl border px-4 py-3">Cancel</button>
              <button type="button" disabled={savingRetentionChoice} onClick={handleRetentionChoice} className={`rounded-xl px-4 py-3 text-white font-bold disabled:opacity-60 ${retentionChoice.decision === 'quit' ? 'bg-red-700' : 'bg-blue-700'}`}>{savingRetentionChoice ? 'Saving…' : 'Confirm'}</button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* QUIT / RESIGN FROM JOB & BARGAIN MODAL — CRYSTAL FROSTY BLUE PINEVELA THEME */}
      {showResignModal && employment && (
        <DashboardOverlay aria-label="Hostel Job Resignation & Bargaining" onClose={() => setShowResignModal(false)} className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white/90 backdrop-blur-2xl rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl shadow-blue-950/25 border border-blue-200/80 space-y-5 animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3.5 pb-3 border-b border-blue-100/70">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/30 ring-4 ring-blue-100/80">
                  <Scale className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Hostel Job Resignation & Bargaining</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                      PineVela HR
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Position: <strong className="text-blue-900">{employment.role}</strong> at <strong className="text-blue-900">{employment.hostelName}</strong>
                  </p>
                </div>
              </div>
              <button aria-label="Close dialog"
                type="button"
                onClick={() => setShowResignModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-blue-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mandatory Reason for Quitting Section */}
            <div className="space-y-2.5 p-4.5 bg-gradient-to-br from-blue-50/80 via-sky-50/50 to-white border border-blue-200/80 rounded-2xl shadow-xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  <span>Reason why you want to quit <span className="text-rose-600">*</span></span>
                </label>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200 uppercase tracking-wider">
                  Mandatory for Manager
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Staff regulations require submitting a clear explanation to management when considering leaving your position.
              </p>

              {/* Quick Suggestion Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'Salary / compensation is inadequate',
                  'Shift schedule conflicts with classes/routine',
                  'Excessive workload in assigned block',
                  'Personal commitments & relocation',
                  'Seeking different role / opportunities'
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setQuitReason(chip)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                      quitReason === chip
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/30'
                        : 'bg-white/80 text-blue-900 border-blue-200/80 hover:bg-blue-50 hover:border-blue-300'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <textarea aria-label="Reason why you want to quit"
                value={quitReason}
                onChange={(e) => setQuitReason(e.target.value)}
                placeholder="Type or select a reason why you are seeking to quit (minimum 5 characters)..."
                rows={2}
                className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-400/20 resize-none mt-1 shadow-xs"
              />
            </div>

            {/* Mode Selection Tabs: Bargain to Stay VS Direct Quit */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-800 block">Choose Your Action:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setQuitMode('bargain')}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer space-y-1.5 ${
                    quitMode === 'bargain'
                      ? 'bg-gradient-to-br from-blue-50/90 to-sky-50/90 border-blue-400 ring-2 ring-blue-400/40 text-blue-950 shadow-sm shadow-blue-500/10'
                      : 'bg-white/70 border-slate-200 hover:border-blue-300 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs text-blue-900">
                    <span>Bargain to Stay</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-tight">
                    Propose terms (e.g. salary, shift, wing) to manager. If accepted, you're good! If declined, you can decide to quit or stay.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setQuitMode('direct')}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer space-y-1.5 ${
                    quitMode === 'direct'
                      ? 'bg-gradient-to-br from-indigo-50/90 to-blue-50/90 border-indigo-400 ring-2 ring-indigo-400/40 text-indigo-950 shadow-sm shadow-indigo-500/10'
                      : 'bg-white/70 border-slate-200 hover:border-blue-300 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs text-indigo-900">
                    <LogOutIcon className="w-4 h-4 text-indigo-600" />
                    <span>Direct Resignation</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-tight">
                    Submit your reason and officially terminate employment immediately. Staff account access will end.
                  </p>
                </button>
              </div>
            </div>

            {/* Conditional Fields: If Bargaining */}
            {quitMode === 'bargain' ? (
              <div className="space-y-3 p-4 bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-white border border-blue-200 rounded-2xl shadow-xs">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-blue-950 block">1. What area would you like to negotiate?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'salary', label: 'Salary / Wage Increase' },
                      { id: 'shift', label: 'Shift Adjustment' },
                      { id: 'wing', label: 'Block / Wing Reassignment' },
                      { id: 'workload', label: 'Workload & Responsibilities' },
                      { id: 'custom', label: 'Other Terms' }
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setBargainType(c.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          bargainType === c.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/25'
                            : 'bg-white text-blue-900 border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-blue-950 block">
                    2. What deal / terms are you asking for to stay? <span className="text-rose-600">*</span>
                  </label>
                  <input aria-label="2. What deal / terms are you asking for to stay?"
                    type="text"
                    value={bargainTerms}
                    onChange={(e) => setBargainTerms(e.target.value)}
                    placeholder={
                      bargainType === 'salary' ? 'e.g., Requesting wage increase to 1,200 GHS/month' :
                      bargainType === 'shift' ? 'e.g., Requesting transfer from Night shift to Morning/Day shift' :
                      bargainType === 'wing' ? 'e.g., Requesting reassignment to Annex Wing or Block A' :
                      'e.g., State your specific required deal terms...'
                    }
                    className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-400/20 shadow-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-blue-900 block">3. Note for Manager (Optional)</label>
                  <input aria-label="3. Note for Manager (Optional)"
                    type="text"
                    value={bargainNotes}
                    onChange={(e) => setBargainNotes(e.target.value)}
                    placeholder="e.g., If these terms can be met, I will gladly continue my dedicated service."
                    className="w-full px-3.5 py-2 bg-white border border-blue-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-400/20 shadow-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-white border border-indigo-200/80 rounded-2xl space-y-2 text-xs text-indigo-950 shadow-xs">
                <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                  <AlertCircle className="w-4 h-4 text-indigo-600" />
                  <span>Direct resignation details:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-700 font-medium text-[11px]">
                  <li>Your official employment at <strong className="text-blue-900">{employment.hostelName}</strong> ends immediately.</li>
                  <li>Your manager is notified of your resignation and submitted reason.</li>
                  <li><strong className="text-blue-900">Your staff account access will end</strong>. A residence manager must create any future staff account.</li>
                </ul>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-blue-100/80">
              <button
                type="button"
                onClick={() => setShowResignModal(false)}
                disabled={submittingQuitOrBargain}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitQuitOrBargain}
                disabled={submittingQuitOrBargain || !quitReason.trim() || quitReason.trim().length < 5 || (quitMode === 'bargain' && !bargainTerms.trim())}
                className="px-5 py-2.5 rounded-xl text-white font-black text-xs transition-all shadow-md shadow-blue-900/25 flex items-center gap-2 cursor-pointer disabled:opacity-50 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800"
              >
                {submittingQuitOrBargain ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : quitMode === 'bargain' ? (
                  <>
                    <span>Send Bargain Deal to Manager</span>
                  </>
                ) : (
                  <>
                    <LogOutIcon className="w-4 h-4" />
                    <span>Confirm & Quit Job</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* MODAL: DECLINE JOB OFFER */}

    </div>
  );
}
