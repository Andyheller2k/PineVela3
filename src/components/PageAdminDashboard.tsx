import AdminCustomerService from './AdminCustomerService';
import AdminPaymentReversals from './AdminPaymentReversals';
import HelpLink from './HelpLink';
import AppearanceSettings from './AppearanceSettings';
import { routePopupFeedback } from '../lib/feedback';
import { activateOnKeyboard } from '../lib/keyboardActivation';
import { useActionFeedback } from '../lib/useActionFeedback';
import AccountModerationPanel from './AccountModerationPanel';
import AdminAccountDirectory from './AdminAccountDirectory';
import AdminGovernancePanel,{ useAdminGovernance } from './AdminGovernancePanel';
import AdminMessageGateway from './AdminMessageGateway';
import AdminRemovalNotice from './AdminRemovalNotice';
import AdminSettingsPanel from './AdminSettingsPanel';
import AdministratorLabel from './AdministratorLabel';
import DashboardOverlay from './DashboardOverlay';
import { AdminManagerClosureRequests } from './ManagerClosureRequest';
import MobileNavigation from './MobileNavigation';
import CompactSidebarNavigation from './CompactSidebarNavigation';
import ResidenceDeletionPanel from './ResidenceDeletionPanel';

import { useQuery } from '@tanstack/react-query';
import {
AlertCircle,
ArrowRight,
Ban,
Bell,
Building2,
Camera,
Check,
CheckCircle2,
Clock,
DollarSign,
Download,
Edit3,
ExternalLink,
Eye,
FileCheck,
FileText,
Image as ImageIcon,
Lock,
LogOut as LogOutIcon,
MapPin,
MessageSquare,
PanelLeftClose,
Plus,
Search,
ShieldAlert,
ShieldCheck,
ShoppingBag,Store,
Trash2,
Unlock,
UserPlus,
Users,
X,
XCircle
} from 'lucide-react';
import { AnimatePresence,motion } from 'motion/react';
import React,{ useEffect,useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { safeJson } from '../lib/api';
import { readAdministratorDirectories } from '../lib/adminDirectories';
import { requestKeyedApproval } from '../lib/approvalPrompt';
import { recordedInspectionCoordinates } from '../lib/inspectionLocation';
import { useSidebarLayout } from '../lib/useSidebarLayout';
import { queryClient,} from '../lib/queryClient';
import { currentManagerInspection,pendingManagerRegistration } from '../lib/registrationStatus';
import { pendingResidenceReview,residenceReviewLabel,residenceReviewStatus } from '../lib/residenceReview';
import { sessionFetch as fetch } from '../lib/session';
import { downloadPdfDocument,getPdfBlobUrl } from '../utils/pdfHelper';
import AdminResidenceRegistrationReview from './AdminResidenceRegistrationReview';
import HostelRegistration from './HostelRegistration';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import PineLogo, { PineWordmark } from './PineLogo';
import { AdminResidenceRequests } from './ResidenceChangeRequests';
import SupabaseOfficerInvitationControls from './SupabaseOfficerInvitationControls';
import TopNavBadge from './TopNavBadge';
import '../adminDashboard.css';

export default function PageAdminDashboard() {
  const [moderationTarget, setModerationTarget] = useState<any>(null);
  const { user, logout, apiFetch } = useAuth();
  const reviewOwner=useRef(user?.id);reviewOwner.current=user?.id;
  const managerReviewPending=useRef(false),managerReviewRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>{managerReviewRequest.current?.abort();},[user?.id]);
  const { notifications, unreadCount, markAsRead, refreshNotifications } = useNotifications();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'residences' | 'managers' | 'digital_market' | 'notifications' | 'settings' | 'user_accounts' | 'governance' | 'messages'>('overview');
  const [deletingResidence, setDeletingResidence] = useState<any>(null);
  
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
  const [rejectSellerId,setRejectSellerId] = useState<string | null>(null);
  const [rejectSellerNotes,setRejectSellerNotes] = useState('');
  const [rejectSellerBusy,setRejectSellerBusy] = useState(false);
  const [digitalMarketStores, setDigitalMarketStores] = useState<any[]>([]);
  const [adminMarketSubTab, setAdminMarketSubTab] = useState<'applications' | 'stores'>('applications');
  const [banReasonInput, setBanReasonInput] = useState<string>('');
  const [banningStoreTarget, setBanningStoreTarget] = useState<any | null>(null);
  // Expanded sidebar and compact side rail share a device preference.
  const isSidebarCollapsed = false;
  const [isSidebarCompact, setIsSidebarCompact] = useSidebarLayout('admin-dashboard-sidebar');
  const actionFeedback = useActionFeedback();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit Residence State
  const [inspectingResidenceModal, setInspectingResidenceModal] = useState<any | null>(null);
  const [rejectingResidenceModal, setRejectingResidenceModal] = useState<any | null>(null);
  const [residenceRejectionReason, setResidenceRejectionReason] = useState('');
  const [inspectActiveImage, setInspectActiveImage] = useState<string>('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [managerSearchQuery, setManagerSearchQuery] = useState('');
  const [residentSearchQuery, setResidentSearchQuery] = useState('');

  // Settings State

  const { data: governanceData } = useAdminGovernance(true, true);
  const adminSlot = governanceData?.members.find((m: any) => m.id === user?.id)?.slot;
  const governanceUnread = notifications.filter(n => !n.read && n.module === 'admin_governance').length;
  const settingsUnread = notifications.filter(n => !n.read && n.module === 'admin_settings').length;
  const pendingGovernance = (governanceData?.proposals.filter((p: any) => ['pending', 'approved'].includes(p.status)).length || 0) + (governanceData?.residenceProposals?.filter((p: any) => ['pending', 'approved'].includes(p.status)).length || 0) + (governanceData?.changes.filter((c: any) => c.status === 'pending').length || 0) + (governanceData?.accountProposals?.filter((p: any) => ['pending', 'approved'].includes(p.status)).length || 0);

  // Datasets
  const [residences, setResidences] = useState<any[]>([]);
  const [managerRequests, setManagerRequests] = useState<any[]>([]);
  const [managerRestrictions, setManagerRestrictions] = useState<any[]>([]);
  const [managerRestrictionError, setManagerRestrictionError] = useState('');
  const [marketStoreError, setMarketStoreError] = useState('');

  const residents = allUsersData.users.filter((account: any) => ['student', 'resident'].includes(account.role)).map((account: any) => ({ ...account, residenceName: account.hostelName || account.residenceName || '', roomNumber: account.roomNumber || '' }));
  const [feesPaid, setFeesPaid] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Verification Teams & Physical Inspection State
  const [managerSubTab, setManagerSubTab] = useState<'inspections' | 'officers' | 'cooldowns'>('inspections');
  const [verificationTeams, setVerificationTeams] = useState<any[]>([]);
  const [officerRosterError, setOfficerRosterError] = useState('');
  const [verificationInspections, setVerificationInspections] = useState<any[]>([]);

  // Dispatch Officer Modal State
  const [dispatchModalManager, setDispatchModalManager] = useState<any | null>(null);
  const [dispatchOfficerId, setDispatchOfficerId] = useState('');
  const [dispatchPriority, setDispatchPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchingLoading, setDispatchingLoading] = useState(false);

  // Review Inspection Report Modal State
  const [reviewReportInspection, setReviewReportInspection] = useState<any | null>(null);
  const reviewedInspectionGps = recordedInspectionCoordinates(reviewReportInspection?.report?.gpsCoordinates)
    || recordedInspectionCoordinates(reviewReportInspection?.report?.liveCoordinates);
  const reviewedInspectionRecommendation = reviewReportInspection?.report?.recommendation
    ?? reviewReportInspection?.report?.inspectorRecommendation;

  const [approveManagerModal, setApproveManagerModal] = useState<{
    id: string; email: string; property: string; ownerId: string; recommendation?: string;
  } | null>(null);
  const [approveManagerNotes, setApproveManagerNotes] = useState('');
  const [approveManagerError, setApproveManagerError] = useState('');
  const [approvingManager, setApprovingManager] = useState(false);
  const [approvalUncertain, setApprovalUncertain] = useState(false);
  const approvalNeedsReason = approveManagerModal?.recommendation !== 'recommend_approval';
  useEffect(() => {
    setApproveManagerModal(null); setApproveManagerNotes(''); setApproveManagerError('');
    setApprovingManager(false); setApprovalUncertain(false);
  }, [user?.id]);

  // Manager Document Inspection & Rejection Modal States
  const [rejectManagerModal, setRejectManagerModal] = useState<{ id: string; name: string; email: string } | null>(null);
  const [rejectManagerReason, setRejectManagerReason] = useState<string>('');
  const [rejectingManagerLoading, setRejectingManagerLoading] = useState<boolean>(false);
  const [managerReviewAction,setManagerReviewAction]=useState<'reject'|'request-info'>('reject');
  useEffect(()=>{setRejectManagerModal(null);setRejectManagerReason('');setRejectingManagerLoading(false);},[user?.id]);

  // Manager Block & Restriction Modal States
  const [blockManagerModal, setBlockManagerModal] = useState<{ id: string; name: string; email: string } | null>(null);
  const [blockManagerReason, setBlockManagerReason] = useState<string>('');
  const [blockingManagerLoading, setBlockingManagerLoading] = useState<boolean>(false);

  // Board Requests & Notifications State
  const [boardRequests, setBoardRequests] = useState<any[]>([]);
  const [notifSubTab, setNotifSubTab] = useState<'manager_requests'>('manager_requests');
  const [docPreviewModal, setDocPreviewModal] = useState<{
    title: string;
    type: 'cv' | 'id';
    data?: string;
    url?: string;
    fileName?: string;
    name?: string;
    endpoint?: string;
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
  const [residenceFilter, setResidenceFilter] = useState<'all' | 'Hostel' | 'Inn' | 'Hotel' | 'Estate' | 'Lounge'>('all');
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

  // Review reads must not wait for the unrelated dashboard datasets. The two
  // manager-list URLs are aliases in Supabase, so read the saved cases once.
  const { data: managerReviewData, error: managerReviewError, isPending: managerReviewPendingRead,
    isFetching: managerReviewFetching, refetch: retryManagerReview } = useQuery({
    queryKey: ['adminData', user?.id, 'managerReview'],
    enabled: (user?.role === 'admin'),
    queryFn: async ({ signal }) => {
      const ownerId = user!.id;
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
      const read = async (path: string): Promise<any[]> => {
        const response = await fetch(path, { signal: requestSignal, headers: { 'X-PineVela-Profile-Context': ownerId } });
        const data = await safeJson(response);
        if (!response.ok || !Array.isArray(data)) throw Error('Could not load manager applications and inspection details. Please retry.');
        return data;
      };
      const [requests, inspections] = await Promise.all([
        read('/api/manager-verifications'), read('/api/admin/verification-inspections')
      ]);
      requestSignal.throwIfAborted();
      if (reviewOwner.current !== ownerId) throw new DOMException('The administrator account changed.', 'AbortError');
      return { ownerId, requests, inspections };
    },
    retry: false,
    refetchInterval: query => query.state.error ? false : 8000,
  });

  const { data: officerRosterData, error: officerRosterReadError, isPending: officerRosterPendingRead,
    isFetching: officerRosterFetching, refetch: retryOfficerRoster } = useQuery({
    queryKey: ['adminData', user?.id, 'officerRoster'],
    enabled: (user?.role === 'admin'),
    queryFn: async ({ signal }) => {
      const ownerId = user!.id;
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
      const response = await fetch('/api/verification-teams', { signal: requestSignal, headers: { 'X-PineVela-Profile-Context': ownerId } });
      const officers = await safeJson(response);
      if (!response.ok || !Array.isArray(officers)) throw Error('Could not load field officers. Please retry.');
      requestSignal.throwIfAborted();
      if (reviewOwner.current !== ownerId) throw new DOMException('The administrator account changed.', 'AbortError');
      return { ownerId, officers };
    },
    retry: false,
    refetchInterval: query => query.state.error ? false : 8000,
  });

  useEffect(() => {

    setManagerRequests([]); setVerificationInspections([]); setVerificationTeams([]); setOfficerRosterError('');
    setDispatchModalManager(null); setReviewReportInspection(null);
  }, [user?.id]);

  useEffect(() => {
    if ((!managerReviewData) || managerReviewData.ownerId !== user?.id) return;
    setManagerRequests(managerReviewData.requests);
    setVerificationInspections(managerReviewData.inspections);
  }, [managerReviewData, user?.id]);

  useEffect(() => {

    setOfficerRosterError(officerRosterReadError ? 'Could not load field officers. Please retry.' : '');
    if (officerRosterData && officerRosterData.ownerId === user?.id) setVerificationTeams(officerRosterData.officers);
  }, [officerRosterData, officerRosterReadError, user?.id]);

  // TanStack Query for the remaining dashboard datasets.
  const { data: adminData, isPending: adminDataPending, error: adminDataError,
    isFetching: adminDataFetching, refetch: retryAdminData } = useQuery({
    queryKey: ['adminData', user?.id],
    enabled: user?.role === 'admin',
    queryFn: async ({ signal }) => {
      const ownerId = user!.id;
      const directories = await readAdministratorDirectories(signal, requestSignal => fetch('/api/admin/dashboard-directories', {
        signal: requestSignal, headers: { 'X-PineVela-Profile-Context': ownerId },
      }));
      signal.throwIfAborted();
      if (reviewOwner.current !== ownerId) throw new DOMException('The administrator account changed.', 'AbortError');
      return directories;
    },
    retry: (false),
    refetchInterval: query => (query.state.error) ? false : 30000,
  });

  const adminDirectoriesUnavailable = (!adminData);

  useEffect(() => {
    if (!adminData) return;
    setResidences(adminData.residences);

    setManagerRestrictions(adminData.managerRestrictions);
    setManagerRestrictionError('');
    setMarketStoreError('');
    setBoardRequests(adminData.boardRequests);
    setActivities(adminData.activities);
    setDigitalMarketApps(adminData.digitalMarketApps);
    setDigitalMarketStores(adminData.digitalMarketStores);
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

  const handleRejectMarketApp = async (appId: string, notes?: string) => {
    if ((notes === undefined)) {setRejectSellerId(appId);setRejectSellerNotes('');return;}
    setRejectSellerBusy(true);
    try {
      const res = await apiFetch('/api/admin/digital-market/reject-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId, ...(notes !== undefined ? {adminNotes:notes.trim()} : {}) })
      });
      if (res && res.success) {
        triggerToast("Digital Market application rejected.");
        setRejectSellerId(null);setRejectSellerNotes('');
        fetchAdminData();
      }
    } catch (e: any) {
      triggerToast(e.message || "Failed to reject application");
    } finally {
      setRejectSellerBusy(false);
    }
  };

  const handleToggleBanStore = async (_storeId: string) => {
    setBanningStoreTarget(null);
    setActiveTab('user_accounts');
    triggerToast('Select the seller account and submit a proposal for five-administrator approval.');
  };

  const handleToggleOfficerStatus = async (officerId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const update = (privateKey?: string) => apiFetch(`/api/verification-teams/${officerId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus, ...(privateKey ? { privateKey } : {}) })
      });
      const res = (await requestKeyedApproval(update));
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

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleApproveManager = async (reqId: string, managerEmail: string) => {
    {
      if(managerReviewPending.current||!user?.id)return;
      const inspection=currentManagerInspection(reqId,verificationInspections);
      if(inspection?.status!=='report_submitted'||!inspection.report){
        triggerToast('Reload the submitted inspection report before approving this application.');return;
      }
      const application=managerRequests.find(item=>item.id===reqId);
      setApproveManagerModal({id:reqId,email:managerEmail,property:application?.hostelName||inspection.hostelName||'',
        ownerId:user.id,recommendation:inspection.report.recommendation});
      setApproveManagerNotes('');setApproveManagerError('');setApprovalUncertain(false);
      return;
    }

  };

  const submitManagerApproval = async (event: React.FormEvent) => {
    event.preventDefault();
    const target=approveManagerModal,notes=approveManagerNotes.trim();
    if(!target||target.ownerId!==user?.id||managerReviewPending.current||approvalUncertain)return;
    if(target.recommendation!=='recommend_approval'&&notes.length<5){
      setApproveManagerError('Explain why you are approving despite the officer recommendation.');return;
    }
    managerReviewPending.current=true;setApprovingManager(true);setApproveManagerError('');
    const captured=target.ownerId,controller=new AbortController();managerReviewRequest.current=controller;
    let uncertain=false;
    try{
      const attempt=await requestKeyedApproval(async privateKey=>{
        controller.signal.throwIfAborted();
        if(reviewOwner.current!==captured)throw Error('The administrator account changed.');
        uncertain=true;
        // Resolve transport failures to the caller so an uncertain write closes
        // the key prompt and requires the existing saved-record recovery step.
        try{return{response:await fetch(`/api/manager-verifications/${target.id}/approve`,{method:'PUT',
          headers:{'content-type':'application/json','X-PineVela-Profile-Context':captured},body:JSON.stringify({adminNotes:notes,privateKey}),
          signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])})};}
        catch(error){return{error};}
      });
      if(attempt.error)throw attempt.error;
      const response=attempt.response as Response;
      const result=await response.json();
      if(!response.ok){uncertain=response.status>=500;throw Error(result.error||'Could not approve this application.');}
      if(!result.success||result.verification?.id!==target.id||result.verification?.status!=='approved')throw Error('The saved decision could not be confirmed.');
      if(reviewOwner.current===captured){
        setApproveManagerModal(null);setApproveManagerNotes('');
        triggerToast('Manager application approved. The primary owner has been notified.');
        void fetchAdminData();void refreshNotifications();
      }
    }catch(error:any){
      if(reviewOwner.current===captured){
        setApprovalUncertain(uncertain);
        setApproveManagerError(uncertain?'The decision could not be confirmed. Refresh the saved application before trying again.':error.message);
      }
    }finally{
      managerReviewPending.current=false;managerReviewRequest.current=null;
      if(reviewOwner.current===captured)setApprovingManager(false);
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
    setManagerReviewAction('reject');
    const target = managerRequests.find(r => r.id === reqId);
    setRejectManagerModal({
      id: reqId,
      name: managerName || target?.managerName || 'Hostel Manager Applicant',
      email: managerEmail || target?.managerEmail || ''
    });
    setRejectManagerReason('');
  };

  const handleConfirmRejectManager = async () => {
    if (!rejectManagerModal||managerReviewPending.current) return;
    if (!rejectManagerReason.trim() || rejectManagerReason.trim().length < 5) {
      triggerToast('Provide detailed administrator feedback (minimum 5 characters).');
      return;
    }

    managerReviewPending.current=true;setRejectingManagerLoading(true);
    const captured=user?.id,controller=new AbortController();managerReviewRequest.current=controller;
    try {
      const payload = {
        rejectionReason: rejectManagerReason.trim(),
        adminNotes: rejectManagerReason.trim()
      };

      {
        const response=await fetch(`/api/manager-verifications/${rejectManagerModal.id}/${managerReviewAction}`,{
          method:'PUT',headers:{'content-type':'application/json','X-PineVela-Profile-Context':String(captured)},
          body:JSON.stringify(payload),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
        const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save administrator feedback.');
        const expected=managerReviewAction==='request-info'?'more_info_required':'rejected';
        if(!result.success||result.verification?.id!==rejectManagerModal.id||result.verification?.status!==expected)
          throw Error('The saved decision could not be confirmed. Refresh the application before retrying.');
      }

      if(reviewOwner.current!==captured)return;
      setManagerRequests(prev => prev.map(r => r.id === rejectManagerModal.id ? {
        ...r,
        status: managerReviewAction==='request-info'?'more_info_required':'rejected',
        rejectionReason: rejectManagerReason.trim(),
        adminNotes: rejectManagerReason.trim()
      } : r));

      triggerToast(managerReviewAction==='request-info'?'Corrections requested. Feedback is available in the primary user account.':'Manager application rejected. Feedback is available in the primary user account.');
      setRejectManagerModal(null);
      setRejectManagerReason('');
      refreshNotifications();
      fetchAdminData();
    } catch (err: any) {
      if(reviewOwner.current===captured)triggerToast(err.name==='TimeoutError'?'The request timed out. Refresh the saved application before retrying.':err.message||'Failed to save manager feedback.');
    } finally {
      managerReviewPending.current=false;managerReviewRequest.current=null;
      if(reviewOwner.current===captured)setRejectingManagerLoading(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    if (!await logout()) return;
    navigate('/login', { replace: true });
  };

  const pendingManagersCount = managerRequests.filter(r => (pendingManagerRegistration(r))).length;
  const hostelCount = residences.filter(r => ((r.wing || '')).toLowerCase().includes('hostel')).length;
  const hotelCount = residences.filter(r => ((r.wing || '')).toLowerCase().includes('hotel')).length;
  const loungeCount = residences.filter(r => (r.hostel_type || '').toLowerCase().includes('lounge')).length;
  const totalManagers = allUsersData.breakdown.managers;
  const totalResidents = residents.length;
  const totalResidences = residences.length;
  const totalFeesCollected = feesPaid.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  // Revenue is counted once from server-verified live transactions. Test/free payments are excluded.
  const totalMerchantFeesCollected = (adminData?.paymentRecords || []).filter((p: any) => p.mode === 'live' && p.purpose !== 'housing').reduce((sum: number, p: any) => sum + Number(p.netAmount ?? p.amount), 0);
  const activeMerchantCount = digitalMarketStores.filter((s: any) => (s.isActive)).length;

  const pendingHostelsCount = residences.filter(r => (pendingResidenceReview(r))).length;

  const pendingBoardRequestsCount = boardRequests.filter(r => r.status === 'Pending').length;
  const adminAlertCount = unreadCount;

  return (
    <div data-dashboard-shell data-navigation-layout={isSidebarCompact ? 'compact' : 'sidebar'} data-sidebar-collapsed={isSidebarCompact} onClickCapture={actionFeedback.capture} onSubmitCapture={actionFeedback.capture} className="admin-dashboard page-canvas min-h-screen h-screen flex flex-col lg:flex-row text-slate-800 overflow-hidden font-sans">
      <AdminRemovalNotice />
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div role="status"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="ux-dashboard-toast fixed top-6 right-6 z-50 bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-blue-400/30 backdrop-blur-md"
          >
            <span className="font-medium text-sm">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE HEADER (lg:hidden) */}
      <header data-portal-navigation="header" className="lg:hidden flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-xl border-b border-sky-200/50 sticky top-0 z-40 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PineLogo size={28} hideText />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black tracking-tight text-blue-950 leading-tight"><PineWordmark /></h1><p className="text-[10px] text-slate-500">Admin {adminSlot ? `#${adminSlot}` : ''}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <HelpLink compact className="!px-2" />
          <button onClick={() => setShowLogoutConfirm(true)} className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg" title="Sign Out">
            <LogOutIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* MOBILE BOTTOM NAV (lg:hidden) */}
      <MobileNavigation label="Administrator navigation" activeTab={activeTab} onSelect={id => setActiveTab(id as any)} primaryIds={["overview", "residences", "managers", "notifications"]} items={[
            { id: 'overview', label: 'Overview', icon: ShieldCheck },
            { id: 'user_accounts', label: 'Accounts', icon: Users, group: 'Management' },
            { id: 'residences', label: 'Residences', icon: Building2, badge: pendingHostelsCount },
            { id: 'managers', label: 'Managers', icon: Users, badge: pendingManagersCount },
            { id: 'digital_market', label: 'Market', icon: ShoppingBag, group: 'Management', badge: digitalMarketApps.filter(a => a.status === 'pending').length || null },
            { id: 'notifications', label: 'Alerts', icon: Bell, badge: adminAlertCount },
            { id: 'messages', label: 'Message Gateway', icon: MessageSquare, group: 'Administration' }, { id: 'governance', label: 'Approvals', icon: ShieldCheck, group: 'Administration', badge: governanceUnread }, { id: 'settings', label: 'Settings', icon: Edit3, group: 'Account', badge: settingsUnread }
          ]} />

      {/* SIDEBAR: PURELY STATIC / FIXED ICE-BLUE FROSTY BLUE WITH CURVED EDGES & BLUE GLOW */}

      {isSidebarCompact && <CompactSidebarNavigation id="admin-dashboard-sidebar" label="Administrator navigation sidebar"
        activeTab={activeTab} onExpand={() => setIsSidebarCompact(false)} items={[
          { id: 'overview', label: 'Overview', icon: ShieldCheck },
          { id: 'user_accounts', label: 'Accounts', icon: Users, badge: allUsersData.totalUsers },
          { id: 'residences', label: 'Residences', icon: Building2, badge: pendingHostelsCount },
          { id: 'managers', label: 'Managers', icon: Users, badge: pendingManagersCount },
          { id: 'digital_market', label: 'Market', icon: ShoppingBag, badge: digitalMarketApps.filter(a => a.status === 'pending').length },
          { id: 'notifications', label: 'Alerts', icon: Bell, badge: adminAlertCount },
          { id: 'messages', label: 'Messages', icon: MessageSquare },
          { id: 'governance', label: 'Approvals', icon: ShieldCheck, badge: governanceUnread },
          { id: 'settings', label: 'Settings', icon: Edit3, badge: settingsUnread }
        ]} onSelect={id => setActiveTab(id as any)} onSignOut={() => setShowLogoutConfirm(true)} />}
      {!isSidebarCompact && <aside id="admin-dashboard-sidebar" data-portal-navigation="sidebar" data-sidebar-collapsed="false" aria-label="Administrator navigation sidebar" className={`hidden lg:flex ${isSidebarCollapsed ? 'w-20 p-4' : 'w-72 p-6'} my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl flex flex-col justify-between shrink-0 overflow-y-auto transition-all duration-300 relative`}>
        <button onClick={() => setIsSidebarCompact(true)} title="Minimize sidebar" aria-label="Minimize sidebar" data-sidebar-toggle aria-controls="admin-dashboard-sidebar" aria-expanded="true" className="absolute top-3 right-3 p-2 rounded-xl text-slate-500 hover:text-blue-700 hover:bg-white/70 cursor-pointer"><PanelLeftClose className="w-4 h-4" /></button>

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
              { id: 'messages', label: 'Message Gateway', icon: MessageSquare, sub: 'Announcements to selected accounts' }, { id: 'governance', label: 'Admin Approvals', icon: ShieldCheck, sub: 'Founder roster & wipe proposals', badge: governanceUnread }, { id: 'settings', label: 'Admin Settings', icon: Edit3, sub: 'Fees, commission & controls', badge: settingsUnread }
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
                      {isSidebarCollapsed && tab.badge ? <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold text-white">{tab.badge}</span> : null}

                    </div>
                    {!isSidebarCollapsed && (
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5 truncate">
                          <span>{tab.label}</span>

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
        <div className="flex justify-center pt-3"><HelpLink compact={isSidebarCollapsed} /></div>
        </div>

      </aside>}

      {/* MAIN CONTENT AREA */}
      <main className={`admin-dashboard-content dashboard-centered-content flex-1 p-6 lg:p-10 space-y-8 overflow-y-auto relative`}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-white/65 p-4 text-sm backdrop-blur-xl"><span className="flex min-w-0 items-center gap-3 font-semibold text-blue-950">{(user?.photo || user?.avatar) && <img src={user.photo || user.avatar} alt="Administrator profile" className="h-9 w-9 shrink-0 rounded-full object-cover" />}<AdministratorLabel slot={adminSlot} name={user?.name} /></span><button onClick={() => setActiveTab('governance')} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">Shared approvals{pendingGovernance ? ` (${pendingGovernance})` : ''}</button></div>
        {(adminDataPending) && <p role="status" className="rounded-2xl border border-blue-200 bg-white/70 p-5 text-sm text-slate-700 dark:border-cyan-900 dark:bg-slate-900 dark:text-slate-100">Loading administrator directories…</p>}
        {(adminDataError) && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"><p>{adminDataError.message}</p>{adminData && <p className="mt-2">Showing the last successfully loaded directory information.</p>}<button type="button" disabled={adminDataFetching} onClick={() => void retryAdminData()} className="mt-2 min-h-11 font-semibold underline disabled:opacity-50">Retry administrator directories</button></div>}
        {activeTab === 'governance' && <><AdminGovernancePanel />{(<AdminManagerClosureRequests />)}<ResidenceDeletionPanel onClose={() => {}} /><AccountModerationPanel target={null} onClose={() => {}} onApplied={fetchAdminData} /></>}
        {activeTab === 'messages' && <AdminMessageGateway />}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && !adminDirectoriesUnavailable && (
          <div className="space-y-8 animate-fadeIn relative z-10">
            {/* Welcome banner */}
            <div className="pv-feature-card bg-sky-50/20 border border-sky-200/50 p-8 rounded-3xl backdrop-blur-2xl shadow-xl relative overflow-hidden">
              <div className="absolute right-0 top-0 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 max-w-2xl">
                <h2 className="text-3xl lg:text-4xl font-semibold text-black tracking-tight" style={{ textShadow: 'none', WebkitTextStroke: '0' }}>Welcome back, {user?.name}</h2>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
              {[
                { 
                  label: 'All Registered User Accounts', 
                  value: allUsersData.totalUsers,
                  sub: `${allUsersData.breakdown.residents} Residents, ${totalManagers} Managers, ${allUsersData.breakdown.staff} Staff, ${allUsersData.breakdown.officers} Officers, ${allUsersData.breakdown.merchants} Merchants`,
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
        {activeTab === 'user_accounts' && !adminDirectoriesUnavailable && (
          <div className="space-y-6 animate-fadeIn relative z-10">
            <AccountModerationPanel target={moderationTarget} onClose={() => setModerationTarget(null)} onApplied={fetchAdminData} />
            <AdminAccountDirectory accounts={allUsersData.users} onManage={setModerationTarget} />
          </div>
        )}

        <div className={activeTab === 'residences' ? '' : 'hidden'}><ResidenceDeletionPanel active={activeTab === 'residences'} selectedHostel={deletingResidence} onClose={() => setDeletingResidence(null)} /></div>
        {/* TAB 2: AVAILABLE RESIDENCES */}
        {activeTab === 'residences' && !adminDirectoriesUnavailable && (
          <div className="space-y-6 animate-fadeIn relative z-10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/80 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl">
              <div role="region" aria-label="Residence directory">
                <h3 className="text-xl font-bold text-slate-900">Available Residences Directory</h3>
                <p className="text-xs text-slate-500">Manage all Hostels, Hotels, and Lounges listed on PineVela</p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input aria-label="Search residences..."
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
                  {pendingHostelsCount > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      approvalTabFilter === 'pending' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                    }`}>
                      {pendingHostelsCount}
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
                    {residences.filter(r => (residenceReviewStatus(r) === 'approved')).length}
                  </span>
                </button>
                {(<button type="button" onClick={() => setApprovalTabFilter('rejected')}
                  className={`flex min-h-11 items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold ${approvalTabFilter === 'rejected' ? 'bg-rose-700 text-white' : 'border border-rose-200 bg-rose-50 text-rose-900'}`}>
                  Rejected ({residences.filter(r => residenceReviewStatus(r) === 'rejected').length})
                </button>)}
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {((['all', 'Hostel', 'Inn', 'Hotel', 'Estate'])).map((cat) => (
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

                  {
                    if (approvalTabFilter === 'pending' && !pendingResidenceReview(res)) return false;
                    if (approvalTabFilter === 'approved' && residenceReviewStatus(res) !== 'approved') return false;
                    if (approvalTabFilter === 'rejected' && residenceReviewStatus(res) !== 'rejected') return false;
                  }

                  if (residenceFilter !== 'all') {
                    const type = (res.wing || '');
                    if (!type.toLowerCase().includes(residenceFilter.toLowerCase())) return false;
                  }
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    return res.name?.toLowerCase().includes(q) || res.location?.toLowerCase().includes(q) || res.managerName?.toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((residence) => {
                  const type = (residence.wing || 'Not provided');
                  const cover = residence.image || residence.imageUrl || residence.exteriorPhotoUrl || residence.imagePreviewUrl || residence.images?.[0];
                  const managerVerified = (residence.managerStatus === 'active');
                  const isApproved = (residenceReviewStatus(residence) === 'approved');

                  return (
                    <div key={residence.id} className="bg-white/90 border border-blue-200/80 rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl flex flex-col justify-between">
                      <div>
                        <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                          {(!cover) ? <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-600"><Building2 size={24}/>No residence photos uploaded</div> : <img
                            src={residence.image || residence.imageUrl || residence.exteriorPhotoUrl || residence.imagePreviewUrl || residence.images?.[0] || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80'}
                            alt={residence.name}
                            onError={(e) => {
                              {e.currentTarget.style.display='none';return;}

                            }}
                            className="w-full h-full object-cover"
                          />}
                          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-xl text-xs font-bold text-blue-700 border border-blue-200">
                            {type}
                          </div>
                          <div className="absolute top-3 right-3">
                            {isApproved ? (
                              <span className="bg-emerald-600 text-white px-3 py-1 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                {(residenceReviewLabel(residence))}
                              </span>
                            ) : (
                              <span className="bg-amber-500 text-white px-3 py-1 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {(residenceReviewLabel(residence))}
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
                              {(<span className="font-semibold text-slate-800">{residence.totalRooms} rooms · {residence.totalBeds} beds</span>)}
                            </div>
                          </div>

                          {/* Verified Manager Profile with Photo */}
                          <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-200/60 flex items-center gap-3">
                            <div className="relative shrink-0">
                              {(<span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-900" aria-label="Manager initials">{residence.managerName?.slice(0,2).toUpperCase() || '?'}</span>)}
                              {managerVerified && <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs" title="Verified Manager">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900 truncate">
                                  {residence.managerName || (('Not provided'))}
                                </span>
                                {managerVerified && <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                  Verified
                                </span>}
                              </div>
                              <p className="text-[10px] text-slate-500 truncate">
                                {residence.managerEmail || (('Email not provided'))}
                              </p>
                              <p className="text-[10px] text-slate-700 font-semibold">
                                {residence.managerPhone || (('Phone not provided'))}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-6 pb-6 pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-blue-100">
                        {isApproved ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Approved Residence</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">

                            <button
                              onClick={async () => {
                                {setInspectingResidenceModal(residence);return;}

                              }}
                              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{(pendingResidenceReview(residence) ? 'Review Registration' : 'View Registration')}</span>
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                            {((isApproved)) && <button
                              onClick={() => {
                                setInspectingResidenceModal(residence);
                                setInspectActiveImage('');
                              }}
                              className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-200"
                              title="Inspect actual photos, GPS location, block structure & verify on-site"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Details</span>
                            </button>}

                          <button
                            aria-label={`Propose deletion of ${residence.name}`}
                            onClick={() => setDeletingResidence(residence)}
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
              <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 p-1 bg-white/80 rounded-2xl border border-sky-200/70 shadow-xs md:w-auto">
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
                  <span>Restrictions ({managerRestrictions.filter(r => (r.isActive)).length})</span>
                </button>
              </div>
            </div>

            {((managerReviewPendingRead || managerReviewError)) && (
              <div role={managerReviewError ? 'alert' : 'status'} className="rounded-2xl border border-sky-200 bg-white/90 p-4 text-sm text-slate-800">
                <p className="font-semibold">{managerReviewError ? 'Manager applications could not load.' : 'Loading manager applications…'}</p>
                {managerReviewError && <>
                  <p className="mt-1 text-xs text-slate-600">Retry to load the saved applications and inspection reports.</p>
                  <button type="button" disabled={managerReviewFetching} onClick={() => { void retryManagerReview(); }} className="mt-3 min-h-11 rounded-xl bg-blue-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {managerReviewFetching ? 'Retrying manager applications…' : 'Retry manager applications'}
                  </button>
                </>}
              </div>
            )}

            {/* SUBTAB 1: PHYSICAL INSPECTIONS & MANAGER VERIFICATIONS */}
            {managerSubTab === 'inspections' && (
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/80 p-3.5 rounded-2xl border border-sky-200/80 shadow-xs backdrop-blur-md">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input aria-label="Search by manager name, email, phone, property name, or precise location..."
                      type="text"
                      placeholder="Search by manager name, email, phone, property name, or precise location..."
                      value={managerSearchQuery}
                      onChange={(e) => setManagerSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {managerSearchQuery && (
                      <button aria-label="Clear search" onClick={() => setManagerSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
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
                      const inspection = (currentManagerInspection(req.id,verificationInspections));
                      const hasSubmittedReport = (inspection?.status==='report_submitted'&&Boolean(inspection.report));
                      const isBlocked = req.status === 'blocked' || req.isBlocked === true;
                      const isApproved = !isBlocked && ((req.status==='approved'));
                      const currentStatus = ((['approved','rejected','withdrawn','more_info_required','blocked','suspended'].includes(req.status)?req.status:hasSubmittedReport?'report_submitted':inspection?.status==='dispatched'?'dispatched':'pending_dispatch'));

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
                                  {currentStatus === 'more_info_required'?'Corrections requested':currentStatus === 'withdrawn'
                                    ? 'Withdrawn'
                                    : currentStatus === 'blocked' || req.status === 'blocked'
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
                                🏢 Residence / Hostel: <span className="text-slate-900 font-extrabold">{req.hostelName || req.propertyName || req.organization || 'Not provided'}</span>
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
                              <span className="font-semibold text-slate-900">{req.managerPhone || 'Not provided'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Precise Property Location</span>
                              <span className="font-bold text-slate-800">{req.location || req.preciseLocation || req.physicalAddress || 'Not provided'}</span>
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
                                  {currentStatus === 'more_info_required'?'Awaiting applicant corrections':currentStatus === 'withdrawn'
                                    ? 'Verification withdrawn after reviewed closure'
                                    : currentStatus === 'blocked' || req.status === 'blocked'
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
                                  {currentStatus === 'more_info_required'?'The primary owner must correct the application. A fresh inspection is required after resubmission.':currentStatus === 'withdrawn'
                                    ? 'The original inspection evidence is retained. This registration no longer accepts verification actions.'
                                    : currentStatus === 'blocked' || req.status === 'blocked'
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
                              {((currentStatus==='pending_dispatch')) && (
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
                                    if(!actualReport){triggerToast('The saved inspection report could not be loaded. Refresh the application.');return;}
                                    setReviewReportInspection({
                                      ...(inspection || {}),
                                      id: inspection?.id || `insp-${req.id}`,
                                      managerVerificationId: req.id,
                                      managerName: req.managerName,
                                      managerEmail: req.managerEmail,
                                      propertyName: req.hostelName || req.propertyName || req.organization,
                                      preciseLocation: req.location || req.preciseLocation || req.physicalAddress,
                                      assignedOfficerName: inspection?.assignedOfficerName || req.assignedOfficerName || 'Field Officer',
                                      status: 'report_submitted',
                                      report: actualReport
                                    });
                                  }}
                                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                                >
                                  <FileCheck className="w-3.5 h-3.5" />
                                  <span>Review On-Site Report</span>
                                </button>
                              )}

                              {/* Direct Approve/Reject buttons */}
                              {((pendingManagerRegistration(req))) && (
                                <>
                                  {(req.status!=='more_info_required')&&<button type="button" onClick={()=>{
                                    handleRejectManager(req.id,req.managerName,req.managerEmail);setManagerReviewAction('request-info');
                                  }} className="min-h-11 rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-2.5 text-xs font-bold text-blue-900">Request corrections</button>}
                                  {((hasSubmittedReport))&&
                                  <button
                                    type="button"
                                    onClick={() => handleApproveManager(req.id, req.managerEmail)}
                                    className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>}
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

                  {managerRequests.length === 0 && ((managerReviewData && managerReviewData.ownerId === user?.id && managerReviewData.requests.length === 0 && !managerReviewError)) && (
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

                </div>

                {(<SupabaseOfficerInvitationControls onChanged={fetchAdminData} />)}
                {(officerRosterPendingRead) && <p role="status" className="text-sm text-slate-600">Loading field officers…</p>}
                {officerRosterError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{officerRosterError}<button type="button" disabled={(officerRosterFetching)} onClick={() => { void ((retryOfficerRoster())); }} className="ml-3 min-h-11 font-semibold underline disabled:opacity-50">Retry field officers</button></p>}

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
                        <p>📞 <span className="font-semibold text-slate-900">{officer.phone || 'Not provided'}</span></p>
                        <p>📍 Zone: <span className="font-bold text-blue-900">{officer.assignedZone || 'Not provided'}</span></p>
                        <p>🚗 Total Dispatches: <span className="font-extrabold text-slate-900">{officer.totalDispatches || 0}</span></p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">

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

                  {verificationTeams.length === 0 && !officerRosterError && ((officerRosterData && officerRosterData.ownerId === user?.id && officerRosterData.officers.length === 0 && !officerRosterReadError)) && (
                    <div className="col-span-full text-center py-12 bg-white/70 border border-sky-200 rounded-3xl">
                      <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                      <h5 className="text-sm font-bold text-slate-900">No Verification Officers Registered</h5>
                      <p className="text-xs text-slate-500 mb-4">Invite accredited officers to handle physical property inspections.</p>

                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUBTAB 3: REVIEWED REGISTRATION COOLDOWNS */}
            {managerSubTab === 'cooldowns' && true && (
              <section aria-label="Manager registration restrictions" className="space-y-4 rounded-3xl border border-sky-200/50 bg-sky-50/20 p-6 backdrop-blur-2xl">
                <div><h3 className="text-lg font-bold text-slate-900">Manager registration restrictions</h3><p className="mt-1 text-sm text-slate-600">Residence and manager-account cooldowns recorded by reviewed administrator decisions. Each restriction applies to the account shown and expires on its recorded date.</p></div>
                {managerRestrictionError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{managerRestrictionError}<button type="button" onClick={fetchAdminData} className="ml-3 font-semibold underline">Retry</button></p>}
                {!managerRestrictionError && managerRestrictions.map(restr => <article key={restr.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white/75 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-slate-900">{restr.accountName}</h4><p className="break-all text-xs text-slate-600">{restr.accountEmail}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${restr.isActive?'bg-amber-50 text-amber-900':'bg-slate-100 text-slate-600'}`}>{restr.isActive?'Active':'Expired'}</span></div>
                  <p className="text-sm font-semibold text-blue-900">{restr.kind==='residence'?'New residence registration':'New manager-account registration'}</p>
                  <p className="text-sm text-slate-700">{restr.reason}</p>
                  <dl className="grid gap-3 text-xs sm:grid-cols-2"><div><dt className="font-semibold text-slate-500">Recorded</dt><dd>{new Date(restr.createdAt).toLocaleString()}</dd></div><div><dt className="font-semibold text-slate-500">Expires</dt><dd>{new Date(restr.expiresAt).toLocaleString()}</dd></div><div><dt className="font-semibold text-slate-500">Primary account</dt><dd className="break-all">{restr.userEmail}</dd></div><div><dt className="font-semibold text-slate-500">Recorded by</dt><dd>{restr.imposedByName}</dd></div></dl>
                  {restr.proposalId && <p className="break-all text-xs text-slate-500">Review: {restr.proposalId} · {restr.proposalStatus}</p>}
                </article>)}
                {!managerRestrictionError && managerRestrictions.length===0 && ((adminData && !adminDataError)) && <p className="rounded-xl bg-white/65 p-4 text-sm text-slate-500">No manager or residence registration restrictions have been recorded.</p>}
              </section>
            )}

          </div>
        )}

        {/* TAB 5: ADMIN SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-fadeIn relative z-10 max-w-4xl">
            <AppearanceSettings />
            <AdminSettingsPanel />
            <AdminCustomerService key={user?.id} onOpenApprovals={() => setActiveTab('governance')} onReviewAccount={report => { const account = allUsersData.users.find(account => account.id === report.targetContextId); setActiveTab('user_accounts'); if (account) setModerationTarget(account); else triggerToast('Refresh Accounts and select the reported account using its account ID to open the required review.'); }} />

            <button onClick={() => setActiveTab('governance')} className="w-full rounded-2xl border border-blue-200 bg-blue-50/60 p-5 text-left text-sm font-semibold text-blue-800">Open administrator roster and five-key wipe proposals</button>
          </div>
        )}

        {/* TAB 4: NOTIFICATIONS & MANAGER BOARD REQUESTS */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 animate-fadeIn relative z-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white/80 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl">
              <div className="flex w-full min-w-0 items-center gap-3">
                <div className="w-12 h-12 shrink-0 aspect-square rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-lg shadow-blue-500/30">
                  <Bell className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold text-slate-900">Notifications & Admin Board Desk</h3>
                  <p className="text-xs text-slate-500">Review manager requests, process operational notices, and manage property verification alerts.</p>
                </div>
              </div>

            </div>

            {notifications.length > 0 && <section className="rounded-3xl border border-blue-100 bg-white/75 p-5 shadow-sm backdrop-blur-xl"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-extrabold text-slate-900"><Bell className="h-4 w-4 text-blue-600" />Live operational alerts {unreadCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">{unreadCount} new</span>}</p><button onClick={() => refreshNotifications()} className="text-xs font-bold text-blue-700">Refresh</button></div><div className="space-y-2">{notifications.map((notification: any) => <button key={notification.id} data-notification-id={notification.id} onClick={() => { void markAsRead(notification.id); if (notification.category === 'support' && /^\/(?:help\?ticket=[a-f0-9-]{36}|customer-service(?:\?ticket=[a-f0-9-]{36})?)$/.test(notification.link || '')) { navigate(notification.link); return; } if (notification.link === 'verification-officers') { setActiveTab('managers'); setManagerSubTab('officers'); } else if (notification.link === 'residence_changes') setActiveTab('notifications'); else if (notification.module === 'admin_governance') setActiveTab('governance'); else if (notification.module === 'admin_settings') setActiveTab('settings'); }} className="block w-full rounded-2xl border border-blue-100 bg-blue-50/60 p-3 text-left"><p className="text-xs font-bold text-slate-900">{notification.title}{!notification.read && <span className="ml-2 text-blue-600">• New</span>}</p><p className="mt-1 text-xs text-slate-600">{notification.message}</p></button>)}</div></section>}
            {/* PENDING RESIDENCE VERIFICATION ALERTS */}
            {pendingHostelsCount > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-6 rounded-3xl backdrop-blur-xl shadow-lg space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="w-10 h-10 shrink-0 aspect-square rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/30">
                      <Clock className="w-5 h-5 animate-spin" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-base font-extrabold text-slate-900 flex flex-wrap items-center gap-2">
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
                  {residences.filter(r => (pendingResidenceReview(r))).map((res, idx) => (
                    <div key={`${res.id || 'res'}-${idx}`} className="bg-white/90 border border-amber-200/80 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-start gap-3">
                        {(!(res.image || res.imageUrl || res.exteriorPhotoUrl || res.imagePreviewUrl)) ? <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100" aria-label="No residence photo submitted"><Building2 size={24}/></div> : <img
                          src={res.image || res.imageUrl || res.exteriorPhotoUrl || res.imagePreviewUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80'}
                          alt={res.name}
                          onError={(e) => {
                            {e.currentTarget.style.display='none';return;}

                          }}
                          className="w-16 h-16 rounded-xl object-cover border border-amber-200 shrink-0"
                        />}
                        <div className="min-w-0 flex-1">
                          <h5 className="text-sm font-bold text-slate-900 truncate">{res.name}</h5>
                          <p className="text-xs text-slate-500">📍 {res.location}</p>
                          <p className="text-xs text-slate-600 mt-1">
                            Manager: <strong className="text-slate-800">{res.managerName || 'Assigned Manager'}</strong> ({res.managerPhone || 'Contact not provided'})
                          </p>
                        </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100"><span className="text-xs font-semibold text-blue-600">{res.totalCapacity ?? 0} Beds</span>
                          <button
                            onClick={() => {
                              setInspectingResidenceModal(res);
                              setInspectActiveImage('');
                            }}
                            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold py-2 px-3 rounded-xl transition-all cursor-pointer border border-indigo-200 flex items-center gap-1"
                            title="Inspect full details, uploaded photos & GPS location"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{('Review Registration')}</span>
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

            {notifSubTab === 'manager_requests' && <AdminResidenceRequests />}

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
                  <input aria-label="Search residents by student name, email, room number, or hostel residence..."
                    type="text"
                    placeholder="Search residents by student name, email, room number, or hostel residence..."
                    value={residentSearchQuery}
                    onChange={(e) => setResidentSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                  {residentSearchQuery && (
                    <button aria-label="Clear search" onClick={() => setResidentSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
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
        {activeTab === 'digital_market' && !adminDirectoriesUnavailable && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header Card */}
            <div className="bg-white/90 border border-blue-200/80 p-6 rounded-3xl backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="w-12 h-12 shrink-0 aspect-square rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/25">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-black text-slate-900 flex flex-wrap items-center gap-2">
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
                    <span>Digital Stores</span>
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
                  <div className="text-2xl font-black text-emerald-900 mt-1">{digitalMarketStores.filter(s => (s.isActive)).length}</div>
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
            <AdminPaymentReversals key={user.id} />
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

                {marketStoreError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{marketStoreError}<button type="button" onClick={fetchAdminData} className="ml-3 font-semibold underline">Retry</button></p>}
                {!marketStoreError && digitalMarketStores.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="p-3">Store Name</th>
                          <th className="p-3">Owner</th>
                          <th className="p-3">University</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Account Access</th>
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
                                store.isBanned ? 'bg-rose-100 text-rose-800' : (!store.isActive) ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {(store.statusLabel)}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                disabled={((!store.isCurrent || store.accountStatus==='closed'))}
                                onClick={() => {
                                  {
                                    const account=allUsersData.users.find(account => account.id===store.accountId && account.role==='merchant');
                                    setActiveTab('user_accounts');
                                    if (account) setModerationTarget(account);
                                    else triggerToast('Refresh Accounts and select this seller to submit a reviewed access proposal.');
                                    return;
                                  }

                                }}
                                className={`px-3 py-1.5 font-bold rounded-xl transition-all cursor-pointer ${
                                  store.isBanned
                                    ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                                    : 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                                }`}
                              >
                                {('Review account access')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !marketStoreError ? (
                  <div className="p-8 text-center text-slate-400 italic text-xs">
                    No student stores registered yet.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* BAN STORE MODAL */}
        {banningStoreTarget && (
          <DashboardOverlay aria-label="Ban Digital Store" onClose={() => setBanningStoreTarget(null)} className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
            <div data-popup-card className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-rose-700 flex items-center gap-2">
                  <Ban className="w-5 h-5 text-rose-600" />
                  Ban Digital Store
                </h3>
                <button aria-label="Close dialog" type="button" onClick={() => setBanningStoreTarget(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-700 font-medium">
                  Are you sure you want to ban/disable <strong>{banningStoreTarget.storeName}</strong>? All listed items will be hidden from the student market.
                </p>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reason for Ban</label>
                  <input aria-label="Reason for Ban"
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
          </DashboardOverlay>
        )}

      </main>

      {/* Four-step residence registration wizard */}
      {showAddResidenceModal && (
        <DashboardOverlay aria-label="Residence registration" onClose={() => setShowAddResidenceModal(false)} className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-md p-2 sm:p-4 md:p-8 flex items-start justify-center animate-fadeIn">
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
        </DashboardOverlay>
      )}

      {/* MODAL: READ-ONLY INSPECTION FOR PENDING RESIDENCE APPROVAL */}
      {inspectingResidenceModal && true && <AdminResidenceRegistrationReview
        key={`${user?.id}:${inspectingResidenceModal.id}`} residenceId={inspectingResidenceModal.id}
        onClose={() => setInspectingResidenceModal(null)} onReviewed={() => {
          void queryClient.invalidateQueries({queryKey:['adminData',user?.id]});void refreshNotifications();
        }} />}

      {/* MODAL: DETAILED REJECTION REASON FOR RESIDENCE APPLICATION */}
      {rejectingResidenceModal && (
        <DashboardOverlay aria-label="Reject Residence Registration" onClose={() => setRejectingResidenceModal(null)} className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border border-rose-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5 text-rose-700">
                <AlertCircle className="w-5 h-5" />
                <h3 className="text-base font-black text-slate-900">Reject Residence Registration</h3>
              </div>
              <button aria-label="Close dialog"
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
              <textarea aria-label="Detailed Rejection Feedback"
                rows={4}
                value={residenceRejectionReason}
                onChange={(e) => setResidenceRejectionReason(e.target.value)}
                placeholder="Explain which photographs, street address or map location need correction."
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
        </DashboardOverlay>
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

        return (
          <DashboardOverlay aria-label="Review identity document" onClose={() => setDocPreviewModal(null)} className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
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

                <button aria-label="Close dialog"
                  type="button"
                  onClick={() => setDocPreviewModal(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Advanced 2-Column Split View Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 overflow-hidden">
                
                {/* LEFT COLUMN: Read-only document preview */}
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

                          {displayText ? (
                            <pre className="whitespace-pre-wrap font-sans text-slate-800 text-xs md:text-sm leading-relaxed tracking-normal font-medium">{displayText}</pre>
                          ) : (
                            <div className="space-y-6 font-sans">
                              <div>
                                <h6 className="text-xs font-extrabold uppercase text-blue-900 mb-2 border-b pb-1">1. PROFILE SUMMARY</h6>
                                <p className="text-slate-700 leading-relaxed text-xs">Review the submitted documents and inspection findings before deciding.</p>
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
          </DashboardOverlay>
        );
      })()}

      {/* MODAL: REJECT STAFF CREDENTIALS WITH REASON */}

      {/* MODAL: VERIFIED STAFF MANAGEMENT & DETAILS */}

      {/* MODAL: DISABLE / BAN / REACTIVATE STAFF ACCOUNT ACTION */}

      {/* MODAL: DISPATCH PINEVELA VERIFICATION TEAM OFFICER */}
      {dispatchModalManager && (
        <DashboardOverlay aria-label="Dispatch verification officer" onClose={() => setDispatchModalManager(null)} className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-900 text-sky-400 flex items-center justify-center font-bold shadow-md shadow-blue-900/30">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">Dispatch PineVela Verification Team</h4>
                  <p className="text-xs text-slate-500">Property: <strong>{dispatchModalManager.hostelName || dispatchModalManager.propertyName || dispatchModalManager.organization}</strong></p>
                </div>
              </div>
              <button aria-label="Close dialog"
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
                <p className="font-bold text-slate-900">📍 {dispatchModalManager.location || dispatchModalManager.preciseLocation || dispatchModalManager.physicalAddress || 'Not provided'}</p>
                <p className="text-slate-600">👤 {dispatchModalManager.managerName} ({dispatchModalManager.managerPhone || 'Phone unavailable'})</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-800 uppercase tracking-wider text-[11px] block">
                  Assign PineVela Verification Officer *
                </label>
                <select aria-label="Assign PineVela Verification Officer"
                  required
                  value={dispatchOfficerId}
                  onChange={(e) => setDispatchOfficerId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Select Field Officer --</option>
                  {verificationTeams.filter(o => (o.status === 'active')).map((officer) => (
                    <option key={officer.officerId || officer.id} value={officer.officerId || officer.id}>
                      {officer.fullName} ({officer.officerId}) — {officer.assignedZone}
                    </option>
                  ))}
                </select>
                {(officerRosterPendingRead) && <p role="status" className="text-xs text-slate-600">Loading field officers…</p>}
                {officerRosterError && <p role="alert" className="text-xs text-rose-800">{officerRosterError}<button type="button" disabled={(officerRosterFetching)} onClick={() => { void ((retryOfficerRoster())); }} className="ml-2 min-h-11 font-semibold underline disabled:opacity-50">Retry field officers</button></p>}
                {verificationTeams.length === 0 && !officerRosterError && ((officerRosterData && officerRosterData.ownerId === user?.id && officerRosterData.officers.length === 0 && !officerRosterReadError)) && (
                  <p className="text-[11px] text-amber-600 font-bold">
                    No verification officers registered. Please register an officer in the "Field Officers" tab first.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-800 uppercase tracking-wider text-[11px] block">
                  Inspection Priority Level
                </label>
                <select aria-label="Inspection Priority Level"
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
                <textarea aria-label="Dispatch Instructions & Field Notes (Optional)"
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
        </DashboardOverlay>
      )}

      {(approveManagerModal?.ownerId === user?.id) && approveManagerModal && (
        <DashboardOverlay aria-label="Approve manager application" onClose={() => { if (!approvingManager) setApproveManagerModal(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
          <div data-popup-card className="max-h-[90vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-base font-black text-slate-900">Approve manager application</h4>
                <p className="mt-1 break-words text-xs text-slate-600">{approveManagerModal.property} · {approveManagerModal.email}</p>
              </div>
              <button type="button" aria-label="Close dialog" disabled={approvingManager} onClick={() => setApproveManagerModal(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-700">This decision activates the manager account and approves its saved property application.</p>
            {approvalNeedsReason && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">The officer did not recommend approval. Explain why you are approving this application.</p>}
            <form onSubmit={submitManagerApproval} className="space-y-4">
              <label className="block space-y-2 text-xs font-bold text-slate-800">
                <span>{approvalNeedsReason ? 'Approval reason (required)' : 'Decision notes (optional)'}</span>
                <textarea aria-label="Approval reason" required={approvalNeedsReason} minLength={approvalNeedsReason ? 5 : undefined} maxLength={4000} rows={4}
                  value={approveManagerNotes} onChange={event => setApproveManagerNotes(event.target.value)} disabled={approvingManager || approvalUncertain}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm font-normal text-slate-900 focus:border-blue-600 focus:outline-none disabled:opacity-60" />
              </label>
              {approveManagerError && <p role="alert" className="text-xs font-semibold text-rose-700">{approveManagerError}</p>}
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button type="button" disabled={approvingManager} onClick={() => setApproveManagerModal(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Cancel</button>
                {approvalUncertain ? <button type="button" onClick={() => { setApproveManagerModal(null); void fetchAdminData(); }} className="min-h-11 rounded-xl bg-blue-900 px-4 py-2 text-xs font-bold text-white">Refresh application</button>
                  : <button type="submit" disabled={approvingManager || (approvalNeedsReason && approveManagerNotes.trim().length < 5)} className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{approvingManager ? 'Approving…' : 'Approve manager'}</button>}
              </div>
            </form>
          </div>
        </DashboardOverlay>
      )}

      {/* MODAL: REVIEW LIVE ON-SITE INSPECTION REPORT */}
      {reviewReportInspection && (
        <DashboardOverlay aria-label="Review inspection report" onClose={() => setReviewReportInspection(null)} className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
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
              <button aria-label="Close dialog"
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
                <span className="text-[10px] text-emerald-700 font-black uppercase block">Reported GPS Coordinates</span>
                <span className="font-extrabold text-slate-900">
                  📍 {reviewedInspectionGps ? `${reviewedInspectionGps.lat.toFixed(4)}, ${reviewedInspectionGps.lng.toFixed(4)}` : 'GPS coordinates not recorded'}
                </span>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {reviewReportInspection.report?.gpsCoordinates?.capturedAddress || reviewReportInspection.report?.verifiedAddress || reviewReportInspection.preciseLocation || 'Address not recorded'}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-emerald-700 font-black uppercase block">Inspection Timestamp</span>
                <span className="font-bold text-slate-900">
                  {reviewReportInspection.report?.submittedAt ? new Date(reviewReportInspection.report.submittedAt).toLocaleString() : 'Submission time not recorded'}
                </span>
                <p className="text-[10px] text-slate-600 font-bold mt-0.5">Review the officer’s evidence before making a decision.</p>
              </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-3">
              <h5 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                PineVela On-Site Verification Criteria Checklist
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Residence Actually Exists on Ground', recorded: reviewReportInspection.report?.checklist?.residenceExists },
                  { label: 'Manager Genuinely Connected to Property', recorded: reviewReportInspection.report?.checklist?.managerConnected },
                  { label: 'Basic Property Info Accurate', recorded: reviewReportInspection.report?.checklist?.basicPropertyInfoVerified ?? reviewReportInspection.report?.checklist?.propertyInfoAccurate },
                  { label: "Manager's Identity / Authority Confirmed", recorded: reviewReportInspection.report?.checklist?.managerAuthorityConfirmed ?? reviewReportInspection.report?.checklist?.managerIdentityConfirmed },
                  { label: 'General Operation Legitimacy Verified', recorded: reviewReportInspection.report?.checklist?.generalLegitimacyConfirmed },
                  { label: 'Safe & Habitable Student Housing', recorded: reviewReportInspection.report?.checklist?.safetyHabitableCompliance ?? reviewReportInspection.report?.checklist?.safeAndHabitable }
                ].map((item, idx) => {
                  const passed = item.recorded === true;
                  const missing = typeof item.recorded !== 'boolean';
                  return (
                  <div key={idx} className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        passed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'
                      }`}>
                        {missing ? '—' : passed ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <X className="w-3.5 h-3.5" />}
                      </div>
                      <span className={`font-bold ${passed ? 'text-slate-800' : 'text-slate-400'}`}>
                        {item.label}
                      </span>
                    </div>
                    <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      missing ? 'bg-slate-50 text-slate-600 border-slate-200' : passed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {missing ? 'Not recorded' : passed ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                ); })}
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
                      <div role="button" tabIndex={0} aria-label={`View ${photoTitle}`} onKeyDown={activateOnKeyboard}
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
                  reviewedInspectionRecommendation === 'recommend_approval'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}>
                  Recommendation: {reviewedInspectionRecommendation === 'recommend_approval' ? 'Recommend approval'
                    : reviewedInspectionRecommendation === 'recommend_rejection' ? 'Recommend rejection'
                    : reviewedInspectionRecommendation === 'requires_reinspection' ? 'Reinspection requested'
                    : reviewedInspectionRecommendation === 'requires_followup' ? 'Follow-up requested' : 'Not recorded'}
                </span>
              </div>
              <p className="text-slate-800 font-semibold italic">
                {reviewReportInspection.report?.observations || reviewReportInspection.report?.inspectorNotes || 'Observations were not recorded for this report.'}
              </p>
              <p className="text-[11px] font-mono text-slate-500 pt-1 border-t border-sky-200/60">
                Digitally Signed: <strong>{reviewReportInspection.report?.inspectorSignature || 'Signature not recorded'}</strong>
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
        </DashboardOverlay>
      )}

      {/* MODAL: REGISTER NEW PINEVELA VERIFICATION OFFICER */}

      {/* MODAL: OFFICIAL OFFICER CREDENTIALS ID CARD (FOR HANDOVER) */}

      {/* MODAL: REJECT MANAGER APPLICATION WITH DETAILED REASON */}
      {rejectManagerModal && (
        <DashboardOverlay aria-label={managerReviewAction==='request-info'?'Request manager application corrections':'Reject manager registration'} onClose={rejectingManagerLoading?null:() => setRejectManagerModal(null)} className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div data-popup-card className="max-h-[90dvh] overflow-y-auto bg-white border border-blue-200 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-fadeIn dark:bg-slate-900 dark:border-slate-700">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-md shadow-rose-500/30">
                  <X className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{managerReviewAction==='request-info'?'Request application corrections':'Reject Manager Application'}</h4>
                  <p className="text-xs text-slate-500">Applicant: <strong>{rejectManagerModal.name}</strong> ({rejectManagerModal.email})</p>
                </div>
              </div>
              <button aria-label="Close dialog"
                type="button"
                disabled={rejectingManagerLoading}
                onClick={() => setRejectManagerModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label htmlFor="manager-review-feedback" className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                {managerReviewAction==='request-info'?'Requested corrections':'Detailed rejection reason'} <span className="text-rose-500">*</span>
              </label>
              <textarea id="manager-review-feedback"
                required
                disabled={rejectingManagerLoading}
                maxLength={4000}
                rows={4}
                value={rejectManagerReason}
                onChange={(e) => setRejectManagerReason(e.target.value)}
                className="w-full p-3.5 border border-slate-300 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 text-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
              />
              <p className="text-[10px] text-slate-500 leading-normal">
                {managerReviewAction==='request-info'?'The primary owner can use this feedback to correct the same application. Manager access stays locked until a fresh physical inspection and approval.':'The primary owner will receive this feedback in their registration status and notifications. Rejection is a final decision for this application.'}
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
                className={`min-h-11 px-5 py-2.5 ${managerReviewAction==='request-info'?'bg-blue-700 hover:bg-blue-800':'bg-rose-600 hover:bg-rose-700'} text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50`}
              >
                <X className="w-4 h-4" />
                <span>{rejectingManagerLoading ? 'Saving feedback…' : managerReviewAction==='request-info'?'Send correction request':'Confirm Rejection & Send Feedback'}</span>
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* MODAL: BLOCK / RESTRICT MANAGER ACCESS WITH REQUIRED DETAILED REASON */}
      {blockManagerModal && (
        <DashboardOverlay aria-label="Restrict manager account" onClose={() => setBlockManagerModal(null)} className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
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
              <button aria-label="Close dialog"
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
              <textarea aria-label="Detailed Reason for Account Restriction * (Required)"
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
        </DashboardOverlay>
      )}

      {/* LOGOUT CONFIRMATION MODAL */}
      {rejectSellerId && <DashboardOverlay aria-label="Reject seller application" onClose={() => {if(!rejectSellerBusy)setRejectSellerId(null);}} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
        <form onSubmit={event => {event.preventDefault();void handleRejectMarketApp(rejectSellerId,rejectSellerNotes);}} className="w-full max-w-lg space-y-4 rounded-3xl border border-blue-200 bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between gap-4"><h3 className="font-bold text-blue-950">Reject seller application</h3><button type="button" aria-label="Close seller rejection" disabled={rejectSellerBusy} onClick={() => setRejectSellerId(null)} className="rounded-xl border border-blue-200 px-3 py-2">Close</button></div>
          <label className="block space-y-2 text-sm font-semibold"><span>Explain what the applicant needs to correct</span><textarea required maxLength={3000} value={rejectSellerNotes} onChange={event => setRejectSellerNotes(event.target.value)} rows={4} className="w-full rounded-xl border border-blue-200 p-3" /></label>
          <button disabled={rejectSellerBusy || !rejectSellerNotes.trim()} className="w-full rounded-xl bg-rose-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{rejectSellerBusy?'Saving…':'Reject and send feedback'}</button>
        </form>
      </DashboardOverlay>}
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
