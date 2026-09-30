import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryClient, invalidateAllQueries } from '../lib/queryClient';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import PineLogo from './PineLogo';
import UserAvatarSelector, { renderAvatarGraphic } from './UserAvatarSelector';
import { 
  Home, 
  Wrench, 
  MessageSquare, 
  Bell, 
  Key, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Camera, 
  Upload, 
  Send, 
  Phone, 
  Mail, 
  Building2, 
  ChevronRight, 
  X, 
  Plus, 
  RefreshCw, 
  LogOut, 
  Sparkles, 
  FileText, 
  Search, 
  MapPin, 
  Calendar, 
  Settings, 
  HelpCircle, 
  AlertTriangle, 
  Landmark, 
  Users, 
  Lock, 
  ShieldAlert, 
  BookOpen, 
  User,
  Copy,
  Bed,
  Layers,
  GraduationCap,
  Eye,
  ImageIcon,
  Star,
  ShoppingBag,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { IssueReport, HostelRoomKey, StudentDirectMessage } from '../types';

export default function PageResidentDashboard() {
  const { user, logout, apiFetch, updateUser } = useAuth();
  const { notifications, unreadCount, registeredAccounts, markAsRead, pushToast } = useNotifications();
  const navigate = useNavigate();

  // Navigation tabs for the resident dashboard
  const [activeTab, setActiveTab] = useState<'room' | 'complaints' | 'alerts' | 'settings'>('room');
  // Collapsible sidebar state (Disabled minimizing to prevent glitched overlapping)
  const isSidebarCollapsed = false;

  // Data states
  const [issueReports, setIssueReports] = useState<IssueReport[]>([]);
  const [messages, setMessages] = useState<StudentDirectMessage[]>([]);
  const [roomKeyDetails, setRoomKeyDetails] = useState<HostelRoomKey | null>(null);
  const [userRooms, setUserRooms] = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [accreditedStaff, setAccreditedStaff] = useState<any[]>([]);

  // Selected chat or issue
  const [activeChatIssueId, setActiveChatIssueId] = useState<string | null>(null);

  // New Issue Modal states
  const [showNewIssueModal, setShowNewIssueModal] = useState<boolean>(false);
  const [issueTitle, setIssueTitle] = useState<string>('');
  const [issueCategory, setIssueCategory] = useState<string>('Plumbing');
  const [issueUrgency, setIssueUrgency] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [issueSubArea, setIssueSubArea] = useState<string>('Bathroom / Shower / WC');
  const [issueDescription, setIssueDescription] = useState<string>('');
  const [issuePhotos, setIssuePhotos] = useState<string[]>([]);
  const [issueVisitWindow, setIssueVisitWindow] = useState<string>('Morning (8:00 AM - 12:00 PM)');
  const [issueContactPhone, setIssueContactPhone] = useState<string>('');
  const [issueContactMethod, setIssueContactMethod] = useState<'In-app Notification' | 'Phone Call' | 'Email'>('In-app Notification');
  const [submittingIssue, setSubmittingIssue] = useState<boolean>(false);
  const [issueFilter, setIssueFilter] = useState<'all' | 'pending' | 'in-progress' | 'awaiting-confirmation' | 'resolved'>('all');
  const [issueSearch, setIssueSearch] = useState<string>('');
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Sample evidence photos for quick selection
  const SAMPLE_EVIDENCE_PHOTOS = [
    { label: '💧 Leaking Tap / Pipe', url: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=600&q=80' },
    { label: '⚡ Power Socket / Wiring', url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80' },
    { label: '🔒 Door Handle / Lock', url: 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=600&q=80' },
    { label: '❄️ AC / Cooling Unit', url: 'https://images.unsplash.com/photo-1615873968403-89e068629265?auto=format&fit=crop&w=600&q=80' }
  ];

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (file.size > MAX_SIZE) {
        triggerToast(`Skipped "${file.name}": File size exceeds the strict 5MB limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result && typeof reader.result === 'string') {
          setIssuePhotos(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setIssuePhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Student Confirmation Modal for completed tasks
  const [selectedIssueForConfirm, setSelectedIssueForConfirm] = useState<IssueReport | null>(null);
  const [confirmFeedback, setConfirmFeedback] = useState<string>('');
  const [confirmRating, setConfirmRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [submittingConfirm, setSubmittingConfirm] = useState<boolean>(false);

  // Direct Message states
  const [newMessageText, setNewMessageText] = useState<string>('');
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);

  // Toast alert
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSignoutConfirmModal, setShowSignoutConfirmModal] = useState<boolean>(false);
  const [showRoomKey, setShowRoomKey] = useState<boolean>(false);

  // Profile settings state
  const [editName, setEditName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // TanStack Query for resident server-state caching and automatic refetching
  const { data: residentData } = useQuery({
    queryKey: ['residentData', user?.id, user?.email],
    queryFn: async () => {
      const profile = await apiFetch('/api/student/my-profile').catch(() => null);
      const issues = await apiFetch('/api/issue-reports').catch(() => []);
      const msgs = await apiFetch('/api/student-messages').catch(() => []);
      const staff = await apiFetch('/api/accredited-staff').catch(() => []);

      return {
        profile,
        issues: Array.isArray(issues) ? issues : [],
        msgs: Array.isArray(msgs) ? msgs : [],
        staff: Array.isArray(staff) ? staff : [],
      };
    },
    enabled: Boolean(user),
    refetchInterval: 8000,
  });

  // Track active maintenance updates requiring attention or recently modified
  const unconfirmedIssues = useMemo(() => {
    return issueReports.filter(i => (i.staffCompleted || i.status === 'Resolved') && !(i.studentAcceptedResolved || i.studentConfirmed) && !i.closedByManager);
  }, [issueReports]);

  const activeUpdatedIssues = useMemo(() => {
    return issueReports.filter(i => {
      if (i.closedByManager) return false;
      if ((i.staffCompleted || i.status === 'Resolved') && !(i.studentAcceptedResolved || i.studentConfirmed)) return true;
      if (i.status === 'In Progress' || i.assignedStaffId) return true;
      if (i.rescheduleRequested || i.staffDeclineRequested) return true;
      return false;
    });
  }, [issueReports]);

  const hasMaintenanceUpdates = activeUpdatedIssues.length > 0;

  // Sync state with TanStack Query cache
  useEffect(() => {
    if (!residentData) return;
    if (residentData.profile) {
      if (residentData.profile.user) {
        setStudentProfile(residentData.profile.user);
      } else {
        setStudentProfile(residentData.profile);
      }
      if (residentData.profile.roomKeyDetails) setRoomKeyDetails(residentData.profile.roomKeyDetails);
      if (residentData.profile.rooms) setUserRooms(residentData.profile.rooms);
    }
    setIssueReports(residentData.issues);
    setMessages(residentData.msgs);
    setAccreditedStaff(residentData.staff);
    setLoadingData(false);
  }, [residentData]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const currentUser = studentProfile || user;
  const activeAvatar = user?.avatar || user?.photo || user?.photoUrl || studentProfile?.avatar || studentProfile?.photo || studentProfile?.photoUrl || studentProfile?.avatarUrl || (user?.email ? localStorage.getItem(`pinevela_avatar_${user.email.toLowerCase().trim()}`) : null) || localStorage.getItem('pinevela_user_avatar') || currentUser?.avatar || 'preset:pine-classic';

  // Keep edit fields updated when currentUser loads
  useEffect(() => {
    if (currentUser) {
      setEditName(currentUser.name || '');
      setEditEmail(currentUser.email || '');
      setEditPhone(currentUser.phone || '');
    }
  }, [currentUser?.id, currentUser?.email, currentUser?.name, currentUser?.roomKey]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim(),
          avatar: activeAvatar,
          photo: activeAvatar,
          photoUrl: activeAvatar,
          avatarUrl: activeAvatar,
          profilePicture: activeAvatar
        })
      });
      triggerToast('Profile information updated successfully!');
      if (res && res.user) {
        setStudentProfile(res.user);
        if (updateUser) {
          updateUser(res.user);
        }
      } else {
        const updatedPayload = {
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim(),
          avatar: activeAvatar,
          photo: activeAvatar,
          photoUrl: activeAvatar,
          avatarUrl: activeAvatar,
          profilePicture: activeAvatar
        };
        setStudentProfile((prev: any) => ({
          ...prev,
          ...updatedPayload
        }));
        if (updateUser) {
          updateUser(updatedPayload);
        }
      }
    } catch (err: any) {
      triggerToast('Failed to update profile: ' + (err.message || 'Error occurred'));
    } finally {
      setSavingProfile(false);
    }
  };

  // Submit New Maintenance Issue
  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDescription.trim()) {
      triggerToast('Please provide a title and detailed description.');
      return;
    }

    setSubmittingIssue(true);
    try {
      const newIssue = await apiFetch('/api/issue-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: issueTitle.trim(),
          category: issueCategory,
          urgency: issueUrgency,
          subArea: issueSubArea,
          locationTag: issueSubArea,
          description: issueDescription.trim(),
          photos: issuePhotos,
          visitWindow: issueVisitWindow,
          contactPhone: issueContactPhone || editPhone || currentUser?.phone || '',
          contactMethod: issueContactMethod
        })
      });

      setIssueReports(prev => [newIssue, ...prev]);
      setShowNewIssueModal(false);
      triggerToast('Maintenance Report submitted successfully to Dispatch Desk!');
      
      // Reset fields
      setIssueTitle('');
      setIssueDescription('');
      setIssuePhotos([]);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to submit maintenance issue.');
    } finally {
      setSubmittingIssue(false);
    }
  };

  // Student confirms the maintenance completion
  const handleConfirmCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssueForConfirm) return;

    setSubmittingConfirm(true);
    try {
      const updated = await apiFetch(`/api/issue-reports/${selectedIssueForConfirm.id}/student-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          isResolved: true,
          rating: confirmRating,
          reviewText: confirmFeedback.trim(),
          feedback: confirmFeedback.trim() 
        })
      });

      setIssueReports(prev => prev.map(issue => issue.id === updated.id ? updated : issue));
      setSelectedIssueForConfirm(null);
      setConfirmFeedback('');
      setConfirmRating(5);
      triggerToast('Thank you! Technical fix verified and review submitted to technician profile.');
    } catch (err: any) {
      triggerToast(err.message || 'Failed to confirm resolution.');
    } finally {
      setSubmittingConfirm(false);
    }
  };

  // Submit Direct Message to Staff
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !activeChatIssueId) return;

    // Find the staff assigned to this issue
    const issue = issueReports.find(i => i.id === activeChatIssueId);
    if (!issue || !issue.assignedStaffId) {
      triggerToast('No active technician assigned to this complaint yet.');
      return;
    }

    setSendingMessage(true);
    try {
      const sent = await apiFetch('/api/student-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: issue.assignedStaffId,
          messageText: newMessageText.trim(),
          issueId: activeChatIssueId
        })
      });

      setMessages(prev => [...prev, sent]);
      setNewMessageText('');
    } catch (err: any) {
      triggerToast(err.message || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Helper function to extract chat messages for the selected issue
  const activeChatMessages = messages.filter(m => (m as any).issueId === activeChatIssueId);

  // Check if resident currently has an active unclosed complaint
  const activeComplaint = issueReports.find(i => 
    !i.closedByManager && 
    !i.studentAcceptedResolved && 
    !i.studentConfirmed && 
    i.status !== 'Resolved'
  );

  // Filtering issues
  const filteredIssues = issueReports.filter(issue => {
    const matchesFilter = 
      issueFilter === 'all' || 
      (issueFilter === 'pending' && issue.status === 'Pending') ||
      (issueFilter === 'in-progress' && issue.status === 'In Progress') ||
      (issueFilter === 'awaiting-confirmation' && issue.status === 'Resolved' && !issue.studentAcceptedResolved) ||
      (issueFilter === 'resolved' && issue.status === 'Resolved' && issue.studentAcceptedResolved);

    const matchesSearch = 
      issue.title.toLowerCase().includes(issueSearch.toLowerCase()) ||
      issue.description.toLowerCase().includes(issueSearch.toLowerCase()) ||
      issue.category.toLowerCase().includes(issueSearch.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  if (loadingData) {
    return (
      <div className="min-h-screen h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/70 to-indigo-50/50">
        <div className="flex flex-col items-center space-y-4 animate-pulse">
          <PineLogo size={60} />
          <div className="flex items-center space-x-2 text-blue-950">
            <RefreshCw className="animate-spin h-5 w-5 text-blue-600" />
            <span className="text-sm font-black">Syncing Resident Portal...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-blue-50/70 to-indigo-50/50 text-slate-800 overflow-hidden font-sans relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 text-white px-5 py-2.5 rounded-full shadow-lg border border-slate-800 flex items-center gap-2 backdrop-blur-md text-xs font-semibold"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE HEADER (lg:hidden) */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3.5 bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-2">
          <PineLogo size={24} />
          <div>
            <h1 className="text-xs font-black tracking-tight text-blue-950 leading-tight">PineVela Resident</h1>
            <p className="text-[10px] text-slate-500 truncate max-w-[150px]">{currentUser?.hostelName || 'Verifying Accommodation'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`p-1.5 rounded-lg ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600' : 'text-slate-500'}`}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowSignoutConfirmModal(true)} 
            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* SIDEBAR: PURELY STATIC / FIXED ICE-BLUE FROSTY GLASS LOOK WITH CURVED EDGES & BLUE GLOW */}
      <aside className={`hidden lg:flex ${isSidebarCollapsed ? 'w-20 p-4' : 'w-72 p-6'} my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl flex flex-col justify-between shrink-0 overflow-y-auto z-20 transition-all duration-300 relative`}>

        <div className="space-y-6">
          {/* Logo & Header */}
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3 px-2'}`}>
            <PineLogo size={isSidebarCollapsed ? 30 : 36} hideText={isSidebarCollapsed} />
            {!isSidebarCollapsed && (
              <div>
                <h1 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-blue-900 to-cyan-800 bg-clip-text text-transparent">
                  PineVela Resident
                </h1>
                <p className="text-[10px] font-medium text-blue-600/70 uppercase tracking-widest">Resident Portal</p>
              </div>
            )}
          </div>

          {/* Student Profile Pill */}
          <div className={`p-3 bg-white/70 border border-blue-200/60 rounded-2xl flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} shadow-xs overflow-hidden`}>
            <div className="flex items-center gap-3 overflow-hidden">
              {renderAvatarGraphic(activeAvatar, "w-10 h-10 text-xs shrink-0")}
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-slate-900 truncate">{currentUser?.name || 'Resident'}</div>
                  <div className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 inline shrink-0" />
                    <span className="truncate">Verified Resident</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <nav className="space-y-1.5">
            {[
              { 
                id: 'room', 
                label: 'My Resident Room', 
                icon: Home, 
                sub: 'Digital key & room hub',
                hasDot: hasMaintenanceUpdates
              },
              { 
                id: 'complaints', 
                label: 'Maintenance', 
                icon: Wrench, 
                sub: 'File & track complaints',
                badge: unconfirmedIssues.length > 0 ? `${unconfirmedIssues.length} Action Needed` : activeUpdatedIssues.length > 0 ? `${activeUpdatedIssues.length} Active` : null,
                isBeaming: hasMaintenanceUpdates || unconfirmedIssues.length > 0
              },
              { id: 'alerts', label: 'Bulletins & Alerts', icon: Bell, sub: 'Announcements & news' },
              { id: 'settings', label: 'Profile & Settings', icon: Settings, sub: 'Manage personal settings' }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isBeaming = (tab as any).isBeaming;
              const hasDot = (tab as any).hasDot;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if ((tab as any).action) {
                      (tab as any).action();
                    } else {
                      setActiveTab(tab.id as any);
                    }
                  }}
                  title={tab.label}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} px-3.5 py-3 rounded-2xl transition-all duration-150 group cursor-pointer ${
                    isActive
                      ? isBeaming
                        ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-500/25 ring-2 ring-red-300'
                        : 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-50'
                      : isBeaming
                        ? 'bg-red-50/90 text-red-700 hover:bg-red-100/90 border border-red-200/80 shadow-xs'
                        : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className={`p-2 rounded-xl transition-colors shrink-0 relative ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : isBeaming 
                          ? 'bg-red-100 text-red-600 group-hover:bg-red-200' 
                          : 'bg-blue-200/70 text-blue-700 group-hover:bg-blue-300/80'
                    }`}>
                      <Icon className="w-4 h-4" />
                      {(isBeaming || hasDot) && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                        </span>
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="text-left overflow-hidden">
                        <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5 truncate">
                          <span>{tab.label}</span>
                          {(tab as any).badge && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-black rounded-md border ${
                              isBeaming 
                                ? 'bg-red-600 text-white border-red-700 animate-pulse' 
                                : 'bg-cyan-100 text-cyan-800 border-cyan-300'
                            }`}>
                              {(tab as any).badge}
                            </span>
                          )}
                        </div>
                        <div className={`text-[10px] font-normal truncate ${isActive ? 'text-blue-100' : isBeaming ? 'text-red-500 font-medium' : 'text-slate-500'}`}>
                          {tab.sub}
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <button
          onClick={() => setShowSignoutConfirmModal(true)}
          title="Sign Out"
          className={`w-full flex items-center justify-center ${isSidebarCollapsed ? 'p-2.5' : 'space-x-2 px-4 py-2.5'} bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-2xl font-semibold text-xs transition-all shadow-xs cursor-pointer`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isSidebarCollapsed && <span>Sign Out</span>}
        </button>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="mobile-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 flex items-center justify-around py-2 shadow-lg">
        <button 
          onClick={() => setActiveTab('room')}
          className={`flex flex-col items-center p-1.5 cursor-pointer relative ${activeTab === 'room' ? 'text-blue-900' : 'text-slate-400'}`}
        >
          <div className="relative">
            <Home size={18} />
            {hasMaintenanceUpdates && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold mt-0.5">My Room</span>
        </button>
        <button 
          onClick={() => setActiveTab('complaints')}
          className={`flex flex-col items-center p-1.5 cursor-pointer relative ${activeTab === 'complaints' ? 'text-blue-900' : hasMaintenanceUpdates ? 'text-red-600 font-bold' : 'text-slate-400'}`}
        >
          <div className="relative">
            <Wrench size={18} />
            {hasMaintenanceUpdates && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold mt-0.5">Complaints</span>
        </button>
        <button 
          onClick={() => setActiveTab('alerts')}
          className={`flex flex-col items-center p-1.5 cursor-pointer ${activeTab === 'alerts' ? 'text-blue-900' : 'text-slate-400'}`}
        >
          <Bell size={18} />
          <span className="text-[10px] font-bold mt-0.5">Bulletins</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center p-1.5 cursor-pointer ${activeTab === 'settings' ? 'text-blue-900' : 'text-slate-400'}`}
        >
          <Settings size={18} />
          <span className="text-[10px] font-bold mt-0.5">Settings</span>
        </button>
      </nav>

      {/* GIANT WATERMARK PINEVELA LOGO — FIXED TO VIEWPORT (does not scroll with content) */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0">
        <div className="transform scale-[4.5] opacity-[0.14] blur-[0.4px]">
          <PineLogo size={180} hideText={true} />
        </div>
      </div>

      {/* MAIN CONTENT WORKSPACE WITH PERSISTENT PINEVELA GIANT WATERMARK */}
      <main className="flex-1 overflow-y-auto p-5 sm:p-8 pb-24 lg:pb-8 flex flex-col space-y-6 relative z-10">
        
        {/* ROOM TAB */}
        {activeTab === 'room' && (
          <div className="space-y-6 max-w-5xl animate-fade-in">
            {/* Header with PineVela Branding */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/70 backdrop-blur-xl border border-white/60 p-6 rounded-3xl shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-gradient-to-br from-blue-900 to-indigo-900 rounded-2xl shadow-md flex items-center justify-center shrink-0">
                  <PineLogo size={32} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Resident Room & Key Hub</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100/80 text-emerald-800 border border-emerald-200/80 flex items-center gap-1">
                      <ShieldCheck size={11} className="text-emerald-600" />
                      <span>Verified Active</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Official digital access credentials, allocated accommodation details, and emergency services
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                <div className="px-3.5 py-2 bg-emerald-50/80 border border-emerald-200/60 rounded-2xl text-right">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block leading-none">Account Status</span>
                  <span className="text-xs font-black text-emerald-950">Active Resident</span>
                </div>
              </div>
            </div>

            {/* If Student Has Not Linked a Specific Room Key Yet */}
            {!currentUser?.roomKey && !roomKeyDetails?.roomKey && (!userRooms || userRooms.length === 0) && (
              <div className="bg-blue-50/90 border border-blue-200/80 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 border border-blue-200">
                    <Home size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-blue-950">No Physical Hostel Room Key Linked Yet</h4>
                    <p className="text-xs text-blue-900/80 mt-0.5 max-w-xl">
                      You are logged in with your student resident account. Your digital room keys will appear here once allocated by your hostel administration.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Room Card Grid - Glassy Vibe */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Primary Accommodation Dossier */}
              <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl border border-white/80 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-100/40 via-indigo-50/20 to-transparent rounded-bl-full pointer-events-none" />

                <div className="flex items-start justify-between gap-4 relative z-10">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-900 via-blue-800 to-indigo-900 text-white flex items-center justify-center shadow-lg shadow-blue-950/15 ring-4 ring-blue-50">
                      <Home size={22} className="text-blue-200" />
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider block">Assigned Hostel Complex</span>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight leading-snug">
                        {currentUser?.hostelName || roomKeyDetails?.hostelName || 'PineVela Residence'}
                      </h3>
                    </div>
                  </div>

                  <span className="px-3 py-1 bg-blue-50 border border-blue-100 text-blue-900 font-mono text-xs font-black rounded-xl">
                    Room {currentUser?.roomNumber || roomKeyDetails?.roomNumber || userRooms[0]?.roomNumber || 'Assigned'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-150/60 relative z-10 text-xs">
                  <div className="p-3 bg-slate-50/70 border border-slate-200/50 rounded-2xl space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                      <Layers size={12} className="text-slate-500" />
                      <span>Block / Wing</span>
                    </div>
                    <div className="font-black text-slate-900 truncate">
                      {currentUser?.blockName || roomKeyDetails?.blockName || userRooms[0]?.blockName || 'Main Complex'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/70 border border-slate-200/50 rounded-2xl space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                      <Bed size={12} className="text-slate-500" />
                      <span>Room Number</span>
                    </div>
                    <div className="font-black text-slate-900 truncate">
                      {currentUser?.roomNumber || roomKeyDetails?.roomNumber || userRooms[0]?.roomNumber || 'Assigned'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/70 border border-slate-200/50 rounded-2xl space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                      <User size={12} className="text-slate-500" />
                      <span>Resident Name</span>
                    </div>
                    <div className="font-black text-slate-900 truncate">
                      {currentUser?.name || roomKeyDetails?.assignedStudentName || 'Resident'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/70 border border-slate-200/50 rounded-2xl space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                      <Phone size={12} className="text-slate-500" />
                      <span>Contact Phone</span>
                    </div>
                    <div className="font-black text-slate-900 truncate">
                      {currentUser?.phone || roomKeyDetails?.assignedStudentPhone || 'Registered Phone'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/70 border border-slate-200/50 rounded-2xl space-y-1 sm:col-span-2">
                    <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                      <Mail size={12} className="text-slate-500" />
                      <span>Resident Account Email</span>
                    </div>
                    <div className="font-black text-slate-900 truncate">
                      {currentUser?.email || roomKeyDetails?.assignedStudentEmail || 'resident@pinevela.com'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Digital Room Key Security Card */}
              <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-6 shadow-xl space-y-5 flex flex-col justify-between border border-blue-900/40 relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PineLogo size={20} />
                      <span className="text-[10px] font-black tracking-widest text-blue-300 uppercase">PineVela KeyPass</span>
                    </div>
                    <Key className="w-5 h-5 text-blue-400" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-blue-200/70 uppercase tracking-wider">Digital Room Key</span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
                        VALIDATED
                      </span>
                    </div>

                    <div className="relative group">
                      <div className="font-mono text-sm sm:text-base font-black tracking-widest bg-white/10 border border-white/15 p-3 rounded-2xl text-center select-all transition-all group-hover:border-blue-400/50">
                        {showRoomKey ? (currentUser?.roomKey || roomKeyDetails?.roomKey || userRooms[0]?.roomKey || 'Key Unassigned') : '•••••••••••••••••'}
                      </div>
                      {showRoomKey && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(currentUser?.roomKey || roomKeyDetails?.roomKey || '');
                            triggerToast('Digital Room Key copied to clipboard!');
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                          title="Copy Key"
                        >
                          <Copy size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRoomKey(!showRoomKey)}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer text-center"
                  >
                    {showRoomKey ? 'Hide Digital Key' : 'Reveal Digital Key'}
                  </button>
                  <p className="text-[10px] text-blue-200/50 text-center font-medium">
                    Do not share your digital key code with unauthorized visitors
                  </p>
                </div>
              </div>

            </div>

            {/* Room Maintenance & Service Live Updates Card with Beaming Highlight Dots */}
            <div className={`p-6 rounded-3xl border backdrop-blur-xl transition-all ${
              hasMaintenanceUpdates || unconfirmedIssues.length > 0
                ? 'bg-gradient-to-br from-red-50/90 via-white/95 to-amber-50/80 border-red-200/90 shadow-md shadow-red-500/5 ring-1 ring-red-400/30'
                : 'bg-white/80 border-white/80 shadow-sm'
            }`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-2xl relative ${
                    hasMaintenanceUpdates || unconfirmedIssues.length > 0 
                      ? 'bg-red-100 text-red-700 ring-2 ring-red-300' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    <Wrench className="w-5 h-5" />
                    {(hasMaintenanceUpdates || unconfirmedIssues.length > 0) && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-black text-slate-900">Room Maintenance & Repair Updates</h3>
                      {(hasMaintenanceUpdates || unconfirmedIssues.length > 0) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 flex items-center gap-1 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                          Live Update
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      Real-time status of repair requests, staff dispatches, and signoffs for your allocated room
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('complaints')}
                  className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-black rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <span>Open Maintenance Desk</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {issueReports.length === 0 ? (
                <div className="pt-4 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>All room fixtures and utilities in good condition. No outstanding maintenance requests.</span>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('complaints');
                      setShowNewIssueModal(true);
                    }}
                    className="text-blue-700 font-bold hover:underline cursor-pointer"
                  >
                    + Report New Fault
                  </button>
                </div>
              ) : (
                <div className="pt-4 space-y-3">
                  {issueReports.slice(0, 3).map(issue => {
                    const isUnconfirmed = (issue.staffCompleted || issue.status === 'Resolved') && !(issue.studentAcceptedResolved || issue.studentConfirmed) && !issue.closedByManager;
                    const isAwaitingDispatch = issue.status === 'Pending' || !issue.assignedStaffId;
                    const isInProgress = issue.status === 'In Progress' || (issue.assignedStaffId && !issue.staffCompleted);

                    return (
                      <div
                        key={issue.id}
                        onClick={() => {
                          setActiveTab('complaints');
                          if (issue.assignedStaffId) {
                            setActiveChatIssueId(issue.id);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer transition-all hover:scale-[1.005] ${
                          isUnconfirmed
                            ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20'
                            : isInProgress
                            ? 'bg-blue-50/80 border-blue-200'
                            : 'bg-slate-50/80 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1 shrink-0">
                            {isUnconfirmed ? (
                              <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                              </span>
                            ) : isInProgress ? (
                              <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                              </span>
                            ) : isAwaitingDispatch ? (
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400"></span>
                              </span>
                            ) : (
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs sm:text-sm font-black text-slate-900">{issue.title}</h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                                {issue.category}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{issue.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {isUnconfirmed ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab('complaints');
                                setSelectedIssueForConfirm(issue);
                              }}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-xs animate-pulse cursor-pointer flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Verify & Confirm Fix</span>
                            </button>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold ${
                              isInProgress ? 'bg-blue-100 text-blue-800' :
                              isAwaitingDispatch ? 'bg-slate-200 text-slate-700' :
                              'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isInProgress ? '🛠️ In Progress' : isAwaitingDispatch ? '⏳ Queued for Dispatch' : '✓ Completed'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* COMPLAINTS TAB */}
        {activeTab === 'complaints' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start animate-fade-in max-w-7xl">
            
            {/* List & Controls Panel */}
            <div className="space-y-4 xl:col-span-7">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Maintenance Desk</h2>
                  <p className="text-xs text-slate-500 font-medium">File, track technician assignments, and verify completed room repairs</p>
                </div>
                {activeComplaint ? (
                  <button
                    onClick={() => triggerToast(`You already have an active complaint in progress ("${activeComplaint.title}"). Please await its resolution before submitting another.`)}
                    className="px-4 py-2.5 bg-slate-200 text-slate-500 font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-not-allowed border border-slate-300"
                  >
                    <Lock size={14} className="text-slate-400" />
                    <span>1 Active Ticket In Progress</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowNewIssueModal(true)}
                    className="px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>Report New Issue</span>
                  </button>
                )}
              </div>

              {/* Active Ticket Banner Notification */}
              {activeComplaint && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900 shadow-2xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-black text-amber-950 block">Active Complaint in Progress</span>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      You currently have an active maintenance report (<strong>{activeComplaint.title}</strong>). Residents may log one complaint at a time to ensure rapid dispatch and quality resolution. Once this task is resolved and confirmed, you can submit another ticket.
                    </p>
                  </div>
                </div>
              )}

              {/* Filters / Search */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={issueSearch}
                    onChange={(e) => setIssueSearch(e.target.value)}
                    placeholder="Search complaints..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                </div>
                <select
                  value={issueFilter}
                  onChange={(e: any) => setIssueFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600"
                >
                  <option value="all">All Complaints ({issueReports.length})</option>
                  <option value="pending">Pending Review</option>
                  <option value="in-progress">In-Progress</option>
                  <option value="awaiting-confirmation">Awaiting Resident Confirmation</option>
                  <option value="resolved">Resolved & Confirmed</option>
                </select>
              </div>

              {/* Complaints List Container */}
              <div className="space-y-3">
                {filteredIssues.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-3xl space-y-2">
                    <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-bold">No maintenance complaints match your filter.</p>
                  </div>
                ) : (
                  filteredIssues.map(issue => {
                    const isUnconfirmed = (issue.staffCompleted || issue.status === 'Resolved') && !(issue.studentAcceptedResolved || issue.studentConfirmed) && !issue.closedByManager;
                    const isInProgress = issue.status === 'In Progress' || (issue.assignedStaffId && !issue.staffCompleted);
                    const hasAction = isUnconfirmed || issue.rescheduleRequested || issue.staffDeclineRequested;

                    return (
                    <div 
                      key={issue.id} 
                      onClick={() => {
                        if (issue.assignedStaffId) {
                          setActiveChatIssueId(issue.id);
                        } else {
                          triggerToast("Chat with technician is only available once staff has been assigned.");
                        }
                      }}
                      className={`p-4 bg-white border rounded-2xl cursor-pointer transition-all hover:border-slate-300 space-y-3 relative ${
                        activeChatIssueId === issue.id 
                          ? 'ring-2 ring-blue-600 border-blue-600 shadow-md' 
                          : hasAction 
                            ? 'border-amber-300 ring-2 ring-amber-400/20 shadow-xs' 
                            : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {hasAction && (
                              <span className="relative flex h-2.5 w-2.5 mr-0.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                              </span>
                            )}
                            {isInProgress && !hasAction && (
                              <span className="relative flex h-2 w-2 mr-0.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black inline-block ${
                              issue.urgency === 'High' || issue.urgency === 'Emergency' ? 'bg-rose-100 text-rose-800 border border-rose-200' : issue.urgency === 'Medium' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}>
                              {issue.urgency} Urgency
                            </span>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[9px] rounded-full border border-slate-200">
                              {issue.category}
                            </span>
                            {(issue.subArea || issue.locationTag) && (
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold text-[9px] rounded-full border border-indigo-100 flex items-center gap-1">
                                <MapPin size={10} />
                                <span>{issue.subArea || issue.locationTag}</span>
                              </span>
                            )}
                          </div>
                          <h3 className="text-xs sm:text-sm font-black text-slate-900 leading-tight pt-0.5">{issue.title}</h3>
                        </div>
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg text-right shrink-0 ${
                          (issue.status === 'Resolved' && (issue.studentAcceptedResolved || issue.studentConfirmed)) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                          (issue.staffCompleted && !(issue.studentAcceptedResolved || issue.studentConfirmed)) ? 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse font-black' :
                          issue.assignedStaffId ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {(issue.status === 'Resolved' && (issue.studentAcceptedResolved || issue.studentConfirmed)) ? '✓ Resolved & Confirmed' :
                           (issue.staffCompleted && !(issue.studentAcceptedResolved || issue.studentConfirmed)) ? '🛠️ Fixed - Awaiting Your Confirmation' :
                           issue.assignedStaffId ? '🛠️ Technician Assigned' :
                           '⏳ Awaiting Review'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">{issue.description}</p>

                      {/* Photo Gallery Attachments */}
                      {Array.isArray(issue.photos) && issue.photos.length > 0 && (
                        <div className="pt-1">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                            <Camera size={11} className="text-blue-600" />
                            <span>Attached Picture Proof ({issue.photos.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {issue.photos.map((photo: string, pIdx: number) => (
                              <div
                                key={pIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxPhoto(photo);
                                }}
                                className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 cursor-pointer hover:opacity-90 relative group shadow-2xs"
                              >
                                <img src={photo} alt="Attached proof" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                  <Eye size={14} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ASSIGNED TECHNICIAN CARD & SLA */}
                      {issue.assignedStaffName && (
                        <div className="p-3 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200/80 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                                {issue.assignedStaffName.charAt(0)}
                              </div>
                              <div>
                                <div className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                                  <span>{issue.assignedStaffName}</span>
                                  <span className="px-1.5 py-0.2 bg-blue-200/70 text-blue-900 text-[9px] font-bold rounded">
                                    {issue.assignedStaffRole || 'Technician'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-blue-700 font-semibold flex items-center gap-2">
                                  {issue.assignedStaffPhone && (
                                    <a 
                                      href={`tel:${issue.assignedStaffPhone}`} 
                                      onClick={(e) => e.stopPropagation()} 
                                      className="hover:underline flex items-center gap-0.5 text-blue-800 font-bold"
                                    >
                                      <Phone size={10} />
                                      <span>{issue.assignedStaffPhone}</span>
                                    </a>
                                  )}
                                  {issue.assignedStaffEmail && (
                                    <span className="text-slate-500 truncate max-w-[120px]">
                                      {issue.assignedStaffEmail}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {issue.deadline && (
                              <div className="text-right">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Target Deadline</span>
                                <span className="text-[11px] font-black text-indigo-900 bg-indigo-100/80 px-2 py-0.5 rounded-md border border-indigo-200 inline-block">
                                  {new Date(issue.deadline).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Reschedule updates */}
                          {issue.rescheduleApproved && (
                            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-900 flex items-start gap-1.5">
                              <Calendar size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                              <div>
                                <strong className="font-bold">Manager Approved New Fix Schedule:</strong> {issue.timeframe || 'Adjusted Timeline'} 
                                {issue.deadline && ` (Extended to ${new Date(issue.deadline).toLocaleString()})`}
                              </div>
                            </div>
                          )}

                          {issue.staffRescheduleRequested && !issue.rescheduleApproved && (
                            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 flex items-start gap-1.5">
                              <Clock size={13} className="text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <strong className="font-bold">Technician Requested Reschedule:</strong> "{issue.staffRescheduleReason || issue.rescheduleReason}" ({issue.staffRequestedTimeframe || issue.requestedTimeframe}). Awaiting manager approval.
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* STAFF COMPLETION PROOF */}
                      {(issue.staffCompleted || issue.staffCompletionPhoto || (issue.status === 'Resolved' && !issue.studentAcceptedResolved)) && (
                        <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                              <CheckCircle2 size={14} className="text-emerald-600" />
                              Technician Fix Report Submitted
                            </span>
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                              Fix Done
                            </span>
                          </div>

                          {issue.staffCompletionNotes && (
                            <p className="text-xs text-emerald-900 font-medium italic">
                              "{issue.staffCompletionNotes}"
                            </p>
                          )}

                          {issue.staffCompletionPhoto && (
                            <div className="pt-1">
                              <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">Completion Photo Proof:</span>
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxPhoto(issue.staffCompletionPhoto!);
                                }}
                                className="w-20 h-20 rounded-xl overflow-hidden border border-emerald-300 cursor-pointer relative group"
                              >
                                <img src={issue.staffCompletionPhoto} alt="Fix Proof" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                                  <Eye size={14} />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Verification and Rating Button */}
                          {!(issue.studentAcceptedResolved || issue.studentConfirmed) && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedIssueForConfirm(issue);
                                }}
                                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                              >
                                <Star size={14} className="fill-amber-300 text-amber-300" />
                                <span>Inspect & Confirm Fix (Rate Technician)</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Additional Details row */}
                      <div className="flex flex-wrap items-center justify-between text-[10px] font-semibold text-slate-500 pt-2 border-t border-slate-100 gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1 text-slate-500">
                            <Clock size={11} />
                            <span>Filed: {new Date(issue.date || '').toLocaleDateString()}</span>
                          </div>
                          {issue.visitWindow && (
                            <div className="flex items-center gap-1 text-slate-600 font-bold bg-slate-50 px-2 py-0.5 rounded-md">
                              <span>🕒 Preferred Window: {issue.visitWindow}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {issue.assignedStaffId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveChatIssueId(issue.id);
                              }}
                              className="text-blue-700 hover:text-blue-900 font-extrabold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
                            >
                              <MessageSquare size={12} />
                              <span>Chat with {issue.assignedStaffName || 'Tech'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              </div>
            </div>

            {/* Live Chat & Tech Bargain Panel */}
            <div className="xl:col-span-5 h-[600px] xl:h-[70vh] bg-white border border-slate-200 rounded-3xl flex flex-col justify-between overflow-hidden shadow-xs">
              {activeChatIssueId ? (
                (() => {
                  const currentIssue = issueReports.find(i => i.id === activeChatIssueId);
                  if (!currentIssue) return <div className="p-6 text-center text-slate-400">Loading chat...</div>;

                  return (
                    <>
                      {/* Chat Header */}
                      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-100 rounded-xl text-blue-800 flex items-center justify-center shrink-0">
                            <MessageSquare className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-xs font-black text-slate-900 leading-tight">Chat with Technician</h3>
                            <p className="text-[10px] text-slate-500 font-bold truncate max-w-[180px]">
                              Issue: {currentIssue.title}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setActiveChatIssueId(null)}
                          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {/* Message Log */}
                      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
                        <div className="text-[10px] text-slate-400 font-extrabold text-center uppercase tracking-wider py-1 bg-white border border-slate-100 rounded-full max-w-xs mx-auto">
                          Dispatched: {currentIssue.assignedStaffName || 'Accredited Specialist'}
                        </div>

                        {activeChatMessages.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-400 font-semibold space-y-2">
                            <MessageSquare className="w-8 h-8 text-slate-200 mx-auto" />
                            <p>No messages yet. Send a message to coordinate access or bargain repair rates.</p>
                          </div>
                        ) : (
                          activeChatMessages.map(m => {
                            const isMe = m.senderRole === 'student';
                            return (
                              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs p-3 rounded-2xl text-xs font-semibold ${
                                  isMe ? 'bg-blue-900 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                                }`}>
                                  <div>{m.message}</div>
                                  <span className={`block text-[9px] text-right mt-1 ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                                    {new Date(m.timestamp || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Chat Input */}
                      <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex gap-2">
                        <input
                          type="text"
                          value={newMessageText}
                          onChange={(e) => setNewMessageText(e.target.value)}
                          placeholder="Type message to technician..."
                          className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                        />
                        <button
                          type="submit"
                          disabled={sendingMessage || !newMessageText.trim()}
                          className="p-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl disabled:opacity-40 cursor-pointer"
                        >
                          <Send size={15} />
                        </button>
                      </form>
                    </>
                  );
                })()
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2.5 text-slate-400 bg-slate-50/20">
                  <MessageSquare className="w-12 h-12 text-slate-200" />
                  <h4 className="text-xs font-black text-slate-900">Coordinate and Chat with assigned Technicians</h4>
                  <p className="text-[11px] max-w-xs mx-auto">
                    Select any of your submitted maintenance issues from the left panel that has an assigned technician to open a real-time coordination chat workspace.
                  </p>
                </div>
              )}
            </div>

          </div>
        )}



        {/* ALERTS TAB */}
        {activeTab === 'alerts' && (
          <div className="space-y-6 max-w-4xl animate-fade-in">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Hostel Bulletins & Announcements</h2>
              <p className="text-xs text-slate-500 font-medium">Read bulletins and emergency announcements posted by your manager</p>
            </div>

            {/* List of Alerts */}
            <div className="space-y-4">
              {notifications && notifications.length > 0 ? (
                notifications.map((notif: any) => (
                  <div key={notif.id} className="p-5 bg-white border border-slate-200 rounded-3xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 font-black text-[9px] rounded-full uppercase tracking-wider ${
                        notif.type === 'error' || notif.type === 'danger' ? 'bg-rose-100 text-rose-800' :
                        notif.type === 'warning' ? 'bg-amber-100 text-amber-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {notif.type || 'Notice'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">{notif.date || notif.timestamp || 'Recent'}</span>
                    </div>
                    <h3 className="text-sm font-black text-slate-900">{notif.title}</h3>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      {notif.message}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl space-y-3">
                  <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto text-xl">
                    🔔
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No Active Bulletins</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    There are no active announcements or emergency bulletins posted at this time.
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-xl animate-fade-in">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Profile & Security Settings</h2>
              <p className="text-xs text-slate-500 font-medium">Manage your personal information, room credentials, avatar, and settings</p>
            </div>

            {/* Profile Avatar Update Component */}
            <UserAvatarSelector 
              onAvatarSave={(avatarUrl) => {
                setStudentProfile((prev: any) => ({
                  ...(prev || {}),
                  avatar: avatarUrl,
                  photo: avatarUrl,
                  photoUrl: avatarUrl,
                  avatarUrl: avatarUrl,
                  profilePicture: avatarUrl
                }));
                if (updateUser) {
                  updateUser({
                    avatar: avatarUrl,
                    photo: avatarUrl,
                    photoUrl: avatarUrl,
                    avatarUrl: avatarUrl,
                    profilePicture: avatarUrl
                  });
                }
                triggerToast('Profile picture updated successfully!');
              }} 
            />

            {/* Settings Forms */}
            <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5 shadow-sm">
              <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                {renderAvatarGraphic(activeAvatar, "w-14 h-14 text-base bg-blue-100 text-blue-900")}
                <div>
                  <h3 className="text-sm font-black text-slate-900">{currentUser?.name || editName}</h3>
                  <p className="text-xs text-slate-400 font-medium">{currentUser?.email || editEmail}</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-extrabold uppercase">
                    Resident Account
                  </span>
                </div>
              </div>

              <div className="space-y-3.5 text-xs font-semibold">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl font-bold focus:bg-white focus:border-blue-500 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Email Address</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="e.g. resident@gmail.com"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl font-bold focus:bg-white focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. +233 24 123 4567"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl font-bold focus:bg-white focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Assigned Room & Hostel Credentials Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 mt-4">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Assigned Housing Credentials</span>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-extrabold text-slate-800">{currentUser?.hostelName || roomKeyDetails?.hostelName || 'Accredited Hostel'}</p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {(currentUser?.blockName || roomKeyDetails?.blockName || 'Block')} • Room {currentUser?.roomNumber || roomKeyDetails?.roomNumber || 'N/A'}
                      </p>
                    </div>
                    <div className="bg-blue-50 text-blue-900 border border-blue-200 px-3 py-1.5 rounded-xl font-mono text-xs font-black">
                      {currentUser?.roomKey || roomKeyDetails?.roomKey || userRooms[0]?.roomKey || 'Key Unassigned'}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {savingProfile ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Saving Updates...
                      </>
                    ) : (
                      'Save Profile Updates'
                    )}
                  </button>
                </div>
              </div>
            </form>

          </div>
        )}

      </main>

      {/* NEW COMPLAINT MODAL */}
      {showNewIssueModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-sky-200/80 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">File Maintenance Complaint</h3>
              <button 
                onClick={() => setShowNewIssueModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitIssue} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="block text-slate-800 font-extrabold">Complaint Title *</label>
                <input
                  type="text"
                  required
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="e.g. Broken water tap or shower leaking"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-800 font-extrabold">Category *</label>
                  <select
                    value={issueCategory}
                    onChange={(e) => setIssueCategory(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-bold"
                  >
                    <option value="Plumbing">Plumbing (Tap/Pipes)</option>
                    <option value="Electrical">Electrical (Lights/Sockets)</option>
                    <option value="Carpentry">Carpentry & Doors</option>
                    <option value="Appliance">Appliance & HVAC</option>
                    <option value="Pest Control">Pest Control</option>
                    <option value="Sanitation">Sanitation & Leakage</option>
                    <option value="Lock & Key">Lock & Key</option>
                    <option value="Furniture">Furniture & Bedding</option>
                    <option value="Other">Other Maintenance</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-800 font-extrabold">Urgency Level *</label>
                  <select
                    value={issueUrgency}
                    onChange={(e: any) => setIssueUrgency(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-bold"
                  >
                    <option value="Low">Low (Fix in 3-5 days)</option>
                    <option value="Medium">Medium (Fix in 24h)</option>
                    <option value="High">High (Fix in 12h)</option>
                    <option value="Emergency">Emergency (Fix ASAP)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-800 font-extrabold">Specific Location in Room *</label>
                  <select
                    value={issueSubArea}
                    onChange={(e) => setIssueSubArea(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-bold"
                  >
                    <option value="Bathroom / Shower / WC">Bathroom / Shower / WC</option>
                    <option value="Bedroom Ceiling / Lighting">Bedroom Ceiling / Lighting</option>
                    <option value="Air Conditioner Unit">Air Conditioner Unit</option>
                    <option value="Window / Balcony Latch">Window / Balcony Latch</option>
                    <option value="Kitchenette Sink / Tap">Kitchenette Sink / Tap</option>
                    <option value="Main Entrance / Digital Lock">Main Entrance / Digital Lock</option>
                    <option value="Study Desk / Power Socket">Study Desk / Power Socket</option>
                    <option value="Wardrobe / Cabinet">Wardrobe / Cabinet</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-800 font-extrabold">Detailed Complaint Description *</label>
                <textarea
                  required
                  rows={3}
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="Describe what is wrong, exact location in room, and any other helpful instructions for dispatching the artisan..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-medium resize-none"
                />
              </div>

              {/* PICTURE PROOF UPLOAD */}
              <div className="space-y-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-blue-600" />
                    <span>Upload Picture Evidence & Proof</span>
                  </label>
                  <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    Max 5MB each
                  </span>
                </div>

                {/* File Upload Box */}
                <label className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-xl p-3 flex flex-col items-center justify-center gap-1 bg-white cursor-pointer transition-all text-center">
                  <Upload className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-bold text-blue-900">Click or drag pictures here</span>
                  <span className="text-[10px] text-slate-400 font-semibold">Supports JPG, PNG, WEBP</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>

                {/* Sample Evidence Pickers removed as requested */}

                {/* Preview Thumbnails */}
                {issuePhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                    {issuePhotos.map((photo, pIdx) => (
                      <div key={pIdx} className="w-16 h-16 rounded-xl overflow-hidden border border-slate-300 relative group shadow-2xs">
                        <img src={photo} alt="Attached preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(pIdx)}
                          className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-0.5 shadow-md hover:bg-rose-700 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Preferred Artisan Visit Window & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-800 font-extrabold">Preferred Artisan Visit Window</label>
                  <select
                    value={issueVisitWindow}
                    onChange={(e) => setIssueVisitWindow(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-blue-600"
                  >
                    <option value="Morning (8:00 AM - 12:00 PM)">Morning (8:00 AM - 12:00 PM)</option>
                    <option value="Afternoon (12:00 PM - 4:00 PM)">Afternoon (12:00 PM - 4:00 PM)</option>
                    <option value="Evening (4:00 PM - 8:00 PM)">Evening (4:00 PM - 8:00 PM)</option>
                    <option value="Immediate / Anytime">Immediate / Anytime</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-800 font-extrabold">Resident Phone Number</label>
                  <input
                    type="text"
                    value={issueContactPhone}
                    onChange={(e) => setIssueContactPhone(e.target.value)}
                    placeholder={currentUser?.phone || '050 000 0000'}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Update Notification Channel */}
              <div className="space-y-1">
                <label className="block text-slate-800 font-extrabold">Preferred Update Channel</label>
                <div className="flex flex-wrap gap-2">
                  {(['In-app Notification', 'Phone Call', 'WhatsApp / SMS', 'Email'] as const).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setIssueContactMethod(method as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        issueContactMethod === method
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewIssueModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingIssue}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-800 hover:to-indigo-800 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-40 flex items-center gap-2"
                >
                  {submittingIssue ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Filing Report...</span>
                    </>
                  ) : (
                    <span>File Maintenance Report</span>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* VERIFY RESOLUTION & RATE STAFF MODAL */}
      {selectedIssueForConfirm && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 leading-tight">Verify Technical Repair Work</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Confirm fix satisfaction and submit staff review</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedIssueForConfirm(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Complaint Subject</div>
              <div className="text-xs font-black text-slate-900">{selectedIssueForConfirm.title}</div>
              <p className="text-xs text-slate-600">{selectedIssueForConfirm.description}</p>
            </div>

            {/* Assigned Staff Info */}
            {selectedIssueForConfirm.assignedStaffName && (
              <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                    {selectedIssueForConfirm.assignedStaffName.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-black text-blue-950">{selectedIssueForConfirm.assignedStaffName}</div>
                    <div className="text-[10px] text-blue-700 font-semibold">{selectedIssueForConfirm.assignedStaffRole || 'Technician'}</div>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-500 font-bold">
                  <span>Assigned Staff</span>
                </div>
              </div>
            )}

            {/* Staff Completion Proof notes if provided */}
            {selectedIssueForConfirm.staffCompletionNotes && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Technician Completion Remarks:</span>
                <p className="italic">"{selectedIssueForConfirm.staffCompletionNotes}"</p>
              </div>
            )}

            {/* Completion Photo preview */}
            {selectedIssueForConfirm.staffCompletionPhoto && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Completion Proof Photo:</span>
                <div className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200">
                  <img src={selectedIssueForConfirm.staffCompletionPhoto} alt="Proof" className="w-full h-full object-cover" />
                </div>
              </div>
            )}

            <form onSubmit={handleConfirmCompletion} className="space-y-4 pt-1">
              {/* 5-STAR RATING SELECTOR */}
              <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-center">
                <label className="block text-xs font-black text-slate-800">
                  Rate Technician Performance & Punctuality
                </label>
                <div className="flex items-center justify-center gap-1.5 py-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setConfirmRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                    >
                      <Star
                        size={26}
                        className={`transition-colors ${
                          (hoverRating || confirmRating) >= star
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <div className="text-[11px] font-bold text-amber-700">
                  {confirmRating === 5 && '★★★★★ Outstanding / Flawless Fix'}
                  {confirmRating === 4 && '★★★★☆ Very Good Service'}
                  {confirmRating === 3 && '★★★☆☆ Satisfactory'}
                  {confirmRating === 2 && '★★☆☆☆ Needs Improvement'}
                  {confirmRating === 1 && '★☆☆☆☆ Poor Service'}
                </div>
              </div>

              {/* Resident Feedback & Review Textarea */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Write Staff Review (Will appear on Technician's Public Profile)
                </label>
                <textarea
                  rows={3}
                  value={confirmFeedback}
                  onChange={(e) => setConfirmFeedback(e.target.value)}
                  placeholder="e.g. Promptly arrived, brought spare components, and fixed the issue with great care!"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600 resize-none bg-white"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedIssueForConfirm(null)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingConfirm}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 size={15} />
                  <span>{submittingConfirm ? 'Submitting...' : 'Confirm Fix & Post Review'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SIGN OUT CONFIRMATION MODAL */}
      {showSignoutConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 text-center border border-slate-100 shadow-2xl">
            <div className="flex items-center justify-center gap-2 pt-1 pb-1">
              <PineLogo size={28} />
              <span className="font-black text-slate-900 tracking-tight text-sm">PineVela Housing</span>
            </div>
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <LogOut size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900">Are you sure you want to sign out?</h3>
              <p className="text-xs text-slate-500 font-semibold">Your resident workspace session will be safely signed out.</p>
            </div>
            <div className="flex gap-2.5 justify-center">
              <button
                onClick={() => setShowSignoutConfirmModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Keep Session
              </button>
              <button
                onClick={() => { setShowSignoutConfirmModal(false); logout(); navigate('/', { replace: true }); }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX PHOTO MODAL */}
      {lightboxPhoto && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="relative max-w-4xl w-full bg-slate-900 rounded-3xl overflow-hidden p-2 shadow-2xl border border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-slate-800 text-white">
              <span className="text-xs font-black tracking-wide flex items-center gap-2">
                <Camera size={14} className="text-blue-400" />
                <span>High-Resolution Complaint Photo Evidence</span>
              </span>
              <button 
                onClick={() => setLightboxPhoto(null)} 
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full cursor-pointer transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center min-h-[300px]">
              <img src={lightboxPhoto} alt="Evidence detail" className="max-h-[80vh] w-auto max-w-full object-contain rounded-2xl" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
