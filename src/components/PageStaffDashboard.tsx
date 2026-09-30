import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { queryClient, invalidateAllQueries } from '../lib/queryClient';
import { useAuth } from '../context/AuthContext';
import { apiFetch, safeJson } from '../lib/api';
import PineLogo from './PineLogo';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import { sanitizePdfDataUrl } from '../utils/pdfHelper';
import {
  Bell, Settings, Briefcase, CheckCircle2, Clock, XCircle, AlertCircle,
  Phone, Mail, User, Building2, FileText, UploadCloud, ChevronRight,
  ShieldCheck, ArrowRight, RefreshCw, Sparkles, MapPin, Eye, ExternalLink,
  Camera, Check, Lock, Send, X, MessageSquare, LogOut as LogOutIcon, DollarSign,
  Scale, Handshake, HelpCircle, ThumbsUp, ThumbsDown, Wrench, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StaffApplication {
  id: string;
  staffId: string;
  staffUsername?: string;
  staffEmail: string;
  applicantName: string;
  phone: string;
  role: string;
  hostelId: string;
  hostelName: string;
  nationalId?: string;
  idDocumentUrl?: string;
  cvUrl?: string;
  cvData?: string;
  cvFileName?: string;
  coverLetter?: string;
  status: 'pending' | 'Approved' | 'Rejected' | 'Dismissed' | 'Removed' | 'Resigned' | string;
  shift?: string;
  assignedBlock?: string;
  appliedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

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
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  date?: string;
  read?: boolean;
}

export default function PageStaffDashboard() {
  const { user, logout, updateUser, setSessionUser } = useAuth();
  const navigate = useNavigate();

  // Data States
  const [staffRecord, setStaffRecord] = useState<any | null>(null);

  const isStaffVerified = Boolean(
    // 1. Check if staffRecord exists and is verified/approved
    (staffRecord && (
      staffRecord.isVerified === true ||
      String(staffRecord.verificationStatus || '').toLowerCase() === 'verified' ||
      String(staffRecord.verificationStatus || '').toLowerCase() === 'approved' ||
      String(staffRecord.status || '').toLowerCase() === 'verified' ||
      String(staffRecord.status || '').toLowerCase() === 'approved'
    )) ||
    // 2. Check if current user session is verified/approved
    (user && (
      user.isVerified === true ||
      String(user.verificationStatus || '').toLowerCase() === 'verified' ||
      String(user.verificationStatus || '').toLowerCase() === 'approved' ||
      String(user.status || '').toLowerCase() === 'verified' ||
      String(user.status || '').toLowerCase() === 'approved'
    ))
  );

  // Active Tab: notifications, apply, settings, chat, offers, or maintenance
  const [activeTab, setActiveTab] = useState<'notifications' | 'apply' | 'settings' | 'chat' | 'offers' | 'maintenance'>('maintenance');
  // Collapsible sidebar state (Disabled minimizing to prevent glitched overlapping)
  const isSidebarCollapsed = false;
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Data States
  const [hostels, setHostels] = useState<any[]>([]);
  const [applications, setApplications] = useState<StaffApplication[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [jobOffers, setJobOffers] = useState<any[]>([]);
  const [viewingOfferMap, setViewingOfferMap] = useState<any | null>(null);
  const [declineOfferModal, setDeclineOfferModal] = useState<any | null>(null);
  const [declineOfferReason, setDeclineOfferReason] = useState('Schedule conflict with current hostel maintenance tasks');
  const mapInstanceRef = React.useRef<any>(null);

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

  useEffect(() => {
    if (viewingOfferMap) {
      const timer = setTimeout(() => {
        const container = document.getElementById('staff-offer-map-view');
        if (!container) return;
        
        // Clean up previous map if exists
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const L = (window as any).L;
        if (!L) return;

        const lat = viewingOfferMap.lat || 5.6037;
        const lng = viewingOfferMap.lng || -0.1870;

        const map = L.map(container).setView([lat, lng], 16);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        L.marker([lat, lng]).addTo(map)
          .bindPopup(`<b>${viewingOfferMap.requesterName}</b><br/>${viewingOfferMap.location}`).openPopup();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    }
  }, [viewingOfferMap]);

  // Application Form States
  const [selectedHostelId, setSelectedHostelId] = useState<string>('');
  const [appliedRole, setAppliedRole] = useState<string>('Facilities & Maintenance Technician');
  const [applicantPhone, setApplicantPhone] = useState<string>('');
  const [applicantNationalId, setApplicantNationalId] = useState<string>('');
  const [coverNote, setCoverNote] = useState<string>('');
  const [cvFileName, setCvFileName] = useState<string>('');
  const [cvData, setCvData] = useState<string>('');
  const [idDocFileName, setIdDocFileName] = useState<string>('');
  const [idDocData, setIdDocData] = useState<string>('');
  const [submittingApp, setSubmittingApp] = useState(false);

  // Settings / Profile Form States
  const [settingsName, setSettingsName] = useState<string>('');
  const [settingsUsername, setSettingsUsername] = useState<string>('');
  const [settingsEmail, setSettingsEmail] = useState<string>('');
  const [settingsPhone, setSettingsPhone] = useState<string>('');
  const [settingsPhoto, setSettingsPhoto] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Chat States
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [chatMessagesList, setChatMessagesList] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  // CV Preview Modal
  const [previewCv, setPreviewCv] = useState<{ name: string; data: string } | null>(null);

  const triggerToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 1500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch accredited hostels
      const hostelsData = await apiFetch('/api/hostels').catch(() => []);
      const validHostels = (Array.isArray(hostelsData) ? hostelsData : []).filter((h: any) => {
        return h && !h.isDeleted && (h.isApproved === true || h.approvalStatus === 'Approved' || h.status === 'Approved');
      });
      setHostels(validHostels);
      if (validHostels.length > 0 && !selectedHostelId) {
        setSelectedHostelId(validHostels[0].id);
      }

      // 2. Fetch staff applications
      const appsData = await apiFetch('/api/staff-applications').catch(() => []);
      setApplications(Array.isArray(appsData) ? appsData : []);

      // 3. Fetch notifications
      const notifsData = await apiFetch('/api/notifications').catch(() => []);
      setNotifications(Array.isArray(notifsData) ? notifsData : []);

      // 3b. Fetch job offers
      const offersData = await apiFetch('/api/staff-job-offers').catch(() => []);
      setJobOffers(Array.isArray(offersData) ? offersData : []);

      // 3c. Fetch resignation & retention bargains
      const bargainsData = await apiFetch('/api/staff-bargains').catch(() => []);
      setStaffBargains(Array.isArray(bargainsData) ? bargainsData : []);

      // 4. Fetch staff verification status directly from dedicated endpoint & /api/staff
      const [allStaff, vrfStatusRes] = await Promise.all([
        apiFetch('/api/staff').catch(() => []),
        apiFetch('/api/staff-verifications/my-status').catch(() => null)
      ]);

      const uEmail = user?.email?.toLowerCase().trim();
      const uId = user?.id;
      let myStaff = Array.isArray(allStaff)
        ? allStaff.find((s: any) => 
            (s.userId && s.userId === uId) ||
            (s.id && s.id === uId) ||
            (s.email && uEmail && s.email.toLowerCase().trim() === uEmail) ||
            (s.parentUserId && s.parentUserId === uId) ||
            (s.parentUserEmail && uEmail && s.parentUserEmail.toLowerCase().trim() === uEmail)
          )
        : null;

      // If dedicated verification status returned verified record, merge or adopt
      if (vrfStatusRes && (vrfStatusRes.isVerified || vrfStatusRes.staffRecord)) {
        if (!myStaff) {
          myStaff = vrfStatusRes.staffRecord || {
            isVerified: vrfStatusRes.isVerified,
            verificationStatus: vrfStatusRes.verificationStatus || 'Verified'
          };
        } else if (vrfStatusRes.isVerified) {
          myStaff.isVerified = true;
          myStaff.verificationStatus = 'Verified';
        }
      }

      // If not found in /api/staff, check /api/users/my-registered-accounts
      if ((!myStaff || !myStaff.isVerified) && user) {
        const queryEmail = user?.email || '';
        const queryId = user?.id || '';
        const regRes = await apiFetch(`/api/users/my-registered-accounts?email=${encodeURIComponent(queryEmail)}&userId=${encodeURIComponent(queryId)}`).catch(() => null);
        if (regRes && regRes.staffAccount) {
          if (!myStaff) {
            myStaff = regRes.staffAccount;
          } else if (regRes.staffAccount.isVerified) {
            myStaff.isVerified = true;
            myStaff.verificationStatus = 'Verified';
          }
        }
      }

      setStaffRecord(myStaff || null);

      if (myStaff) {
        const myIsVerified = Boolean(myStaff.isVerified === true || myStaff.verificationStatus === 'Verified' || myStaff.verificationStatus === 'verified' || myStaff.status === 'Verified');
        const myVrfStatus = myIsVerified ? 'Verified' : (myStaff.verificationStatus || myStaff.status || 'Pending');
        if (user && (user.isVerified !== myIsVerified || user.verificationStatus !== myVrfStatus)) {
          updateUser?.({ isVerified: myIsVerified, verificationStatus: myVrfStatus });
        }
      }

      // If approved, default to notifications or apply view
      if (myStaff && activeTab === 'apply') {
        // Can remain on apply or view status
      }
    } catch (err: any) {
      console.error("Error loading staff console data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    try {
      const res = await apiFetch(`/api/job-offers/${offerId}/accept`, {
        method: 'PUT'
      });
      if (res.success || res.offer) {
        triggerToast('Job offer accepted successfully! Logged in system and requester notified.', 'success');
        loadData();
      } else {
        triggerToast(res.error || 'Failed to accept offer', 'error');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to accept offer', 'error');
    }
  };

  const handleDeclineOffer = async () => {
    if (!declineOfferModal) return;
    try {
      const res = await apiFetch(`/api/job-offers/${declineOfferModal.id}/decline`, {
        method: 'PUT',
        body: JSON.stringify({ reason: declineOfferReason || 'Declined due to scheduling commitments' })
      });
      if (res.success || res.offer) {
        triggerToast('Job offer declined and client notified.', 'info');
        setDeclineOfferModal(null);
        setDeclineOfferReason('Schedule conflict with current hostel maintenance tasks');
        loadData();
      } else {
        triggerToast(res.error || 'Failed to decline offer', 'error');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to decline offer', 'error');
    }
  };

  const fetchChatRooms = async () => {
    try {
      const rooms = await apiFetch('/api/staff-chat/rooms').catch(() => []);
      if (Array.isArray(rooms)) {
        setChatRooms(rooms);
        if (rooms.length > 0 && !selectedRoomId) {
          setSelectedRoomId(rooms[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading chat rooms:", err);
    }
  };

  const fetchChatMessages = async (roomId: string) => {
    if (!roomId) return;
    try {
      const msgs = await apiFetch(`/api/staff-chat/rooms/${roomId}/messages`).catch(() => []);
      if (Array.isArray(msgs)) {
        setChatMessagesList(msgs);
      }
    } catch (err) {
      console.error("Error fetching chat messages:", err);
    }
  };

  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRoomId || !newMessage.trim()) return;
    setSendingMsg(true);
    try {
      const response = await apiFetch(`/api/staff-chat/rooms/${selectedRoomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage })
      });
      if (response && response.id) {
        setNewMessage('');
        fetchChatMessages(selectedRoomId);
      } else if (response && response.error) {
        triggerToast(response.error, 'error');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to send message.', 'error');
    } finally {
      setSendingMsg(false);
    }
  };

  // Poll for messages when chat active
  useEffect(() => {
    if (activeTab === 'chat') {
      fetchChatRooms();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'chat' && selectedRoomId) {
      fetchChatMessages(selectedRoomId);
      const interval = setInterval(() => {
        fetchChatMessages(selectedRoomId);
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [activeTab, selectedRoomId]);

  const fetchAssignedIssues = async () => {
    try {
      const res = await apiFetch('/api/issue-reports').catch(() => []);
      if (Array.isArray(res)) {
        const cleanEmail = (user?.email || '').toLowerCase().trim();
        const userId = user?.id;
        const myIssues = res.filter((issue: any) => 
          (issue.assignedStaffId && (issue.assignedStaffId === userId || issue.assignedStaffId === user?.id)) ||
          (issue.assignedStaffEmail && issue.assignedStaffEmail.toLowerCase().trim() === cleanEmail) ||
          (issue.assignedStaffName && user?.name && issue.assignedStaffName.toLowerCase().trim() === user.name.toLowerCase().trim()) ||
          (approvedApp && (issue.hostelId === approvedApp.hostelId || (issue.hostelName && approvedApp.hostelName && issue.hostelName.toLowerCase().trim() === approvedApp.hostelName.toLowerCase().trim())))
        );
        setAssignedIssues(myIssues);
      }
    } catch (err) {
      console.error("Error fetching assigned issues:", err);
    }
  };

  const handleAcceptAssignment = async (issueId: string) => {
    try {
      await apiFetch(`/api/issue-reports/${issueId}/accept-assignment`, {
        method: 'POST'
      });
      triggerToast("Work order accepted! Marked as In Progress.", "success");
      fetchAssignedIssues();
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
      fetchAssignedIssues();
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
      fetchAssignedIssues();
    } catch (err: any) {
      triggerToast(err.message || "Failed to submit request.", "error");
    }
  };

  const handleCompleteWorkOrder = async () => {
    if (!showCompleteModal) return;
    setIsSubmittingComplete(true);
    try {
      const payload = {
        completionNotes: completionNotes.trim() || "Repairs successfully completed and inspected on site.",
        completionPhoto: completionPhoto || undefined
      };
      await apiFetch(`/api/issue-reports/${showCompleteModal.id}/staff-complete`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      triggerToast("Work order marked completed! Sent to resident for verification.", "success");
      setShowCompleteModal(null);
      setCompletionNotes("");
      setCompletionPhoto("");
      await fetchAssignedIssues();
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

  const [showVerificationSuccessBanner, setShowVerificationSuccessBanner] = useState(true);

  // Find active pending application
  const activePendingApp = applications.find(a => a.status === 'pending');
  // Find approved application (ONLY if actively employed, not dismissed or resigned)
  const approvedApp = (staffRecord && staffRecord.hostelId && (staffRecord.status === 'Active' || staffRecord.status === 'Approved' || !staffRecord.status) ? {
    id: staffRecord.id,
    role: staffRecord.role,
    hostelName: staffRecord.hostelName || 'Accredited Residence',
    shift: staffRecord.shift || 'Day Shift',
    assignedBlock: staffRecord.assignedBlock || 'All Wings',
    status: 'Approved',
    appliedAt: staffRecord.createdAt || new Date().toISOString()
  } as any : null) || applications.find(a => (a.status as string) === 'Approved' || (a.status as string) === 'approved');

  // Dismissed and resigned applications (to provide clear feedback when lock is lifted)
  const dismissedApp = applications.find(a => ((a.status as string) === 'Dismissed' || (a.status as string) === 'Removed') && !approvedApp);
  const resignedApp = applications.find(a => (a.status as string) === 'Resigned' && !approvedApp);

  // Initial data loading & periodic sync
  useEffect(() => {
    if (user) {
      loadData();
      fetchAssignedIssues();
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetchAssignedIssues();
    }, 8000);
    return () => clearInterval(interval);
  }, [user?.id, user?.email]);

  // Sync settings inputs when user changes
  useEffect(() => {
    if (user) {
      setSettingsName(user.name || '');
      setSettingsUsername(user.username || (user as any).userName || '');
      setSettingsEmail(user.email || '');
      setSettingsPhone(user.phone || (user as any).phoneNumber || '');
      setSettingsPhoto(user.photo || user.avatar || (user as any).profilePicture || '');
      setApplicantPhone(user.phone || '');
      setApplicantNationalId((user as any).nationalId || '');
    }
  }, [user]);

  // Staff Bargains & Resignation State
  const [staffBargains, setStaffBargains] = useState<StaffBargain[]>([]);
  const [showResignModal, setShowResignModal] = useState(false);
  const [quitReason, setQuitReason] = useState('');
  const [quitMode, setQuitMode] = useState<'bargain' | 'direct'>('bargain');
  const [bargainType, setBargainType] = useState<string>('salary');
  const [bargainTerms, setBargainTerms] = useState('');
  const [bargainNotes, setBargainNotes] = useState('');
  const [submittingQuitOrBargain, setSubmittingQuitOrBargain] = useState(false);
  const [processingDecision, setProcessingDecision] = useState(false);

  // Active / latest bargain proposal
  const activeBargain = staffBargains.length > 0 ? staffBargains[0] : null;

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

      const res = await apiFetch('/api/staff-bargains', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.success) {
        if (res.directQuit) {
          triggerToast('Resignation processed with reason. Application lock has been lifted!', 'success');
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

  // Staff post-bargain decision handler (quit or stay after manager rejection)
  const handlePostBargainDecision = async (bargainId: string, decision: 'quit' | 'stay') => {
    setProcessingDecision(true);
    try {
      const res = await apiFetch(`/api/staff-bargains/${bargainId}/staff-decision`, {
        method: 'POST',
        body: JSON.stringify({ decision })
      });

      if (res.success) {
        if (decision === 'quit') {
          triggerToast('Resignation finalized. Your application lock is now lifted!', 'success');
        } else {
          triggerToast('Decision recorded: You have decided to remain in your position on duty.', 'success');
        }
        await loadData();
      } else {
        triggerToast(res.error || 'Failed to record decision', 'error');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to record decision', 'error');
    } finally {
      setProcessingDecision(false);
    }
  };

  // File Upload Handlers (CV & ID)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'cv' | 'id') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'cv') {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        triggerToast("CV document MUST be in PDF format (.pdf)", 'error');
        return;
      }
    }

    if (file.size > 5 * 1024 * 1024) {
      triggerToast("File size cannot exceed 5MB.", 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (type === 'cv') {
        const sanitized = sanitizePdfDataUrl(result, user?.name || 'Staff Applicant');
        setCvFileName(file.name);
        setCvData(sanitized);
        triggerToast(`CV PDF "${file.name}" attached successfully!`, 'success');
      } else {
        setIdDocFileName(file.name);
        setIdDocData(result);
        triggerToast(`ID Document "${file.name}" attached successfully!`, 'success');
      }
    };
    reader.readAsDataURL(file);
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
      setSettingsPhoto(result);
      triggerToast("New profile picture preview loaded. Tap Save to apply.", 'info');
    };
    reader.readAsDataURL(file);
  };

  // Submit Application
  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();

    if (approvedApp) {
      triggerToast(`Application Locked: You are already actively employed as ${approvedApp.role} at ${approvedApp.hostelName}. Staff members who are hired and verified cannot apply for other hostel jobs unless you quit your job or are removed by management.`, 'error');
      return;
    }

    if (activePendingApp) {
      triggerToast("You already have an active application under review. You cannot enroll into other roles until a decision is finalized.", 'error');
      return;
    }

    if (!selectedHostelId) {
      triggerToast("Please choose an accredited hostel to apply to.", 'error');
      return;
    }

    if (!applicantPhone || !applicantPhone.trim()) {
      triggerToast("Please enter your contact phone number.", 'error');
      return;
    }

    if (!cvData) {
      triggerToast("Please upload your Curriculum Vitae (CV / Resume).", 'error');
      return;
    }

    if (!idDocData) {
      triggerToast("Please upload your National ID Card Document (Ghana Card photo/scan).", 'error');
      return;
    }

    if (!coverNote || !coverNote.trim()) {
      triggerToast("Please enter your Cover Note / Practical Experience description.", 'error');
      return;
    }

    const targetHostel = hostels.find(h => h.id === selectedHostelId);
    if (!targetHostel) {
      triggerToast("Selected hostel could not be found.", 'error');
      return;
    }

    setSubmittingApp(true);
    try {
      const newApp = await apiFetch('/api/staff-applications', {
        method: 'POST',
        body: JSON.stringify({
          applicantName: user?.name || settingsName || 'Staff Applicant',
          phone: applicantPhone,
          email: user?.email || settingsEmail,
          role: appliedRole,
          hostelId: targetHostel.id,
          hostelName: targetHostel.name,
          nationalId: applicantNationalId,
          idDocumentUrl: idDocData,
          cvData: cvData,
          cvFileName: cvFileName || 'Resume_CV.pdf',
          coverLetter: coverNote
        })
      });

      setApplications(prev => [newApp, ...prev]);
      triggerToast(`Application submitted! Your CV has been sent to the manager of ${targetHostel.name}.`, 'success');
      
      // Reset upload states
      setCvData('');
      setCvFileName('');
      setIdDocData('');
      setIdDocFileName('');
      setCoverNote('');

      // Refresh data
      loadData();
    } catch (err: any) {
      triggerToast(err?.message || "Failed to submit application. Please try again.", 'error');
    } finally {
      setSubmittingApp(false);
    }
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
          username: settingsUsername,
          email: settingsEmail,
          phone: settingsPhone,
          profilePicture: settingsPhoto
        })
      });

      if (res.user && updateUser) {
        updateUser(res.user);
      }

      triggerToast("Profile updated successfully! All contact details are directly synchronized with your manager's staff directory.", 'success');
      loadData();
    } catch (err: any) {
      triggerToast(err?.message || "Failed to update profile settings.", 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row relative text-slate-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
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
          onConfirm={() => {
            setShowLogoutConfirm(false);
            logout();
            navigate('/login');
          }}
        />
      )}

      {/* CV Preview Modal */}
      {previewCv && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-black text-slate-900">{previewCv.name}</h3>
              </div>
              <button onClick={() => setPreviewCv(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 p-4 rounded-xl border border-slate-200">
              {previewCv.data.startsWith('data:image') ? (
                <img src={previewCv.data} alt="CV Document" className="w-full object-contain max-h-[60vh] rounded-lg" />
              ) : previewCv.data.startsWith('data:application/pdf') ? (
                <iframe src={previewCv.data} title="CV PDF" className="w-full h-[60vh] rounded-lg border-0" />
              ) : (
                <div className="text-xs text-slate-600 whitespace-pre-wrap font-mono p-4">
                  {previewCv.data.substring(0, 1000)}...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      
      {/* MOBILE HEADER (lg:hidden) */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-xl border-b border-sky-200/50 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <PineLogo size={24} />
          <div>
            <h1 className="text-xs font-black tracking-tight text-blue-950 leading-tight">PineVela Staff</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowLogoutConfirm(true)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg">
            <LogOutIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MOBILE BOTTOM NAV (lg:hidden) */}
      <nav className="mobile-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around px-2 py-2 pb-safe">
          {[
            { id: 'apply', icon: Briefcase, label: 'Board' },
            { id: 'offers', icon: Briefcase, label: 'Offers', badge: jobOffers.filter(o => o.status === 'Pending').length },
            { id: 'notifications', icon: Bell, label: 'Alerts', badge: notifications.length },
            { id: 'settings', icon: Settings, label: 'Settings' },
            ...(approvedApp ? [
              { id: 'chat', icon: MessageSquare, label: 'Chat', dot: true },
              { id: 'maintenance', icon: Wrench, label: 'Orders', badge: assignedIssues.filter(i => i.status !== 'Resolved' && !i.staffCompleted).length }
            ] : [])
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all relative ${
                activeTab === tab.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${activeTab === tab.id ? 'bg-blue-100/50' : ''}`}>
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'scale-110 transition-transform' : ''}`} />
                {tab.badge ? (
                  <span className="absolute top-1 right-3 w-4 h-4 bg-amber-400 text-slate-900 rounded-full text-[9px] font-black flex items-center justify-center ring-2 ring-white">
                    {tab.badge}
                  </span>
                ) : null}
                {tab.dot ? (
                  <span className="absolute top-1 right-4 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                ) : null}
              </div>
              <span className={`text-[9px] font-bold mt-0.5 ${activeTab === tab.id ? 'text-blue-700' : 'text-slate-500'}`}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* LEFT SIDEBAR NAVIGATION */}

      <aside className={`hidden lg:flex ${isSidebarCollapsed ? 'w-20 p-4' : 'w-72 p-6'} my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl flex flex-col justify-between shrink-0 overflow-y-auto z-20 transition-all duration-300 relative`}>

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
          <div className={`p-3.5 bg-white/80 border border-blue-200/60 rounded-2xl flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} shadow-sm overflow-hidden`}>
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
                    {approvedApp ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 inline shrink-0" />
                        <span className="truncate text-emerald-700 font-bold">{approvedApp.role || 'Enrolled Staff'}</span>
                      </>
                    ) : activePendingApp ? (
                      <>
                        <Clock className="w-3 h-3 text-amber-600 inline shrink-0" />
                        <span className="truncate text-amber-700 font-bold">Application Pending</span>
                      </>
                    ) : (
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
                      {assignedIssues.filter(i => i.status !== 'Resolved' && !i.staffCompleted).length > 0 && (
                        <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded text-[9px] font-black uppercase animate-pulse shrink-0">
                          {assignedIssues.filter(i => i.status !== 'Resolved' && !i.staffCompleted).length} NEW
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] font-medium truncate ${activeTab === 'maintenance' ? 'text-blue-200' : 'text-emerald-100'}`}>
                      Priority maintenance & repair tasks
                    </div>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && assignedIssues.filter(i => i.status !== 'Resolved' && !i.staffCompleted).length > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-sm animate-ping shrink-0">
                  !
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('apply')}
              title="Apply & Vacancies"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-3'} rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'apply'
                  ? 'bg-blue-900 text-white shadow-lg shadow-blue-900/25'
                  : 'bg-white/40 hover:bg-white/80 text-slate-700 border border-slate-200/40'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Briefcase className={`w-4 h-4 shrink-0 ${activeTab === 'apply' ? 'text-amber-300' : 'text-blue-700'}`} />
                {!isSidebarCollapsed && (
                  <div className="text-left overflow-hidden">
                    <div className="truncate">Apply & Vacancies</div>
                    <div className={`text-[10px] font-normal truncate ${activeTab === 'apply' ? 'text-blue-200' : 'text-slate-500'}`}>
                      {approvedApp ? 'My Appointed Role' : activePendingApp ? 'Under Review' : 'Find Hostel Work'}
                    </div>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && (
                activePendingApp ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-400 text-slate-950 shrink-0">
                    Review
                  </span>
                ) : approvedApp ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-400 text-emerald-950 shrink-0">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-900 shrink-0">
                    Open
                  </span>
                )
              )}
            </button>

            {/* Tab: Job Offers */}
            <button
              onClick={() => setActiveTab('offers')}
              title="Job Offers"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-3'} rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'offers'
                  ? 'bg-blue-900 text-white shadow-lg shadow-blue-900/25'
                  : 'bg-white/40 hover:bg-white/80 text-slate-700 border border-slate-200/40'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Briefcase className={`w-4 h-4 shrink-0 ${activeTab === 'offers' ? 'text-amber-300' : 'text-blue-700'}`} />
                {!isSidebarCollapsed && (
                  <div className="text-left overflow-hidden">
                    <div className="truncate">Job Offers</div>
                    <div className={`text-[10px] font-normal truncate ${activeTab === 'offers' ? 'text-blue-200' : 'text-slate-500'}`}>
                      Hiring proposals received
                    </div>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && jobOffers.filter(o => o.status === 'Pending').length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-400 text-slate-950 shrink-0">
                  {jobOffers.filter(o => o.status === 'Pending').length}
                </span>
              )}
            </button>
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

            {/* Tab 4: Secure Chat with Manager (Unlocked once Approved) */}
            {approvedApp && (
              <button
                onClick={() => setActiveTab('chat')}
                title="Secure Chat"
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-3'} rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'chat'
                    ? 'bg-gradient-to-r from-blue-700 to-sky-800 text-white shadow-lg shadow-blue-900/25 border-blue-500'
                    : 'bg-blue-50/50 hover:bg-blue-100/80 text-blue-950 border border-blue-200/60'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare className={`w-4 h-4 shrink-0 ${activeTab === 'chat' ? 'text-sky-300' : 'text-blue-700'}`} />
                  {!isSidebarCollapsed && (
                    <div className="text-left overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">Secure Chat</span>
                        <span className="px-1.5 py-0.2 bg-blue-400 text-white rounded text-[8px] font-black uppercase shrink-0">MGR</span>
                      </div>
                      <div className={`text-[10px] font-normal truncate ${activeTab === 'chat' ? 'text-blue-200' : 'text-slate-500'}`}>
                        Encrypted live connection
                      </div>
                    </div>
                  )}
                </div>
                {!isSidebarCollapsed && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />}
              </button>
            )}

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
        </div>
      </aside>

      {/* GIANT WATERMARK PINEVELA LOGO — FIXED TO VIEWPORT (does not scroll with content) */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0">
        <div className="transform scale-[4.5] opacity-[0.14] blur-[0.4px]">
          <PineLogo size={180} hideText={true} />
        </div>
      </div>

      {/* MAIN WORKSPACE CONTENT */}
      <main className="flex-1 m-4 mb-24 lg:mb-6 lg:my-6 lg:mr-6 h-auto lg:h-[calc(100vh-3rem)] overflow-y-auto pb-24 lg:pb-8 bg-gradient-to-br from-white/95 via-sky-50/50 to-blue-50/30 backdrop-blur-2xl border border-sky-200/70 shadow-2xl rounded-3xl p-6 md:p-8 space-y-8 relative z-10">
        {/* TOP STATUS BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-emerald-100 text-emerald-900 rounded-md border border-emerald-200">
                {approvedApp ? 'Active Duty Dispatch' : 'Staff Console'}
              </span>
              <span className="text-xs text-slate-500 font-semibold">{approvedApp ? `• Hostel: ${approvedApp.hostelName}` : 'Academic Year 2026/2027'}</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mt-1">
              {approvedApp && activeTab === 'maintenance' ? 'Vocational Repair Desk' : (
                <>
                  {activeTab === 'apply' && 'Staff Applications & Job Board'}
                  {activeTab === 'notifications' && 'Operational Notifications'}
                  {activeTab === 'offers' && 'Job Offers & Hiring Proposals'}
                  {activeTab === 'settings' && 'Staff Account & Profile Settings'}
                  {activeTab === 'chat' && 'Secure Encrypted Communication'}
                  {activeTab === 'maintenance' && 'Vocational Work Orders & Repairs'}
                </>
              )}
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
        {/* TAB 1: APPLY (JOB BOARD, ACTIVE APPLICATION & APPLICATION SUBMISSION) */}
        {/* ========================================================================= */}
        {activeTab === 'apply' && (
          <div className="space-y-8">
            {/* VERIFIED STAFF WELCOME GREEN BANNER */}
            {isStaffVerified && showVerificationSuccessBanner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white rounded-3xl shadow-xl border border-emerald-400 relative overflow-hidden"
              >
                <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 text-white shadow-md">
                      <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-400/30 text-emerald-100 text-[10px] font-black uppercase tracking-wider border border-emerald-300/30">
                          Admin Credential Verified
                        </span>
                        <span className="text-xs text-emerald-200 font-bold">• Account Unlocked</span>
                      </div>
                      <h3 className="text-xl font-black text-white tracking-tight">
                        🎉 Welcome! Your Staff Account Credentials Are Verified!
                      </h3>
                      <p className="text-xs text-emerald-100 leading-relaxed font-medium max-w-2xl">
                        PineVela Super Administration has reviewed and approved your <strong>Curriculum Vitae (CV)</strong> and <strong>National ID</strong> credentials. You are now fully unlocked to browse accredited university hostels and submit job applications!
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
                    <button
                      onClick={() => {
                        const el = document.getElementById('accredited-hostels-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="px-5 py-3 rounded-2xl bg-white text-emerald-950 hover:bg-emerald-50 text-xs font-black shadow-lg transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <span>Apply For Work Now</span>
                      <ArrowRight className="w-4 h-4 text-emerald-700" />
                    </button>
                    <button
                      onClick={() => setShowVerificationSuccessBanner(false)}
                      className="p-2.5 rounded-2xl bg-emerald-700/60 hover:bg-emerald-800/80 text-white/80 hover:text-white transition-all cursor-pointer"
                      title="Dismiss notice"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* UNVERIFIED STAFF CREDENTIAL LOCK BANNER */}
            {!isStaffVerified && (
              <div className="p-6 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/70 border-2 border-amber-300 rounded-3xl shadow-md space-y-3">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-lg shadow-amber-500/30">
                    <Lock className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">
                        Staff Account Verification Required Before Applying
                      </h3>
                      <span className="px-3 py-0.5 rounded-full text-xs font-extrabold bg-amber-200 text-amber-950 border border-amber-300">
                        Admin Review Pending
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      Your registered <strong>Curriculum Vitae (CV)</strong> and <strong>National ID (Ghana Card)</strong> documents have been forwarded to the PineVela Super Administrator verification desk under the <strong>Verified Staffs</strong> tab.
                    </p>
                    <div className="p-3 bg-white/90 border border-amber-200 rounded-xl text-xs font-bold text-amber-950 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Job applications for accredited hostels remain <strong>LOCKED</strong> until an Administrator reviews and approves your credentials. Once verified, options to apply for jobs will immediately unlock!</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ACTIVE APPOINTMENT OR PENDING STATUS BANNER */}
            {approvedApp ? (
              <div className="space-y-4">
                {/* ACTIVE BARGAIN STATUS BANNER IF PRESENT */}
                {activeBargain && activeBargain.status === 'pending' && (
                  <div className="p-5 bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-100/70 border-2 border-purple-300 rounded-3xl shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <Scale className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-950 text-[10px] font-black uppercase">
                              Retention Bargain Pending
                            </span>
                            <span className="text-[11px] text-purple-700 font-bold">• Under Manager Review</span>
                          </div>
                          <h4 className="text-sm font-black text-slate-900 mt-0.5">
                            Proposed Terms Sent to {activeBargain.hostelName} Manager
                          </h4>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-purple-100 border border-purple-300 text-purple-900 font-black text-xs rounded-xl shrink-0">
                        Awaiting Decision
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                      <div className="p-3 bg-white/90 border border-purple-200 rounded-2xl space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Your Reason for Seeking to Quit:</span>
                        <p className="text-slate-800 font-medium italic">"{activeBargain.reasonToQuit}"</p>
                      </div>
                      <div className="p-3 bg-white/90 border border-purple-200 rounded-2xl space-y-1">
                        <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">Your Proposed Deal to Stay:</span>
                        <p className="text-purple-950 font-bold">"{activeBargain.bargainProposal?.proposedTerms}"</p>
                        {activeBargain.bargainProposal?.notes && (
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">{activeBargain.bargainProposal.notes}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-purple-800 font-medium">
                      You remain on duty with your current schedule while your manager reviews the proposal. If they accept your deal, you're good! If they decline, you can decide whether to quit or stay.
                    </p>
                  </div>
                )}

                {activeBargain && activeBargain.status === 'accepted' && (
                  <div className="p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border-2 border-emerald-300 rounded-3xl shadow-sm space-y-2.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-950 text-[10px] font-black uppercase">
                              Deal Accepted! 🎉
                            </span>
                            <span className="text-[11px] text-emerald-700 font-bold">• Position Maintained</span>
                          </div>
                          <h4 className="text-sm font-black text-emerald-950 mt-0.5">
                            Management Accepted Your Terms at {activeBargain.hostelName}
                          </h4>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-white/90 border border-emerald-200 rounded-2xl text-xs space-y-1">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Manager's Confirmation Note:</span>
                      <p className="text-slate-800 font-medium">{activeBargain.managerResponseNote || 'Terms approved and accepted by property manager.'}</p>
                    </div>
                    <p className="text-[11px] text-emerald-800 font-medium">
                      You're good! Your deal was accepted by your manager and you continue your employment under these agreed terms.
                    </p>
                  </div>
                )}

                {activeBargain && activeBargain.status === 'rejected' && (
                  <div className="p-6 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border-2 border-rose-300 rounded-3xl shadow-md space-y-4 animate-in fade-in">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <AlertCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-950 text-[10px] font-black uppercase">
                              Bargain Deal Declined
                            </span>
                            <span className="text-[11px] text-rose-700 font-bold">• Action Required: Quit or Stay</span>
                          </div>
                          <h4 className="text-base font-black text-rose-950 mt-0.5">
                            Your Manager Declined the Proposed Terms
                          </h4>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-white/95 border border-rose-200 rounded-2xl space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Manager's Note:</span>
                        <span className="text-[10px] text-slate-400 font-medium">Proposal terms were not approved</span>
                      </div>
                      <p className="text-slate-800 font-medium italic">"{activeBargain.managerResponseNote || 'Management was unable to meet the requested terms.'}"</p>
                      <div className="pt-1 border-t border-slate-100 flex flex-wrap gap-4 text-[11px] text-slate-600">
                        <span>Original Reason: <strong className="text-slate-900">{activeBargain.reasonToQuit}</strong></span>
                        <span>Requested Deal: <strong className="text-slate-900">{activeBargain.bargainProposal?.proposedTerms}</strong></span>
                      </div>
                    </div>

                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 space-y-1">
                      <span className="font-bold flex items-center gap-1.5 text-amber-900">
                        <HelpCircle className="w-4 h-4 text-amber-600" />
                        What would you like to do now?
                      </span>
                      <p className="text-slate-700 text-[11px] leading-relaxed">
                        Since the manager did not accept your terms, you have full authority to make your final choice:
                        either <strong>Proceed to Quit</strong> (your employment ends immediately and your application lock is lifted so you can apply elsewhere), or <strong>Decide to Stay</strong> (remain in your current job on your existing terms).
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => handlePostBargainDecision(activeBargain.id, 'stay')}
                        disabled={processingDecision}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Decide to Stay in Job</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePostBargainDecision(activeBargain.id, 'quit')}
                        disabled={processingDecision}
                        className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <LogOutIcon className="w-4 h-4" />
                        <span>Proceed to Quit Job</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-6 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100/60 border-2 border-emerald-300 rounded-3xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-black uppercase tracking-wider shadow-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Appointed & Enrolled Staff Member</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-900">
                      Official Appointment: {approvedApp.role}
                    </h3>
                    <p className="text-xs text-slate-700 font-medium">
                      Hostel: <strong className="text-slate-950 font-bold">{approvedApp.hostelName}</strong> | Assigned Shift: <strong className="text-slate-950 font-bold">{approvedApp.shift || 'Day Shift'}</strong> | Wing: <strong className="text-slate-950 font-bold">{approvedApp.assignedBlock || 'All Blocks'}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="px-4 py-3 bg-white/90 border border-emerald-200 rounded-2xl text-center shadow-xs">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Status</span>
                      <span className="text-sm font-black text-emerald-800">Active On Duty</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuitReason('');
                        setBargainTerms('');
                        setBargainNotes('');
                        setQuitMode('bargain');
                        setShowResignModal(true);
                      }}
                      className="px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-900 border border-purple-200 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                      title="Quit or bargain terms with manager to stay"
                    >
                      <Scale className="w-4 h-4 text-purple-600" />
                      <span>Quit / Bargain Terms</span>
                    </button>
                  </div>
                </div>

                {/* Application Lock Active Policy Card */}
                <div className="p-5 bg-gradient-to-r from-sky-400/20 via-blue-500/15 to-indigo-400/20 backdrop-blur-xl border border-sky-300/50 rounded-3xl shadow-lg relative overflow-hidden space-y-2.5">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center shrink-0 border border-blue-200 shadow-xs">
                      <Lock className="w-4 h-4 text-blue-900" />
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black uppercase shadow-xs">
                          Application Lock Active
                        </span>
                        <span className="text-blue-950 font-bold">• Exclusive Hostel Appointment</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed font-medium">
                        As an accredited staff member appointed to <strong className="text-blue-950">{approvedApp.hostelName}</strong>, you remain dedicated to your current job as <strong className="text-blue-950">{approvedApp.role}</strong>. Applications to other hostels are locked unless:
                        <br />
                        <strong>1.</strong> You are removed or sacked by your manager, or
                        <br />
                        <strong>2.</strong> You quit the job using the <strong>Quit Job</strong> button.
                      </p>
                      <div className="pt-1.5 flex items-center gap-2 text-emerald-800 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>You are fully allowed to accept one-time job offers under the Offers tab at any time!</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activePendingApp ? (
              <div className="p-6 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/50 border-2 border-amber-300 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500 text-white rounded-full text-xs font-black uppercase tracking-wider">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Application Pending Manager Review</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900">
                      Position Applied: {activePendingApp.role} at {activePendingApp.hostelName}
                    </h3>
                    <p className="text-xs text-slate-700 font-medium">
                      Submitted on {new Date(activePendingApp.appliedAt).toLocaleDateString()} with verified CV and National ID.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-black shrink-0">
                    Under Review
                  </span>
                </div>

                {/* Constraint Notice */}
                <div className="p-3.5 bg-white/80 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-950 font-semibold">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>
                    <strong>Application Lock Active:</strong> You currently have an application under review by the hostel manager. As per housing policy, you cannot apply or enroll in another role until the manager finalizes their decision (approved or rejected).
                  </span>
                </div>

                {activePendingApp.cvData && (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPreviewCv({ name: activePendingApp.cvFileName || 'Submitted CV', data: activePendingApp.cvData! })}
                      className="px-3.5 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs hover:bg-blue-800 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Submitted CV</span>
                    </button>
                    <span className="text-xs text-slate-500 font-medium">File: {activePendingApp.cvFileName || 'Curriculum_Vitae.pdf'}</span>
                  </div>
                )}
              </div>
            ) : null}

            {/* If previously dismissed / sacked by manager */}
            {dismissedApp && !approvedApp && !activePendingApp && (
              <div className="p-5 bg-rose-50 border border-rose-200 rounded-3xl flex items-start gap-4 text-xs text-rose-950">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-900 text-[10px] font-black uppercase">
                      Appointment Concluded
                    </span>
                    <span className="text-xs text-rose-700 font-bold">• Applications Unlocked</span>
                  </div>
                  <h4 className="text-sm font-black text-rose-950">
                    Previous Appointment at {dismissedApp.hostelName} Ended by Management
                  </h4>
                  <p className="text-xs text-rose-800 leading-relaxed font-medium">
                    Your appointment as <strong>{dismissedApp.role}</strong> was concluded by the hostel manager. Your application lock has been lifted and you are now fully eligible to apply for any available hostel positions below.
                  </p>
                </div>
              </div>
            )}

            {/* If previously quit / resigned voluntarily */}
            {resignedApp && !approvedApp && !activePendingApp && (
              <div className="p-5 bg-sky-50 border border-sky-200 rounded-3xl flex items-start gap-4 text-xs text-sky-950">
                <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-200 text-sky-900 text-[10px] font-black uppercase">
                      Resignation Recorded
                    </span>
                    <span className="text-xs text-sky-700 font-bold">• Applications Unlocked</span>
                  </div>
                  <h4 className="text-sm font-black text-sky-950">
                    Voluntary Resignation Confirmed
                  </h4>
                  <p className="text-xs text-sky-800 leading-relaxed font-medium">
                    You have resigned from your position at {resignedApp.hostelName}. Your application lock has been lifted and you may apply for other accredited hostel jobs below.
                  </p>
                </div>
              </div>
            )}

            {/* If has previous rejected applications, display note */}
            {applications.some(a => a.status === 'Rejected') && !activePendingApp && !approvedApp && !dismissedApp && !resignedApp && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-900">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Previous Application Update:</strong> Your earlier application was reviewed and not accepted at that time. You are now free to apply for any other available staff positions below.
                </div>
              </div>
            )}

            {/* ACCREDITED HOSTELS HIRING DIRECTORY */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Accredited Hostels Hiring Staff</h3>
                  <p className="text-xs text-slate-500 font-medium">Browse verified residences in need of maintenance, security, front desk, and housekeeping personnel.</p>
                </div>
                <span className="text-xs font-bold text-blue-900 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  {hostels.length} Verified Properties
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {hostels.map(h => {
                  const isHiring = h.staffHiringOpen !== false;
                  const openRoles = Array.isArray(h.openStaffRoles) && h.openStaffRoles.length > 0
                    ? h.openStaffRoles
                    : [
                        { role: 'Facilities & Plumbing Technician', vacancies: 2, shift: 'Day Shift' },
                        { role: 'Security & Safety Officer', vacancies: 3, shift: 'Night Shift' },
                        { role: 'Housekeeping Supervisor', vacancies: 1, shift: 'Morning Shift' }
                      ];

                  return (
                    <div 
                      key={h.id}
                      className={`p-5 bg-white border rounded-2xl shadow-sm transition-all space-y-4 flex flex-col justify-between ${
                        selectedHostelId === h.id ? 'border-blue-600 ring-2 ring-blue-600/20' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="relative h-32 rounded-xl overflow-hidden bg-slate-100">
                          <img 
                            src={h.image || h.imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80'} 
                            alt={h.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80';
                            }}
                          />
                          <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-sm">
                            Accredited
                          </div>
                          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-amber-300" />
                            <span>{h.location}</span>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-base font-black text-slate-900">{h.name}</h4>
                          <p className="text-xs text-slate-500 font-medium line-clamp-1">{h.description || 'Modern student community residence.'}</p>
                        </div>

                        {/* Open Staff Roles Chips */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Needed Personnel:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {openRoles.map((r: any, idx: number) => (
                              <span 
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-md text-[10px] font-bold flex-wrap"
                              >
                                <span>{r.role || r}</span>
                                {r.wage && (
                                  <span className="bg-emerald-50 text-emerald-800 rounded px-1 text-[8px] font-black border border-emerald-200">
                                    {r.wage}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-[11px] text-slate-600">
                          <span className="font-bold text-slate-900">{h.managerName || 'Manager'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (approvedApp) {
                              triggerToast(`Application Locked: You are already actively employed as ${approvedApp.role} at ${approvedApp.hostelName}. You cannot apply for other hostel jobs unless you quit or are removed by management.`, 'error');
                              return;
                            }
                            if (!isStaffVerified) {
                              triggerToast('Application Locked: Your account credentials must be verified by Admin first.', 'error');
                              return;
                            }
                            if (activePendingApp) {
                              triggerToast(`Application Locked: You already have a pending application for ${activePendingApp.role} at ${activePendingApp.hostelName}.`, 'error');
                              return;
                            }
                            setSelectedHostelId(h.id);
                            const element = document.getElementById('apply-form-section');
                            element?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          disabled={!isStaffVerified || !!activePendingApp || !!approvedApp}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            selectedHostelId === h.id
                              ? 'bg-blue-900 text-white'
                              : 'bg-slate-100 hover:bg-blue-50 text-slate-800'
                          } ${(!isStaffVerified || activePendingApp || approvedApp) ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {approvedApp ? 'Locked (Employed)' : !isStaffVerified ? 'Locked (Unverified)' : activePendingApp ? 'Locked (Pending)' : selectedHostelId === h.id ? 'Selected' : 'Select Hostel'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* APPLICATION FORM (LOCKED IF EMPLOYED, UNVERIFIED OR PENDING APPLICATION EXISTS) */}
            <div id="apply-form-section" className="p-6 md:p-8 bg-white border border-slate-200/90 rounded-3xl shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Submit Staff Application with CV & ID</h3>
                  <p className="text-xs text-slate-500 font-medium">Your credentials will be forwarded directly to the property manager's notification center.</p>
                </div>
                {approvedApp ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-950 border border-blue-300">
                    <Lock className="w-3.5 h-3.5 text-blue-800" />
                    <span>Locked (Active Employment)</span>
                  </span>
                ) : !isStaffVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Locked (Unverified Credentials)</span>
                  </span>
                ) : activePendingApp ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Locked (Pending Active Application)</span>
                  </span>
                ) : null}
              </div>

              {approvedApp ? (
                <div className="p-8 bg-slate-50 border-2 border-slate-200 rounded-3xl text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-900 to-indigo-950 text-amber-300 flex items-center justify-center mx-auto shadow-md">
                    <Lock className="w-7 h-7" />
                  </div>
                  <div className="space-y-2 max-w-lg mx-auto">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-950 text-[10px] font-black uppercase">
                      Single-Hostel Appointment Enforced
                    </div>
                    <h4 className="text-base font-black text-slate-900">
                      Application Locked: Employed at {approvedApp.hostelName}
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      You are currently hired and verified as <strong>{approvedApp.role}</strong> at <strong>{approvedApp.hostelName}</strong>. You cannot apply for any other hostel jobs unless:
                    </p>
                    <div className="text-left bg-white p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1.5 text-slate-700 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-900 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                        <span>You are sacked or removed by your current hostel manager</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-900 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                        <span>You voluntarily quit / resign from the job</span>
                      </div>
                    </div>
                    <p className="text-xs text-emerald-700 font-bold">
                      Note: You are still allowed to take one-time job offers under the Offers tab!
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowResignModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                    >
                      <LogOutIcon className="w-4 h-4" />
                      <span>Quit Job / Resign Position</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('offers')}
                      className="px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                    >
                      <DollarSign className="w-4 h-4 text-amber-300" />
                      <span>Browse One-Time Job Offers</span>
                    </button>
                  </div>
                </div>
              ) : !isStaffVerified ? (
                <div className="p-8 bg-amber-50/70 border-2 border-dashed border-amber-300 rounded-3xl text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto font-bold shadow-md shadow-amber-500/30">
                    <Lock className="w-6 h-6 animate-pulse" />
                  </div>
                  <h4 className="text-base font-black text-slate-900">Application Options Locked</h4>
                  <p className="text-xs text-slate-700 max-w-lg mx-auto leading-relaxed">
                    Your submitted <strong>CV</strong> and <strong>National ID</strong> documents are undergoing verification review by PineVela Administrators in the <strong>Verified Staffs</strong> portal.
                  </p>
                  <p className="text-xs text-amber-900 font-bold max-w-lg mx-auto">
                    Once an Administrator approves your credentials, job application options will be unlocked immediately!
                  </p>
                </div>
              ) : activePendingApp ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3">
                  <Lock className="w-8 h-8 text-slate-400 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">You have already submitted an application</h4>
                  <p className="text-xs text-slate-600 max-w-md mx-auto">
                    You cannot submit another application until the manager of <strong>{activePendingApp.hostelName}</strong> has made an approval or rejection decision on your current submission.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitApplication} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Choose Hostel */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Target Accredited Hostel *</label>
                      <select
                        value={selectedHostelId}
                        onChange={(e) => setSelectedHostelId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                        required
                      >
                        <option value="">-- Choose a Hostel --</option>
                        {hostels.map(h => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.location})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Desired Staff Role */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Role / Position You Want to Apply For *</label>
                      <select
                        value={appliedRole}
                        onChange={(e) => setAppliedRole(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                        required
                      >
                        <option value="">-- Select Role / Position --</option>
                        {(() => {
                          const selectedHostel = hostels.find(h => h.id === selectedHostelId);
                          const activeRoles = selectedHostel && Array.isArray(selectedHostel.openStaffRoles) && selectedHostel.openStaffRoles.length > 0
                            ? selectedHostel.openStaffRoles
                            : [
                                { role: 'Facilities & Maintenance Technician', wage: 'Negotiable' },
                                { role: 'Plumber & Water Systems Lead', wage: 'Negotiable' },
                                { role: 'Electrician & Backup Power Specialist', wage: 'Negotiable' },
                                { role: 'Head of Security & Gate Operations', wage: 'Negotiable' },
                                { role: 'Security Officer (Night Shift)', wage: 'Negotiable' },
                                { role: 'Front Desk & Operations Assistant', wage: 'Negotiable' },
                                { role: 'Housekeeping & Sanitation Staff', wage: 'Negotiable' },
                                { role: 'Hostel Warden / Residential Assistant', wage: 'Negotiable' }
                              ];
                          return activeRoles.map((r: any, idx: number) => {
                            const title = r.role || r;
                            const wageInfo = r.wage ? ` (Salary: ${r.wage})` : '';
                            return (
                              <option key={idx} value={title}>
                                {title}{wageInfo}
                              </option>
                            );
                          });
                        })()}
                      </select>
                    </div>

                    {/* Contact Phone */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Contact Phone Number *</label>
                      <input
                        type="text"
                        value={applicantPhone}
                        onChange={(e) => setApplicantPhone(e.target.value)}
                        placeholder="+233 24 123 4567"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                        required
                      />
                    </div>
                  </div>

                  {/* FILE UPLOAD SECTION: CV & NATIONAL ID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                    {/* CV / Resume Upload */}
                    <div className="p-5 border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/40 rounded-2xl transition-all space-y-3 text-center animate-pulse-subtle">
                      <FileText className="w-8 h-8 text-blue-600 mx-auto" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">Curriculum Vitae (CV / Resume) *</span>
                        <span className="text-[10px] text-slate-500 font-medium">Upload PDF, DOCX, or Image (Max 5MB)</span>
                      </div>
                      
                      {cvFileName ? (
                        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 font-bold">
                          <span className="truncate max-w-[200px]">{cvFileName}</span>
                          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded">Ready</span>
                        </div>
                      ) : (
                        <label className="inline-block px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-all">
                          <span>Select CV Document</span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,image/*"
                            onChange={(e) => handleFileUpload(e, 'cv')}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    {/* National ID Document Upload */}
                    <div className="p-5 border-2 border-dashed border-red-200 hover:border-red-400 bg-red-50/20 rounded-2xl transition-all space-y-3 text-center">
                      <ShieldCheck className="w-8 h-8 text-red-600 mx-auto" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block text-red-950">National ID Card Document *</span>
                        <span className="text-[10px] text-red-700 font-medium">Clear photo or scan of Ghana Card (Compulsory)</span>
                      </div>

                      {idDocFileName ? (
                        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 font-bold">
                          <span className="truncate max-w-[200px]">{idDocFileName}</span>
                          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded">Attached</span>
                        </div>
                      ) : (
                        <label className="inline-block px-4 py-2 bg-red-900 hover:bg-red-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-all">
                          <span>Upload Ghana Card</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => handleFileUpload(e, 'id')}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Cover Note */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cover Note / Practical Experience *</label>
                    <textarea
                      rows={3}
                      value={coverNote}
                      onChange={(e) => setCoverNote(e.target.value)}
                      placeholder="Briefly state your relevant experience (e.g. 4 years maintaining campus plumbing and borehole pumps). This field is compulsory."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                      required
                    />
                  </div>

                  {/* Submit Action */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <button
                      type="submit"
                      disabled={submittingApp || !cvData}
                      className="px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white text-xs font-black rounded-xl shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {submittingApp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Submitting Application to Manager...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Submit Application to Manager</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: NOTIFICATIONS (APPLICATION UPDATES, NOTICES & DECISIONS) */}
        {/* ========================================================================= */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Notifications & Decisions</h3>
                <p className="text-xs text-slate-500 font-medium">Official updates from property managers regarding your applications and duty assignments.</p>
              </div>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                {notifications.length} Total Notices
              </span>
            </div>

            {notifications.length === 0 ? (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl space-y-3">
                <Bell className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-base font-bold text-slate-800">No New Notifications</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  When a hostel manager reviews your CV, approves your role, or posts updates, notifications will appear here in real time.
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
                      className={`p-5 bg-white border rounded-2xl shadow-xs transition-all space-y-2 ${
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: JOB OFFERS & PROPOSALS */}
        {/* ========================================================================= */}
        {activeTab === 'offers' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">One-Time Job Offers & Hiring Proposals</h3>
                <p className="text-xs text-slate-500 font-medium">Review verified, secure one-time hiring proposals and freelance contracts with full client identity details.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-900 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  {jobOffers.length} Proposal{jobOffers.length === 1 ? '' : 's'}
                </span>
                <span className="text-xs font-bold text-emerald-900 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Verified Requesters</span>
                </span>
              </div>
            </div>

            {/* One-Time Job Offers Policy Note */}
            <div className="p-4 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border border-sky-200 rounded-2xl flex items-start sm:items-center gap-3 text-xs text-blue-950 font-medium shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 border border-blue-200">
                <ShieldCheck className="w-5 h-5 text-blue-700" />
              </div>
              <div className="space-y-0.5">
                <div className="font-bold text-blue-900 flex items-center gap-1.5">
                  <span>Identity-Verified Independent Contracting</span>
                  <span className="px-2 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-black uppercase">Ghana ID Checked</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  {approvedApp ? (
                    <>
                      Although your primary residency appointment is at <strong>{approvedApp.hostelName}</strong>, PineVela permits you to freely accept external one-time contracts with verified upfront wages and location tracking.
                    </>
                  ) : (
                    'Review client credentials, exact work site GPS address, and agreed upfront compensation before accepting.'
                  )}
                </p>
              </div>
            </div>

            {jobOffers.length === 0 ? (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl space-y-3">
                <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-base font-bold text-slate-800">No Job Offers Received Yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  When university residents, hostel managers, or private clients send you a direct one-time job proposal, it will appear here with full identity inspection details.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {jobOffers.map((offer: any) => {
                  const isAccepted = offer.status === 'Accepted';
                  const isDeclined = offer.status === 'Declined';
                  const isPending = !isAccepted && !isDeclined;
                  const cleanPhone = (offer.requesterContact || offer.contact || '').replace(/[^0-9+]/g, '');

                  return (
                    <div key={offer.id} className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-5 flex flex-col justify-between hover:border-blue-300 transition-all">
                      <div className="space-y-4">
                        {/* Header Badge & Date */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isAccepted ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              isDeclined ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                              'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                            }`}>
                              {offer.status || 'Pending Review'}
                            </span>
                            {offer.category && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded-md text-[10px] font-bold border border-blue-200">
                                {offer.category}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {offer.createdAt ? new Date(offer.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                          </span>
                        </div>

                        {/* Title & Trade */}
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-black text-slate-900">{offer.workOffered || offer.title || 'General Maintenance Task'}</h4>
                          </div>
                          {offer.workCategory && (
                            <span className="inline-block mt-1 text-[11px] font-bold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100">
                              🔧 Specialization: {offer.workCategory}
                            </span>
                          )}
                        </div>

                        {/* Requester Identity & Security Box */}
                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-xl bg-blue-900 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                                {offer.requesterName?.[0] || 'C'}
                              </div>
                              <div>
                                <div className="text-xs font-black text-slate-900">{offer.requesterName || 'Private Requester'}</div>
                                <div className="text-[10px] text-slate-500 font-medium">{offer.requesterType || offer.category || 'Verified Client'}</div>
                              </div>
                            </div>
                            {offer.requesterNationalId ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-lg border border-emerald-200 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                <span>ID: {offer.requesterNationalId}</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded-lg border border-blue-100">
                                Campus Verified
                              </span>
                            )}
                          </div>

                          {offer.requesterOrganization && (
                            <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1.5 pt-1 border-t border-slate-200/60">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Property/Hostel: <strong className="text-slate-800">{offer.requesterOrganization}</strong></span>
                            </div>
                          )}
                        </div>

                        {/* Task Scope & Details Grid */}
                        <div className="space-y-2 text-xs text-slate-700 font-medium bg-gradient-to-br from-blue-50/40 via-sky-50/20 to-white p-4 rounded-2xl border border-blue-100 space-y-2.5">
                          {offer.description && (
                            <div className="pb-2 border-b border-blue-100/60">
                              <span className="font-bold text-slate-900 block mb-0.5">Task Description / Issue:</span>
                              <p className="text-[11px] text-slate-600 leading-relaxed bg-white/80 p-2.5 rounded-xl border border-slate-200/60">
                                {offer.description}
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="font-bold text-slate-900">Schedule: </span>
                              <span className="text-slate-700">{offer.timeAndSchedule || offer.schedule || 'Flexible as agreed'}</span>
                            </div>
                            {offer.estimatedDuration && (
                              <div>
                                <span className="font-bold text-slate-900">Est. Duration: </span>
                                <span className="text-slate-700">{offer.estimatedDuration}</span>
                              </div>
                            )}
                            <div className="sm:col-span-2">
                              <span className="font-bold text-slate-900">Location: </span>
                              <button
                                type="button"
                                onClick={() => setViewingOfferMap(offer)}
                                className="text-blue-700 underline font-bold hover:text-blue-900 inline-flex items-center gap-1 cursor-pointer bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-200 ml-1"
                              >
                                <MapPin className="w-3 h-3 text-blue-600 inline" />
                                <span>{offer.location || offer.digitalAddress || 'Campus Area'} (View Map)</span>
                              </button>
                            </div>
                            <div>
                              <span className="font-bold text-emerald-800">Offered Wage: </span>
                              <span className="font-black text-emerald-900">{offer.wageSalary || offer.wage || 'Competitive Rate'}</span>
                            </div>
                            {offer.paymentMethod && (
                              <div>
                                <span className="font-bold text-slate-900">Payment Mode: </span>
                                <span className="text-slate-700">{offer.paymentMethod}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Direct Requester Contact Options */}
                        <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-blue-600" />
                            <span>{offer.requesterContact || offer.contact || offer.requesterEmail || 'Contact on file'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {cleanPhone && (
                              <>
                                <a
                                  href={`tel:${cleanPhone}`}
                                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                                >
                                  <Phone className="w-3 h-3 text-emerald-600" />
                                  <span>Call</span>
                                </a>
                                <a
                                  href={`https://wa.me/${cleanPhone.replace('+', '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                                >
                                  <span>WhatsApp</span>
                                </a>
                              </>
                            )}
                            {offer.requesterEmail && (
                              <a
                                href={`mailto:${offer.requesterEmail}`}
                                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                              >
                                <Mail className="w-3 h-3 text-blue-600" />
                                <span>Email</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Footer */}
                      <div className="pt-2 border-t border-slate-100">
                        {isAccepted ? (
                          <div className="w-full py-3 bg-emerald-50 text-emerald-800 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border border-emerald-200">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                            <span>Offer Accepted & Contact Dispatched!</span>
                          </div>
                        ) : isDeclined ? (
                          <div className="w-full py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-semibold text-xs flex items-center justify-center gap-2 border border-slate-200">
                            <XCircle size={15} className="text-slate-400" />
                            <span>Offer Declined ({offer.declineReason || 'Schedule conflict'})</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              onClick={() => setDeclineOfferModal(offer)}
                              className="w-full py-2.5 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200 rounded-2xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <X size={14} />
                              <span>Decline Offer</span>
                            </button>
                            <button
                              onClick={() => handleAcceptOffer(offer.id)}
                              className="w-full py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-2xl font-black text-xs shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                            >
                              <Check size={16} />
                              <span>Accept Job Offer</span>
                            </button>
                          </div>
                        )}
                      </div>
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
          <div className="max-w-2xl bg-white border border-slate-200/90 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
            <div className="border-b pb-4">
              <h3 className="text-lg font-black text-slate-900">Staff Account Settings</h3>
              <p className="text-xs text-slate-500 font-medium">
                Update your contact phone, email address, profile picture, and username. Any changes made here are directly synchronized with your manager's staff management directory.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Profile Picture Upload & Preview */}
              <div className="flex items-center gap-5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
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
                  <label className="absolute -bottom-1.5 -right-1.5 p-1.5 bg-blue-900 text-white rounded-xl shadow-md cursor-pointer hover:bg-blue-800 transition-all">
                    <Camera className="w-3.5 h-3.5" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleProfilePhotoUpload} 
                      className="hidden" 
                    />
                  </label>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-900">Profile Picture</h4>
                  <p className="text-[10px] text-slate-500">Tap camera icon to upload a passport-size photo. Shows on manager roster.</p>
                  <input
                    type="text"
                    value={settingsPhoto}
                    onChange={(e) => setSettingsPhoto(e.target.value)}
                    placeholder="Or enter image URL"
                    className="w-full px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    placeholder="e.g. Kwame Mensah"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username (Login ID)</label>
                  <input
                    type="text"
                    value={settingsUsername}
                    onChange={(e) => setSettingsUsername(e.target.value)}
                    placeholder="e.g. kwame_staff"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Contact Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (Direct Line)</label>
                  <input
                    type="text"
                    value={settingsPhone}
                    onChange={(e) => setSettingsPhone(e.target.value)}
                    placeholder="+233 24 123 4567"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={settingsEmail}
                    onChange={(e) => setSettingsEmail(e.target.value)}
                    placeholder="kwame@example.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
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
        {activeTab === 'chat' && (
          <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[480px] bg-white border border-blue-200 rounded-3xl shadow-md overflow-hidden" id="staff-secure-chat-container">
            {/* Encryption Header Banner */}
            <div className="bg-slate-900/90 backdrop-blur-md text-sky-100 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10" id="chat-security-banner">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-blue-800/80 backdrop-blur-sm rounded-lg text-amber-300">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black tracking-wide uppercase flex items-center gap-1.5">
                    <span>Secured Live Connection</span>
                    <span className="px-1.5 py-0.5 bg-sky-500 text-slate-950 text-[8px] font-black rounded">AES-256</span>
                  </h3>
                  <p className="text-[10px] text-blue-300 font-medium">End-to-end server encrypted. Invisible to Admins & third-parties.</p>
                </div>
              </div>
              <div className="text-[10px] bg-slate-950/50 backdrop-blur-sm text-blue-300 font-mono px-2.5 py-1 rounded-lg border border-white/10 self-start sm:self-auto">
                Room Handshake: Verified Active
              </div>
            </div>

            {/* Main Chat Workspace */}
            <div className="flex-1 flex overflow-hidden bg-slate-50/50" id="chat-main-workspace">
              {/* Sidebar (Only shown if multiple rooms exist, but usually 1) */}
              {chatRooms.length > 1 && (
                <div className="w-64 border-r border-slate-200/80 bg-white hidden md:flex flex-col overflow-y-auto p-4 space-y-2" id="chat-rooms-list">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Active Channels</p>
                  {chatRooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoomId(r.id)}
                      className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-2.5 border ${
                        selectedRoomId === r.id
                          ? 'bg-blue-50 border-blue-200 text-blue-950 font-bold'
                          : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
                      <div className="truncate text-xs">
                        <div className="font-bold truncate">{r.managerName || 'Property Manager'}</div>
                        <div className="text-[10px] text-slate-400 truncate font-mono">{r.hostelName}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Window */}
              <div className="flex-1 flex flex-col h-full bg-white relative" id="chat-window-pane">
                {selectedRoomId ? (
                  <>
                    {/* Active Conversation Header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white" id="chat-active-header">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-black text-sm uppercase">
                          {(chatRooms.find(r => r.id === selectedRoomId)?.managerName || 'M').substring(0, 2)}
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">
                            {chatRooms.find(r => r.id === selectedRoomId)?.managerName || 'Property Manager'}
                          </h4>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <span>Hostel Channel:</span>
                            <span className="text-blue-700 font-black">{chatRooms.find(r => r.id === selectedRoomId)?.hostelName || 'Accredited Residence'}</span>
                          </span>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200/50 text-blue-800 text-[10px] font-bold px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse" />
                        <span>Connected</span>
                      </div>
                    </div>

                    {/* Chat Messages Log */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/40" id="chat-messages-log">
                      {chatMessagesList.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3" id="chat-empty-state">
                          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <MessageSquare className="w-6 h-6 animate-pulse" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-700">Encrypted Chat Channel Initiated</p>
                            <p className="text-[10px] text-slate-400 max-w-xs mx-auto mt-0.5">Send a secure live message to begin communicating directly with your Property Manager.</p>
                          </div>
                        </div>
                      ) : (
                        chatMessagesList.map((m) => {
                          const isMe = m.senderId === user?.id;
                          return (
                            <div
                              key={m.id}
                              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}
                              id={`msg-${m.id}`}
                            >
                              {/* Message Header */}
                              <span className="text-[9px] text-slate-400 font-bold mb-1 px-1">
                                {isMe ? 'You (Staff)' : `${m.senderName} (Manager)`} • {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              
                              {/* Message Bubble */}
                              <div
                                className={`px-4 py-2.5 text-xs font-medium leading-relaxed shadow-xs max-w-md ${
                                  isMe
                                    ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none'
                                    : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-none'
                                }`}
                              >
                                {m.content}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Chat Message Input Bar */}
                    <form onSubmit={handleSendChatMessage} className="p-4 border-t border-slate-100 bg-white flex gap-3 items-center" id="chat-input-form">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a secure, encrypted message to your manager..."
                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                        disabled={sendingMsg}
                        required
                      />
                      <button
                        type="submit"
                        disabled={sendingMsg || !newMessage.trim()}
                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center disabled:opacity-50 shrink-0"
                        title="Send secure message"
                      >
                        {sendingMsg ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3" id="chat-no-room-state">
                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700 font-sans">No Active Encrypted Channels</p>
                      <p className="text-[10px] text-slate-400 max-w-xs mx-auto mt-0.5">Secure communication room is established automatically once a Property Manager reviews and approves an active employment application.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* View Offer Precise Location Modal */}
      {viewingOfferMap && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-900" />
                  <span>Precise Job Offer Location</span>
                </h3>
                <p className="text-xs text-slate-500">{viewingOfferMap.location}</p>
              </div>
              <button 
                onClick={() => setViewingOfferMap(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-slate-700 font-medium">
                <span className="font-bold">Client / Requesters:</span> {viewingOfferMap.requesterName} ({viewingOfferMap.contact || viewingOfferMap.requesterContact || viewingOfferMap.requesterEmail})
              </div>
              <div className="text-xs text-slate-700 font-medium">
                <span className="font-bold">Work:</span> {viewingOfferMap.workOffered}
              </div>
              <div id="staff-offer-map-view" className="w-full h-72 rounded-2xl border border-slate-300 shadow-inner z-0"></div>
            </div>

             <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingOfferMap(null)}
                className="px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Close Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: ASSIGNED MAINTENANCE WORK ORDERS (VOCATIONAL STAFF WORKFLOW) */}
      {/* ========================================================================= */}
      {activeTab === 'maintenance' && approvedApp && (
        <div className="space-y-6 pt-3">
          <div className="p-6 bg-gradient-to-r from-sky-400/20 via-blue-500/15 to-indigo-400/20 backdrop-blur-xl border border-sky-300/50 text-slate-900 rounded-3xl shadow-xl relative overflow-hidden mt-2">
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-sky-200/20 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black uppercase tracking-wider border border-emerald-300">
                  Active Duty Dispatch
                </span>
                <span className="text-xs text-blue-900 font-semibold">• Hostel: {approvedApp.hostelName}</span>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Vocational Repair Desk</h3>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed font-medium">
                Manage, diagnose, and resolve repair requests assigned to you by the hostel manager. Maintain strict SLA timeframes to avoid delay penalties.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {assignedIssues.length === 0 ? (
              <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-3xl p-8 space-y-3">
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
                const isTaskCompleted = issue.status === 'Resolved' || issue.status === 'Closed' || issue.staffCompleted || issue.closedByManager || issue.isClosed;
                const isOverdue = !isTaskCompleted && issue.deadline && new Date() > new Date(issue.deadline);
                
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
                  <div key={issue.id} className="p-5 sm:p-6 bg-white border border-slate-200 rounded-3xl shadow-xs hover:shadow-md transition-all space-y-4">
                    
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
                      {isTaskCompleted ? (
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
                            <img 
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
                      {issue.rescheduleRequested && (
                        <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full font-bold">
                          🕒 SLA Timeframe Extension pending manager approval
                        </span>
                      )}
                    </div>

                    {/* ACTIVE FLOW BUTTONS */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-3">
                      {/* Case A: Dispatch Not Acknowledged yet */}
                      {(issue.status === 'Open' || issue.status === 'Pending') && !issue.staffCompleted && !issue.staffDeclineRequested && (
                        <div className="w-full flex flex-col sm:flex-row gap-3">
                          <button
                            onClick={() => handleAcceptAssignment(issue.id)}
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            <span>Acknowledge & Set In Progress</span>
                          </button>
                          <button
                            onClick={() => setShowCompleteModal(issue)}
                            className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Mark Resolved</span>
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
                      {issue.status === 'In Progress' && !issue.staffCompleted && (
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
                              <span>Repair Fix Submitted &bull; Awaiting Resident Sign-off</span>
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
                              <img 
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

      {/* Decline Dialog Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-55 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-200/80 space-y-5">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Decline Work Order Assignment</h3>
              <button onClick={() => setShowDeclineModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                State why you cannot attend to this issue at this time. The manager will be instantly notified to reassign the repair.
              </p>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">REASON FOR DECLINING <span className="text-rose-500">*</span></label>
                <textarea
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
        </div>
      )}

      {/* Reschedule/SLA Extension Modal */}
      {showRescheduleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-55 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-200/80 space-y-5">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Request SLA Timeframe Extension</h3>
              <button onClick={() => setShowRescheduleModal(null)} className="text-slate-400 hover:text-slate-600">
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
                  <select
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
                  <textarea
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
        </div>
      )}

      {/* Completion Signoff Modal with Image attachment upload */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-55 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-200/80 space-y-5">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Submit Repair Resolution Details</h3>
              <button onClick={() => setShowCompleteModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Provide comprehensive remarks about what repairs were carried out, along with a picture proof if applicable, to allow resident verification.
              </p>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">COMPLETION REMARKS <span className="text-rose-500">*</span></label>
                <textarea
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
                      <button 
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
        </div>
      )}

      {/* ZOOMED IMAGE OVERLAY */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QUIT / RESIGN FROM JOB & BARGAIN MODAL — CRYSTAL FROSTY BLUE PINEVELA THEME */}
      {showResignModal && approvedApp && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-2xl rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl shadow-blue-950/25 border border-blue-200/80 space-y-5 animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
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
                    Position: <strong className="text-blue-900">{approvedApp.role}</strong> at <strong className="text-blue-900">{approvedApp.hostelName}</strong>
                  </p>
                </div>
              </div>
              <button
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

              <textarea
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
                    <Sparkles className="w-4 h-4 text-blue-600" />
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
                    Submit your reason and officially terminate employment immediately. Application lock will be lifted.
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
                  <input
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
                  <input
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
                  <li>Your official employment at <strong className="text-blue-900">{approvedApp.hostelName}</strong> ends immediately.</li>
                  <li>Your manager is notified of your resignation and submitted reason.</li>
                  <li><strong className="text-blue-900">Your application lock will be lifted</strong>, allowing you to apply for any other hostel position.</li>
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
                    <Sparkles className="w-4 h-4" />
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
        </div>
      )}

      {/* MODAL: DECLINE JOB OFFER */}
      {declineOfferModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2.5 text-rose-700 font-black text-base">
                <XCircle className="w-5 h-5 text-rose-600" />
                <span>Decline Job Offer</span>
              </div>
              <button
                onClick={() => setDeclineOfferModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              You are declining the proposal for <strong>{declineOfferModal.workOffered || 'this task'}</strong> from <strong>{declineOfferModal.requesterName}</strong>. Please select or state your reason:
            </p>

            <div className="space-y-2">
              {[
                'Schedule conflict with current hostel maintenance tasks',
                'Task location is outside my operating coverage area',
                'Required materials/equipment are unavailable',
                'Offered wage is below standard service rate'
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setDeclineOfferReason(reason)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    declineOfferReason === reason
                      ? 'bg-rose-50 border-rose-300 text-rose-950 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">Custom note to client:</label>
              <textarea
                value={declineOfferReason}
                onChange={(e) => setDeclineOfferReason(e.target.value)}
                rows={2}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-rose-400"
                placeholder="Type reason here..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeclineOfferModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Keep Offer
              </button>
              <button
                type="button"
                onClick={handleDeclineOffer}
                className="px-5 py-2 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md transition-all cursor-pointer"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
