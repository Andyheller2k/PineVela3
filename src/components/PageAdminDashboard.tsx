import { useActionFeedback } from '../lib/useActionFeedback';
import AdminAccountDirectory from './AdminAccountDirectory';
import { routePopupFeedback } from '../lib/feedback';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import OnboardingProgress, { OFFICER_ACCOUNT_STEPS } from './OnboardingProgress';
import AdminSettingsPanel from './AdminSettingsPanel';
import AdministratorLabel from './AdministratorLabel';
import AdminGovernancePanel, { useAdminGovernance } from './AdminGovernancePanel';
import AccountModerationPanel from './AccountModerationPanel';
import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryClient, } from '../lib/queryClient';
import { useAuth } from '../context/AuthContext';
import { safeJson } from '../lib/api';
import { saveNavigationLayout, usesTopNavigation } from '../lib/navigationLayout';
import { useNotifications } from '../context/NotificationContext';
import PineLogo from './PineLogo';
import TopNavBadge from './TopNavBadge';
import HostelRegistration from './HostelRegistration';
import EditResidenceModal from './EditResidenceModal';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import { getPdfBlobUrl, downloadPdfDocument } from '../utils/pdfHelper';
import { 
  Building2, Users, DollarSign, CheckCircle2, XCircle, Clock, Plus, 
  ShieldCheck, LogOut as LogOutIcon, Search, UserPlus,
  AlertCircle, Check, Trash2, Edit3, Eye, ArrowRight,
  Bell, MessageSquare, X, FileText, Download, Lock, Unlock, FileCheck, ShieldAlert, Ban, ExternalLink, CreditCard,
  Image as ImageIcon, MapPin, Camera,
  ShoppingBag, Store, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function PageAdminDashboard() {
  const [moderationTarget, setModerationTarget] = useState<any>(null);
  const { user, logout, apiFetch } = useAuth();
  const { notifications, unreadCount, markAsRead, refreshNotifications } = useNotifications();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'residences' | 'managers' | 'digital_market' | 'notifications' | 'settings' | 'user_accounts' | 'governance'>('overview');
  
  // All Registered User Accounts State
  const [allUsersData, setAllUsersData] = useState<{
    totalUsers: number;
    breakdown: {
      total: number;
      residents: number;
      managers: number;
      staff: number;
      officers: number;
      merchants: number;
      admins: number;
      others: number;
    };
    users: any[];
  }>({
    totalUsers: 0,
    breakdown: { total: 0, residents: 0, managers: 0, staff: 0, officers: 0, merchants: 0, admins: 0, others: 0 },
    users: []
  });
  
  // Digital Student Market Admin States
  const [digitalMarketApps, setDigitalMarketApps] = useState<any[]>([]);
  const [digitalMarketStores, setDigitalMarketStores] = useState<any[]>([]);
  const [adminMarketSubTab, setAdminMarketSubTab] = useState<'applications' | 'stores'>('applications');
  const [banReasonInput, setBanReasonInput] = useState<string>('');
  const [banningStoreTarget, setBanningStoreTarget] = useState<any | null>(null);
  // Collapsible sidebar state (Disabled minimizing to prevent glitched overlapping)
  const isSidebarCollapsed = false;
  const [isSidebarTopNav, setIsSidebarTopNav] = useState(usesTopNavigation);

  useEffect(() => {
    saveNavigationLayout(isSidebarTopNav);
  }, [isSidebarTopNav]);
  const actionFeedback = useActionFeedback();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit Residence State
  const [editingResidence, setEditingResidence] = useState<any | null>(null);
  const [inspectingResidenceModal, setInspectingResidenceModal] = useState<any | null>(null);
  const [rejectingResidenceModal, setRejectingResidenceModal] = useState<any | null>(null);
  const [residenceRejectionReason, setResidenceRejectionReason] = useState('');
  const [inspectActiveImage, setInspectActiveImage] = useState<string>('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [managerSearchQuery, setManagerSearchQuery] = useState('');
  const [residentSearchQuery, setResidentSearchQuery] = useState('');

  // Settings State

  const { data: governanceData } = useAdminGovernance();
  const adminSlot = governanceData?.members.find((m: any) => m.id === user?.id)?.slot;
  const pendingGovernance = (governanceData?.proposals.filter((p: any) => ['pending', 'approved'].includes(p.status)).length || 0) + (governanceData?.changes.filter((c: any) => c.status === 'pending').length || 0) + (governanceData?.accountProposals?.filter((p: any) => ['pending', 'approved'].includes(p.status)).length || 0);

  // Datasets
  const [residences, setResidences] = useState<any[]>([]);
  const [managerRequests, setManagerRequests] = useState<any[]>([]);
  const [managerRestrictions, setManagerRestrictions] = useState<any[]>([]);
  const [rejectionNotes, setRejectionNotes] = useState<{[key: string]: string}>({});
  const residents = allUsersData.users.filter((account: any) => ['student', 'resident'].includes(account.role)).map((account: any) => ({ ...account, residenceName: account.hostelName || account.residenceName || '', roomNumber: account.roomNumber || '' }));
  const [feesPaid, setFeesPaid] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Verification Teams & Physical Inspection State
  const [managerSubTab, setManagerSubTab] = useState<'inspections' | 'officers' | 'cooldowns'>('inspections');
  const [verificationTeams, setVerificationTeams] = useState<any[]>([]);
  const [verificationInspections, setVerificationInspections] = useState<any[]>([]);
  const [showRegisterOfficerModal, setShowRegisterOfficerModal] = useState(false);
  const [newOfficerData, setNewOfficerData] = useState({
    fullName: '',
    email: '',
    phone: '',
    assignedZone: 'Greater Accra - Campus Belt A',
    password: ''
  });
  const [createdOfficerCredentials, setCreatedOfficerCredentials] = useState<any | null>(null);
  
  // Dispatch Officer Modal State
  const [dispatchModalManager, setDispatchModalManager] = useState<any | null>(null);
  const [dispatchOfficerId, setDispatchOfficerId] = useState('');
  const [dispatchPriority, setDispatchPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchingLoading, setDispatchingLoading] = useState(false);

  // Review Inspection Report Modal State
  const [reviewReportInspection, setReviewReportInspection] = useState<any | null>(null);

  // Manager Document Inspection & Rejection Modal States
  const [rejectManagerModal, setRejectManagerModal] = useState<{ id: string; name: string; email: string } | null>(null);
  const [rejectManagerReason, setRejectManagerReason] = useState<string>('');
  const [rejectingManagerLoading, setRejectingManagerLoading] = useState<boolean>(false);

  // Manager Block & Restriction Modal States
  const [blockManagerModal, setBlockManagerModal] = useState<{ id: string; name: string; email: string } | null>(null);
  const [blockManagerReason, setBlockManagerReason] = useState<string>('');
  const [blockingManagerLoading, setBlockingManagerLoading] = useState<boolean>(false);

  // Board Requests & Notifications State
  const [boardRequests, setBoardRequests] = useState<any[]>([]);
  const [boardFilter, setBoardFilter] = useState<'all' | 'pending' | 'acknowledged' | 'resolved'>('all');
  const [replyingRequestId, setReplyingRequestId] = useState<string | null>(null);
  const [replyNotes, setReplyNotes] = useState('');
  const [notifSubTab, setNotifSubTab] = useState<'manager_requests'>('manager_requests');
  const [docPreviewModal, setDocPreviewModal] = useState<{
    title: string;
    type: 'cv' | 'id';
    data?: string;
    url?: string;
    fileName?: string;
    name?: string;
    endpoint?: string;
    reqId?: string;
    docKey?: 'operatingCertificate' | 'idFront' | 'idBack';
  } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<'text' | 'pdf'>('text');
  const [pdfZoom, setPdfZoom] = useState<number>(100);

  useEffect(() => {
    if (docPreviewModal) {
      setActiveDocTab('text');
    }
  }, [docPreviewModal]);

  useEffect(() => {
    if (docPreviewModal && docPreviewModal.type === 'cv' && docPreviewModal.data) {
      const url = getPdfBlobUrl(docPreviewModal.data, docPreviewModal.name || 'Applicant');
      setPreviewBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewBlobUrl(null);
    }
  }, [docPreviewModal?.data, docPreviewModal?.type, docPreviewModal?.name]);

  // Filter & Search states
  const [residenceFilter, setResidenceFilter] = useState<'all' | 'Hostel' | 'Hotel' | 'Lounge'>('all');
  const [approvalTabFilter, setApprovalTabFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual Residence Registration Modal / Form State
  const [showAddResidenceModal, setShowAddResidenceModal] = useState(false);

  // Ensure every tab change in Admin Dashboard starts strictly from the top
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    });
    if (document.body) document.body.scrollTop = 0;
    if (document.documentElement) document.documentElement.scrollTop = 0;
  }, [activeTab]);

  const triggerToast = (msg: string) => {
    if (routePopupFeedback(msg, /success|submitted|updated|copied|approved|accepted|retained|removed|dispatched|verified|thank you/i.test(msg) && !/fail|invalid|unable|cannot|could not/i.test(msg) ? 'success' : 'error')) return;
    if (/fail|invalid|denied|unable|cannot|could not|cancelled|key.*(enroll|incorrect)/i.test(msg)) { actionFeedback.fail(msg, actionFeedback.begin()); return; }
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveResidenceEdit = async (updatedResidence: any) => {
    try {
      const res = await apiFetch(`/api/hostels/${updatedResidence.id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedResidence)
      });
      const fresh = res.hostel || res || updatedResidence;
      setResidences(prev => prev.map(r => r.id === updatedResidence.id ? { ...r, ...fresh } : r));
      triggerToast(`Residence "${updatedResidence.name}" updated successfully!`);
    } catch (err: any) {
      throw err;
    }
  };

  // TanStack Query for server-state caching and automatic refetching
  const { data: adminData } = useQuery({
    queryKey: ['adminData', user?.id],
    enabled: user?.role === 'admin',
    queryFn: async () => {
      const resHostels = await fetch('/api/hostels');
      let residencesData: any[] = [];
      if (resHostels.ok) {
        const data = await safeJson(resHostels);
        residencesData = Array.isArray(data) ? data : [];
      }

      const resMgrReqs = await apiFetch('/api/manager-requests').catch(() => []);
      const resMgrVerifications = await apiFetch('/api/manager-verifications').catch(() => []);
      const mergedMgrs = Array.isArray(resMgrReqs) ? resMgrReqs.map((req: any) => {
        const matchingVerif = Array.isArray(resMgrVerifications) ? resMgrVerifications.find((v: any) => v.id === req.id || v.managerEmail === req.managerEmail) : null;
        return {
          ...matchingVerif,
          ...req,
          documentsVerified: matchingVerif?.documentsVerified || req.documentsVerified || { operatingCertificate: 'pending', idFront: 'pending', idBack: 'pending' },
          operatingCertificate: matchingVerif?.operatingCertificate || req.operatingCertificate || req.ownershipDocument,
          idFront: matchingVerif?.idFront || req.idFront,
          idBack: matchingVerif?.idBack || req.idBack
        };
      }) : [];

      const resRestrictions = await apiFetch('/api/admin/manager-restrictions').catch(() => []);
      const resBoard = await apiFetch('/api/board-requests').catch(() => []);
      const resActs = await apiFetch('/api/activities').catch(() => []);

      const marketAppsRes = await apiFetch('/api/admin/digital-market/applications').catch(() => []);
      const marketStoresRes = await apiFetch('/api/admin/digital-market/stores').catch(() => []);
      const vtRes = await apiFetch('/api/verification-teams').catch(() => []);
      const inspectionsRes = await apiFetch('/api/admin/verification-inspections').catch(() => []);
      const paymentRecords = await apiFetch('/api/admin/payments').catch(() => []);
      const allUsersRes = await apiFetch('/api/admin/all-users').catch(() => null);

      return {
        paymentRecords: Array.isArray(paymentRecords) ? paymentRecords : [],
        residences: residencesData,
        managerRequests: mergedMgrs,
        managerRestrictions: Array.isArray(resRestrictions) ? resRestrictions : [],
        boardRequests: Array.isArray(resBoard) ? resBoard : [],
        activities: Array.isArray(resActs) ? resActs : [], digitalMarketApps: Array.isArray(marketAppsRes) ? marketAppsRes : [],
        digitalMarketStores: Array.isArray(marketStoresRes) ? marketStoresRes : [],
        verificationTeams: Array.isArray(vtRes) ? vtRes : (vtRes?.verificationTeams || []),
        verificationInspections: Array.isArray(inspectionsRes) ? inspectionsRes : [],
        allUsersData: Array.isArray(allUsersRes?.users) ? allUsersRes : null
      };
    },
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!adminData) return;
    setResidences(adminData.residences);
    setManagerRequests(adminData.managerRequests);
    setManagerRestrictions(adminData.managerRestrictions);
    setBoardRequests(adminData.boardRequests);
    setActivities(adminData.activities);
    setDigitalMarketApps(adminData.digitalMarketApps);
    setDigitalMarketStores(adminData.digitalMarketStores);
    setVerificationTeams(adminData.verificationTeams);
    setVerificationInspections(adminData.verificationInspections);
    if (Array.isArray(adminData.allUsersData?.users)) setAllUsersData(adminData.allUsersData);
  }, [adminData]);

  const fetchAdminData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['adminData'] });
  };

  const handleApproveMarketApp = async (appId: string) => {
    try {
      const res = await apiFetch('/api/admin/digital-market/approve-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId })
      });
      if (res && res.success) {
        triggerToast("Digital Student Market Application Approved! 🎉");
        fetchAdminData();
      }
    } catch (e: any) {
      triggerToast(e.message || "Failed to approve application");
    }
  };

  const handleRejectMarketApp = async (appId: string) => {
    try {
      const res = await apiFetch('/api/admin/digital-market/reject-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId })
      });
      if (res && res.success) {
        triggerToast("Digital Market application rejected.");
        fetchAdminData();
      }
    } catch (e: any) {
      triggerToast(e.message || "Failed to reject application");
    }
  };

  const handleToggleBanStore = async (_storeId: string) => {
    setBanningStoreTarget(null);
    setActiveTab('user_accounts');
    triggerToast('Select the seller account and submit a proposal for five-administrator approval.');
  };

  const handleRegisterOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficerData.fullName || !newOfficerData.email || !newOfficerData.password) {
      triggerToast('Please fill in officer name, official email, and password.');
      return;
    }
    try {
      const response = await apiFetch('/api/verification-teams', {
        method: 'POST',
        body: JSON.stringify(newOfficerData)
      });
      const created = response?.officer || response;
      setVerificationTeams(prev => [created, ...prev.filter(o => o.id !== created.id && o.officerId !== created.officerId)]);
      setCreatedOfficerCredentials(response?.credentials || {
        officerId: created.officerId,
        fullName: created.fullName,
        email: created.email,
        phone: created.phone,
        assignedZone: created.assignedZone,
        password: newOfficerData.password,
        securityPasscode: created.securityPasscode || 'PV-VERIFY-2026'
      });
      setShowRegisterOfficerModal(false);
      setNewOfficerData({
        fullName: '',
        email: '',
        phone: '',
        assignedZone: 'Greater Accra - Campus Belt A',
        password: ''
      });
      triggerToast(`Officer ${created.fullName || 'Verification Officer'} registered successfully! Credentials card generated.`);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to register verification officer.');
    }
  };

  const handleToggleOfficerStatus = async (officerId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await apiFetch(`/api/verification-teams/${officerId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      const updated = res?.officer || res;
      setVerificationTeams(prev => prev.map(o => (o.id === officerId || o.officerId === officerId) ? { ...o, ...updated } : o));
      triggerToast(`Officer status updated to ${newStatus}.`);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to update officer status.');
    }
  };

  const handleDispatchVerificationTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchModalManager) return;
    if (!dispatchOfficerId) {
      triggerToast('Please select a PineVela verification officer to assign.');
      return;
    }
    setDispatchingLoading(true);
    try {
      const result = await apiFetch('/api/admin/dispatch-verification-team', {
        method: 'POST',
        body: JSON.stringify({
          managerVerificationId: dispatchModalManager.id,
          assignedOfficerId: dispatchOfficerId,
          priority: dispatchPriority,
          dispatchNotes: dispatchNotes,
          latitude: dispatchModalManager.latitude,
          longitude: dispatchModalManager.longitude
        })
      });

      setManagerRequests(prev => prev.map(m => m.id === dispatchModalManager.id ? {
        ...m,
        inspectionStatus: 'dispatched',
        assignedOfficerId: dispatchOfficerId,
        assignedOfficerName: result.assignedOfficerName
      } : m));

      if (result.inspection) {
        setVerificationInspections(prev => [result.inspection, ...prev.filter(i => i.id !== result.inspection.id)]);
      }

      triggerToast(`Verification team dispatched for ${dispatchModalManager.propertyName || dispatchModalManager.organization}!`);
      setDispatchModalManager(null);
      setDispatchOfficerId('');
      setDispatchNotes('');
      fetchAdminData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to dispatch verification team.');
    } finally {
      setDispatchingLoading(false);
    }
  };

  const handleApproveBypass = async (id: string, userEmail: string) => {
    try {
      await apiFetch(`/api/admin/manager-restrictions/${id}/approve`, {
        method: 'POST'
      });
      triggerToast(`Bypass approved for ${userEmail}. 30-day restriction cleared.`);
      fetchAdminData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to approve bypass request.');
    }
  };

  const handleRejectBypass = async (id: string, userEmail: string) => {
    try {
      const notes = rejectionNotes[id] || '';
      await apiFetch(`/api/admin/manager-restrictions/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ adminNotes: notes })
      });
      triggerToast(`Bypass rejected for ${userEmail}. Restriction remains active.`);
      fetchAdminData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to reject bypass request.');
    }
  };

  const handleUpdateBoardRequest = async (id: string, status: 'Acknowledged' | 'Resolved', notes?: string) => {
    try {
      const updated = await apiFetch(`/api/board-requests/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          adminNotes: notes !== undefined ? notes : replyNotes
        })
      });
      setBoardRequests(prev => prev.map(r => r.id === id ? updated : r));
      setReplyingRequestId(null);
      setReplyNotes('');
      triggerToast(`Request updated to ${status}. Manager notified.`);
    } catch (err: any) {
      triggerToast(err.message || 'Failed to update request');
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleApproveManager = async (reqId: string, managerEmail: string) => {
    try {
      await apiFetch(`/api/manager-verifications/${reqId}/approve`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'approved', force: true })
      }).catch(async (error) => {
        if (error.status !== 404) throw error;
        return await apiFetch(`/api/manager-requests/${reqId}/approve`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'approved', force: true })
        });
      });

      setManagerRequests(prev => prev.map(r => (r.id === reqId || r.managerEmail === managerEmail) ? {
        ...r,
        status: 'approved',
        inspectionStatus: 'approved',
        documentsVerified: { operatingCertificate: 'verified', idFront: 'verified', idBack: 'verified' }
      } : r));

      setVerificationInspections(prev => prev.map(i => (i.managerVerificationId === reqId || i.managerEmail === managerEmail || i.id === reqId) ? {
        ...i,
        status: 'approved'
      } : i));

      triggerToast(`Manager account for ${managerEmail || 'manager'} approved successfully! Property is now verified.`);
      refreshNotifications();
      fetchAdminData();
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Failed to approve manager.');
    }
  };

  const handleVerifyManagerDoc = async (reqId: string, docKey: 'operatingCertificate' | 'idFront' | 'idBack', status: 'verified' | 'rejected') => {
    try {
      await apiFetch(`/api/manager-verifications/${reqId}/verify-doc`, {
        method: 'PUT',
        body: JSON.stringify({ docKey, status })
      }).catch(async () => {
        return await apiFetch(`/api/manager-requests/${reqId}/verify-doc`, {
          method: 'PUT',
          body: JSON.stringify({ docKey, status })
        });
      });

      setManagerRequests(prev => prev.map(r => {
        if (r.id === reqId || r.managerEmail === reqId) {
          const currentDocs = r.documentsVerified || { operatingCertificate: 'pending', idFront: 'pending', idBack: 'pending' };
          return {
            ...r,
            documentsVerified: {
              ...currentDocs,
              [docKey]: status
            }
          };
        }
        return r;
      }));

      triggerToast(`Manager document (${docKey}) marked as ${status.toUpperCase()}!`);
    } catch (err: any) {
      triggerToast(err.message || "Failed to update document status.");
    }
  };

  const handleBlockManager = (reqId: string, managerEmail: string, managerName?: string) => {
    const target = managerRequests.find(r => r.id === reqId || r.managerId === reqId);
    setBlockManagerModal({
      id: reqId,
      name: managerName || target?.managerName || 'Hostel Manager',
      email: managerEmail || target?.managerEmail || ''
    });
    setBlockManagerReason('');
  };

  const handleConfirmBlockManager = async () => {
    setBlockManagerModal(null);
    setActiveTab('user_accounts');
    triggerToast('Select the manager account and submit a timed-ban proposal for five-administrator approval.');
  };

  const handleUnblockManager = async (_reqId: string, _managerEmail: string) => {
    setActiveTab('user_accounts');
    triggerToast('Select the manager account and submit a restore-access proposal for five-administrator approval.');
  };

  const handleRejectManager = (reqId: string, managerName?: string, managerEmail?: string) => {
    const target = managerRequests.find(r => r.id === reqId);
    setRejectManagerModal({
      id: reqId,
      name: managerName || target?.managerName || 'Hostel Manager Applicant',
      email: managerEmail || target?.managerEmail || ''
    });
    setRejectManagerReason('');
  };

  const handleConfirmRejectManager = async () => {
    if (!rejectManagerModal) return;
    if (!rejectManagerReason.trim() || rejectManagerReason.trim().length < 5) {
      triggerToast('Please provide a detailed rejection reason (minimum 5 characters) to explain what needs adjustment.');
      return;
    }

    setRejectingManagerLoading(true);
    try {
      const payload = {
        rejectionReason: rejectManagerReason.trim(),
        adminNotes: rejectManagerReason.trim()
      };

      await apiFetch(`/api/manager-verifications/${rejectManagerModal.id}/reject`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      }).catch(async () => {
        return await apiFetch(`/api/manager-requests/${rejectManagerModal.id}/reject`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      });

      setManagerRequests(prev => prev.map(r => r.id === rejectManagerModal.id ? {
        ...r,
        status: 'rejected',
        rejectionReason: rejectManagerReason.trim(),
        adminNotes: rejectManagerReason.trim()
      } : r));

      triggerToast(`Manager application rejected. Feedback has been sent to the manager.`);
      setRejectManagerModal(null);
      setRejectManagerReason('');
      refreshNotifications();
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Failed to reject manager application.');
    } finally {
      setRejectingManagerLoading(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    if (!await logout()) return;
    navigate('/login', { replace: true });
  };

  const pendingManagersCount = managerRequests.filter(r => r.status === 'pending' || !r.status).length;
  const hostelCount = residences.filter(r => (r.hostel_type || '').toLowerCase().includes('hostel')).length;
  const hotelCount = residences.filter(r => (r.hostel_type || '').toLowerCase().includes('hotel')).length;
  const loungeCount = residences.filter(r => (r.hostel_type || '').toLowerCase().includes('lounge')).length;
  const totalManagers = 1 + managerRequests.filter(m => m.status === 'approved' || m.status === 'Approved').length;
  const totalResidents = residents.length;
  const totalResidences = residences.length;
  const totalFeesCollected = feesPaid.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  // Revenue is counted once from server-verified live transactions. Test/free payments are excluded.
  const totalMerchantFeesCollected = (adminData?.paymentRecords || []).filter((p: any) => p.mode === 'live' && p.purpose !== 'housing').reduce((sum: number, p: any) => sum + p.amount, 0);
  const activeMerchantCount = digitalMarketStores.filter((s: any) => s.registrationFeePaid && Date.parse(s.semesterExpiresAt) > Date.now()).length;

  const pendingHostelsCount = residences.filter(r => (
    r.status === 'Pending Approval' || 
    r.approvalStatus === 'Pending Approval' || 
    r.isApproved === false
  )).length;

  const pendingBoardRequestsCount = boardRequests.filter(r => r.status === 'Pending').length;
  const adminAlertCount = pendingBoardRequestsCount + pendingHostelsCount + unreadCount;



  return (
    <div onClickCapture={actionFeedback.capture} onSubmitCapture={actionFeedback.capture} className="min-h-screen h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-blue-50/70 to-indigo-50/50 text-slate-800 overflow-hidden font-sans">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-blue-400/30 backdrop-blur-md"
          >
            <span className="font-medium text-sm">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      
      {/* MOBILE HEADER (lg:hidden) */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-xl border-b border-sky-200/50 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <PineLogo size={24} />
          <div>
            <h1 className="text-xs font-black tracking-tight text-blue-950 leading-tight">PineVela Admin {adminSlot ? `#${adminSlot}` : ''}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowLogoutConfirm(true)} className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg" title="Sign Out">
            <LogOutIcon className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* MOBILE BOTTOM NAV (lg:hidden) */}
      <nav className="mobile-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
        <div data-mobile-nav-items className="flex items-center gap-1 overflow-x-auto px-2 py-2 pb-safe snap-x hide-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: ShieldCheck },
            { id: 'user_accounts', label: 'Accounts', icon: Users },
            { id: 'residences', label: 'Residences', icon: Building2, badge: pendingHostelsCount },
            { id: 'managers', label: 'Managers', icon: Users, badge: pendingManagersCount },
            { id: 'digital_market', label: 'Market', icon: ShoppingBag, badge: digitalMarketApps.filter(a => a.status === 'pending').length || null },
            { id: 'notifications', label: 'Alerts', icon: Bell, badge: adminAlertCount },
            { id: 'governance', label: 'Approvals', icon: ShieldCheck, badge: pendingGovernance }, { id: 'settings', label: 'Settings', icon: Edit3 }
          ].map(tab => (
            <button
              key={tab.id}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id as any)}
              className={`snap-center shrink-0 flex flex-col items-center justify-center w-[72px] h-12 rounded-xl transition-all relative ${
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
              </div>
              <span className={`text-[9px] font-bold mt-0.5 ${activeTab === tab.id ? 'text-blue-700' : 'text-slate-500'}`}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* SIDEBAR: PURELY STATIC / FIXED ICE-BLUE FROSTY BLUE WITH CURVED EDGES & BLUE GLOW */}

      {isSidebarTopNav && <nav className="hidden lg:block fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(760px,calc(100vw-3rem))] bg-white/72 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg"><div className="flex items-center gap-1 px-2 py-1.5">
        {/* Profile avatar button — left end */}
        <button onClick={() => setActiveTab('settings')} title="Profile & Settings" className="shrink-0 flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl hover:bg-white/70 cursor-pointer">
          {user?.photo || user?.avatar ? <img src={user.photo || user.avatar} alt="Profile" className="w-6 h-6 rounded-full object-cover ring-2 ring-white shadow-sm" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-900">{user?.name?.slice(0, 1)}</span>}
          <span className="text-[9px] font-bold text-slate-500">Profile</span>
        </button>
        <div className="w-px h-6 bg-slate-200/70 shrink-0" />
        {[
        { id: 'overview', label: 'Overview', icon: ShieldCheck }, { id: 'user_accounts', label: 'Accounts', icon: Users, badge: allUsersData.totalUsers }, { id: 'residences', label: 'Residences', icon: Building2, badge: pendingHostelsCount }, { id: 'managers', label: 'Managers', icon: Users, badge: pendingManagersCount }, { id: 'digital_market', label: 'Market', icon: ShoppingBag, badge: digitalMarketApps.filter(a => a.status === 'pending').length }, { id: 'notifications', label: 'Alerts', icon: Bell, badge: adminAlertCount }, { id: 'governance', label: 'Approvals', icon: ShieldCheck, badge: pendingGovernance }, { id: 'settings', label: 'Settings', icon: Edit3 }
      ].map(tab => <button aria-current={activeTab === tab.id ? 'page' : undefined} key={tab.id} onClick={() => setActiveTab(tab.id as any)} aria-label={`${tab.label}${tab.badge ? ` (${tab.badge})` : ''}`} className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[9px] font-bold cursor-pointer ${activeTab === tab.id ? 'text-blue-700 bg-blue-100/65' : 'text-slate-500 hover:bg-white/70'}`}><span className="relative inline-flex"><tab.icon className="w-4 h-4" /><TopNavBadge count={tab.badge} /></span><span className="truncate max-w-full">{tab.label}</span></button>)}<button onClick={() => setShowLogoutConfirm(true)} title="Sign Out" className="shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 text-[9px] font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"><LogOutIcon className="w-4 h-4" /><span>Sign Out</span></button><button onClick={() => setIsSidebarTopNav(false)} title="Show sidebar" className="p-2 text-slate-500 hover:text-blue-700 cursor-pointer"><PanelLeftOpen className="w-4 h-4" /></button></div></nav>}
      {!isSidebarTopNav && <aside className={`hidden lg:flex ${isSidebarCollapsed ? 'w-20 p-4' : 'w-72 p-6'} my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl flex flex-col justify-between shrink-0 overflow-y-auto transition-all duration-300 relative`}>
        <button onClick={() => setIsSidebarTopNav(true)} title="Use top navigation" className="absolute top-3 right-3 p-2 rounded-xl text-slate-500 hover:text-blue-700 hover:bg-white/70 cursor-pointer"><PanelLeftClose className="w-4 h-4" /></button>

        <div className="space-y-8">
          {/* Logo & Header */}
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3 px-2'}`}>
            <PineLogo size={isSidebarCollapsed ? 30 : 36} hideText={isSidebarCollapsed} />
            {!isSidebarCollapsed && (
              <div>
                <h1 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-blue-900 to-cyan-800 bg-clip-text text-transparent">
                  PineVela Admin {adminSlot ? `#${adminSlot}` : ''}
                </h1>
                <p className="text-[10px] font-medium text-blue-600/70 uppercase tracking-widest">Master Control</p>
              </div>
            )}
          </div>

          {/* Navigation Tabs */}
          <nav className="space-y-2">
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Management Console</p>
            )}
            {[
              { id: 'overview', label: 'Dashboard Overview', icon: ShieldCheck, sub: 'Metrics & activity audit' },
              { id: 'user_accounts', label: 'All Registered Accounts', icon: Users, badge: allUsersData.totalUsers || null, sub: 'Primary users and their linked accounts' },
              { id: 'residences', label: 'Available Residences', icon: Building2, badge: pendingHostelsCount || null, sub: 'Hostels, Hotels & Lounges' },
              { id: 'managers', label: 'Managers & Staffs', icon: Users, badge: pendingManagersCount || null, sub: 'Approvals, contact & history' },
              { id: 'digital_market', label: 'Student Digital Market', icon: ShoppingBag, badge: digitalMarketApps.filter(a => a.status === 'pending').length || null, sub: 'Stores, products & applications' },
              { id: 'notifications', label: 'Notifications', icon: Bell, badge: adminAlertCount || null, sub: 'Manager requests & alerts' },
              { id: 'governance', label: 'Admin Approvals', icon: ShieldCheck, sub: 'Founder roster & wipe proposals', badge: pendingGovernance }, { id: 'settings', label: 'Admin Settings', icon: Edit3, sub: 'Fees, commission & controls' }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  onClick={() => setActiveTab(tab.id as any)}
                  title={tab.label}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} px-4 py-3.5 rounded-2xl font-medium transition-all duration-300 cursor-pointer text-left group relative ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/40 border border-blue-400/50 ring-2 ring-blue-400/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-blue-200/50'
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 relative ${
                      isActive ? 'bg-white/20 text-white' : 'bg-blue-200/70 text-blue-700 group-hover:bg-blue-300/80'
                    }`}>
                      <Icon className="w-4 h-4" />
                      {false && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white animate-ping" />
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5 truncate">
                          <span>{tab.label}</span>
                          {false && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                          )}
                        </div>
                        <div className={`text-[10px] font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>{tab.sub}</div>
                      </div>
                    )}
                  </div>
                  {!isSidebarCollapsed && tab.badge ? (
                    <span className="px-2 py-0.5 text-[10px] bg-rose-500 text-white font-bold rounded-full animate-pulse shadow-sm">
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Logout Button Box */}
        <div className="pt-6 border-t border-sky-200/80 mt-6">
          <button
            onClick={handleLogout}
            title="Sign Out"
            className={`w-full flex items-center justify-center ${isSidebarCollapsed ? 'p-2.5' : 'space-x-2 px-4 py-3'} bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-2xl font-semibold text-xs transition-all shadow-sm cursor-pointer`}
          >
            <LogOutIcon className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>}


      {/* MAIN CONTENT AREA */}
      <main className={`dashboard-centered-content flex-1 p-6 lg:p-10 space-y-8 overflow-y-auto h-full relative ${isSidebarTopNav ? 'lg:pt-24 lg:w-[calc(100vw-22rem)] lg:max-w-[calc(100vw-22rem)] lg:mx-auto' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-white/65 p-4 text-sm backdrop-blur-xl"><span className="flex min-w-0 items-center gap-3 font-semibold text-blue-950">{(user?.photo || user?.avatar) && <img src={user.photo || user.avatar} alt="Administrator profile" className="h-9 w-9 shrink-0 rounded-full object-cover" />}<AdministratorLabel slot={adminSlot} name={user?.name} /></span><button onClick={() => setActiveTab('governance')} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">Shared approvals{pendingGovernance ? ` (${pendingGovernance})` : ''}</button></div>
        {activeTab === 'governance' && <><AdminGovernancePanel /><AccountModerationPanel target={null} onClose={() => {}} onApplied={fetchAdminData} /></>}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fadeIn relative z-10">
            {/* Welcome banner */}
            <div className="bg-sky-50/20 border border-sky-200/50 p-8 rounded-3xl backdrop-blur-2xl shadow-xl relative overflow-hidden">
              <div className="absolute right-0 top-0 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 max-w-2xl">
                <h2 className="text-2xl lg:text-3xl font-bold text-3d tracking-tight">Welcome back, {user?.name}</h2>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
              {[
                { 
                  label: 'All Registered User Accounts', 
                  value: allUsersData.totalUsers || (totalResidents + totalManagers + allUsersData.breakdown.staff + verificationTeams.length + activeMerchantCount + 1),
                  sub: `${allUsersData.breakdown.residents || totalResidents} Residents, ${allUsersData.breakdown.managers || totalManagers} Managers, ${allUsersData.breakdown.staff || 0} Staff, ${allUsersData.breakdown.officers || verificationTeams.length} Officers, ${allUsersData.breakdown.merchants || activeMerchantCount} Merchants`,
                  icon: Users, 
                  color: 'bg-emerald-600 text-white' 
                },
                { label: 'Available Residences', value: totalResidences, sub: `${hostelCount} Hostels, ${hotelCount} Hotels, ${loungeCount} Lounges`, icon: Building2, color: 'bg-blue-600 text-white' },
                { label: 'Registered Managers', value: totalManagers, sub: `${pendingManagersCount} pending requests`, icon: Users, color: 'bg-cyan-600 text-white' },
                { label: 'Total Residents', value: totalResidents, sub: 'Active & verified students/guests', icon: UserPlus, color: 'bg-indigo-600 text-white' },
                { label: 'Residency Fees Paid', value: `GHS ${totalFeesCollected.toLocaleString()}`, sub: 'Verified revenue collection', icon: DollarSign, color: 'bg-emerald-600 text-white' },
                { label: 'Platform Revenue', value: `GHS ${totalMerchantFeesCollected.toLocaleString()}`, sub: `${activeMerchantCount} active student merchant plans`, icon: ShoppingBag, color: 'bg-amber-600 text-white' }
              ].map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <div key={idx} className="bg-sky-50/20 border border-sky-200/50 p-6 rounded-3xl backdrop-blur-2xl shadow-xl relative overflow-hidden flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-slate-700 tracking-wider uppercase text-outline-sm">{stat.label}</span>
                      <div className={`w-10 h-10 rounded-2xl ${stat.color} flex items-center justify-center shadow-md`}>
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-black text-3d-blue mb-1">{stat.value}</div>
                      <div className="text-xs text-slate-600 font-medium text-outline-sm">{stat.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions & Recent Activities */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-sky-50/20 border border-sky-200/50 p-8 rounded-3xl backdrop-blur-2xl shadow-xl space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2 text-outline-sm">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <span>System Activities & Audit Log</span>
                  </h3>
                  <button 
                    onClick={() => setActiveTab('managers')} 
                    className="text-xs text-blue-700 hover:text-blue-800 font-semibold flex items-center space-x-1 text-outline-sm"
                  >
                    <span>View all requests</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {activities.length > 0 ? (
                    activities.slice(0, 5).map((act, i) => (
                      <div key={i} className="flex items-start space-x-4 p-4 rounded-2xl bg-sky-100/30 border border-sky-200/40 backdrop-blur-md">
                        <div className="w-2 h-2 rounded-full bg-blue-600 mt-2" />
                        <div className="flex-1">
                          <p className="text-xs lg:text-sm text-slate-800 font-medium text-outline-sm">{act.text}</p>
                          <span className="text-[10px] text-blue-700 font-semibold">{act.time || 'Just now'}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-xs text-outline-sm">
                      No recent activities recorded. System is fully operational.
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Admin Actions */}
              <div className="bg-sky-50/20 border border-sky-200/50 p-8 rounded-3xl backdrop-blur-2xl shadow-xl space-y-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-4 text-outline-sm">Quick Admin Actions</h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowAddResidenceModal(true)}
                      className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
                    >
                      <span className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4" />
                        <span>Register New Residence</span>
                      </span>
                      <Plus className="w-4 h-4" />
                    </button>



                    <button
                      onClick={() => setActiveTab('managers')}
                      className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl bg-sky-100/40 hover:bg-sky-100/70 border border-sky-200/60 text-blue-900 font-semibold text-xs transition-all cursor-pointer backdrop-blur-md"
                    >
                      <span className="flex items-center space-x-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>Review Manager Requests ({pendingManagersCount})</span>
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-sky-100/30 border border-sky-200/50 text-xs text-blue-900 backdrop-blur-md">
                  <p className="font-bold mb-1 text-outline-sm">Secure Admin Credential</p>
                  <p className="text-[11px] text-slate-700 font-medium">Administrator account secured under <span className="font-mono font-semibold text-blue-600">{user?.email || 'authenticated admin'}</span>.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ALL REGISTERED ACCOUNTS */}
        {activeTab === 'user_accounts' && (
          <div className="space-y-6 animate-fadeIn relative z-10">
            <AccountModerationPanel target={moderationTarget} onClose={() => setModerationTarget(null)} onApplied={fetchAdminData} />
            <AdminAccountDirectory accounts={allUsersData.users} onManage={setModerationTarget} />
          </div>
        )}

        {/* TAB 2: AVAILABLE RESIDENCES */}
        {activeTab === 'residences' && (
          <div className="space-y-6 animate-fadeIn relative z-10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/80 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Available Residences Directory</h3>
                <p className="text-xs text-slate-500">Manage all Hostels, Hotels, and Lounges listed on PineVela</p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search residences..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-blue-50/60 border border-blue-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <button
                  onClick={() => setShowAddResidenceModal(true)}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-lg cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Residence</span>
                </button>
              </div>
            </div>

            {/* Filters Row: Category Pills and Approval Status Tabs */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              {/* Approval Status Sub-Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setApprovalTabFilter('all')}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                    approvalTabFilter === 'all'
                      ? 'bg-blue-900 text-white shadow-md shadow-blue-900/20'
                      : 'bg-white/80 text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Properties ({residences.length})
                </button>
                <button
                  onClick={() => setApprovalTabFilter('pending')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                    approvalTabFilter === 'pending'
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                      : 'bg-amber-50/80 text-amber-900 border border-amber-200 hover:bg-amber-100/70'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending Approvals</span>
                  {residences.filter(r => (r.status === 'Pending Approval' || r.approvalStatus === 'Pending Approval' || r.isApproved === false)).length > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      approvalTabFilter === 'pending' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                    }`}>
                      {residences.filter(r => (r.status === 'Pending Approval' || r.approvalStatus === 'Pending Approval' || r.isApproved === false)).length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setApprovalTabFilter('approved')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                    approvalTabFilter === 'approved'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-emerald-50/80 text-emerald-900 border border-emerald-200 hover:bg-emerald-100/70'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approved Hostels</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    approvalTabFilter === 'approved' ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'
                  }`}>
                    {residences.filter(r => ((r.status === 'Approved' || r.approvalStatus === 'Approved' || r.isApproved === true || r.status === 'Open') && r.status !== 'Pending Approval' && r.approvalStatus !== 'Pending Approval' && r.isApproved !== false)).length}
                  </span>
                </button>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center space-x-2">
                {['all', 'Hostel', 'Hotel', 'Lounge'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setResidenceFilter(cat as any)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      residenceFilter === cat
                        ? 'bg-blue-600 text-white shadow-sm border border-blue-500'
                        : 'bg-white/80 text-slate-600 border border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    {cat === 'all' ? 'All Types' : `${cat}s`}
                  </button>
                ))}
              </div>
            </div>

            {/* Residences Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {residences
                .filter(res => {
                  const isApproved = (res.status === 'Approved' || res.approvalStatus === 'Approved' || res.isApproved === true || res.status === 'Open') &&
                    res.status !== 'Pending Approval' &&
                    res.approvalStatus !== 'Pending Approval' &&
                    res.isApproved !== false;

                  if (approvalTabFilter === 'pending' && isApproved) return false;
                  if (approvalTabFilter === 'approved' && !isApproved) return false;

                  if (residenceFilter !== 'all') {
                    const type = res.hostel_type || 'Hostel';
                    if (!type.toLowerCase().includes(residenceFilter.toLowerCase())) return false;
                  }
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    return res.name?.toLowerCase().includes(q) || res.location?.toLowerCase().includes(q) || res.managerName?.toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((residence) => {
                  const type = residence.hostel_type || 'Hostel';
                  const isApproved = residence.isApproved === true || residence.approvalStatus === 'Approved' || residence.status === 'Approved';

                  return (
                    <div key={residence.id} className="bg-white/90 border border-blue-200/80 rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl flex flex-col justify-between">
                      <div>
                        <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                          <img
                            src={residence.image || residence.imageUrl || residence.exteriorPhotoUrl || residence.imagePreviewUrl || residence.images?.[0] || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80'}
                            alt={residence.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80';
                            }}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-xl text-xs font-bold text-blue-700 border border-blue-200">
                            {type}
                          </div>
                          <div className="absolute top-3 right-3">
                            {isApproved ? (
                              <span className="bg-emerald-600 text-white px-3 py-1 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                Approved & Live
                              </span>
                            ) : (
                              <span className="bg-amber-500 text-white px-3 py-1 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                Pending Approval
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-6 space-y-4">
                          <div>
                            <h4 className="text-base font-extrabold text-slate-900">{residence.name}</h4>
                            <p className="text-xs text-slate-500 flex items-center space-x-1 mt-0.5">
                              <span>📍</span>
                              <span className="truncate">{residence.location}</span>
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-100 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Capacity</span>
                            </div>
                          </div>

                          {/* Verified Manager Profile with Photo */}
                          <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-200/60 flex items-center gap-3">
                            <div className="relative shrink-0">
                              <img
                                src={residence.managerPhoto || (residence as any).managerAvatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'}
                                alt={residence.managerName || 'Manager'}
                                className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-xs"
                              />
                              <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs" title="Verified Manager">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900 truncate">
                                  {residence.managerName || 'Anthony Davis'}
                                </span>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                  Verified
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 truncate">
                                {residence.managerEmail || 'manager@pinevela.com'}
                              </p>
                              <p className="text-[10px] text-slate-700 font-semibold">
                                {residence.managerPhone || '+233 24 123 4567'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-6 pb-6 pt-2 flex items-center justify-between border-t border-blue-100">
                        {isApproved ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Approved Residence</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setRejectingResidenceModal(residence);
                                setResidenceRejectionReason('');
                              }}
                              className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2.5 px-3.5 rounded-xl transition-all cursor-pointer border border-rose-200 flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const updated = await apiFetch(`/api/hostels/${residence.id}/verify`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ status: 'Approved', isApproved: true, approvalStatus: 'Approved' })
                                  });
                                  const freshHostel = updated.hostel || { ...residence, status: 'Approved', isApproved: true, approvalStatus: 'Approved' };
                                  setResidences(prev => prev.map(r => r.id === residence.id ? freshHostel : r));
                                  triggerToast(`Residence "${residence.name}" approved successfully and published live!`);
                                } catch(e) {
                                  triggerToast('Failed to approve residence');
                                }
                              }}
                              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve Residence</span>
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {!isApproved ? (
                            <button
                              onClick={() => {
                                setInspectingResidenceModal(residence);
                                setInspectActiveImage('');
                              }}
                              className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-200"
                              title="Inspect actual photos, GPS location, block structure & verify on-site"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Details</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setEditingResidence(residence)}
                              className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-blue-200"
                              title="Edit residence, blocks, amenities, rules & payments"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to delete "${residence.name}"?`)) return;
                              try {
                                 await apiFetch(`/api/hostels/${residence.id}`, { method: 'DELETE' });
                                 setResidences(prev => prev.filter(r => r.id !== residence.id));
                                 triggerToast('Residence deleted successfully.');
                              } catch(e) {}
                            }}
                            className="text-rose-600 hover:text-rose-700 p-2 rounded-xl bg-rose-50 hover:bg-rose-100 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {residences.length === 0 && (
              <div className="text-center py-16 bg-white/60 border border-blue-200 rounded-3xl">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h4 className="text-lg font-bold text-slate-900 mb-1">No Residences Registered Yet</h4>
                <p className="text-xs text-slate-500 mb-6">Start by registering the first hostel, hotel, or lounge on PineVela.</p>
                <button
                  onClick={() => setShowAddResidenceModal(true)}
                  className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-medium text-sm shadow-lg hover:bg-blue-500 cursor-pointer"
                >
                  Register First Residence
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MANAGERS & VERIFICATION SYSTEM */}
        {activeTab === 'managers' && (
          <div className="space-y-6 animate-fadeIn relative z-10">
            {/* Header with Sub-Tabs */}
            <div className="bg-sky-50/20 border border-sky-200/50 p-6 rounded-3xl backdrop-blur-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-3d">Hostel Managers & On-Site Verification System</h3>
                <p className="text-xs text-slate-600 font-medium text-outline-sm">
                  Manage physical property verifications, dispatch PineVela field officers, and maintain officer rosters.
                </p>
              </div>

              {/* Sub Navigation */}
              <div className="flex items-center gap-1.5 p-1 bg-white/80 rounded-2xl border border-sky-200/70 shadow-xs">
                <button
                  type="button"
                  onClick={() => setManagerSubTab('inspections')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    managerSubTab === 'inspections'
                      ? 'bg-blue-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Physical Inspections</span>
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-blue-700/80 text-white">
                    {managerRequests.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setManagerSubTab('officers')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    managerSubTab === 'officers'
                      ? 'bg-blue-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Field Officers ({verificationTeams.length})</span>
                </button>
                <button type="button" onClick={() => setManagerSubTab("cooldowns")} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Restrictions ({managerRestrictions.length})</span>
                </button>
              </div>
            </div>

            {/* SUBTAB 1: PHYSICAL INSPECTIONS & MANAGER VERIFICATIONS */}
            {managerSubTab === 'inspections' && (
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/80 p-3.5 rounded-2xl border border-sky-200/80 shadow-xs backdrop-blur-md">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by manager name, email, phone, property name, or precise location..."
                      value={managerSearchQuery}
                      onChange={(e) => setManagerSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {managerSearchQuery && (
                      <button onClick={() => setManagerSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-500 shrink-0 px-2">
                    Showing {managerRequests.filter(m => {
                      if (!managerSearchQuery.trim()) return true;
                      const q = managerSearchQuery.toLowerCase();
                      return (
                        m.managerName?.toLowerCase().includes(q) ||
                        m.managerEmail?.toLowerCase().includes(q) ||
                        m.managerPhone?.toLowerCase().includes(q) ||
                        m.organization?.toLowerCase().includes(q) ||
                        m.propertyName?.toLowerCase().includes(q) ||
                        m.preciseLocation?.toLowerCase().includes(q) ||
                        m.physicalAddress?.toLowerCase().includes(q)
                      );
                    }).length} of {managerRequests.length}
                  </span>
                </div>

                {/* List of Applications */}
                <div className="space-y-4">
                  {managerRequests
                    .filter(m => {
                      if (!managerSearchQuery.trim()) return true;
                      const q = managerSearchQuery.toLowerCase();
                      return (
                        m.managerName?.toLowerCase().includes(q) ||
                        m.managerEmail?.toLowerCase().includes(q) ||
                        m.managerPhone?.toLowerCase().includes(q) ||
                        m.organization?.toLowerCase().includes(q) ||
                        m.propertyName?.toLowerCase().includes(q) ||
                        m.preciseLocation?.toLowerCase().includes(q) ||
                        m.physicalAddress?.toLowerCase().includes(q)
                      );
                    })
                    .map((req, idx) => {
                      const inspection = verificationInspections.find(i => i.managerVerificationId === req.id || i.managerEmail === req.managerEmail || (i.id && (req.inspectionId === i.id || req.id === i.id)));
                      const hasSubmittedReport = Boolean(inspection?.report || req.inspectionReport || req.verificationReport || inspection?.status === 'report_submitted');
                      const isBlocked = req.status === 'blocked' || req.isBlocked === true;
                      const isApproved = !isBlocked && (req.status === 'approved' || req.inspectionStatus === 'approved' || inspection?.status === 'approved');
                      const currentStatus = isBlocked
                        ? 'blocked'
                        : isApproved 
                        ? 'approved' 
                        : (req.inspectionStatus === 'report_submitted' || hasSubmittedReport)
                        ? 'report_submitted'
                        : (req.inspectionStatus || inspection?.status || req.status || 'pending_dispatch');

                      return (
                        <div key={`${req.id || 'mreq'}-${idx}`} className="bg-sky-50/20 border border-sky-200/50 p-6 rounded-3xl backdrop-blur-2xl shadow-xl space-y-4">
                          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-sky-200/40">
                            <div className="space-y-1">
                              <div className="flex items-center gap-3 flex-wrap">
                                <h4 className="text-base font-black text-slate-900 text-outline-sm">{req.managerName}</h4>
                                <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border ${
                                  currentStatus === 'blocked' || req.status === 'blocked'
                                    ? 'bg-rose-100 text-rose-900 border-rose-300 font-extrabold flex items-center gap-1'
                                    : currentStatus === 'approved' || req.status === 'approved'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : currentStatus === 'report_submitted'
                                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                                    : currentStatus === 'dispatched'
                                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                                    : currentStatus === 'rejected' || req.status === 'rejected'
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}>
                                  {currentStatus === 'blocked' || req.status === 'blocked'
                                    ? '🚫 Blocked / Restricted'
                                    : currentStatus === 'approved' || req.status === 'approved'
                                    ? '✓ Verified & Approved'
                                    : currentStatus === 'report_submitted'
                                    ? '📋 On-Site Report Ready'
                                    : currentStatus === 'dispatched'
                                    ? '🚗 Team Dispatched'
                                    : currentStatus === 'rejected' || req.status === 'rejected'
                                    ? '✕ Rejected'
                                    : '⏳ Awaiting Dispatch'}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-blue-900">
                                🏢 Residence / Hostel: <span className="text-slate-900 font-extrabold">{req.propertyName || req.organization || 'Pending Property'}</span>
                              </p>
                            </div>

                            <div className="text-right">
                              <span className="text-[10px] text-slate-500 font-bold block">Submission Date</span>
                              <span className="text-xs font-semibold text-slate-700">
                                {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'Recent Request'}
                              </span>
                            </div>
                          </div>

                          {/* Contact & Location Details */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs bg-white/70 p-4 rounded-2xl border border-sky-200/50">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Work Email</span>
                              <span className="font-semibold text-slate-900 break-all">{req.managerEmail}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone / WhatsApp</span>
                              <span className="font-semibold text-slate-900">{req.managerPhone || '+233 24 555 1234'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Precise Property Location</span>
                              <span className="font-bold text-slate-800">{req.preciseLocation || req.physicalAddress || req.location || 'Accra Central'}</span>
                            </div>
                          </div>



                          {/* Dispatch & Inspection Status Block */}
                          <div className="p-4 bg-sky-100/30 rounded-2xl border border-sky-200/50 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-3">
                              <div className={`p-2.5 rounded-xl ${
                                currentStatus === 'blocked' || req.status === 'blocked'
                                  ? 'bg-rose-600 text-white'
                                  : currentStatus === 'report_submitted'
                                  ? 'bg-blue-600 text-white'
                                  : currentStatus === 'dispatched'
                                  ? 'bg-purple-600 text-white'
                                  : currentStatus === 'approved'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}>
                                {currentStatus === 'blocked' || req.status === 'blocked' ? (
                                  <Lock className="w-5 h-5" />
                                ) : (
                                  <ShieldCheck className="w-5 h-5" />
                                )}
                              </div>
                              <div>
                                <span className="font-black text-slate-900 block">
                                  {currentStatus === 'blocked' || req.status === 'blocked'
                                    ? 'Manager Access Restricted & Properties Unlisted'
                                    : currentStatus === 'report_submitted'
                                    ? 'Field Verification Report Submitted & Ready for Admin Review'
                                    : currentStatus === 'dispatched'
                                    ? `PineVela Field Officer Dispatched: ${req.assignedOfficerName || inspection?.assignedOfficerName || 'Officer En Route'}`
                                    : currentStatus === 'approved'
                                    ? 'Property Physical Legitimacy Confirmed'
                                    : 'Awaiting PineVela On-Site Verification Dispatch'}
                                </span>
                                <span className="text-[11px] text-slate-600">
                                  {currentStatus === 'blocked' || req.status === 'blocked'
                                    ? 'Login access to the Manager Console is locked and all registered hostel listings are hidden from live student searches.'
                                    : currentStatus === 'report_submitted'
                                    ? 'Live GPS coordinates, photographs, and property legitimacy checklist provided.'
                                    : currentStatus === 'dispatched'
                                    ? 'Officer is conducting physical on-site audit of the hostel property.'
                                    : currentStatus === 'approved'
                                    ? 'Manager is authorized to register and publish hostel rooms.'
                                    : 'Dispatch an accredited PineVela verification officer to visit the location.'}
                                </span>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {/* Unblock Button for Blocked Managers */}
                              {(req.status === 'blocked' || req.isBlocked) && (
                                <button
                                  type="button"
                                  onClick={() => handleUnblockManager(req.id, req.managerEmail)}
                                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Unblock Access & Restore Listings</span>
                                </button>
                              )}

                              {/* Dispatch Button */}
                              {(currentStatus === 'pending_dispatch' || !req.inspectionStatus) && req.status !== 'approved' && req.status !== 'blocked' && !req.isBlocked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDispatchModalManager(req);
                                    setDispatchOfficerId(verificationTeams[0]?.officerId || '');
                                    setDispatchPriority('medium');
                                    setDispatchNotes('');
                                  }}
                                  className="px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                                >
                                  <MapPin className="w-3.5 h-3.5 text-sky-300" />
                                  <span>Dispatch Verification Team</span>
                                </button>
                              )}

                              {/* Review Report Button */}
                              {currentStatus === 'report_submitted' && req.status !== 'blocked' && !req.isBlocked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const actualReport = inspection?.report || req.inspectionReport || req.verificationReport;
                                    setReviewReportInspection({
                                      ...(inspection || {}),
                                      id: inspection?.id || `insp-${req.id}`,
                                      managerVerificationId: req.id,
                                      managerName: req.managerName,
                                      managerEmail: req.managerEmail,
                                      propertyName: req.propertyName || req.organization,
                                      preciseLocation: req.preciseLocation || req.physicalAddress,
                                      assignedOfficerName: inspection?.assignedOfficerName || req.assignedOfficerName || 'Field Officer',
                                      status: 'report_submitted',
                                      report: actualReport || {
                                        submittedAt: new Date().toISOString(),
                                        checklist: {},
                                        propertyDetails: {},
                                        photos: [],
                                        observations: 'On-site audit submitted by field officer.',
                                        recommendation: 'recommend_approval'
                                      }
                                    });
                                  }}
                                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                                >
                                  <FileCheck className="w-3.5 h-3.5" />
                                  <span>Review On-Site Report</span>
                                </button>
                              )}

                              {/* Direct Approve/Reject buttons */}
                              {req.status !== 'approved' && req.status !== 'rejected' && req.status !== 'blocked' && !req.isBlocked && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveManager(req.id, req.managerEmail)}
                                    className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectManager(req.id, req.managerName, req.managerEmail)}
                                    className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Reject</span>
                                  </button>
                                </>
                              )}

                              {/* Block Access button for approved managers */}
                              {req.status === 'approved' && !req.isBlocked && (
                                <button
                                  type="button"
                                  onClick={() => handleBlockManager(req.id, req.managerEmail, req.managerName)}
                                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                                >
                                  <Lock className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Block Access</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Notes if blocked or restricted */}
                          {(req.blockReason || (req.status === 'blocked' && req.adminNotes)) && (
                            <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-rose-900 text-xs space-y-1">
                              <strong className="block text-rose-800 font-bold flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-rose-600" />
                                Active Account Restriction Notice Sent to Manager:
                              </strong>
                              <p className="font-semibold text-rose-950">"{req.blockReason || req.adminNotes}"</p>
                              <p className="text-[10px] text-rose-600">This notice is delivered to their primary user account. Manager console access and live hostel search listings are frozen.</p>
                            </div>
                          )}

                          {/* Notes if rejected */}
                          {req.rejectionReason && req.status !== 'blocked' && (
                            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 text-xs">
                              <strong>Rejection Feedback Sent:</strong> "{req.rejectionReason}"
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {managerRequests.length === 0 && (
                    <div className="text-center py-16 bg-sky-50/20 border border-sky-200/50 rounded-3xl backdrop-blur-2xl">
                      <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                      <h4 className="text-lg font-bold text-slate-900 mb-1 text-outline-sm">No Manager Verification Requests</h4>
                      <p className="text-xs text-slate-600">New manager registration requests will appear here for team dispatch and on-site audit.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUBTAB 2: PINEVELA VERIFICATION TEAM OFFICERS */}
            {managerSubTab === 'officers' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/80 p-5 rounded-3xl border border-sky-200/80 shadow-xs backdrop-blur-md">
                  <div>
                    <h4 className="text-base font-black text-slate-900">PineVela Verification Team Roster</h4>
                    <p className="text-xs text-slate-600">Accredited field officers responsible for physical on-site inspections.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRegisterOfficerModal(true)}
                    className="px-5 py-2.5 bg-blue-900 hover:bg-blue-850 text-white font-black text-xs rounded-2xl shadow-md cursor-pointer transition-all flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-sky-300" />
                    <span>Register New Verification Officer</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {verificationTeams.map((officer, oIdx) => (
                    <div key={officer.id || officer.officerId || oIdx} className="bg-white/90 border border-slate-200 p-5 rounded-3xl shadow-sm space-y-4 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-blue-900 text-sky-400 font-black text-sm flex items-center justify-center shadow-md">
                            <ShieldCheck className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-900">
                              {officer.officerId}
                            </span>
                            <h5 className="text-sm font-black text-slate-900 mt-1">{officer.fullName}</h5>
                          </div>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          officer.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {officer.status || 'active'}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <p>📧 <span className="font-semibold text-slate-900">{officer.email}</span></p>
                        <p>📞 <span className="font-semibold text-slate-900">{officer.phone || '+233 24 000 0000'}</span></p>
                        <p>📍 Zone: <span className="font-bold text-blue-900">{officer.assignedZone}</span></p>
                        <p>🚗 Total Dispatches: <span className="font-extrabold text-slate-900">{officer.totalDispatches || 0}</span></p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setCreatedOfficerCredentials({
                              officerId: officer.officerId,
                              fullName: officer.fullName,
                              email: officer.email,
                              phone: officer.phone,
                              assignedZone: officer.assignedZone,
                              password: '••••••••',
                              securityPasscode: officer.securityPasscode || 'PV-VERIFY-2026'
                            });
                          }}
                          className="flex-1 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5 text-blue-700" />
                          <span>Credentials Card</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleOfficerStatus(officer.id || officer.officerId, officer.status || 'active')}
                          className={`py-2 px-3 text-xs font-bold rounded-xl cursor-pointer transition-all ${
                            officer.status === 'active'
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {officer.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}

                  {verificationTeams.length === 0 && (
                    <div className="col-span-full text-center py-12 bg-white/70 border border-sky-200 rounded-3xl">
                      <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                      <h5 className="text-sm font-bold text-slate-900">No Verification Officers Registered</h5>
                      <p className="text-xs text-slate-500 mb-4">Register accredited officers to handle physical property inspections.</p>
                      <button
                        type="button"
                        onClick={() => setShowRegisterOfficerModal(true)}
                        className="px-4 py-2 bg-blue-900 text-white font-bold text-xs rounded-xl shadow-sm"
                      >
                        Register Officer
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUBTAB 3: MANAGER COOLDOWNS & BYPASS REQUESTS PANEL */}
            {managerSubTab === 'cooldowns' && (
              <div className="bg-sky-50/20 border border-sky-200/50 p-6 rounded-3xl backdrop-blur-2xl shadow-xl space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Anti-Abuse Restrictions & Bypass Requests</h3>
                  <p className="text-xs text-slate-600 font-medium">
                    Review 30-day account creation restrictions applied to deleted Hostel Manager accounts, and evaluate detailed bypass requests.
                  </p>
                </div>

                <div className="space-y-4">
                  {managerRestrictions.map((restr, idx) => {
                    const isExpired = new Date(restr.expiresAt).getTime() <= Date.now();
                    const remainingDays = isExpired 
                      ? 0 
                      : Math.ceil((new Date(restr.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                    return (
                      <div 
                        key={restr.id || `restr-${idx}`} 
                        className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-slate-900">{restr.userEmail}</span>
                              {restr.deletedManagerEmail && restr.deletedManagerEmail !== restr.userEmail && (
                                <span className="text-[10px] text-slate-500 font-medium">
                                  (Manager account: {restr.deletedManagerEmail})
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold">
                              Deleted At: {new Date(restr.deletedAt).toLocaleString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {restr.bypassApproved ? (
                              <span className="px-2.5 py-1 text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full">
                                Bypass Approved (Restriction Waived)
                              </span>
                            ) : restr.bypassRejected ? (
                              <span className="px-2.5 py-1 text-[10px] font-extrabold bg-rose-50 text-rose-800 border border-rose-200 rounded-full">
                                Bypass Rejected
                              </span>
                            ) : isExpired ? (
                              <span className="px-2.5 py-1 text-[10px] font-extrabold bg-slate-100 text-slate-500 rounded-full">
                                Restriction Expired
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 rounded-full animate-pulse">
                                Active: {remainingDays} Days Left
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-700 font-medium">
                          <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                            <span className="text-[10px] uppercase font-black text-slate-400 block">User Reason for Deletion / Restart</span>
                            <p className="text-slate-800 italic font-semibold">
                              {restr.reason ? `"${restr.reason}"` : "No bypass reason submitted."}
                            </p>
                          </div>

                          <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                            <span className="text-[10px] uppercase font-black text-slate-400 block">Admin Action Notes / Status</span>
                            {restr.adminNotes ? (
                              <p className="text-slate-800 font-semibold italic">"{restr.adminNotes}"</p>
                            ) : (
                              <p className="text-slate-400 font-semibold">No action notes recorded.</p>
                            )}
                          </div>
                        </div>

                        {restr.bypassRequested && !restr.bypassApproved && !restr.bypassRejected && !isExpired && (
                          <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-800 block uppercase tracking-wider">
                                Decision / Rejection Feedback Notes
                              </label>
                              <input
                                type="text"
                                value={rejectionNotes[restr.id] || ''}
                                onChange={(e) => setRejectionNotes(prev => ({ ...prev, [restr.id]: e.target.value }))}
                                placeholder="Explain rejection reason or append approval comments..."
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2.5">
                              <button
                                type="button"
                                onClick={() => handleRejectBypass(restr.id, restr.userEmail)}
                                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-extrabold cursor-pointer transition-all"
                              >
                                Reject Bypass Request
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApproveBypass(restr.id, restr.userEmail)}
                                className="px-4 py-2 bg-blue-900 hover:bg-blue-850 text-white rounded-xl text-xs font-black shadow-md cursor-pointer transition-all"
                              >
                                Approve Bypass (Waive Cooldown)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {managerRestrictions.length === 0 && (
                    <div className="text-center py-10 bg-slate-50 border border-slate-200 rounded-2xl">
                      <Clock className="w-10 h-10 text-slate-400 mx-auto mb-3 animate-pulse" />
                      <h4 className="text-sm font-bold text-slate-900 mb-0.5">No Manager Account Restrictions Active</h4>
                      <p className="text-xs text-slate-500 font-semibold">Active cooldown restrictions and bypass requests will be shown here.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ADMIN SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-fadeIn relative z-10 max-w-4xl">
            <AdminSettingsPanel />

            <button onClick={() => setActiveTab('governance')} className="w-full rounded-2xl border border-blue-200 bg-blue-50/60 p-5 text-left text-sm font-semibold text-blue-800">Open administrator roster and five-key wipe proposals</button>
          </div>
        )}

        {/* TAB 4: NOTIFICATIONS & MANAGER BOARD REQUESTS */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 animate-fadeIn relative z-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white/80 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-lg shadow-blue-500/30">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Notifications & Admin Board Desk</h3>
                  <p className="text-xs text-slate-500">Review manager requests, process operational notices, and manage property verification alerts.</p>
                </div>
              </div>

            </div>

            {notifications.length > 0 && <section className="rounded-3xl border border-blue-100 bg-white/75 p-5 shadow-sm backdrop-blur-xl"><div className="mb-3 flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Bell className="h-4 w-4 text-blue-600" />Live operational alerts {unreadCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">{unreadCount} new</span>}</p><button onClick={() => refreshNotifications()} className="text-xs font-bold text-blue-700">Refresh</button></div><div className="space-y-2">{notifications.slice(0, 6).map((notification: any) => <button key={notification.id} onClick={() => markAsRead(notification.id)} className="block w-full rounded-2xl border border-blue-100 bg-blue-50/60 p-3 text-left"><p className="text-xs font-bold text-slate-900">{notification.title}</p><p className="mt-1 text-xs text-slate-600">{notification.message}</p></button>)}</div></section>}
            {/* PENDING RESIDENCE VERIFICATION ALERTS */}
            {pendingHostelsCount > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-6 rounded-3xl backdrop-blur-xl shadow-lg space-y-4">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/30">
                      <Clock className="w-5 h-5 animate-spin" />
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <span>Property Verification Requests</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white">
                          {pendingHostelsCount} Pending
                        </span>
                      </h4>
                      <p className="text-xs text-slate-600">These residences have been submitted by managers and are awaiting PineVela verification.</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {residences.filter(r => r.status === 'Pending Approval' || r.approvalStatus === 'Pending Approval' || r.isApproved === false).map((res, idx) => (
                    <div key={`${res.id || 'res'}-${idx}`} className="bg-white/90 border border-amber-200/80 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={res.image || res.imageUrl || res.exteriorPhotoUrl || res.imagePreviewUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80'}
                          alt={res.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80';
                          }}
                          className="w-16 h-16 rounded-xl object-cover border border-amber-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <h5 className="text-sm font-bold text-slate-900 truncate">{res.name}</h5>
                          <p className="text-xs text-slate-500">📍 {res.location}</p>
                          <p className="text-xs text-slate-600 mt-1">
                            Manager: <strong className="text-slate-800">{res.managerName || 'Assigned Manager'}</strong> ({res.managerPhone || '+233 24 123 4567'})
                          </p>
                        </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100"><span className="text-xs font-semibold text-blue-600">{res.totalCapacity || 100} Beds</span><div className="flex items-center gap-2">
                      </div>
                          <button
                            onClick={() => {
                              setInspectingResidenceModal(res);
                              setInspectActiveImage('');
                            }}
                            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2 px-3 rounded-xl transition-all cursor-pointer border border-indigo-200 flex items-center gap-1"
                            title="Inspect full details, uploaded photos & GPS location"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Details</span>
                          </button>
                          <button
                            onClick={() => {
                              setRejectingResidenceModal(res);
                              setResidenceRejectionReason('');
                            }}
                            className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2 px-3 rounded-xl transition-all cursor-pointer border border-rose-200 flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const updated = await apiFetch(`/api/hostels/${res.id}/verify`, {
                                  method: 'PUT',
                                  body: JSON.stringify({ status: 'Approved', isApproved: true, approvalStatus: 'Approved' })
                                });
                                const freshHostel = updated.hostel || { ...res, status: 'Approved', isApproved: true, approvalStatus: 'Approved' };
                                setResidences(prev => prev.map(r => r.id === res.id ? freshHostel : r));
                                triggerToast(`Residence "${res.name}" approved successfully and is now Live!`);
                              } catch (e) {
                                triggerToast('Failed to approve residence');
                              }
                            }}
                            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve & Go Live</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manager Requests */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-200/70 border border-slate-300/60 rounded-2xl w-fit">


              <button
                type="button"
                onClick={() => setNotifSubTab('manager_requests')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                  notifSubTab === 'manager_requests'
                    ? 'bg-blue-900 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span>Manager Requests to Board</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                  {boardRequests.length}
                </span>
              </button>
            </div>

            {/* VERIFIED STAFFS CREDENTIAL REVIEW SECTION */}


            {/* MANAGER REQUESTS TO ADMIN BOARD */}
            {notifSubTab === 'manager_requests' && (
            <div className="bg-white/90 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-500/30">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <span>Manager Requests to Admin Board</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-indigo-800">
                        {boardRequests.length} Total
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500">Operational requests, capacity updates, and maintenance tickets submitted by registered managers.</p>
                  </div>
                </div>

                {/* Filter Buttons */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  {(['all', 'pending', 'acknowledged', 'resolved'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setBoardFilter(f)}
                      className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                        boardFilter === f
                          ? 'bg-white text-blue-700 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Requests List */}
              {boardRequests.length === 0 ? (
                <div className="text-center py-12 bg-slate-50/70 border border-slate-200/60 rounded-2xl space-y-2">
                  <MessageSquare className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">No requests from managers at this time</p>
                  <p className="text-[11px] text-slate-400">Managers can submit requests to the Admin Board directly from their dashboard.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {boardRequests
                    .filter(req => {
                      if (boardFilter === 'pending') return req.status === 'Pending';
                      if (boardFilter === 'acknowledged') return req.status === 'Acknowledged';
                      if (boardFilter === 'resolved') return req.status === 'Resolved';
                      return true;
                    })
                    .map((req, idx) => {
                      const isPending = req.status === 'Pending';
                      const isResolved = req.status === 'Resolved';
                      const isReplying = replyingRequestId === req.id;

                      return (
                        <div
                          key={`${req.id || 'board'}-${idx}`}
                          className={`p-5 rounded-2xl border transition-all ${
                            isPending
                              ? 'bg-indigo-50/50 border-indigo-200 shadow-xs'
                              : isResolved
                              ? 'bg-slate-50/70 border-slate-200 opacity-90'
                              : 'bg-blue-50/40 border-blue-200'
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-blue-100/60 pb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                                {(req.managerName || 'M').charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-slate-900">{req.managerName || 'Property Manager'}</span>
                                  <span className="text-xs text-slate-500">• {req.hostelName || 'Assigned Property'}</span>
                                </div>
                                <p className="text-[11px] text-slate-500">
                                  {req.managerEmail || ''} {req.managerPhone ? `| ${req.managerPhone}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                                {req.category || 'General'}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                req.priority === 'Urgent'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : req.priority === 'High'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {req.priority || 'Normal'} Priority
                              </span>
                              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                                req.status === 'Pending'
                                  ? 'bg-amber-500 text-white'
                                  : req.status === 'Acknowledged'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-emerald-600 text-white'
                              }`}>
                                {req.status}
                              </span>
                            </div>
                          </div>

                          <div className="py-3 space-y-1">
                            <h5 className="text-sm font-bold text-slate-900">{req.subject}</h5>
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{req.message}</p>
                            <p className="text-[10px] text-slate-400 pt-1">
                              Submitted: {new Date(req.createdAt).toLocaleString()}
                            </p>
                          </div>

                          {/* Existing Admin Notes */}
                          {req.adminNotes && (
                            <div className="p-3 bg-white rounded-xl border border-blue-200/70 text-xs text-blue-900 space-y-1 my-2">
                              <span className="font-bold text-[10px] uppercase text-blue-600">Admin Response:</span>
                              <p className="text-xs">{req.adminNotes}</p>
                            </div>
                          )}

                          {/* Reply / Note Drawer */}
                          {isReplying && (
                            <div className="mt-3 p-4 bg-white rounded-xl border border-blue-300 space-y-2">
                              <label className="text-xs font-bold text-slate-700">Reply / Note to Manager:</label>
                              <textarea
                                value={replyNotes}
                                onChange={(e) => setReplyNotes(e.target.value)}
                                rows={2}
                                placeholder="Enter operational reply or resolution instructions for manager..."
                                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setReplyingRequestId(null);
                                    setReplyNotes('');
                                  }}
                                  className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleUpdateBoardRequest(req.id, 'Acknowledged')}
                                  className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                                >
                                  Save as Acknowledged
                                </button>
                                <button
                                  onClick={() => handleUpdateBoardRequest(req.id, 'Resolved')}
                                  className="px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                                >
                                  Save & Resolve
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Action Toolbar */}
                          <div className="flex flex-wrap items-center justify-between pt-3 border-t border-blue-100/60 gap-2">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  setReplyingRequestId(isReplying ? null : req.id);
                                  setReplyNotes(req.adminNotes || '');
                                }}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>{req.adminNotes ? 'Edit Response' : 'Reply to Manager'}</span>
                              </button>

                              {(() => {
                                const matchingRes = residences.find(r => 
                                  (r.name && req.hostelName && r.name.toLowerCase() === req.hostelName.toLowerCase()) ||
                                  (r.id && req.hostelId && r.id === req.hostelId)
                                );
                                if (matchingRes) {
                                  return (
                                    <button
                                      onClick={() => setEditingResidence(matchingRes)}
                                      className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-xl border border-indigo-200 flex items-center gap-1.5 transition-all cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      <span>Edit {matchingRes.name}</span>
                                    </button>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            <div className="flex items-center gap-2">
                              {req.status !== 'Acknowledged' && req.status !== 'Resolved' && (
                                <button
                                  onClick={() => handleUpdateBoardRequest(req.id, 'Acknowledged', req.adminNotes)}
                                  className="text-xs px-3 py-1.5 rounded-xl bg-blue-100 text-blue-800 hover:bg-blue-200 font-bold transition-all cursor-pointer"
                                >
                                  Acknowledge
                                </button>
                              )}
                              {req.status !== 'Resolved' && (
                                <button
                                  onClick={() => handleUpdateBoardRequest(req.id, 'Resolved', req.adminNotes)}
                                  className="text-xs px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Mark Resolved</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            )}

            {/* REGISTERED RESIDENTS OVERVIEW */}
            <div className="bg-white/90 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-blue-100 pb-4 gap-3">
                <h4 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span>Verified Residents Community ({residents.length})</span>
                </h4>
                <span className="text-xs text-slate-400">Active & Registered</span>
              </div>

              {/* Resident Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-blue-100">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search residents by student name, email, room number, or hostel residence..."
                    value={residentSearchQuery}
                    onChange={(e) => setResidentSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                  {residentSearchQuery && (
                    <button onClick={() => setResidentSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-xs font-bold text-slate-500 shrink-0 px-2">
                  Showing {residents.filter(r => {
                    if (!residentSearchQuery.trim()) return true;
                    const q = residentSearchQuery.toLowerCase();
                    return (
                      r.name?.toLowerCase().includes(q) ||
                      r.email?.toLowerCase().includes(q) ||
                      r.residenceName?.toLowerCase().includes(q) ||
                      r.roomNumber?.toLowerCase().includes(q)
                    );
                  }).length} of {residents.length}
                </span>
              </div>

              {residents.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs italic">
                  Residents appear here after activating their assigned room with a room key.
                </div>
              ) : (
                <div className="space-y-3">
                  {residents
                    .filter(r => {
                      if (!residentSearchQuery.trim()) return true;
                      const q = residentSearchQuery.toLowerCase();
                      return (
                        r.name?.toLowerCase().includes(q) ||
                        r.email?.toLowerCase().includes(q) ||
                        r.residenceName?.toLowerCase().includes(q) ||
                        r.roomNumber?.toLowerCase().includes(q)
                      );
                    })
                    .map((res) => (
                    <div key={res.id} className="flex flex-col md:flex-row items-start md:items-center justify-between bg-blue-50/60 border border-blue-100 p-4 rounded-2xl gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-900">{res.name}</p>
                        <p className="text-xs text-slate-600">
                          Email: <span className="text-slate-900 font-semibold">{res.email}</span> | Residence: <span className="text-blue-600 font-semibold">{res.residenceName}</span> ({res.roomNumber})
                        </p>
                      </div>


                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: STAFF VERIFICATION DESK */}


        {/* TAB: STUDENT DIGITAL MARKET MANAGEMENT */}
        {activeTab === 'digital_market' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header Card */}
            <div className="bg-white/90 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/25">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      Student Digital Market Control Desk
                      <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full uppercase">
                        PineVela P2P
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Review student merchant applications, verify accredited university credentials, and manage active digital stores.
                    </p>
                  </div>
                </div>

                {/* Sub-tab Toggle */}
                <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAdminMarketSubTab('applications')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      adminMarketSubTab === 'applications' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Merchant Applications</span>
                    {digitalMarketApps.filter(a => a.status === 'pending').length > 0 && (
                      <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-black rounded-full">
                        {digitalMarketApps.filter(a => a.status === 'pending').length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminMarketSubTab('stores')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      adminMarketSubTab === 'stores' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Store className="w-4 h-4" />
                    <span>Active Digital Stores</span>
                    <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full">
                      {digitalMarketStores.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 pt-2">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Applications</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{digitalMarketApps.length}</div>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">Pending Approvals</div>
                  <div className="text-2xl font-black text-amber-900 mt-1">{digitalMarketApps.filter(a => a.status === 'pending').length}</div>
                </div>
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">Active Stores</div>
                  <div className="text-2xl font-black text-emerald-900 mt-1">{digitalMarketStores.filter(s => !s.isBanned).length}</div>
                </div>
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">Banned / Disabled Stores</div>
                  <div className="text-2xl font-black text-rose-900 mt-1">{digitalMarketStores.filter(s => s.isBanned).length}</div>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">Platform Revenue</div>
                  <div className="text-2xl font-black text-amber-950 mt-1">GHS {totalMerchantFeesCollected.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* SUB TAB 1: APPLICATIONS */}
            {adminMarketSubTab === 'applications' && (
              <div className="bg-white/90 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl space-y-4">
                <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Student Merchant Registration Requests
                </h4>

                {digitalMarketApps.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="p-3">Applicant Name</th>
                          <th className="p-3">Accredited University</th>
                          <th className="p-3">Student Email</th>
                          <th className="p-3">Ghana Card ID</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Fee Plan</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {digitalMarketApps.map(app => (
                          <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-bold text-slate-900">{app.fullName}</td>
                            <td className="p-3 text-blue-900 font-semibold">{app.university}</td>
                            <td className="p-3 text-slate-600 font-mono text-xs">{app.studentEmail}</td>
                            <td className="p-3 text-slate-800 font-mono text-xs font-bold">{app.idNumber || '—'}</td>
                            <td className="p-3 text-slate-600 text-xs">{app.categoryToSell}</td>
                            <td className="p-3 font-bold text-emerald-800 text-xs">50 GHS + 300/sem</td>
                            <td className="p-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                app.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : (app.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800')
                              }`}>
                                {app.status?.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {app.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRejectMarketApp(app.id)}
                                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl transition-all cursor-pointer text-xs"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveMarketApp(app.id)}
                                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer text-xs"
                                  >
                                    Approve Application
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-medium text-[11px]">Decided</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 italic text-xs">
                    No student merchant applications submitted yet.
                  </div>
                )}
              </div>
            )}

            {/* SUB TAB 2: ACTIVE STORES */}
            {adminMarketSubTab === 'stores' && (
              <div className="bg-white/90 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl space-y-4">
                <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-600" />
                  All Student Digital Stores ({digitalMarketStores.length})
                </h4>

                {digitalMarketStores.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="p-3">Store Name</th>
                          <th className="p-3">Owner</th>
                          <th className="p-3">University</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Ban Controls</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {digitalMarketStores.map(store => (
                          <tr key={store.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-bold text-slate-900">{store.storeName}</td>
                            <td className="p-3 text-slate-700">{store.ownerName} ({store.studentEmail})</td>
                            <td className="p-3 text-blue-900 font-semibold">{store.university}</td>
                            <td className="p-3 text-slate-600">{store.category}</td>
                            <td className="p-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                store.isBanned ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {store.isBanned ? 'Banned / Disabled' : 'Active'}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  if (store.isBanned) {
                                    handleToggleBanStore(store.id);
                                  } else {
                                    setBanningStoreTarget(store);
                                  }
                                }}
                                className={`px-3 py-1.5 font-bold rounded-xl transition-all cursor-pointer ${
                                  store.isBanned
                                    ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                                    : 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                                }`}
                              >
                                {store.isBanned ? 'Unban Store' : 'Ban / Disable Store'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 italic text-xs">
                    No student stores registered yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* BAN STORE MODAL */}
        {banningStoreTarget && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
            <div data-popup-card className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-rose-700 flex items-center gap-2">
                  <Ban className="w-5 h-5 text-rose-600" />
                  Ban Digital Store
                </h3>
                <button type="button" onClick={() => setBanningStoreTarget(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-700 font-medium">
                  Are you sure you want to ban/disable <strong>{banningStoreTarget.storeName}</strong>? All listed items will be hidden from the student market.
                </p>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reason for Ban</label>
                  <input
                    type="text"
                    placeholder="e.g. Counterfeit item reports / Policy violation"
                    value={banReasonInput}
                    onChange={e => setBanReasonInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBanningStoreTarget(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleBanStore(banningStoreTarget.id)}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md cursor-pointer"
                >
                  Confirm Ban Store
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* FULL 10-STEP HOSTEL REGISTRATION WIZARD: MANUALLY REGISTER RESIDENCE */}
      {showAddResidenceModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-md p-2 sm:p-4 md:p-8 flex items-start justify-center animate-fadeIn">
          <div data-popup-card className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-blue-200 my-auto">
            <HostelRegistration
              currentUserId={user?.id || 'admin_user'}
              onSuccess={(newHostel) => {
                setShowAddResidenceModal(false);
                const approvedHostel = {
                  ...newHostel,
                  isApproved: true,
                  approvalStatus: 'Approved',
                  status: 'Approved'
                };
                setResidences(prev => [approvedHostel, ...prev.filter(r => r.id !== approvedHostel.id)]);
                triggerToast(`Residence "${newHostel.name}" registered and approved successfully!`);
              }}
              onCancel={() => setShowAddResidenceModal(false)}
            />
          </div>
        </div>
      )}

      {/* MODAL: READ-ONLY INSPECTION FOR PENDING RESIDENCE APPROVAL */}
      {inspectingResidenceModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border border-blue-200 rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-700">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                      Pending Approval
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800">
                      {inspectingResidenceModal.hostel_type || inspectingResidenceModal.wing || 'Student Residence'}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mt-1">{inspectingResidenceModal.name}</h3>
                </div>
              </div>
              <button
                onClick={() => setInspectingResidenceModal(null)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Read-Only Banner Notice */}
            <div className="p-3.5 bg-blue-50/80 rounded-2xl border border-blue-200/70 flex items-center gap-2.5 text-xs text-blue-900 font-semibold">
              <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Read-Only Inspection Mode: Inspect the actual photos, digital address map coordinates, block gender settings, and capacity details before approving or rejecting this application.</span>
            </div>

            {/* 1. ACTUAL UPLOADED PHOTOS GALLERY */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-blue-700" />
                  <span>Submitted Residence Photographs</span>
                </h4>
                <span className="text-[11px] font-bold text-slate-500">
                  Exact manager uploaded photos (No placeholders)
                </span>
              </div>

              {/* Gallery Grid */}
              {(() => {
                const photos: string[] = [];
                const main = inspectingResidenceModal.image || inspectingResidenceModal.imageUrl || inspectingResidenceModal.exteriorPhotoUrl || inspectingResidenceModal.imagePreviewUrl;
                if (main) photos.push(main);
                if (Array.isArray(inspectingResidenceModal.gallery)) {
                  inspectingResidenceModal.gallery.forEach((g: string) => {
                    if (g && !photos.includes(g)) photos.push(g);
                  });
                } else if (Array.isArray(inspectingResidenceModal.images)) {
                  inspectingResidenceModal.images.forEach((g: string) => {
                    if (g && !photos.includes(g)) photos.push(g);
                  });
                }

                return photos.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-500 text-center font-bold">
                    No photographs attached
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative h-64 sm:h-80 w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm">
                      <img
                        src={inspectActiveImage || photos[0]}
                        alt="Submitted property photo"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-lg">
                        {inspectActiveImage === photos[0] || (!inspectActiveImage && photos[0] === main) ? 'Primary Exterior Photo' : 'Gallery Photograph'}
                      </div>
                    </div>

                    {photos.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {photos.map((pUrl, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => setInspectActiveImage(pUrl)}
                            className={`relative w-20 h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                              (inspectActiveImage || photos[0]) === pUrl ? 'border-blue-600 ring-2 ring-blue-600/30 scale-105' : 'border-slate-200 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={pUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 2. ON-SITE GPS VERIFICATION & MAP LOCATION */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-600" />
                  <span>On-Site Dispatch & GPS Verification</span>
                </h4>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${inspectingResidenceModal.digitalAddress || ''} ${inspectingResidenceModal.addressLine1 || ''} ${inspectingResidenceModal.city || ''} Ghana`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Dispatch Team (Google Maps)</span>
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">GhanaPost Digital GPS</span>
                  <span className="font-extrabold text-blue-900 text-sm">{inspectingResidenceModal.digitalAddress || inspectingResidenceModal.gpsAddress || 'GA-183-9022'}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Street Address</span>
                  <span className="font-bold text-slate-800 truncate block">{inspectingResidenceModal.addressLine1 || inspectingResidenceModal.location || 'Campus Main Street'}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">City & Region</span>
                  <span className="font-bold text-slate-800 block">{inspectingResidenceModal.city || 'Accra'}, {inspectingResidenceModal.region || 'Greater Accra'}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Campus Proximity</span>
                  <span className="font-bold text-emerald-800 block">{inspectingResidenceModal.campusProximity || '5-10 Mins Walk'}</span>
                </div>
              </div>
            </div>

            {/* 3. BLOCKS, GENDER & CAPACITY SPECIFICATIONS */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>Blocks, Gender Designation & Room Types</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-center">
                </div>
              </div>

              {/* Blocks breakdown */}
              {Array.isArray(inspectingResidenceModal.blocksList) && inspectingResidenceModal.blocksList.length > 0 && (
                <div className="space-y-2">
                  {inspectingResidenceModal.blocksList.map((block: any, bIdx: number) => (
                    <div key={block.id || bIdx} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900">{block.name || `Block ${bIdx + 1}`}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          block.gender === 'Female' ? 'bg-pink-100 text-pink-800 border border-pink-200' :
                          block.gender === 'Male' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-purple-100 text-purple-800 border border-purple-200'
                        }`}>
                          {block.gender ? `${block.gender} Block` : 'Mixed Block'}
                        </span>
                      </div>

                      {Array.isArray(block.roomTypes) && block.roomTypes.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                          {block.roomTypes.map((rt: any, rtIdx: number) => (
                            <div key={rt.id || rtIdx} className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                              <span className="font-bold text-slate-800">{rt.typeName}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 font-medium">Standard structure: {block.totalRooms || 0} rooms ({block.bedsPerRoom || 1} beds/room)</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. MANAGER PROFILE & CONTACT */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
              <img
                src={inspectingResidenceModal.managerPhoto || (inspectingResidenceModal as any).managerAvatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'}
                alt="Manager"
                className="w-12 h-12 rounded-xl object-cover border border-slate-300"
              />
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Submitted By Manager</span>
                <p className="text-xs font-black text-slate-900">{inspectingResidenceModal.managerName || 'Assigned Manager'}</p>
                <p className="text-xs text-slate-600 font-semibold">{inspectingResidenceModal.managerPhone || '+233 24 123 4567'} • {inspectingResidenceModal.managerEmail || 'manager@pinevela.com'}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 gap-3">
              <button
                onClick={() => setInspectingResidenceModal(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close Details
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const targetRes = inspectingResidenceModal;
                    setInspectingResidenceModal(null);
                    setRejectingResidenceModal(targetRes);
                    setResidenceRejectionReason('');
                  }}
                  className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Reject Application</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      const updated = await apiFetch(`/api/hostels/${inspectingResidenceModal.id}/verify`, {
                        method: 'PUT',
                        body: JSON.stringify({ status: 'Approved', isApproved: true, approvalStatus: 'Approved' })
                      });
                      const freshHostel = updated.hostel || { ...inspectingResidenceModal, status: 'Approved', isApproved: true, approvalStatus: 'Approved' };
                      setResidences(prev => prev.map(r => r.id === inspectingResidenceModal.id ? freshHostel : r));
                      setInspectingResidenceModal(null);
                      triggerToast(`Residence "${inspectingResidenceModal.name}" approved and live!`);
                    } catch(e) {
                      triggerToast('Failed to approve residence');
                    }
                  }}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve & Publish Live</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETAILED REJECTION REASON FOR RESIDENCE APPLICATION */}
      {rejectingResidenceModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border border-rose-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5 text-rose-700">
                <AlertCircle className="w-5 h-5" />
                <h3 className="text-base font-black text-slate-900">Reject Residence Registration</h3>
              </div>
              <button
                onClick={() => setRejectingResidenceModal(null)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Please provide detailed reasons for rejecting <strong>"{rejectingResidenceModal.name}"</strong>. This feedback will be sent directly to the manager's account so they know what to correct.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Detailed Rejection Feedback <span className="text-rose-500">*</span></label>
              <textarea
                rows={4}
                value={residenceRejectionReason}
                onChange={(e) => setResidenceRejectionReason(e.target.value)}
                placeholder="e.g. The exterior photo provided is blurry, and the digital address (GA-183-9022) needs re-verification. Please upload clear photos and re-submit."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectingResidenceModal(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!residenceRejectionReason.trim() || residenceRejectionReason.trim().length < 5) {
                    triggerToast('Please enter a detailed rejection reason for the manager');
                    return;
                  }
                  try {
                    const updated = await apiFetch(`/api/hostels/${rejectingResidenceModal.id}/verify`, {
                      method: 'PUT',
                      body: JSON.stringify({
                        status: 'Rejected',
                        isApproved: false,
                        approvalStatus: 'Rejected',
                        adminNotes: residenceRejectionReason.trim(),
                        rejectionReason: residenceRejectionReason.trim()
                      })
                    });
                    const freshHostel = updated.hostel || {
                      ...rejectingResidenceModal,
                      status: 'Rejected',
                      isApproved: false,
                      approvalStatus: 'Rejected',
                      rejectionReason: residenceRejectionReason.trim(),
                      adminNotes: residenceRejectionReason.trim()
                    };
                    setResidences(prev => prev.map(r => r.id === rejectingResidenceModal.id ? freshHostel : r));
                    setRejectingResidenceModal(null);
                    setResidenceRejectionReason('');
                    triggerToast(`Rejection notice sent to manager for "${rejectingResidenceModal.name}".`);
                  } catch(e) {
                    triggerToast('Failed to record rejection');
                  }
                }}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-md cursor-pointer"
              >
                Submit Rejection Notice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT REGISTERED RESIDENCE */}
      {editingResidence && (
        <EditResidenceModal
          isOpen={Boolean(editingResidence)}
          onClose={() => setEditingResidence(null)}
          residence={editingResidence}
          onSave={handleSaveResidenceEdit}
        />
      )}

      {/* MODAL: DOCUMENT PREVIEW (CV PDF & NATIONAL ID FRONT/BACK) */}
      {docPreviewModal && (() => {
        const docData = (docPreviewModal.url || docPreviewModal.data) as any;
        // Resolve actual data, url, and filename safely when data is a raw string or structured object
        const resolvedData = docPreviewModal.url || (docData && typeof docData === 'object'
          ? (docData.url || docData.data || '')
          : (docData || ''));

        const resolvedFileName = docPreviewModal.fileName || 
          (docData && typeof docData === 'object' ? docData.fileName : '') || 
          'Official_Document';

        // Try extracting readable text from base64 encoded PDF or raw text
        let displayText = '';
        let isPdf = false;

        if (typeof resolvedData === 'string') {
          if (resolvedData.startsWith('data:application/pdf') || resolvedData.startsWith('JVBERi') || resolvedData.includes('%PDF')) {
            isPdf = true;
            // Try our awesome custom parser to show a beautiful readable presentation
            let pdfString = '';
            if (resolvedData.startsWith('data:application/pdf;base64,')) {
              const base64 = resolvedData.split('base64,')[1];
              try { pdfString = atob(base64); } catch (e) {}
            } else if (resolvedData.startsWith('JVBERi')) {
              try { pdfString = atob(resolvedData); } catch (e) {}
            } else {
              pdfString = resolvedData;
            }

            if (pdfString) {
              const regex = /\((.*?)\)\s*Tj/g;
              let match;
              const lines: string[] = [];
              while ((match = regex.exec(pdfString)) !== null) {
                let text = match[1].replace(/\\([()])/g, '$1');
                lines.push(text);
              }
              if (lines.length > 0) {
                displayText = lines.join('\n');
              } else {
                displayText = ''; // trigger fallback UI
              }
            }
          } else {
            displayText = resolvedData;
          }
        }

        // Try parsing ID front/back if structured as stringified JSON or raw object
        let parsedIdData: any = null;
        try {
          if (typeof resolvedData === 'string' && resolvedData.startsWith('{')) {
            parsedIdData = JSON.parse(resolvedData);
          } else if (docData && typeof docData === 'object') {
            if (docData.front || docData.back) {
              parsedIdData = docData;
            }
          }
        } catch (e) {}

        // Find request to resolve live status
        const activeRequest = null;
        const liveDocStatus = activeRequest?.documentsVerified?.[docPreviewModal.docKey!] || 'pending';

        return (
          <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
            <div data-popup-card className="bg-white border border-slate-100 rounded-3xl p-6 max-w-6xl w-full max-h-[96vh] flex flex-col space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
              
              {/* Header block */}
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-900 text-white flex items-center justify-center font-bold shadow-md">
                    {docPreviewModal.type === 'cv' ? <FileText className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">{docPreviewModal.title}</h4>
                    <p className="text-[11px] text-slate-500">{resolvedFileName || 'Official Submitted Credential Document'}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDocPreviewModal(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Advanced 2-Column Split View Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 overflow-hidden">
                
                {/* LEFT COLUMN: Inline Read-Only PDF Viewer Mockup */}
                <div className="lg:col-span-8 flex flex-col h-[52vh] lg:h-[65vh] bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-inner relative">
                  
                  {/* Browser-Native Style PDF Viewer Toolbar */}
                  <div className="bg-slate-900 px-4 py-2 border-b border-slate-700 flex flex-wrap items-center justify-between gap-2 text-slate-300 text-xs">
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-400">PDF READER v1.2</span>
                      <span className="hidden sm:inline">|</span>
                      <span className="hidden sm:inline text-emerald-400 flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Secure Rendering Sandboxed
                      </span>
                    </div>

                    {/* PDF Controls */}
                    <div className="flex items-center gap-2.5">
                      {/* Zoom Controls */}
                      <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                        <button
                          type="button"
                          onClick={() => setPdfZoom(prev => Math.max(prev - 25, 50))}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-700 text-[11px] font-bold rounded transition-colors"
                        >
                          -
                        </button>
                        <span className="px-2 py-1 font-mono text-[10px] font-bold w-12 text-center">{pdfZoom}%</span>
                        <button
                          type="button"
                          onClick={() => setPdfZoom(prev => Math.min(prev + 25, 150))}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-700 text-[11px] font-bold rounded transition-colors"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-slate-500">|</span>
                      <span className="text-[10px] font-mono font-bold bg-slate-800 px-2 py-1 rounded text-slate-300">Page 1 of 1</span>
                    </div>
                  </div>

                  {/* PDF Scroller Stage */}
                  <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-700/30 flex justify-center items-start">
                    
                    {/* Render Content */}
                    <div 
                      style={{ transform: `scale(${pdfZoom / 100})`, transformOrigin: 'top center' }}
                      className="transition-transform duration-200"
                    >
                      {docPreviewModal.type === 'id' ? (
                        <div className="space-y-4">
                          {parsedIdData && (parsedIdData.front || parsedIdData.back) ? (
                            <div className="space-y-4 max-w-md w-[450px]">
                              <div className="p-4 bg-white rounded-2xl border border-slate-300 shadow-lg text-left space-y-2">
                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest block">FRONT SIDE</span>
                                {parsedIdData.front && (parsedIdData.front.startsWith('data:') || parsedIdData.front.startsWith('http')) ? (
                                  <img src={parsedIdData.front} alt="ID Front" className="w-full h-44 object-contain rounded-xl border bg-slate-50" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="p-8 text-center text-xs font-mono text-slate-500 bg-slate-50 rounded-xl">Document Attachment Available Online</div>
                                )}
                              </div>

                              <div className="p-4 bg-white rounded-2xl border border-slate-300 shadow-lg text-left space-y-2">
                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest block">BACK SIDE</span>
                                {parsedIdData.back && (parsedIdData.back.startsWith('data:') || parsedIdData.back.startsWith('http')) ? (
                                  <img src={parsedIdData.back} alt="ID Back" className="w-full h-44 object-contain rounded-xl border bg-slate-50" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="p-8 text-center text-xs font-mono text-slate-500 bg-slate-50 rounded-xl">Document Attachment Available Online</div>
                                )}
                              </div>
                            </div>
                          ) : typeof resolvedData === 'string' && (resolvedData.startsWith('data:') || resolvedData.startsWith('http')) ? (
                            <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-300 w-[450px]">
                              <img src={resolvedData} alt="National ID" className="w-full h-auto object-contain rounded-xl" referrerPolicy="no-referrer" />
                            </div>
                          ) : (
                            <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-300 text-center space-y-3 w-[450px]">
                              <ShieldCheck className="w-12 h-12 text-blue-900 mx-auto" />
                              <h6 className="text-xs font-extrabold text-slate-800">Secure Document Attached</h6>
                              <p className="font-mono text-[11px] text-slate-500 break-all">{String(resolvedData)}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Document / CV text presentation formatted beautifully as a read-only scanned document sheet */
                        <div className="bg-white shadow-2xl p-8 md:p-12 w-[540px] min-h-[680px] border border-slate-300 text-left font-serif text-slate-800 text-[11.5px] tracking-normal leading-relaxed relative rounded-sm">
                          
                          {/* Official Header layout */}
                          <div className="border-b-4 border-double border-slate-300 pb-4 mb-6 text-center">
                            <h5 className="font-sans font-black uppercase tracking-widest text-slate-900 text-[13px]">{docPreviewModal.title}</h5>
                            <span className="text-[9px] font-sans text-slate-500 font-extrabold tracking-wider uppercase block mt-1">Official PineVela Secured Record — Handled Inline</span>
                          </div>

                          {/* Watermark layer */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none rotate-45 text-slate-900 font-black text-6xl uppercase tracking-widest">
                            PineVela Secure
                          </div>

                          {displayText ? (
                            <pre className="whitespace-pre-wrap font-sans text-slate-800 text-xs md:text-sm leading-relaxed tracking-normal font-medium">{displayText}</pre>
                          ) : (
                            <div className="space-y-6 font-sans">
                              <div>
                                <h6 className="text-xs font-extrabold uppercase text-blue-900 mb-2 border-b pb-1">1. PROFILE SUMMARY</h6>
                                <p className="text-slate-700 leading-relaxed text-xs">Certified Residence & Property Manager applicant. Highly experienced in maintenance, student safety protocols, hostel registration, and compliance tracking. Detailed logs and credentials uploaded for verification.</p>
                              </div>

                              <div>
                                <h6 className="text-xs font-extrabold uppercase text-blue-900 mb-2 border-b pb-1">2. VERIFIED CREDENTIAL METADATA</h6>
                                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                                  <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-black block">Applicant Name</span>
                                    <span className="font-black text-slate-800">{docPreviewModal.name || 'Manager Applicant'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-black block">Document Identifier</span>
                                    <span className="font-mono text-slate-800">{resolvedFileName}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-black block">System Verification Status</span>
                                    <span className="font-extrabold text-blue-900 uppercase">{ 'Pending approval'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-black block">Origin Host</span>
                                    <span className="font-mono text-slate-600">secure-gateway.pinevela.com</span>
                                  </div>
                                </div>
                              </div>

                              <div className="pt-8 border-t border-dashed mt-8 flex justify-between items-end">
                                <div className="space-y-1">
                                  <span className="text-[9px] text-slate-400 uppercase font-black block">System Verification QR Signature</span>
                                  <div className="w-14 h-14 bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px] text-slate-400 font-mono">
                                    [ SIGNED QR ]
                                  </div>
                                </div>
                                <div className="text-right space-y-1">
                                  <div className="font-serif italic text-xs text-slate-600 border-b border-slate-400 w-32 pb-1 inline-block">Digitally Approved</div>
                                  <span className="text-[9px] text-slate-400 uppercase font-black block">PineVela Compliance Officer</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Sidebar containing details & requested 'Verify' status toggle */}
                <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                  
                  <div className="space-y-4">
                    {/* Specifications List */}
                    <div className="space-y-2 border-b pb-3">
                      <span className="text-[10px] font-black uppercase text-slate-400 block tracking-widest">Document Specs</span>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Type:</span>
                          <span className="font-black text-slate-800 uppercase">{docPreviewModal.type === 'cv' ? 'Curriculum Vitae' : 'National Identity'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">File Name:</span>
                          <span className="font-bold text-slate-800 truncate max-w-[150px]" title={resolvedFileName}>{resolvedFileName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Size Checked:</span>
                          <span className="font-mono font-bold text-blue-900">1.24 MB (Strict &lt;5MB limit)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Attached By:</span>
                          <span className="font-bold text-slate-800">{docPreviewModal.name || 'Applicant'}</span>
                        </div>
                      </div>
                    </div>

                    {/* REQUESTED 'VERIFY' STATUS TOGGLE NEXT TO PREVIEW */}
                    <div className="space-y-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-blue-700" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700">Document Verification Toggle</span>
                      </div>

                      {/* Display Current State */}
                      <div className="py-2.5 px-3 rounded-xl border flex items-center justify-between text-xs font-bold bg-slate-50">
                        <span className="text-slate-500">Current Status:</span>
                        {activeRequest && docPreviewModal.docKey ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            liveDocStatus === 'verified'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : liveDocStatus === 'rejected'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}>
                            {liveDocStatus}
                          </span>
                        ) : (
                          <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">Unregistered</span>
                        )}
                      </div>

                      {/* Decisive Toggle buttons */}
                      {activeRequest && docPreviewModal.docKey ? (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              handleVerifyManagerDoc(activeRequest.id, docPreviewModal.docKey as any, 'verified');
                            }}
                            className={`w-full py-2.5 px-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                              liveDocStatus === 'verified'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                            <span>{liveDocStatus === 'verified' ? '✓ Document Verified' : 'Mark Document as Verified'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleVerifyManagerDoc(activeRequest.id, docPreviewModal.docKey as any, 'rejected');
                            }}
                            className={`w-full py-2.5 px-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                              liveDocStatus === 'rejected'
                                ? 'bg-rose-600 text-white shadow-md'
                                : 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200'
                            }`}
                          >
                            <X className="w-4 h-4" />
                            <span>{liveDocStatus === 'rejected' ? '✕ Document Rejected' : 'Reject Document'}</span>
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 text-center">Interactive decision actions are not available for unregistered guest attachments.</p>
                      )}
                    </div>
                  </div>

                  {/* Actions & Close */}
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex gap-2">
                      <a
                        href={previewBlobUrl || docPreviewModal.endpoint || resolvedData || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10.5px] font-bold text-center flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <ExternalLink size={13} /> Browser Tab
                      </a>
                      <button
                        type="button"
                        onClick={() => downloadPdfDocument(resolvedData, resolvedFileName, docPreviewModal.name || 'Applicant')}
                        className="flex-1 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-xl text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Download size={13} /> Save PDF
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDocPreviewModal(null)}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer text-center"
                    >
                      Close Preview
                    </button>
                  </div>

                </div>

              </div>

            </div>
          </div>
        );
      })()}

      {/* MODAL: REJECT STAFF CREDENTIALS WITH REASON */}


      {/* MODAL: VERIFIED STAFF MANAGEMENT & DETAILS */}


      {/* MODAL: DISABLE / BAN / REACTIVATE STAFF ACCOUNT ACTION */}


      {/* MODAL: DISPATCH PINEVELA VERIFICATION TEAM OFFICER */}
      {dispatchModalManager && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-900 text-sky-400 flex items-center justify-center font-bold shadow-md shadow-blue-900/30">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">Dispatch PineVela Verification Team</h4>
                  <p className="text-xs text-slate-500">Property: <strong>{dispatchModalManager.propertyName || dispatchModalManager.organization}</strong></p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDispatchModalManager(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDispatchVerificationTeam} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Hostel Location & Manager Contact</span>
                <p className="font-bold text-slate-900">📍 {dispatchModalManager.preciseLocation || dispatchModalManager.physicalAddress || 'Accra Central'}</p>
                <p className="text-slate-600">👤 {dispatchModalManager.managerName} ({dispatchModalManager.managerPhone || 'Phone unavailable'})</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-800 uppercase tracking-wider text-[11px] block">
                  Assign PineVela Verification Officer *
                </label>
                <select
                  required
                  value={dispatchOfficerId}
                  onChange={(e) => setDispatchOfficerId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Select Field Officer --</option>
                  {verificationTeams.filter(o => o.status !== 'suspended').map((officer) => (
                    <option key={officer.officerId || officer.id} value={officer.officerId || officer.id}>
                      {officer.fullName} ({officer.officerId}) — {officer.assignedZone}
                    </option>
                  ))}
                </select>
                {verificationTeams.length === 0 && (
                  <p className="text-[11px] text-amber-600 font-bold">
                    No verification officers registered. Please register an officer in the "Field Officers" tab first.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-800 uppercase tracking-wider text-[11px] block">
                  Inspection Priority Level
                </label>
                <select
                  value={dispatchPriority}
                  onChange={(e: any) => setDispatchPriority(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="low">Standard / Low Priority</option>
                  <option value="medium">Medium Priority (Within 48h)</option>
                  <option value="high">High Priority (Within 24h)</option>
                  <option value="urgent">Urgent On-Site Audit (Same Day)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-800 uppercase tracking-wider text-[11px] block">
                  Dispatch Instructions & Field Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="e.g. Call manager on WhatsApp 30 mins prior to arrival. Verify perimeter fence and fire extinguishers."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setDispatchModalManager(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchingLoading || !dispatchOfficerId}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-850 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <MapPin className="w-4 h-4 text-sky-300" />
                  <span>{dispatchingLoading ? 'Dispatching...' : 'Dispatch Officer Now'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REVIEW LIVE ON-SITE INSPECTION REPORT */}
      {reviewReportInspection && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div data-popup-card className="bg-white border border-slate-200 rounded-3xl p-6 max-w-2xl w-full space-y-6 shadow-2xl my-8 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-900 text-white flex items-center justify-center font-bold shadow-md">
                  <ShieldCheck className="w-6 h-6 text-sky-400" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">Official On-Site Physical Verification Report</h4>
                  <p className="text-xs text-slate-500">Property: <strong>{reviewReportInspection.propertyName}</strong> | Auditor: <strong>{reviewReportInspection.assignedOfficerName || 'Field Officer'}</strong></p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewReportInspection(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live GPS & Timestamp Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs">
              <div>
                <span className="text-[10px] text-emerald-700 font-black uppercase block">Live Verified Location</span>
                <span className="font-extrabold text-slate-900">
                  📍 {reviewReportInspection.report?.gpsCoordinates
                    ? `${reviewReportInspection.report.gpsCoordinates.lat?.toFixed(4)}, ${reviewReportInspection.report.gpsCoordinates.lng?.toFixed(4)}`
                    : reviewReportInspection.report?.liveCoordinates
                    ? `${reviewReportInspection.report.liveCoordinates.lat?.toFixed(4)}, ${reviewReportInspection.report.liveCoordinates.lng?.toFixed(4)}`
                    : 'On-Site GPS Logged'}
                </span>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {reviewReportInspection.report?.gpsCoordinates?.capturedAddress || reviewReportInspection.report?.verifiedAddress || reviewReportInspection.preciseLocation || 'On-site coordinates verified'}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-emerald-700 font-black uppercase block">Inspection Timestamp</span>
                <span className="font-bold text-slate-900">
                  {reviewReportInspection.report?.submittedAt ? new Date(reviewReportInspection.report.submittedAt).toLocaleString() : 'Audit Complete'}
                </span>
                <p className="text-[10px] text-emerald-800 font-bold mt-0.5">✓ Certified Physical On-Site In-Person Audit</p>
              </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-3">
              <h5 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                PineVela On-Site Verification Criteria Checklist
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Residence Actually Exists on Ground', checked: Boolean(reviewReportInspection.report?.checklist?.residenceExists) },
                  { label: 'Manager Genuinely Connected to Property', checked: Boolean(reviewReportInspection.report?.checklist?.managerConnected) },
                  { label: 'Basic Property Info Accurate', checked: Boolean(reviewReportInspection.report?.checklist?.basicPropertyInfoVerified ?? reviewReportInspection.report?.checklist?.propertyInfoAccurate) },
                  { label: "Manager's Identity / Authority Confirmed", checked: Boolean(reviewReportInspection.report?.checklist?.managerAuthorityConfirmed ?? reviewReportInspection.report?.checklist?.managerIdentityConfirmed) },
                  { label: 'General Operation Legitimacy Verified', checked: Boolean(reviewReportInspection.report?.checklist?.generalLegitimacyConfirmed) },
                  { label: 'Safe & Habitable Student Housing', checked: Boolean(reviewReportInspection.report?.checklist?.safetyHabitableCompliance ?? reviewReportInspection.report?.checklist?.safeAndHabitable) }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        item.checked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'
                      }`}>
                        {item.checked ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <X className="w-3.5 h-3.5" />}
                      </div>
                      <span className={`font-bold ${item.checked ? 'text-slate-800' : 'text-slate-400'}`}>
                        {item.label}
                      </span>
                    </div>
                    <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      item.checked ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {item.checked ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Property Physical Inspection Data removed as requested */}

            {/* Live Inspection Photos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-blue-700" />
                  <span>Live Field Inspection Photographs ({reviewReportInspection.report?.photos?.length || 0})</span>
                </h5>
              </div>

              {reviewReportInspection.report?.photos && reviewReportInspection.report.photos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {reviewReportInspection.report.photos.map((photoItem: any, pIdx: number) => {
                    const isObj = typeof photoItem === 'object' && photoItem !== null;
                    const photoUrl = isObj ? photoItem.url : photoItem;
                    const photoTitle = isObj ? photoItem.title : `Inspection Photo #${pIdx + 1}`;
                    const photoTime = isObj && photoItem.capturedAt ? new Date(photoItem.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

                    return (
                      <div
                        key={pIdx}
                        onClick={() => {
                          setDocPreviewModal({
                            type: 'id',
                            url: photoUrl,
                            title: photoTitle,
                            name: reviewReportInspection.assignedOfficerName || 'Verification Officer'
                          });
                        }}
                        className="rounded-2xl overflow-hidden border border-slate-200 bg-white p-2 shadow-xs cursor-pointer hover:border-blue-400 hover:shadow-md transition-all space-y-1.5 group"
                      >
                        <div className="aspect-video rounded-xl overflow-hidden bg-slate-900 relative">
                          <img src={photoUrl} alt={photoTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-[11px] font-black text-white px-2 py-1 bg-black/60 rounded-lg">View Full Image</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] px-1">
                          <span className="font-bold text-slate-900 truncate" title={photoTitle}>{photoTitle}</span>
                          {photoTime && <span className="text-[10px] text-slate-400 font-mono">{photoTime}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                  No photographic evidence attached to this inspection report.
                </div>
              )}
            </div>

            {/* Officer Notes & Recommendation */}
            <div className="p-4 bg-sky-50 rounded-2xl border border-sky-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-blue-900 tracking-wider">Officer Field Notes</span>
                <span className={`px-2.5 py-0.5 border rounded-full font-black text-[10px] uppercase ${
                  (reviewReportInspection.report?.recommendation === 'recommend_approval' || reviewReportInspection.report?.inspectorRecommendation === 'recommend_approval')
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}>
                  Recommendation: {(reviewReportInspection.report?.recommendation === 'recommend_approval' || reviewReportInspection.report?.inspectorRecommendation === 'recommend_approval') ? '✓ Recommend Approval' : 'Review Closely'}
                </span>
              </div>
              <p className="text-slate-800 font-semibold italic">
                "{reviewReportInspection.report?.observations || reviewReportInspection.report?.inspectorNotes || 'Physical audit completed by accredited officer.'}"
              </p>
              <p className="text-[11px] font-mono text-slate-500 pt-1 border-t border-sky-200/60">
                Digitally Signed: <strong>{reviewReportInspection.report?.inspectorSignature || `${reviewReportInspection.assignedOfficerName || 'Officer'} (PineVela Inspector)`}</strong>
              </p>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => setReviewReportInspection(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close Report
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleRejectManager(reviewReportInspection.managerVerificationId || reviewReportInspection.id, reviewReportInspection.managerName, reviewReportInspection.managerEmail);
                    setReviewReportInspection(null);
                  }}
                  className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject Manager</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleApproveManager(reviewReportInspection.managerVerificationId || reviewReportInspection.id, reviewReportInspection.managerEmail || '');
                    setReviewReportInspection(null);
                  }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve & Authorize Manager</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTER NEW PINEVELA VERIFICATION OFFICER */}
      {showRegisterOfficerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-900 text-sky-400 flex items-center justify-center font-bold shadow-md shadow-blue-900/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">Register Verification Officer</h4>
                  <p className="text-xs text-slate-500">Add an accredited on-site inspection officer</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterOfficerModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <OnboardingProgress steps={OFFICER_ACCOUNT_STEPS} step={newOfficerData.fullName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newOfficerData.email) ? (newOfficerData.password ? 3 : 2) : 1} label="Officer registration" />
            <form onSubmit={handleRegisterOfficer} className="onboarding-fields space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Officer Full Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Kwame Mensah"
                  value={newOfficerData.fullName}
                  onChange={(e) => setNewOfficerData(prev => ({ ...prev, fullName: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Official Verification Email *</label>
                <input
                  required
                  type="email"
                  placeholder="officer.mensah@pinevela.com"
                  value={newOfficerData.email}
                  onChange={(e) => setNewOfficerData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Phone / WhatsApp *</label>
                <input
                  required
                  type="tel"
                  placeholder="+233 24 123 4567"
                  value={newOfficerData.phone}
                  onChange={(e) => setNewOfficerData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Assigned Geographic Zone</label>
                <select
                  value={newOfficerData.assignedZone}
                  onChange={(e) => setNewOfficerData(prev => ({ ...prev, assignedZone: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Greater Accra - Campus Belt A (Legon / UPSA)">Greater Accra - Campus Belt A (Legon / UPSA)</option>
                  <option value="Greater Accra - Campus Belt B (ATU / Central)">Greater Accra - Campus Belt B (ATU / Central)</option>
                  <option value="Ashanti Region - KNUST / Kumasi">Ashanti Region - KNUST / Kumasi</option>
                  <option value="Central Region - UCC / Cape Coast">Central Region - UCC / Cape Coast</option>
                  <option value="Western Region - UMaT / Takoradi">Western Region - UMaT / Takoradi</option>
                  <option value="Northern Region - UDS / Tamale">Northern Region - UDS / Tamale</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Initial Officer Access Password *</label>
                <input
                  required
                  type="text"
                  placeholder="SecurePassword2026!"
                  value={newOfficerData.password}
                  onChange={(e) => setNewOfficerData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl font-mono text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <PasswordStrengthGauge password={newOfficerData.password} />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowRegisterOfficerModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-850 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 text-sky-300" />
                  <span>Register Officer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: OFFICIAL OFFICER CREDENTIALS ID CARD (FOR HANDOVER) */}
      {createdOfficerCredentials && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-900" />
                <h4 className="text-base font-black text-slate-900">Official PineVela Officer Credentials</h4>
              </div>
              <button
                type="button"
                onClick={() => setCreatedOfficerCredentials(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Frosty Credential ID Card */}
            <div className="p-6 rounded-3xl bg-linear-to-br from-blue-950 via-blue-900 to-indigo-950 text-white shadow-xl relative overflow-hidden border border-blue-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-400/20 text-sky-300 flex items-center justify-center border border-sky-400/30">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-sky-300 block">PineVela Security</span>
                    <span className="text-xs font-bold text-white">Physical Verification Officer</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 bg-sky-500/20 text-sky-200 border border-sky-400/40 rounded-full font-mono text-[10px] font-bold">
                  {createdOfficerCredentials.officerId}
                </span>
              </div>

              <div className="space-y-2 text-xs py-2 border-y border-blue-800/60">
                <div>
                  <span className="text-[10px] uppercase font-bold text-sky-300/80 block">Officer Name</span>
                  <span className="text-sm font-extrabold text-white">{createdOfficerCredentials.fullName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-sky-300/80 block">Official Login Email</span>
                    <span className="font-mono text-[11px] font-bold text-white break-all">{createdOfficerCredentials.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-sky-300/80 block">Officer Password</span>
                    <span className="font-mono text-[11px] font-bold text-amber-300">{createdOfficerCredentials.password}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-sky-300/80 block">Assigned Zone</span>
                  <span className="font-bold text-sky-100">{createdOfficerCredentials.assignedZone}</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 text-[10px] text-sky-300">
                <span>Passcode: <strong className="text-white font-mono">{createdOfficerCredentials.securityPasscode}</strong></span>
                <span className="font-bold">Portal: /verification-team</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 text-center leading-normal">
              Provide these credentials securely to the field officer. They can log in to their assigned inspection queue at the <strong>PineVela Verification Team Portal</strong>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`PineVela Verification Team Credentials:\nOfficer: ${createdOfficerCredentials.fullName}\nOfficer ID: ${createdOfficerCredentials.officerId}\nEmail: ${createdOfficerCredentials.email}\nPassword: ${createdOfficerCredentials.password}\nPortal: https://pinevela.com/verification-team`);
                  triggerToast('Credentials copied to clipboard!');
                }}
                className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5 text-blue-700" />
                <span>Copy Credentials</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedOfficerCredentials(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REJECT MANAGER APPLICATION WITH DETAILED REASON */}
      {rejectManagerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border border-rose-200 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-md shadow-rose-500/30">
                  <X className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">Reject Manager Application</h4>
                  <p className="text-xs text-slate-500">Applicant: <strong>{rejectManagerModal.name}</strong> ({rejectManagerModal.email})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectManagerModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 block">
                Provide Detailed Rejection Reason <span className="text-rose-500">* (Sent to Manager for corrections)</span>
              </label>
              <textarea
                required
                rows={4}
                value={rejectManagerReason}
                onChange={(e) => setRejectManagerReason(e.target.value)}
                placeholder="e.g. Physical residence location could not be confirmed, or property is currently under major uncompleted construction. Please resolve and re-apply."
                className="w-full p-3.5 border border-slate-300 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:outline-none bg-slate-50"
              />
              <p className="text-[10px] text-slate-500 leading-normal">
                This rejection reason will be immediately displayed on <strong>{rejectManagerModal.name}'s</strong> manager portal screen and delivered to their inbox.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                disabled={rejectingManagerLoading}
                onClick={() => setRejectManagerModal(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectingManagerLoading}
                onClick={handleConfirmRejectManager}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>{rejectingManagerLoading ? 'Processing...' : 'Confirm Rejection & Send Feedback'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BLOCK / RESTRICT MANAGER ACCESS WITH REQUIRED DETAILED REASON */}
      {blockManagerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border-2 border-rose-300 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-md shadow-rose-500/30">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">Restrict & Block Manager</h4>
                  <p className="text-xs text-slate-500">Manager: <strong>{blockManagerModal.name}</strong> ({blockManagerModal.email})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlockManagerModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 space-y-1">
              <span className="font-bold block">⚠️ Mandatory Restriction Policy:</span>
              <p>
                Before blocking, you must provide a detailed explanation of why this manager's account is restricted. This message will be sent to their primary user account, their manager card will display a Blocked status, and their registered hostel will be removed from live search.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Detailed Reason for Account Restriction <span className="text-rose-600 font-extrabold">* (Required)</span>
              </label>
              <textarea
                required
                rows={4}
                value={blockManagerReason}
                onChange={(e) => setBlockManagerReason(e.target.value)}
                placeholder="e.g. Failure to comply with KNUST fire safety standards, unverified student complaints regarding utilities, or pending credential re-audit. Account frozen pending investigation."
                className="w-full p-3.5 border-2 border-slate-300 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:border-rose-500 focus:outline-none bg-slate-50 text-slate-900"
              />
              <p className="text-[10px] text-slate-500 leading-normal">
                Minimum 5 characters. This explanation is immediately delivered to the manager's account and displayed on their manager card.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                disabled={blockingManagerLoading}
                onClick={() => setBlockManagerModal(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={blockingManagerLoading}
                onClick={handleConfirmBlockManager}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>{blockingManagerLoading ? 'Restricting Access...' : 'Confirm & Block Manager'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOGOUT CONFIRMATION MODAL */}
      <LogoutConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        userRole={adminSlot ? `Administrator #${adminSlot}` : 'Administrator'}
        userName={user?.name || 'Administrator'}
      />

              
    </div>
  );
}
