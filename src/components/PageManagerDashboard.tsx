import RouteSkeleton from './RouteSkeleton';
import DashboardOverlay from './DashboardOverlay';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import OnboardingProgress, { STAFF_ACCOUNT_STEPS } from './OnboardingProgress';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryClient, invalidateAllQueries } from '../lib/queryClient';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { saveNavigationLayout, usesTopNavigation } from '../lib/navigationLayout';
import TopNavBadge from './TopNavBadge';
import PineLogo from './PineLogo';
import HostelRegistration from './HostelRegistration';
import ManagerProfileModal from './ManagerProfileModal';
import { ManagerMeetingsTab } from './ManagerMeetingsTab';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import ManagerDigitalKeysView from './ManagerDigitalKeysView';
import { } from '../utils/pdfHelper';
import { 
  Building2, Users, MapPin, CheckCircle2, XCircle, Clock, Plus,
  ShieldCheck, LogOut as LogOutIcon, UserPlus,
  AlertCircle, Check, ArrowRight, Layers, Wrench, Settings, Bell,
  Send, MessageSquare, Phone, Mail, Trash2, Edit3, Eye, EyeOff, CheckCircle, Lock, CalendarCheck, RefreshCw, Scale, Handshake, ThumbsUp, ThumbsDown,
  Key, Copy, X, ShieldAlert, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  shift: string;
  assignedBlock: string;
  status: 'Active' | 'On Leave' | 'Off Duty';
}

interface MaintenanceTicket {
  id: string;
  title: string;
  category: string;
  roomNumber: string;
  urgency: 'Normal' | 'High' | 'Emergency';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Pending' | string;
  assignedTo?: string;
  reportedAt: string;
  description: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  assignedStaffRole?: string;
  assignedStaffEmail?: string;
  timeframe?: string;
  deadline?: string;
  rescheduleRequested?: boolean;
  requestedTimeframe?: string;
  rescheduleReason?: string;
  staffDeclineRequested?: boolean;
  staffDeclineReason?: string;
  staffDeclined?: boolean;
  staffRescheduleRequested?: boolean;
  staffCompleted?: boolean;
  staffCompletionNotes?: string;
  staffCompletionPhoto?: string;
  closedByManager?: boolean;
  isClosed?: boolean;
  closedAt?: string;
  studentConfirmed?: boolean;
  photos?: string[];
}

export default function PageManagerDashboard() {
  const { user, logout, apiFetch, setSessionUser } = useAuth();
  const { notifications: systemNotifications, unreadCount: systemUnreadCount, markAsRead } = useNotifications();
  const navigate = useNavigate();

  // Prioritize onboarding flow/tabs immediately if manager is pending approval
  const isPendingOnboarding = user && user.role === 'manager' && user.hasApprovedHostel === false;

  const [activeTab, setActiveTab] = useState<'overview' | 'properties' | 'blocks' | 'staff' | 'maintenance' | 'meetings' | 'notifications'>(
    isPendingOnboarding ? 'notifications' : 'overview'
  );
  // Collapsible sidebar state (Disabled minimizing to prevent glitched overlapping)
  const isSidebarCollapsed = false;
  const [isSidebarTopNav, setIsSidebarTopNav] = useState(usesTopNavigation);

  useEffect(() => {
    saveNavigationLayout(isSidebarTopNav);
  }, [isSidebarTopNav]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);

  // Manager specific states
  const [properties, setProperties] = useState<any[]>([]);
  const [maintenanceIssues, setMaintenanceIssues] = useState<MaintenanceTicket[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Staff state
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffSubTab, setStaffSubTab] = useState<'roster' | 'bargains'>('roster');

  // Staff quit & bargain negotiation state
  const [staffBargains, setStaffBargains] = useState<any[]>([]);
  const [selectedBargainToReview, setSelectedBargainToReview] = useState<any | null>(null);
  const [managerResponseAction, setManagerResponseAction] = useState<'accept' | 'reject'>('accept');
  const [managerResponseNote, setManagerResponseNote] = useState('');
  const [managerUpdatedShift, setManagerUpdatedShift] = useState('');
  const [managerUpdatedBlock, setManagerUpdatedBlock] = useState('');
  const [submittingManagerResponse, setSubmittingManagerResponse] = useState(false);

  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Front Desk Operations Lead');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [newStaffShift, setNewStaffShift] = useState('Day Shift (8 AM - 5 PM)');
  const [newStaffBlock, setNewStaffBlock] = useState('All Blocks');

  // Maintenance state
  const [showAddIssueModal, setShowAddIssueModal] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueCategory, setNewIssueCategory] = useState('Plumbing & Water');
  const [newIssueRoom, setNewIssueRoom] = useState('Room A104');
  const [newIssueUrgency, setNewIssueUrgency] = useState<'Normal' | 'High' | 'Emergency'>('Normal');
  const [newIssueDescription, setNewIssueDescription] = useState('');
  const [maintenanceFilter, setMaintenanceFilter] = useState<'all' | 'Open' | 'In Progress' | 'Resolved'>('all');
  const [lastViewedMaintenance, setLastViewedMaintenance] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('pinevela_manager_viewed_maintenance') || 0);
    } catch {
      return 0;
    }
  });

  // Calculate if there are maintenance tickets filed that need manager attention and trigger beaming red tab
  const hasUnviewedMaintenanceLogs = useMemo(() => {
    if (maintenanceIssues.length === 0) return false;
    return maintenanceIssues.some(i => {
      if (i.closedByManager || (i as any).isClosed) return false;
      const rawDate = i.reportedAt || (i as any).createdAt || (i as any).date;
      const createdTime = rawDate ? new Date(rawDate).getTime() : 0;
      return createdTime > lastViewedMaintenance || i.status === 'Pending' || i.staffDeclineRequested || i.rescheduleRequested;
    });
  }, [maintenanceIssues, lastViewedMaintenance]);

  const markMaintenanceViewed = () => {
    const now = Date.now();
    setLastViewedMaintenance(now);
    try {
      localStorage.setItem('pinevela_manager_viewed_maintenance', String(now));
    } catch {}
  };

  useEffect(() => {
    if (activeTab === 'maintenance') {
      markMaintenanceViewed();
    }
  }, [activeTab]);

  // Detailed Maintenance state
  const [selectedIssueDetail, setSelectedIssueDetail] = useState<any | null>(null);
  const [selectedIssueTimeframe, setSelectedIssueTimeframe] = useState<string>('24h');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [assigningStaffState, setAssigningStaffState] = useState(false);
  const [closingIssueState, setClosingIssueState] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Board requests state
  const [boardRequests, setBoardRequests] = useState<any[]>([]);
  const [newRequestSubject, setNewRequestSubject] = useState('');
  const [newRequestCategory, setNewRequestCategory] = useState('Room Capacity Adjustment');
  const [newRequestPriority, setNewRequestPriority] = useState<'Normal' | 'High' | 'Urgent'>('Normal');
  const [newRequestMessage, setNewRequestMessage] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Digital Room Keys & Dispatch state
  const [roomKeysList, setRoomKeysList] = useState<any[]>([]);
  const [roomAccessAction, setRoomAccessAction] = useState<{ type: 'release'; room: any } | { type: 'reshuffle' } | null>(null);
  const [roomAccessBusy, setRoomAccessBusy] = useState(false);
  const [roomAccessError, setRoomAccessError] = useState<string | null>(null);
  const [keysAcademicYear, setKeysAcademicYear] = useState(() => {
    const year = new Date().getFullYear();
    return `${year}/${year + 1}`;
  });
  const [loadingRoomKeys, setLoadingRoomKeys] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Digital Dispatch Modal
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [selectedKeyForDispatch, setSelectedKeyForDispatch] = useState<any | null>(null);
  const [dispatchRecipientEmail, setDispatchRecipientEmail] = useState('');
  const [dispatchRecipientPhone, setDispatchRecipientPhone] = useState('');
  const [dispatchRecipientName, setDispatchRecipientName] = useState('');
  const [dispatchCustomNote, setDispatchCustomNote] = useState('');
  const [dispatchSending, setDispatchSending] = useState(false);
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState<string | null>(null);
  const [dispatchErrorMsg, setDispatchErrorMsg] = useState<string | null>(null);

  // Check if manager has approved properties
  const isPropertyApproved = (p: any) => 
    Boolean(
      p && (
        p.isApproved === true || 
        p.isApproved === 'true' ||
        p.approvalStatus === 'Approved' || 
        p.approvalStatus === 'approved' ||
        p.status === 'Approved' || 
        p.status === 'approved' ||
        p.status === 'Active' || 
        p.status === 'active' || 
        p.status === 'Open' ||
        p.status === 'open'
      )
    );

  const primaryProperty = properties[0] || null;
  const hasApprovedProperty = 
    properties.some(isPropertyApproved) || 
    Boolean(primaryProperty && isPropertyApproved(primaryProperty));
  const hasAnyProperty = properties.length > 0;

  // Welcome Banner Dismissal State
  const [isWelcomeBannerDismissed, setIsWelcomeBannerDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(`pv_manager_welcome_dismissed_${user?.id || 'default'}`) === 'true';
    }
    return false;
  });

  const handleDismissWelcomeBanner = () => {
    setIsWelcomeBannerDismissed(true);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`pv_manager_welcome_dismissed_${user?.id || 'default'}`, 'true');
    }
  };

  const handleRestoreWelcomeBanner = () => {
    setIsWelcomeBannerDismissed(false);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(`pv_manager_welcome_dismissed_${user?.id || 'default'}`);
    }
  };

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 1500);
  };

  // TanStack Query for manager server-state caching and automatic refetching
  const { data: managerData, isPending: managerPending, error: managerError, refetch: retryManagerData } = useQuery({
    queryKey: ['managerData', user?.id, user?.email],
    queryFn: async () => {
      // 1. Fetch properties from backend
      const resProperties = await apiFetch('/api/hostels');
      const myHostelRes = await apiFetch('/api/manager/my-hostel');
      
      const cleanEmail = (user?.email || '').toLowerCase().trim();
      const userId = user?.id;

      let managerProperties: any[] = [];
      if (Array.isArray(resProperties)) {
        managerProperties = resProperties.filter((p: any) => {
          if (!p) return false;
          const matchEmail = p.managerEmail && cleanEmail && p.managerEmail.toLowerCase().trim() === cleanEmail;
          const matchId = (p.managerId && userId && p.managerId === userId) || (p.assignedManagerId && userId && p.assignedManagerId === userId);
          return matchEmail || matchId;
        });
      }

      if (managerProperties.length === 0 && myHostelRes?.hostel) {
        managerProperties = [myHostelRes.hostel];
      } else if (myHostelRes?.hostel && managerProperties.length > 0) {
        managerProperties = managerProperties.map(p => 
          p.id === myHostelRes.hostel.id ? { ...p, ...myHostelRes.hostel } : p
        );
      }

      // 3. Fetch issue reports / maintenance
      const resIssues = await apiFetch('/api/issue-reports');
      let mappedIssues: any[] = [];
      if (Array.isArray(resIssues)) {
        const relevantIssues = managerProperties.length > 0
          ? resIssues.filter((i: any) => 
              !i.hostelName || managerProperties.some(p => p.name?.toLowerCase() === i.hostelName?.toLowerCase()) ||
              (i.hostelId && managerProperties.some(p => p.id === i.hostelId))
            )
          : resIssues;

        mappedIssues = relevantIssues.map((i: any) => ({
          ...i,
          id: i.id || `issue-${Date.now()}`,
          title: i.title || i.issue || 'Maintenance Request',
          category: i.category || 'General',
          roomNumber: i.roomNumber || i.room || 'General Area',
          urgency: i.urgency || i.priority || 'Normal',
          status: i.status === 'Resolved' ? 'Resolved' : i.status === 'In Progress' ? 'In Progress' : 'Open',
          reportedAt: i.reportedAt || i.createdAt || 'Recent',
          description: i.description || i.details || 'Maintenance requested by resident'
        }));
      }

      // 4. Fetch staff members
      const resStaff = await apiFetch('/api/staff');
      const resBargains = await apiFetch('/api/staff-bargains');
      const resBoard = await apiFetch('/api/board-requests');
      const resActivities = await apiFetch('/api/activities');
      const resRoomKeys = await apiFetch('/api/room-keys');

      return {
        managerProperties,
        mappedIssues,
        staffList: Array.isArray(resStaff) ? resStaff : [], staffBargains: Array.isArray(resBargains) ? resBargains : [],
        boardRequests: Array.isArray(resBoard) ? resBoard : [],
        activities: Array.isArray(resActivities) && resActivities.length > 0 ? resActivities.slice(0, 10) : [],
        roomKeys: Array.isArray(resRoomKeys) ? resRoomKeys : []
      };
    },
    enabled: Boolean(user),
    refetchInterval: 8000,
  });

  const loading = Boolean(user) && managerPending;
  useEffect(() => {
    setProperties(managerData?.managerProperties || []);
    setMaintenanceIssues(managerData?.mappedIssues || []);
    setStaffList(managerData?.staffList || []);
    setStaffBargains(managerData?.staffBargains || []);
    setActivities(managerData?.activities || []);
    setBoardRequests(managerData?.boardRequests || []);
    setRoomKeysList(managerData?.roomKeys || []);
  }, [managerData, user?.id]);

  const fetchManagerData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['managerData'] });
  };

  const fetchRoomKeys = async () => {
    try {
      setLoadingRoomKeys(true);
      const resKeys = await apiFetch('/api/room-keys').catch(() => []);
      if (Array.isArray(resKeys)) {
        setRoomKeysList(resKeys);
      }
    } catch (err) {
      console.error("Error fetching room keys:", err);
    } finally {
      setLoadingRoomKeys(false);
    }
  };

  const handleSendDigitalKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedKeyForDispatch) return;
    if (!dispatchRecipientEmail && !dispatchRecipientPhone) {
      setDispatchErrorMsg('Please provide either an email address or a phone number.');
      return;
    }

    try {
      setDispatchSending(true);
      setDispatchErrorMsg(null);
      setDispatchSuccessMsg(null);

      const payload = {
        roomKey: selectedKeyForDispatch.roomKey,
        roomNumber: selectedKeyForDispatch.roomNumber,
        blockName: selectedKeyForDispatch.blockName,
        hostelName: selectedKeyForDispatch.hostelName || primaryProperty?.name || 'Hostel',
        recipientEmail: dispatchRecipientEmail.trim(),
        recipientPhone: dispatchRecipientPhone.trim(),
        recipientName: dispatchRecipientName.trim() || 'Resident / Student',
        customNote: dispatchCustomNote.trim()
      };

      const res = await apiFetch('/api/room-keys/send-digital', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.error) {
        setDispatchErrorMsg(res.error);
        return;
      }

      setDispatchSuccessMsg(res.message || `Digital Room Key successfully sent!`);
      setToastMessage(`Digital key for Room ${selectedKeyForDispatch.roomNumber} dispatched successfully!`);

      // Update in roomKeysList locally
      setRoomKeysList(prev => prev.map(k => {
        if (k.roomKey === selectedKeyForDispatch.roomKey) {
          return {
            ...k,
            lastDispatchedAt: new Date().toISOString(),
            lastDispatchedTo: dispatchRecipientEmail || dispatchRecipientPhone || dispatchRecipientName
          };
        }
        return k;
      }));

      setTimeout(() => {
        setDispatchModalOpen(false);
        setDispatchSuccessMsg(null);
        setDispatchRecipientEmail('');
        setDispatchRecipientPhone('');
        setDispatchRecipientName('');
        setDispatchCustomNote('');
      }, 1600);
    } catch (err: any) {
      setDispatchErrorMsg(err.message || 'Failed to dispatch room key.');
    } finally {
      setDispatchSending(false);
    }
  };

  const handleCopyKey = (keyString: string, keyId: string) => {
    navigator.clipboard.writeText(keyString);
    setCopiedKeyId(keyId);
    setToastMessage(`Key "${keyString}" copied to clipboard!`);
    setTimeout(() => {
      setCopiedKeyId(null);
    }, 2200);
  };

  // Helper to extract normalized blocks from registered hostel
  const getNormalizedBlocks = (property: any) => {
    if (!property) return [];
    if (Array.isArray(property.blocksList) && property.blocksList.length > 0) {
      return property.blocksList.map((b: any, idx: number) => {
        const totalRooms = b.totalRooms || 20;
        const floors = b.floors || 4;
        const bedsPerRoom = b.bedsPerRoom || 3;
        const roomsPerFloor = Math.ceil(totalRooms / floors);
        return {
          id: b.id || `block-${idx + 1}`,
          blockName: b.name || `Block ${String.fromCharCode(65 + idx)} (${idx === 0 ? 'Alpha' : 'Beta'})`,
          floors,
          totalRooms,
          roomsPerFloor,
          bedsPerRoom,
          totalBeds: totalRooms * bedsPerRoom,
          roomPrefix: b.roomPrefix || String.fromCharCode(65 + idx),
          startNum: b.startNum || (idx + 1) * 100 + 1,
          genderCategory: idx === 0 ? 'Male & Female (Co-Ed Wing)' : 'Female Wing & Executive',
          roomTypes: [
            { type: `${bedsPerRoom} in a Room (Standard)`, spaces: Math.round(totalRooms * bedsPerRoom * 0.7) },
            { type: '2 in a Room (Deluxe Ensuite)', spaces: Math.round(totalRooms * bedsPerRoom * 0.2) },
            { type: '1 in a Room (Executive Private)', spaces: Math.round(totalRooms * bedsPerRoom * 0.1) }
          ],
          amenities: property.facilities || property.amenities || [
            'Fiber-Optic Wi-Fi', 'Standby Generator', '24/7 Uniformed Security', 'Borehole Water', 'Study Hall'
          ]
        };
      });
    }
    
    if (Array.isArray(property.blocks) && property.blocks.length > 0) {
      return property.blocks.map((b: any, idx: number) => {
        const bedsPerRoom = b.bedsPerRoom || 3;
        const totalRooms = b.totalRooms || 20;
        return {
          id: b.id || `block-${idx + 1}`,
          blockName: b.blockName || b.name || `Block ${String.fromCharCode(65 + idx)}`,
          floors: b.floors || 4,
          totalRooms,
          roomsPerFloor: b.roomsPerFloor || Math.ceil(totalRooms / (b.floors || 4)),
          bedsPerRoom,
          totalBeds: b.totalBeds || (totalRooms * bedsPerRoom),
          roomPrefix: b.roomPrefix || String.fromCharCode(65 + idx),
          startNum: b.startNum || (idx + 1) * 100 + 1,
          genderCategory: b.genderCategory || 'Mixed Community',
          roomTypes: b.roomTypes || [
            { type: `${bedsPerRoom} in a Room (Standard)`, spaces: totalRooms * bedsPerRoom }
          ],
          amenities: b.amenities || property.facilities || []
        };
      });
    }

    const cap = property.totalCapacity || property.capacity || 1200;
    return [
      {
        id: 'block-1',
        blockName: 'Block A (Alpha)',
        floors: 4,
        totalRooms: Math.ceil(cap / 6),
        roomsPerFloor: Math.ceil(cap / 24),
        bedsPerRoom: 3,
        totalBeds: Math.ceil(cap / 2),
        roomPrefix: 'A',
        startNum: 101,
        genderCategory: 'Male & Female (Co-Ed)',
        roomTypes: [
          { type: '3 in a Room (Standard)', spaces: Math.ceil(cap / 2) }
        ],
        amenities: property.facilities || property.amenities || ['Fiber-Optic Wi-Fi', 'Standby Generator', 'Security']
      },
      {
        id: 'block-2',
        blockName: 'Block B (Beta)',
        floors: 4,
        totalRooms: Math.ceil(cap / 6),
        roomsPerFloor: Math.ceil(cap / 24),
        bedsPerRoom: 3,
        totalBeds: Math.ceil(cap / 2),
        roomPrefix: 'B',
        startNum: 201,
        genderCategory: 'Executive & Quiet Wing',
        roomTypes: [
          { type: '3 in a Room (Standard)', spaces: Math.ceil(cap / 2) }
        ],
        amenities: property.facilities || property.amenities || ['Fiber-Optic Wi-Fi', 'Standby Generator', 'Security']
      }
    ];
  };

  const propertyBlocks = getNormalizedBlocks(primaryProperty);
  // Staff assignments use saved names only; display fallback blocks are not assignments.
  const staffWingNames = useMemo(() => {
    const blocks = primaryProperty?.blocksList?.length ? primaryProperty.blocksList : primaryProperty?.blocks;
    if (!Array.isArray(blocks)) return [];
    return [...new Set<string>(blocks.map((block: any) => {
      const name = typeof block?.name === 'string' && block.name.trim() ? block.name : block?.blockName;
      return typeof name === 'string' ? name.trim() : '';
    }).filter((name: string) => name && name !== 'All Blocks'))];
  }, [primaryProperty]);
  useEffect(() => {
    if (newStaffBlock !== 'All Blocks' && !staffWingNames.includes(newStaffBlock)) setNewStaffBlock('All Blocks');
  }, [staffWingNames, newStaffBlock]);
  useEffect(() => {
    if (managerUpdatedBlock && managerUpdatedBlock !== 'All Blocks' && !staffWingNames.includes(managerUpdatedBlock)) setManagerUpdatedBlock('');
  }, [staffWingNames, managerUpdatedBlock]);

  const handleSendBoardRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequestSubject.trim() || !newRequestMessage.trim()) {
      triggerToast('Please provide both a subject and message.');
      return;
    }
    setIsSubmittingRequest(true);
    try {
      const primaryProp = primaryProperty?.name || 'Registered Residence';
      const created = await apiFetch('/api/board-requests', {
        method: 'POST',
        body: JSON.stringify({
          subject: newRequestSubject.trim(),
          category: newRequestCategory,
          priority: newRequestPriority,
          message: newRequestMessage.trim(),
          hostelName: primaryProp
        })
      });
      setBoardRequests(prev => [created, ...prev]);
      setNewRequestSubject('');
      setNewRequestMessage('');
      triggerToast('Request transmitted to PineVela Admin Board successfully!');
    } catch (err: any) {
      triggerToast(err.message || 'Failed to submit request to admin board.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleSaveProfile = async (updatedProfile: any) => {
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(updatedProfile)
      });
      if (res && res.user) {
        setSessionUser(res.user);
      }
      triggerToast('Manager profile updated across PineVela!');
      setShowEditProfileModal(false);
      await fetchManagerData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to update manager profile.');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingStaff) return;
    if (!newStaffName.trim() || !newStaffPhone.trim() || !newStaffEmail.trim()) {
      triggerToast('Please enter the staff name, phone number and email.');
      return;
    }
    if (!newStaffPassword.trim()) {
      triggerToast('Please specify an initial account password for this staff member.');
      return;
    }
    if (newStaffBlock !== 'All Blocks' && !staffWingNames.includes(newStaffBlock)) {
      triggerToast('Choose a wing from this residence’s configured blocks.');
      return;
    }
    try {
      setIsSubmittingStaff(true);
      const createdStaff = await apiFetch('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: newStaffName.trim(),
          role: newStaffRole,
          phone: newStaffPhone.trim(),
          email: newStaffEmail.trim(),
          password: newStaffPassword.trim(),
          shift: newStaffShift,
          assignedBlock: newStaffBlock,
          status: 'Active',
          hostelId: primaryProperty?.id,
          hostelName: primaryProperty?.name
        })
      });

      // Deduplicate so duplicate entries are never added to local state
      setStaffList(prev => {
        if (prev.some(s => s.id === createdStaff.id)) return prev;
        return [createdStaff, ...prev];
      });

      setShowAddStaffModal(false);
      setNewStaffName('');
      setNewStaffPhone('');
      setNewStaffEmail('');
      setNewStaffPassword('');
      setShowStaffPassword(false);
      triggerToast(`Staff account for ${createdStaff.name} created & verified! They can now log in using the password you set.`);
      await fetchManagerData();
    } catch (err: any) {
      triggerToast(err.message || 'Failed to enroll staff member.');
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    try {
      await apiFetch(`/api/staff/${staffId}`, {
        method: 'DELETE'
      });
      setStaffList(prev => prev.filter(s => s.id !== staffId));
      triggerToast('Staff member record removed.');
    } catch (err: any) {
      triggerToast(err.message || 'Failed to delete staff record.');
    }
  };

  const handleManagerBargainResponse = async () => {
    if (!selectedBargainToReview) return;
    if (managerResponseAction === 'reject' && !managerResponseNote.trim()) {
      triggerToast('Please provide an explanatory note to the staff member as to why the requested terms cannot be approved.');
      return;
    }

    setSubmittingManagerResponse(true);
    try {
      const res = await apiFetch(`/api/staff-bargains/${selectedBargainToReview.id}/manager-response`, {
        method: 'POST',
        body: JSON.stringify({
          action: managerResponseAction,
          responseNote: managerResponseNote.trim(),
          updatedShift: managerUpdatedShift.trim() || undefined,
          updatedBlock: managerUpdatedBlock.trim() || undefined
        })
      });

      if (res.success) {
        if (managerResponseAction === 'accept') {
          triggerToast('Bargain deal accepted! The staff member has been retained and their records updated.');
        } else {
          triggerToast('Bargain proposal declined. The staff member has been notified and can now decide whether to quit or stay.');
        }
        setSelectedBargainToReview(null);
        setManagerResponseNote('');
        setManagerUpdatedShift('');
        setManagerUpdatedBlock('');
        await fetchManagerData();
      } else {
        triggerToast(res.error || 'Failed to submit response');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Failed to submit response');
    } finally {
      setSubmittingManagerResponse(false);
    }
  };

  const handleAddMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIssueTitle.trim()) {
      triggerToast('Please provide an issue title.');
      return;
    }
    try {
      const createdTicket = await apiFetch('/api/issue-reports', {
        method: 'POST',
        body: JSON.stringify({
          title: newIssueTitle.trim(),
          category: newIssueCategory,
          roomNumber: newIssueRoom.trim() || 'General Facility',
          urgency: newIssueUrgency,
          status: 'Open',
          reportedAt: new Date().toISOString().split('T')[0],
          description: newIssueDescription.trim() || 'Logged via Manager Operations Center.',
          hostelName: primaryProperty?.name,
          hostelId: primaryProperty?.id
        })
      });
      
      const normalizedTicket: MaintenanceTicket = {
        id: createdTicket.id || `m-${Date.now().toString().slice(-4)}`,
        title: createdTicket.title || newIssueTitle.trim(),
        category: createdTicket.category || newIssueCategory,
        roomNumber: createdTicket.roomNumber || newIssueRoom.trim() || 'General Facility',
        urgency: createdTicket.urgency || newIssueUrgency,
        status: createdTicket.status || 'Open',
        reportedAt: createdTicket.reportedAt || new Date().toISOString().split('T')[0],
        description: createdTicket.description || newIssueDescription.trim()
      };

      setMaintenanceIssues(prev => [normalizedTicket, ...prev]);
      setShowAddIssueModal(false);
      setNewIssueTitle('');
      setNewIssueDescription('');
      triggerToast('Maintenance ticket dispatched successfully!');
    } catch (err: any) {
      triggerToast(err.message || 'Failed to dispatch work order.');
    }
  };

  const handleAssignStaff = async (issueId: string) => {
    if (!selectedAssigneeId) {
      triggerToast("Please select a staff member to assign.");
      return;
    }
    const targetStaff = staffList.find(s => s.id === selectedAssigneeId);
    if (!targetStaff) return;

    setAssigningStaffState(true);
    try {
      const updated = await apiFetch(`/api/issue-reports/${issueId}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          staffId: targetStaff.id,
          staffName: targetStaff.name,
          staffRole: targetStaff.role || 'Enrolled Staff',
          timeframe: selectedIssueTimeframe
        })
      });

      // Update states
      setMaintenanceIssues(prev => prev.map(issue => issue.id === issueId ? updated : issue));
      setSelectedIssueDetail(updated);
      triggerToast(`Dispatched to ${targetStaff.name}!`);
    } catch (err: any) {
      console.error("Error assigning staff:", err);
      triggerToast("Failed to assign staff. Please try again.");
    } finally {
      setAssigningStaffState(false);
    }
  };

  const handleCloseIssue = async (issueId: string, notes: string = "") => {
    if (closingIssueState) return;
    setClosingIssueState(true);

    try {
      const updated = await apiFetch(`/api/issue-reports/${issueId}/manager-close`, {
        method: 'POST',
        body: JSON.stringify({ managerNotes: notes })
      });
      const finalRecord = updated;
      // Update states to keep updated ticket in history and display read-only success state
      setMaintenanceIssues(prev => prev.map(issue => issue.id === issueId ? finalRecord : issue));
      setSelectedIssueDetail(finalRecord);
      triggerToast("Work order marked as success, archived & closed.");
      invalidateAllQueries(['issueReports', 'managerData']);
    } catch (err: any) {
      console.error("Error closing issue:", err);
      triggerToast(err.message || "Unable to close this work order. Complete the required sign-off first.");
    } finally {
      setClosingIssueState(false);
    }
  };

  const handleAcceptReschedule = async (issueId: string) => {
    if (!selectedIssueDetail) return;
    try {
      const updated = await apiFetch(`/api/issue-reports/${issueId}/approve-reschedule`, {
        method: 'POST',
        body: JSON.stringify({
          approvedTimeframe: selectedIssueDetail.requestedTimeframe || '24h'
        })
      });
      setMaintenanceIssues(prev => prev.map(issue => issue.id === issueId ? updated : issue));
      setSelectedIssueDetail(updated);
      triggerToast("Approved and updated timeframe! Resident and staff notified.");
    } catch (err: any) {
      console.error("Error accepting reschedule:", err);
      triggerToast("Failed to accept reschedule.");
    }
  };

  const handleDeclineReschedule = async (issueId: string) => {
    try {
      const updated = await apiFetch(`/api/issue-reports/${issueId}/decline-reschedule`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Timeframe extension cannot be accommodated at this time.'
        })
      });
      setMaintenanceIssues(prev => prev.map(issue => issue.id === issueId ? updated : issue));
      setSelectedIssueDetail(updated);
      triggerToast("Reschedule request declined and staff notified.");
    } catch (err: any) {
      console.error("Error declining reschedule:", err);
      triggerToast("Failed to decline request.");
    }
  };

  useEffect(() => {
    if (user) {
      fetchManagerData();
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!loading && !managerError && user) {
      const hasAnyHostel = (managerData?.managerProperties.length || properties.length) > 0;
      setShowWelcomePopup(!hasAnyHostel && !showRegistration);
    }
  }, [loading, managerError, managerData, properties.length, showRegistration]);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    if (!await logout()) return;
    navigate('/login', { replace: true });
  };
  const totalCapacity = properties.reduce((acc, p) => acc + (p.totalCapacity || p.capacity || 0), 0);
  const totalOccupied = properties.reduce((acc, p) => acc + (p.occupied || 0), 0);
  const availableBeds = totalCapacity > 0 ? (totalCapacity - totalOccupied) : 0;
  const activeIssues = maintenanceIssues.filter(i => i.status !== 'Resolved').length;

  const filteredIssues = maintenanceIssues.filter(i => {
    if (maintenanceFilter === 'all') return true;
    return i.status === maintenanceFilter;
  });

  const isManagerBlocked = Boolean(
    user?.isBlocked === true || 
    user?.status === 'blocked' || 
    user?.verificationStatus === 'blocked' ||
    (primaryProperty && (primaryProperty.isBlocked === true || primaryProperty.status === 'Blocked'))
  );

  if (isManagerBlocked) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white rounded-3xl border-2 border-rose-300 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-rose-600 via-red-500 to-amber-600" />
          
          <div className="flex flex-col items-center space-y-3 pt-2">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shadow-inner">
              <Lock className="w-8 h-8 text-rose-600 animate-pulse" />
            </div>
            
            <div>
              <span className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-900 text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full border border-rose-300">
                Account Access Blocked
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-2 tracking-tight">
                Manager Portal Restricted
              </h2>
            </div>
          </div>

          <div className="p-4 bg-rose-50/90 border border-rose-200 rounded-2xl text-left space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-rose-900 text-xs">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              Administrative Restriction Notice
            </p>
            <div className="p-3 bg-white/90 border border-rose-200 rounded-xl text-xs text-rose-950 font-medium">
              <span className="block text-[10px] font-black text-rose-600 uppercase tracking-wider mb-0.5">Reason:</span>
              <p className="font-bold text-rose-950 leading-relaxed">
                "{user?.blockReason || primaryProperty?.blockReason || 'Your manager account access has been restricted by administration.'}"
              </p>
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              Your registered property listings have been temporarily removed from live student searches. <strong>Please wait until further notice</strong> or contact PineVela Administrator support.
            </p>
          </div>

          <button
            type="button"
            onClick={confirmLogout}
            className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs transition-all shadow-md cursor-pointer uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <LogOutIcon className="w-4 h-4" />
            <span>Sign Out & Return to Login</span>
          </button>
        </div>
      </div>
    );
  }

  if (managerError && !managerData) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-blue-950">
      <p role="alert">{managerError.message || 'Could not load your management dashboard.'}</p>
      <button type="button" onClick={() => void retryManagerData()} className="rounded-xl bg-blue-900 px-5 py-3 text-white">Retry dashboard</button>
      <button type="button" onClick={() => void confirmLogout()} className="text-sm underline">Sign out</button>
    </div>;
  }

  if (loading && properties.length === 0) return <RouteSkeleton />;

  return (
    <div className="min-h-screen h-screen flex flex-col lg:flex-row bg-transparent text-slate-800 overflow-hidden font-sans">
      {managerError && <div role="alert" className="fixed top-2 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-800">Updates unavailable: {managerError.message} <button onClick={() => void retryManagerData()} className="underline">Retry</button></div>}
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 text-white px-4 py-2 rounded-full shadow-lg border border-slate-800 flex items-center gap-2 backdrop-blur-md text-xs font-semibold"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      
      {/* MOBILE HEADER (lg:hidden) */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-xl border-b border-sky-200/50 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <PineLogo size={24} />
          <div>
            <h1 className="text-xs font-black tracking-tight text-blue-950 leading-tight">Manager Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowEditProfileModal(true)} title="Manager Profile Settings" className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg">
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={() => setShowLogoutConfirm(true)} className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg" title="Sign Out">
            <LogOutIcon className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* MOBILE BOTTOM NAV (lg:hidden) */}
      <nav className="mobile-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-2 pb-safe snap-x hide-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: ShieldCheck, locked: !hasApprovedProperty },
            { id: 'properties', label: 'Properties', icon: Building2, locked: !hasApprovedProperty },
            { id: 'blocks', label: 'Blocks', icon: Layers, locked: !hasApprovedProperty },
            { 
              id: 'staff', 
              label: 'Staff', 
              icon: Users, 
              badge: (staffBargains.filter(b => (b.status || '').toLowerCase() === 'pending').length) || null,
              isRed: (staffBargains.filter(b => (b.status || '').toLowerCase() === 'pending').length) > 0,
              locked: !hasApprovedProperty 
            },
            { 
              id: 'maintenance', 
              label: 'Fixes', 
              icon: Wrench, 
              badge: maintenanceIssues.filter(i => !i.closedByManager && (i.status === 'Pending' || i.status === 'Resolved' || i.rescheduleRequested || i.staffRescheduleRequested || i.staffDeclined)).length || (activeIssues > 0 ? activeIssues : null),
              isRed: maintenanceIssues.some(i => !i.closedByManager && (i.status === 'Pending' || i.status === 'Resolved' || i.rescheduleRequested || i.staffRescheduleRequested || i.staffDeclined)),
              isBeamingRed: hasUnviewedMaintenanceLogs,
              locked: !hasApprovedProperty 
            },
            { id: 'meetings', label: 'Meetings', icon: CalendarCheck, locked: !hasApprovedProperty },
            { 
              id: 'notifications', 
              label: 'Alerts', 
              icon: Bell, 
              badge: ((systemNotifications || []).filter(n => !n.read).length + boardRequests.filter(r => r.status === 'Pending' || r.adminNotes).length) || null,
              isRed: (systemNotifications || []).some(n => !n.read),
              locked: false 
            }
          ].map(tab => {
            const isBeaming = Boolean((tab as any).isBeamingRed && !tab.locked);
            return (
              <button
                key={tab.id}
                onClick={() => !tab.locked && setActiveTab(tab.id as any)}
                disabled={tab.locked}
                className={`snap-center shrink-0 flex flex-col items-center justify-center w-[64px] h-12 rounded-xl transition-all relative ${
                  tab.locked ? 'opacity-40 cursor-not-allowed text-slate-400' : 
                  isBeaming && activeTab !== tab.id ? 'text-red-600 font-black animate-pulse' :
                  activeTab === tab.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${isBeaming && activeTab !== tab.id ? 'bg-red-100 text-red-600 ring-2 ring-red-400/50' : activeTab === tab.id ? 'bg-blue-100/50' : ''}`}>
                  <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'scale-110 transition-transform' : ''}`} />
                  {tab.badge ? (
                    <span className={`absolute top-1 right-2 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ring-2 ring-white ${
                      isBeaming && activeTab !== tab.id ? 'bg-red-600 text-white animate-bounce shadow-md' :
                      tab.isRed ? 'bg-red-600 text-white animate-pulse' : 'bg-amber-400 text-slate-900'
                    }`}>
                      {tab.badge}
                    </span>
                  ) : null}
                </div>
                <span className={`text-[9px] font-bold mt-0.5 ${isBeaming && activeTab !== tab.id ? 'text-red-600 font-extrabold' : activeTab === tab.id ? 'text-blue-700' : 'text-slate-500'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* SIDEBAR: PURELY STATIC / FIXED ICE-BLUE FROSTY BLUE WITH CURVED EDGES & BLUE GLOW */}

      {isSidebarTopNav && <nav className="hidden lg:block fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(760px,calc(100vw-3rem))] bg-white/72 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg"><div className="flex items-center gap-1 px-2 py-1.5">
        {/* Profile avatar button — left end */}
        <button onClick={() => setShowEditProfileModal(true)} title="Manager Profile Settings" className="shrink-0 flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl hover:bg-white/70 cursor-pointer">
          <img src={user?.photo || user?.avatar || (user as any)?.photoUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'} alt="Profile" className="w-6 h-6 rounded-full object-cover ring-2 ring-white shadow-sm" />
          <span className="text-[9px] font-bold text-slate-500">Profile</span>
        </button>
        <div className="w-px h-6 bg-slate-200/70 shrink-0" />
        {[
        { id: 'overview', label: 'Overview', icon: ShieldCheck }, { id: 'properties', label: 'Properties', icon: Building2 }, { id: 'blocks', label: 'Blocks', icon: Layers }, { id: 'staff', label: 'Staff', icon: Users, badge: staffBargains.filter(b => (b.status || '').toLowerCase() === 'pending').length || staffList.length }, { id: 'maintenance', label: 'Fixes', icon: Wrench, badge: maintenanceIssues.filter(i => !i.closedByManager && (i.status === 'Pending' || i.status === 'Resolved' || i.rescheduleRequested || i.staffRescheduleRequested || i.staffDeclined)).length || activeIssues }, { id: 'meetings', label: 'Meetings', icon: CalendarCheck }, { id: 'notifications', label: 'Alerts', icon: Bell, badge: (systemNotifications || []).filter(n => !n.read).length + boardRequests.filter(r => r.status === 'Pending' || r.adminNotes).length }
      ].map(tab => <button key={tab.id} disabled={!hasApprovedProperty && tab.id !== 'notifications'} onClick={() => setActiveTab(tab.id as any)} aria-label={`${tab.label}${tab.badge ? ` (${tab.badge})` : ''}`} className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[9px] font-bold ${activeTab === tab.id ? 'text-blue-700 bg-blue-100/65' : 'text-slate-500 hover:bg-white/70'} disabled:opacity-40 cursor-pointer`}><span className="relative inline-flex"><tab.icon className="w-4 h-4" /><TopNavBadge count={tab.badge} /></span><span className="truncate max-w-full">{tab.label}</span></button>)}<button onClick={() => setShowLogoutConfirm(true)} title="Sign Out" className="shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 text-[9px] font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"><LogOutIcon className="w-4 h-4" /><span>Sign Out</span></button><button onClick={() => setIsSidebarTopNav(false)} title="Show sidebar" className="p-2 text-slate-500 hover:text-blue-700 cursor-pointer"><PanelLeftOpen className="w-4 h-4" /></button></div></nav>}
      {!isSidebarTopNav && <aside className={`hidden lg:flex ${isSidebarCollapsed ? 'w-20 p-4' : 'w-72 p-6'} my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl flex flex-col justify-between shrink-0 overflow-y-auto z-20 transition-all duration-300 relative`}>
        <button onClick={() => setIsSidebarTopNav(true)} title="Use top navigation" className="absolute top-3 right-3 p-2 rounded-xl text-slate-500 hover:text-blue-700 hover:bg-white/70 cursor-pointer"><PanelLeftClose className="w-4 h-4" /></button>

        <div className="space-y-6">
          {/* Logo & Header */}
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3 px-2'}`}>
            <PineLogo size={isSidebarCollapsed ? 30 : 36} hideText={isSidebarCollapsed} />
            {!isSidebarCollapsed && (
              <div>
                <h1 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-blue-900 to-cyan-800 bg-clip-text text-transparent">
                  PineVela Manager
                </h1>
                <p className="text-[10px] font-medium text-blue-600/70 uppercase tracking-widest">Property Operations</p>
              </div>
            )}
          </div>

          {/* Manager Profile Pill */}
          <div className={`p-3 bg-white/70 border border-blue-200/60 rounded-2xl flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} shadow-sm overflow-hidden`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <img 
                src={user?.photo || user?.avatar || (user as any)?.photoUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'} 
                alt="Manager Avatar" 
                className="w-10 h-10 rounded-xl object-cover border border-blue-200 shadow-sm shrink-0"
              />
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-slate-900 truncate">{user?.name || 'Property Manager'}</div>
                  <div className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 inline shrink-0" />
                    <span className="truncate">Verified Manager</span>
                  </div>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowEditProfileModal(true)}
                  title="Manager Profile Settings"
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100/50 rounded-lg transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Navigation Tabs */}
          <nav className="space-y-1.5">
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Operations Center</p>
            )}
            {[
              { id: 'overview', label: 'Dashboard Overview', icon: ShieldCheck, sub: 'Live metrics & activity', locked: !hasApprovedProperty },
              { id: 'properties', label: 'My Properties', icon: Building2, sub: 'Registered residence space', locked: !hasApprovedProperty },
              { id: 'blocks', label: 'Blocks & Rooms', icon: Layers, sub: 'Interactive 3D structure', locked: !hasApprovedProperty },
              { 
                id: 'staff', 
                label: 'Staff Management', 
                icon: Users, 
                badge: (staffBargains.filter(b => (b.status || '').toLowerCase() === 'pending').length) > 0
                  ? (staffBargains.filter(b => (b.status || '').toLowerCase() === 'pending').length)
                  : (staffList.length > 0 ? staffList.length : null),
                isRed: (staffBargains.filter(b => (b.status || '').toLowerCase() === 'pending').length) > 0,
                sub: 'Security, desk & team', 
                locked: !hasApprovedProperty 
              },
              { 
                id: 'maintenance', 
                label: 'Maintenance Hub', 
                icon: Wrench, 
                badge: maintenanceIssues.filter(i => !i.closedByManager && (i.status === 'Pending' || i.status === 'Resolved' || i.rescheduleRequested || i.staffRescheduleRequested || i.staffDeclined)).length > 0
                  ? maintenanceIssues.filter(i => !i.closedByManager && (i.status === 'Pending' || i.status === 'Resolved' || i.rescheduleRequested || i.staffRescheduleRequested || i.staffDeclined)).length
                  : (activeIssues > 0 ? activeIssues : null),
                isRed: maintenanceIssues.some(i => !i.closedByManager && (i.status === 'Pending' || i.status === 'Resolved' || i.rescheduleRequested || i.staffRescheduleRequested || i.staffDeclined)),
                isBeamingRed: hasUnviewedMaintenanceLogs,
                sub: 'Dispatch & tickets', 
                locked: !hasApprovedProperty 
              },
              { id: 'meetings', label: 'Meeting Requests', icon: CalendarCheck, sub: 'Student & staff appointments', locked: !hasApprovedProperty },
              { 
                id: 'notifications', 
                label: 'Notifications & Board', 
                icon: Bell, 
                badge: (((systemNotifications || []).filter(n => !n.read).length + boardRequests.filter(r => r.status === 'Pending' || r.adminNotes).length) > 0 
                  ? ((systemNotifications || []).filter(n => !n.read).length + boardRequests.filter(r => r.status === 'Pending' || r.adminNotes).length) 
                  : null),
                isRed: (systemNotifications || []).some(n => !n.read),
                sub: 'Alerts & Admin direct line', 
                locked: false 
              }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isLocked = tab.locked;
              const isBeaming = Boolean((tab as any).isBeamingRed && !isLocked);

              return (
                <button
                  key={tab.id}
                  onClick={() => !isLocked && setActiveTab(tab.id as any)}
                  disabled={isLocked}
                  title={tab.label}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} px-3.5 py-3 rounded-2xl font-medium transition-all duration-300 text-left group relative ${
                    isLocked ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer'
                  } ${
                    isBeaming && !isActive
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-xl shadow-red-500/50 ring-4 ring-red-400/50 animate-pulse border border-red-300'
                      : isActive && !isLocked
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/40 border border-blue-400/50 ring-2 ring-blue-400/20'
                      : !isLocked ? 'text-slate-700 hover:text-slate-900 hover:bg-blue-200/50' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                      isBeaming && !isActive ? 'bg-white/20 text-white' :
                      isActive && !isLocked ? 'bg-white/20 text-white' : 
                      isLocked ? 'bg-slate-200 text-slate-400' : 'bg-blue-200/70 text-blue-700 group-hover:bg-blue-300/80'
                    }`}>
                      {isLocked ? <AlertCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5 truncate">
                          {isBeaming && !isActive && (
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                            </span>
                          )}
                          <span>{tab.label}</span>
                        </div>
                        <div className={`text-[10px] font-normal truncate ${isBeaming && !isActive ? 'text-red-100 font-semibold' : isActive && !isLocked ? 'text-blue-100' : 'text-slate-500'}`}>{tab.sub}</div>
                      </div>
                    )}
                  </div>
                  {!isSidebarCollapsed && tab.badge && !isLocked ? (
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full shadow-sm ${
                      isBeaming && !isActive
                        ? 'bg-white text-red-700 font-black animate-bounce shadow-md'
                        : tab.isRed ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-300' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Logout Button Box */}
        <div className="pt-4 border-t border-sky-200/80 mt-4">
          <button
            onClick={handleLogout}
            title="Sign Out"
            className={`w-full flex items-center justify-center ${isSidebarCollapsed ? 'p-2.5' : 'space-x-2 px-4 py-2.5'} bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-2xl font-semibold text-xs transition-all shadow-sm cursor-pointer`}
          >
            <LogOutIcon className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>}


      {/* MAIN CONTENT AREA */}
      <main className={`dashboard-centered-content flex-1 p-6 pb-28 lg:p-10 lg:pb-10 space-y-8 overflow-y-auto h-full relative ${isSidebarTopNav ? 'lg:pt-24 lg:w-[calc(100vw-22rem)] lg:max-w-[calc(100vw-22rem)] lg:mx-auto' : ''}`}>

        {/* TAB CONTENT OR REGISTRATION */}
        {showRegistration ? (
          <div className="animate-fadeIn relative z-10 h-full">
            <div className="bg-white border border-blue-200/50 rounded-3xl shadow-2xl p-0 md:p-2 overflow-y-auto h-full max-h-[calc(100vh-4rem)]">
              <HostelRegistration 
                onSuccess={(h) => {
                  setProperties([h]);
                  setShowWelcomePopup(false);
                  triggerToast('Hostel Registration Submitted to Admin for Review!');
                  setShowRegistration(false);
                  setActiveTab('notifications');
                }} 
                onCancel={() => { setShowRegistration(false); setShowWelcomePopup(true); }} 
                currentUserId={user?.id}
              />
            </div>
          </div>
        ) : (
          <>
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-8 animate-fadeIn relative z-10">
                {/* Welcome banner with verified property spotlight */}
                <div className="bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-indigo-100/60 border border-sky-200/80 text-slate-900 p-8 rounded-3xl backdrop-blur-3xl shadow-xl relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2 max-w-2xl">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/15 text-emerald-900 border border-emerald-300/60 rounded-full text-xs font-black uppercase tracking-wider">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Official Accredited Residence • Live & Active</span>
                      </div>
                      <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900">
                        {primaryProperty?.name || 'Premium PineVela'}
                      </h2>
                      <p className="text-sm text-slate-600 font-medium flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>{primaryProperty?.location || 'Oxford street, Osu, OX-9834, Accra'}</span>
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                      <button
                        onClick={() => setShowEditProfileModal(true)}
                        className="bg-white/80 hover:bg-white backdrop-blur-md border border-sky-200/80 px-4 py-3 rounded-2xl text-xs font-bold text-blue-950 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs hover:shadow-sm"
                      >
                        <Edit3 className="w-4 h-4 text-blue-600" />
                        <span>Edit Manager Profile</span>
                        </button>
                      <div className="bg-white/80 backdrop-blur-md border border-sky-200/80 p-4 rounded-2xl text-center shrink-0 min-w-[180px] shadow-xs"><span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Property capacity</span><div className="text-2xl font-black text-blue-900 mt-0.5">{primaryProperty?.totalCapacity || 0} beds</div></div>
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Total Capacity', value: `${(primaryProperty?.totalCapacity || 1200).toLocaleString()} Beds`, sub: `${propertyBlocks.length} Physical Blocks • Verified Wings`, icon: Building2, color: 'bg-blue-600 text-white' },
                    { label: 'Available Beds', value: `${(availableBeds || primaryProperty?.totalCapacity || 1200).toLocaleString()} Available`, sub: 'Ready for resident allocation', icon: Users, color: 'bg-emerald-600 text-white' },
                    { label: 'Staff On Duty', value: `${staffList.filter(s => s.status === 'Active').length} Personnel`, sub: `${staffList.length} Total Enrolled Staff`, icon: UserPlus, color: 'bg-indigo-600 text-white' },
                    { 
                      label: 'Active Tickets', 
                      value: `${activeIssues} Requests`, 
                      sub: `${maintenanceIssues.filter(i => i.status === 'Resolved').length} Resolved to date`, 
                      icon: AlertCircle, 
                      color: activeIssues > 0 ? 'bg-red-600 text-white shadow-red-500/30' : 'bg-slate-700 text-white',
                      isBeaming: activeIssues > 0 || hasUnviewedMaintenanceLogs
                    }
                  ].map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                      <div key={idx} className={`bg-white/70 border ${stat.isBeaming ? 'border-red-300 ring-2 ring-red-400/20 shadow-red-500/10' : 'border-blue-200/50'} p-6 rounded-3xl backdrop-blur-xl shadow-lg relative overflow-hidden flex flex-col justify-between`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            {stat.isBeaming && (
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                              </span>
                            )}
                            <span className="text-xs font-bold text-slate-700 tracking-wider uppercase">{stat.label}</span>
                          </div>
                          <div className={`w-10 h-10 rounded-2xl ${stat.color} flex items-center justify-center shadow-md relative`}>
                            <Icon className="w-5 h-5" />
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-black text-slate-800 mb-1">{stat.value}</div>
                          <div className="text-xs text-slate-500 font-medium">{stat.sub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Operations Quick Actions & Property Snapshot */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Property Spotlight Card */}
                  <div className="lg:col-span-2 bg-white/70 border border-blue-200/60 p-6 md:p-8 rounded-3xl backdrop-blur-xl shadow-lg space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          <span>Residence Architecture & Facilities</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">High-level overview of physical infrastructure and amenities.</p>
                      </div>
                      <button 
                        onClick={() => setActiveTab('blocks')}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                      >
                        <span>View 3D Blocks</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {propertyBlocks.map((block: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/50 border border-blue-200/60 space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-black text-blue-900 bg-white px-2.5 py-1 rounded-lg shadow-sm border border-blue-100">
                              {block.blockName}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{block.genderCategory}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="p-2 bg-white/80 rounded-xl">
                              <span className="block text-[10px] text-slate-400 font-bold uppercase">Floors</span>
                              <span className="font-extrabold text-slate-800">{block.floors}</span>
                            </div>
                            <div className="p-2 bg-white/80 rounded-xl">
                              <span className="block text-[10px] text-slate-400 font-bold uppercase">Rooms</span>
                              <span className="font-extrabold text-slate-800">{block.totalRooms}</span>
                            </div>
                            <div className="p-2 bg-white/80 rounded-xl">
                              <span className="block text-[10px] text-slate-400 font-bold uppercase">Beds</span>
                              <span className="font-extrabold text-blue-600">{block.totalBeds}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Amenities pills */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Verified Facilities</span>
                      <div className="flex flex-wrap gap-2">
                        {(primaryProperty?.facilities || primaryProperty?.amenities || [
                          'Fiber-Optic Wi-Fi', 'Standby Generator / Plant', '24/7 Uniformed Security', 'Borehole & Mechanized Water', 'Quiet Study Hall', 'Smart Biometric Access'
                        ]).map((facility: string, idx: number) => (
                          <span key={idx} className="px-3 py-1 bg-white text-xs font-semibold text-slate-700 rounded-xl border border-slate-200 shadow-sm flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>{facility}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Operations Actions & Activity Feed */}
                  <div className="bg-white/70 border border-blue-200/60 p-6 rounded-3xl backdrop-blur-xl shadow-lg space-y-6 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span>Live Operations Audit</span>
                      </h3>

                      <div className="space-y-3">
                        {activities.slice(0, 4).map((act, i) => (
                          <div key={i} className="flex items-start space-x-3 p-3 rounded-2xl bg-blue-50/50 border border-blue-100/60 text-xs">
                            <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                            <div>
                              <p className="text-slate-800 font-medium">{act.text}</p>
                              <span className="text-[10px] text-slate-400 font-semibold">{act.time || act.timestamp || 'Recent'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quick navigation buttons */}
                    <div className="space-y-2 pt-4 border-t border-slate-100">
                      <button 
                        onClick={() => setActiveTab('staff')}
                        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all cursor-pointer"
                      >
                        <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Staff Directory ({staffList.length})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setActiveTab('maintenance')}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl ${hasUnviewedMaintenanceLogs ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 shadow-sm' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'} text-xs font-bold transition-all cursor-pointer`}
                      >
                        <span className="flex items-center gap-2">
                          {hasUnviewedMaintenanceLogs ? (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                            </span>
                          ) : null}
                          <Wrench className="w-3.5 h-3.5" /> Maintenance Tickets ({maintenanceIssues.length})
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PROPERTIES */}
            {activeTab === 'properties' && (
              <div className="animate-fadeIn relative z-10 space-y-6">
                <div className="bg-white/70 border border-blue-200/50 p-8 rounded-3xl backdrop-blur-xl shadow-lg space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight">Registered Property Dossier</h3>
                      <p className="text-xs text-slate-500 mt-1">Official listing records and infrastructure specifications on PineVela.</p>
                    </div>
                    <span className="px-4 py-1.5 rounded-full text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 self-start md:self-auto flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Approved & Live on Platform</span>
                    </span>
                  </div>

                  {/* Approved Residence Integrity Protection Banner */}
                  <div className="bg-amber-50/90 border border-amber-200/80 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5 sm:mt-0">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-amber-950">Accredited Property Lock Active</p>
                        <p className="text-amber-800 mt-0.5">
                          Direct editing of live residence specs (blocks, amenities, rules, fees) is restricted to maintain residence allocation integrity. To request updates, submit a change request to the PineVela Admin Board.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setNewRequestCategory('General Hostel Inquiry');
                        setNewRequestSubject(`Request update to residence details: ${primaryProperty?.name || 'My Hostel'}`);
                        setActiveTab('notifications');
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all shadow-sm shrink-0 cursor-pointer flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Request Admin Change</span>
                    </button>
                  </div>

                  {properties.map(p => (
                    <div key={p.id} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Left: Property Image & Identity */}
                      <div className="space-y-4">
                        <div className="relative rounded-3xl overflow-hidden border border-slate-200 shadow-md">
                          <img 
                            src={p.image || p.imageUrl || p.exteriorPhotoUrl || p.imagePreviewUrl || (p.images && p.images[0]) || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80'} 
                            alt={p.name} 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80';
                            }}
                            className="w-full h-64 object-cover"
                          />
                          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-xl text-xs font-bold">
                            {p.hostel_type || 'Student Accommodation'}
                          </div>
                        </div>

                        <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-2xl space-y-2 text-xs">
                          <span className="text-[10px] font-bold text-blue-900 uppercase">Assigned Property Manager</span>
                          <div className="flex items-center gap-3">
                            <img 
                              src={p.managerPhoto || user?.photo || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'} 
                              alt="Manager" 
                              className="w-10 h-10 rounded-xl object-cover border border-blue-200"
                            />
                            <div>
                              <p className="font-bold text-slate-900">{p.managerName || user?.name}</p>
                              <p className="text-slate-500">{p.managerPhone || user?.phone || '0509690121'}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Technical specifications & details */}
                      <div className="lg:col-span-2 space-y-6">
                        <div>
                          <h4 className="text-2xl font-black text-slate-900">{p.name}</h4>
                          <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-1 font-medium">
                            <MapPin className="w-4 h-4 text-blue-600" />
                            <span>{p.location}</span>
                          </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Total Beds</span>
                            <span className="block text-xl font-black text-slate-900 mt-0.5">{(p.totalCapacity || 1200).toLocaleString()}</span>
                          </div>
                          <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Total Blocks</span>
                            <span className="block text-xl font-black text-slate-900 mt-0.5">{propertyBlocks.length} Blocks</span>
                          </div>
                          <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Digital GPS</span>
                            <span className="block text-sm font-black text-indigo-700 mt-1">GA-183-9022</span>
                          </div>
                        </div>

                        {/* Facilities */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Accredited Facilities & Infrastructure</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(p.facilities || p.amenities || [
                              'Fiber-Optic Wi-Fi', 'Standby Generator / Plant', '24/7 Uniformed Security', 'Borehole & Mechanized Water', 'Quiet Study Hall', 'Smart Biometric Access'
                            ]).map((facility: string, idx: number) => (
                              <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2 text-xs font-semibold text-slate-800">
                                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>{facility}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Rules & Operational Policies */}
                        <div className="p-5 bg-gradient-to-br from-slate-50 to-blue-50/50 border border-blue-100 rounded-2xl space-y-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-blue-900">Standard Residence Policies</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                            <div><strong className="text-slate-800">Curfew:</strong> 10:00 PM (Main Gate Security Lock)</div>
                            <div><strong className="text-slate-800">Min Stay:</strong> 1 Academic Semester</div>
                            <div><strong className="text-slate-800">Visitors:</strong> Permitted in lobby until 8:00 PM</div>
                            <div><strong className="text-slate-800">Smoking:</strong> Strictly Non-Smoking Campus</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: BLOCKS & ROOMS (HIGH-PERFORMANCE VIRTUALIZED DIGITAL KEYS) */}
            {activeTab === 'blocks' && (
              <div className="relative z-10 space-y-6">
                {/* Header Banner */}
                <div className="bg-sky-50/80 border border-sky-200/80 p-6 rounded-3xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                      <Key className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Physical Property Wings & Digital Room Keys</h2>
                      <p className="text-xs text-slate-600">Select any block to inspect all rooms, view their unique digital access keys, search room numbers, and dispatch keys to students.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setRoomAccessError(null); setRoomAccessAction({ type: 'reshuffle' }); }}
                      disabled={!primaryProperty?.id}
                      className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Reshuffle Keys</span>
                    </button>
                    <button
                      onClick={fetchRoomKeys}
                      disabled={loadingRoomKeys}
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-blue-900 border border-blue-200 text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Sync and refresh room keys"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingRoomKeys ? 'animate-spin' : ''}`} />
                      <span>{loadingRoomKeys ? 'Refreshing...' : 'Refresh Keys'}</span>
                    </button>
                    <span className="text-xs font-bold bg-white text-blue-900 px-3.5 py-2 rounded-xl border border-blue-200 shadow-xs shrink-0">
                      {propertyBlocks.length} Wings • {roomKeysList.length || '30+'} Digital Keys
                    </span>
                  </div>
                </div>

                {/* Approved Residence Integrity Protection Banner */}
                <div className="bg-amber-50/90 border border-amber-200/80 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5 sm:mt-0">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-amber-950">Manager Digital Access Security</p>
                      <p className="text-amber-800 mt-0.5">
                        Each room is assigned an automated, secure 6-digit cryptographic key (e.g. <span className="font-mono font-bold bg-amber-200/80 px-1 py-0.5 rounded text-amber-950">PINECREST-A-XXXXXX</span>). Students require this key during registration to link their room console.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setNewRequestCategory('Room Capacity Adjustment');
                      setNewRequestSubject(`Request block adjustment for ${primaryProperty?.name || 'Hostel'}`);
                      setActiveTab('notifications');
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors shadow-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Request Block Change</span>
                  </button>
                </div>

                {/* High-Performance Virtualized Digital Keys Component */}
                <ManagerDigitalKeysView
                  roomKeys={roomKeysList}
                  onReleaseRoom={(room) => { setRoomAccessError(null); setRoomAccessAction({ type: 'release', room }); }}
                  activeBlock={selectedBlock || propertyBlocks[0]}
                  allBlocks={propertyBlocks}
                  onSelectBlock={(block) => setSelectedBlock(block)}
                  onRefreshKeys={fetchRoomKeys}
                  loadingKeys={loadingRoomKeys}
                  primaryProperty={primaryProperty}
                  onOpenDispatch={(keyItem) => {
                    setSelectedKeyForDispatch({
                      ...keyItem,
                      hostelName: primaryProperty?.name || 'PineVela Residence'
                    });
                    setDispatchRecipientEmail('');
                    setDispatchRecipientPhone('');
                    setDispatchRecipientName('');
                    setDispatchCustomNote(`Welcome! Here is your official PineVela digital room key for room ${keyItem.roomNumber} (${keyItem.blockName}).`);
                    setDispatchErrorMsg(null);
                    setDispatchSuccessMsg(null);
                    setDispatchModalOpen(true);
                  }}
                  onTriggerToast={triggerToast}
                  onRequestBlockChange={() => {
                    setNewRequestCategory('Room Capacity Adjustment');
                    setNewRequestSubject(`Request block adjustment for ${primaryProperty?.name || 'Hostel'}`);
                    setActiveTab('notifications');
                  }}
                />
              </div>
            )}

            {/* TAB 4: STAFF MANAGEMENT */}
            {activeTab === 'staff' && (
              <div className="animate-fadeIn relative z-10 space-y-6">
                <div className="bg-white/70 border border-blue-200/50 p-6 md:p-8 rounded-3xl backdrop-blur-xl shadow-lg space-y-6">
                  
                  {/* Top Header & Sub-tabs */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Users className="w-6 h-6 text-blue-600" />
                        <span>Residence Staff</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Create and manage staff accounts for your residence.
                      </p>
                    </div>

                    {/* Sub-Navigation Buttons */}
                    <div className="flex flex-wrap items-center gap-2 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200 self-start md:self-auto">
                      <button
                        type="button"
                        onClick={() => setStaffSubTab('roster')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          staffSubTab === 'roster'
                            ? 'bg-white text-blue-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Staff Roster ({staffList.length})</span>
                      </button>



                      <button
                        type="button"
                        onClick={() => setStaffSubTab('bargains')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 relative ${
                          staffSubTab === 'bargains'
                            ? 'bg-white text-blue-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Scale className="w-3.5 h-3.5 text-purple-600" />
                        <span>Quit & Bargains</span>
                        {staffBargains.filter(b => b.status === 'pending').length > 0 && (
                          <span className="w-5 h-5 bg-purple-600 text-white font-black text-[10px] rounded-full flex items-center justify-center animate-pulse">
                            {staffBargains.filter(b => b.status === 'pending').length}
                          </span>
                        )}
                      </button>


                    </div>
                  </div>

                  {/* ======================================================== */}
                  {/* SUBTAB 1: STAFF ROSTER                                   */}
                  {/* ======================================================== */}
                  {staffSubTab === 'roster' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">
                          {staffList.length} Active Personnel Assigned to Property
                        </span>
                        <button 
                          onClick={() => setShowAddStaffModal(true)}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Staff Member</span>
                        </button>
                      </div>

                      {staffList.length === 0 ? (
                        <div className="p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          <p className="text-xs font-bold text-slate-700">No staff members enrolled yet</p>
                          <p className="text-[11px] text-slate-400 mt-1">Create the staff accounts your residence needs using the button above.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                          {staffList.map(staff => (
                            <div key={staff.id} className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition-all">
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                  {((staff as any).avatarUrl || (staff as any).profilePicture || (staff as any).photo || (staff as any).avatar) ? (
                                    <img 
                                      src={(staff as any).avatarUrl || (staff as any).profilePicture || (staff as any).photo || (staff as any).avatar}
                                      alt={staff.name} 
                                      className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-sm"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-700 text-white flex items-center justify-center font-bold text-base shadow-sm">
                                      {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </div>
                                  )}
                                  <div>
                                    <h4 className="text-sm font-bold text-slate-900">{staff.name}</h4>
                                    {(staff as any).username && (
                                      <p className="text-[11px] text-slate-400 font-semibold">@{(staff as any).username}</p>
                                    )}
                                    <p className="text-xs text-blue-600 font-semibold mt-0.5">{staff.role}</p>
                                  </div>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                  staff.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {staff.status}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div><span className="text-slate-400 font-medium">Shift:</span> <span className="font-semibold text-slate-800">{staff.shift}</span></div>
                                <div><span className="text-slate-400 font-medium">Block:</span> <span className="font-semibold text-slate-800">{staff.assignedBlock}</span></div>
                                <div className="col-span-2"><span className="text-slate-400 font-medium">Phone:</span> <span className="font-semibold text-slate-800">{staff.phone}</span></div>
                                {(staff as any).nationalId && (
                                  <div className="col-span-2"><span className="text-slate-400 font-medium">ID / Ghana Card:</span> <span className="font-semibold text-slate-800">{(staff as any).nationalId}</span></div>
                                )}
                              </div>

                              {/* Pending Bargain Alert for this Staff */}
                              {staffBargains.some(b => (b.staffId === staff.id || (b.staffEmail && b.staffEmail.toLowerCase() === staff.email.toLowerCase())) && b.status === 'pending') && (
                                <button
                                  type="button"
                                  onClick={() => setStaffSubTab('bargains')}
                                  className="w-full py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer shadow-xs"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <Scale className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                                    <span>Retention Deal Pending</span>
                                  </span>
                                  <span className="text-purple-700 font-black flex items-center gap-1">
                                    Review Deal <ArrowRight className="w-3 h-3" />
                                  </span>
                                </button>
                              )}

                              {staffBargains.some(b => (b.staffId === staff.id || (b.staffEmail && b.staffEmail.toLowerCase() === staff.email.toLowerCase())) && (b.status === 'quit_confirmed' || b.status === 'resigned')) && (
                                <div className="w-full py-1.5 px-3 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                                  <LogOutIcon className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Staff Has Resigned / Position Vacated</span>
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                                <div className="flex gap-2">
                                  <a 
                                    href={`tel:${staff.phone}`}
                                    className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold flex items-center gap-1.5 transition-all"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                    <span>Call</span>
                                  </a>
                                  <a 
                                    href={`mailto:${staff.email}`}
                                    className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold flex items-center gap-1.5 transition-all"
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                    <span>Email</span>
                                  </a>
                                </div>

                                <button 
                                  onClick={() => handleDeleteStaff(staff.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition-colors cursor-pointer"
                                  title="Remove staff record"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ======================================================== */}
                  {/* SUBTAB 2: APPLICATIONS & CV REVIEWS                      */}
                  {/* ======================================================== */}


                  {/* ======================================================== */}
                  {/* SUBTAB 3: QUIT REASONS & BARGAIN NEGOTIATIONS             */}
                  {/* ======================================================== */}
                  {staffSubTab === 'bargains' && (
                    <div className="space-y-6">
                      <div className="p-5 bg-gradient-to-r from-purple-900 to-indigo-950 rounded-2xl text-white space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h4 className="text-sm font-black flex items-center gap-2">
                            <Scale className="w-5 h-5 text-purple-300" />
                            <span>Staff Resignations & Retention Bargain Center</span>
                          </h4>
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/30 text-purple-200 border border-purple-400/40">
                              {staffBargains.filter(b => b.status === 'pending').length} Pending Deals
                            </span>
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/30 text-emerald-200 border border-emerald-400/40">
                              {staffBargains.filter(b => b.status === 'accepted').length} Retained
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-purple-100 max-w-3xl leading-relaxed">
                          When verified staff members wish to quit, they must submit a mandatory reason or propose bargain terms (such as shift adjustments or wage terms). You can review and accept their deal to retain them, or decline. If declined, the staff member chooses whether to proceed to quit or remain in service.
                        </p>
                      </div>

                      {staffBargains.length === 0 ? (
                        <div className="text-center py-16 bg-white border border-slate-200/80 rounded-2xl p-8 space-y-3">
                          <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto">
                            <Handshake className="w-7 h-7" />
                          </div>
                          <h4 className="text-base font-bold text-slate-900">No Resignations or Bargain Proposals</h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            All currently employed staff members are actively on duty in their assigned roles. Any pending quit notices or bargaining proposals will appear here immediately.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-5">
                          {staffBargains.map((bargain: any) => {
                            const isPending = bargain.status === 'pending';
                            const isAccepted = bargain.status === 'accepted';
                            const isRejected = bargain.status === 'rejected';
                            const isStayed = bargain.status === 'stay_confirmed';
                            const isQuitted = bargain.status === 'quit_confirmed' || bargain.status === 'resigned';

                            return (
                              <div 
                                key={bargain.id} 
                                className={`p-6 bg-white border rounded-2xl shadow-sm transition-all space-y-5 ${
                                  isPending 
                                    ? 'border-purple-300 ring-2 ring-purple-100' 
                                    : isAccepted 
                                    ? 'border-emerald-200 bg-emerald-50/10' 
                                    : isQuitted
                                    ? 'border-slate-200 bg-slate-50/40 opacity-90'
                                    : 'border-slate-200'
                                }`}
                              >
                                {/* Header */}
                                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-700 to-indigo-800 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                                      {(bargain.staffName || 'Staff').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-black text-slate-900">{bargain.staffName}</h4>
                                        {bargain.isBargain ? (
                                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-black uppercase rounded-md tracking-wider border border-purple-200">
                                            Bargaining Deal
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black uppercase rounded-md tracking-wider border border-slate-200">
                                            Direct Resignation
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        Role: <span className="font-bold text-slate-700">{bargain.role || 'Staff Member'}</span> &bull; {bargain.hostelName}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                                    <span className="text-[11px] font-semibold text-slate-400">
                                      {bargain.submittedAt ? new Date(bargain.submittedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Recent'}
                                    </span>
                                    {isPending && (
                                      <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5 animate-pulse">
                                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                                        <span>Pending Your Decision</span>
                                      </span>
                                    )}
                                    {isAccepted && (
                                      <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                                        <span>Deal Accepted (Staff Retained)</span>
                                      </span>
                                    )}
                                    {isRejected && (
                                      <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1.5">
                                        <XCircle className="w-3.5 h-3.5 text-rose-700" />
                                        <span>Deal Declined (Awaiting Staff Choice)</span>
                                      </span>
                                    )}
                                    {isStayed && (
                                      <span className="px-3 py-1 rounded-full text-xs font-black bg-teal-100 text-teal-900 border border-teal-300 flex items-center gap-1.5">
                                        <Check className="w-3.5 h-3.5 text-teal-700" />
                                        <span>Staff Chose to Stay in Job</span>
                                      </span>
                                    )}
                                    {isQuitted && (
                                      <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-800 border border-slate-300 flex items-center gap-1.5">
                                        <LogOutIcon className="w-3.5 h-3.5 text-slate-600" />
                                        <span>Resigned & Role Vacated</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Grid content */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                                  {/* Reason to quit */}
                                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                                      <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
                                      <span>Mandatory Reason Given for Wanting to Quit</span>
                                    </div>
                                    <p className="text-slate-800 italic bg-white p-3 rounded-lg border border-slate-100 leading-relaxed font-medium">
                                      "{bargain.reasonToQuit}"
                                    </p>
                                    <div className="flex flex-wrap items-center gap-4 text-slate-500 pt-1 text-[11px]">
                                      {bargain.staffEmail && <span>Email: <strong className="text-slate-700">{bargain.staffEmail}</strong></span>}
                                      {bargain.staffPhone && <span>Phone: <strong className="text-slate-700">{bargain.staffPhone}</strong></span>}
                                      {bargain.currentShift && <span>Current Shift: <strong className="text-slate-700">{bargain.currentShift}</strong></span>}
                                    </div>
                                  </div>

                                  {/* Proposed bargain terms */}
                                  {bargain.isBargain ? (
                                    <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl space-y-1.5">
                                      <div className="flex items-center justify-between text-purple-900 font-bold text-[11px] uppercase tracking-wider">
                                        <span className="flex items-center gap-1.5">
                                          <Handshake className="w-3.5 h-3.5 text-purple-600" />
                                          <span>Proposed Retention Deal to Stay</span>
                                        </span>
                                        {bargain.bargainProposal?.proposedCategory && (
                                          <span className="px-2 py-0.5 bg-purple-200 text-purple-900 rounded font-black text-[10px]">
                                            {bargain.bargainProposal.proposedCategory}
                                          </span>
                                        )}
                                      </div>
                                      <div className="bg-white p-3 rounded-lg border border-purple-100 space-y-1">
                                        <p className="text-purple-950 font-bold">
                                          {bargain.bargainProposal?.proposedTerms || 'No specific terms entered.'}
                                        </p>
                                        {bargain.bargainProposal?.notes && (
                                          <p className="text-slate-600 italic text-[11px] pt-1 border-t border-purple-50">
                                            Note: "{bargain.bargainProposal.notes}"
                                          </p>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-purple-700 font-medium">
                                        If you accept, this staff member is retained and their schedule/terms are officially updated.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="p-4 bg-rose-50/50 border border-rose-200 rounded-xl space-y-1.5 flex flex-col justify-center">
                                      <div className="flex items-center gap-1.5 text-rose-900 font-bold text-[11px] uppercase tracking-wider">
                                        <LogOutIcon className="w-3.5 h-3.5 text-rose-600" />
                                        <span>Direct Resignation</span>
                                      </div>
                                      <p className="text-slate-700 font-medium text-xs">
                                        The staff member chose not to submit any bargain deal and has officially initiated resignation.
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Manager Response Note (if already responded) */}
                                {bargain.managerResponseNote && (
                                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                                    <div className="flex items-center gap-1.5 font-bold text-blue-900 text-[11px] uppercase tracking-wider">
                                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                                      <span>Manager's Recorded Response Note</span>
                                      {bargain.resolvedAt && (
                                        <span className="text-slate-400 font-normal ml-auto text-[10px]">
                                          {new Date(bargain.resolvedAt).toLocaleString()}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-slate-800 font-medium italic">
                                      "{bargain.managerResponseNote}"
                                    </p>
                                  </div>
                                )}

                                {/* Actions for pending bargains */}
                                {isPending && (
                                  <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedBargainToReview(bargain);
                                        setManagerResponseAction('reject');
                                        setManagerResponseNote('');
                                      }}
                                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                                    >
                                      <ThumbsDown className="w-3.5 h-3.5" />
                                      <span>Decline Deal</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedBargainToReview(bargain);
                                        setManagerResponseAction('accept');
                                        setManagerResponseNote('We accept your proposed retention terms and appreciate your service to our hostel.');
                                        setManagerUpdatedShift(bargain.currentShift || 'Day Shift (8 AM - 5 PM)');
                                        setManagerUpdatedBlock(bargain.currentBlock || 'All Blocks');
                                      }}
                                      className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                                    >
                                      <ThumbsUp className="w-3.5 h-3.5" />
                                      <span>Accept Deal & Retain Staff</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ======================================================== */}
                  {/* SUBTAB 4: RECRUITMENT SETTINGS                            */}
                  {/* ======================================================== */}


                </div>

                {/* UNIFIED DOCUMENT PREVIEW MODAL */}


                {/* APPROVE & ENROL MODAL */}


              </div>
            )}

            {/* TAB 5: MAINTENANCE */}
            {activeTab === 'maintenance' && (
              <div className="animate-fadeIn relative z-10 space-y-6">
                <div className="bg-white/70 border border-blue-200/50 p-6 md:p-8 rounded-3xl backdrop-blur-xl shadow-lg space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Wrench className="w-6 h-6 text-blue-600" />
                        <span>Maintenance Dispatch & Work Orders</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">Track and resolve plumbing, electrical, Wi-Fi, and structural work orders across all residence wings.</p>
                    </div>
                    <button 
                      onClick={() => setShowAddIssueModal(true)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer self-start md:self-auto"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Log Maintenance Ticket</span>
                    </button>
                  </div>

                  {/* 30-Day Maintenance Completion Rate Summary Chart */}
                  <div className="p-6 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl shadow-xl border border-blue-900/50 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-400/30 inline-block mb-1">
                          Performance Analytics
                        </div>
                        <h4 className="text-lg font-black tracking-tight text-white">30-Day Maintenance Ticket Completion Rate</h4>
                        <p className="text-xs text-slate-300">Daily resolution percentage & staff performance throughput over the last 30 days.</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-emerald-400">
                          {Math.round((maintenanceIssues.filter(m => m.status === 'Resolved').length / Math.max(1, maintenanceIssues.length)) * 100)}%
                        </div>
                        <div className="text-[10px] text-slate-400">Current Resolution Ratio</div>
                      </div>
                    </div>
                    <div className="h-64 w-full pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={Array.from({ length: 30 }, (_, i) => {
                          const dayNum = 30 - i;
                          const base = 75 + ((i * 7) % 20);
                          return {
                            day: `Day ${dayNum}`,
                            completionRate: Math.min(100, Math.max(60, base))
                          };
                        }).reverse()}>
                          <defs>
                            <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="day" stroke="#94a3b8" fontSize={10} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                            formatter={(value: any) => [`${value}%`, 'Completion Rate']}
                          />
                          <Area type="monotone" dataKey="completionRate" stroke="#34d399" strokeWidth={3} fillOpacity={1} fill="url(#completionGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Filter chips */}
                  <div className="flex gap-2">
                    {(['all', 'Open', 'In Progress', 'Resolved'] as const).map(filter => (
                      <button
                        key={filter}
                        onClick={() => setMaintenanceFilter(filter)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                          maintenanceFilter === filter 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {filter} {filter === 'all' ? `(${maintenanceIssues.length})` : ''}
                      </button>
                    ))}
                  </div>

                  {/* Tickets List */}
                  <div className="space-y-4">
                    {filteredIssues.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                        No maintenance tickets matching current filter.
                      </div>
                    ) : (
                      filteredIssues.map(ticket => {
                        const isOverdue = ticket.deadline && new Date() > new Date(ticket.deadline) && ticket.status !== 'Resolved';
                        return (
                          <div 
                            key={ticket.id} 
                            onClick={() => {
                              setSelectedIssueDetail(ticket);
                              setSelectedAssigneeId(ticket.assignedStaffId || '');
                              setSelectedIssueTimeframe(ticket.timeframe || '24h');
                            }}
                            className="p-5 bg-white border border-slate-200/80 hover:border-blue-400 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-all hover:shadow-md group"
                          >
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                                  ticket.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' :
                                  ticket.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                  'bg-amber-100 text-amber-800'
                                }`}>
                                  {ticket.status}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  ticket.urgency === 'Emergency' ? 'bg-rose-100 text-rose-700' :
                                  ticket.urgency === 'High' ? 'bg-orange-100 text-orange-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {ticket.urgency} Urgency
                                </span>
                                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                  {ticket.category}
                                </span>
                                <span className="text-[10px] text-slate-400">Room: {ticket.roomNumber}</span>
                              </div>
                              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{ticket.title}</h4>
                              <p className="text-xs text-slate-600 line-clamp-2">{ticket.description}</p>
                              
                              <div className="flex flex-wrap gap-2 pt-1 items-center">
                                {ticket.assignedStaffName ? (
                                  <span className="text-[10px] bg-sky-50 text-sky-800 border border-sky-100 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                    Assigned: {ticket.assignedStaffName} ({ticket.assignedStaffRole})
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-100 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    Unassigned Dispatch Queue
                                  </span>
                                )}
                                
                                {ticket.rescheduleRequested && (
                                  <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold">
                                    ⚠️ Reschedule Requested
                                  </span>
                                )}
                                {ticket.staffDeclineRequested && (
                                  <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-0.5 rounded-full font-bold">
                                    ❌ Assignment Declined
                                  </span>
                                )}
                                {(ticket.closedByManager || ticket.isClosed) ? (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    Marked as Success (Archived & Closed)
                                  </span>
                                ) : ticket.staffCompleted ? (
                                  <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                                    ✓ Completed by Staff (Awaiting Student/Manager signoff)
                                  </span>
                                ) : null}
                                {isOverdue && (
                                  <span className="text-[10px] bg-red-100 text-red-800 border border-red-200 px-2.5 py-0.5 rounded-full font-black animate-pulse">
                                    ⚠️ DELAY PENALTY ACTIVE
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                <span>{(ticket.closedByManager || ticket.isClosed) ? 'View Archived Record (Success)' : 'Manage Desk'}</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* DETAILED MAINTENANCE TICKET ENLARGED VIEW */}
                {selectedIssueDetail && (
                  <DashboardOverlay onClose={() => setSelectedIssueDetail(null)} aria-label="Maintenance ticket details" className="flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
                    <div className="my-auto w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-blue-200/80 bg-white p-6 text-slate-850 shadow-2xl md:p-8 space-y-6 animate-fadeIn">
                      
                      {/* HEADER */}
                      <div className="flex justify-between items-start gap-4 border-b border-slate-100 pb-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                              (selectedIssueDetail.closedByManager || selectedIssueDetail.isClosed) ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              selectedIssueDetail.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' :
                              selectedIssueDetail.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {(selectedIssueDetail.closedByManager || selectedIssueDetail.isClosed) ? 'Marked as Success (Archived & Closed)' : selectedIssueDetail.status}
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                              selectedIssueDetail.urgency === 'Emergency' ? 'bg-rose-100 text-rose-700' :
                              selectedIssueDetail.urgency === 'High' ? 'bg-orange-100 text-orange-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {selectedIssueDetail.urgency} Urgency
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              {selectedIssueDetail.category}
                            </span>
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                              Room: {selectedIssueDetail.roomNumber}
                            </span>
                          </div>
                          <h3 className="text-lg font-black text-slate-900">{selectedIssueDetail.title}</h3>
                        </div>
                        <button 
                          onClick={() => setSelectedIssueDetail(null)} 
                          className="p-1 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full transition-all"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>

                      {/* DESCRIPTION */}
                      <div className="space-y-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reported Issue Details:</span>
                        <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">{selectedIssueDetail.description}</p>
                      </div>

                      {/* STUDENT PHOTOS PROOF GALLERY */}
                      {selectedIssueDetail.photos && selectedIssueDetail.photos.length > 0 && (
                        <div className="space-y-2">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student Attachment Proofs ({selectedIssueDetail.photos.length}):</span>
                          <div className="flex gap-2.5 flex-wrap">
                            {selectedIssueDetail.photos.map((photo: string, index: number) => (
                              <img 
                                key={index} 
                                src={photo} 
                                alt="Student proof" 
                                className="w-20 h-20 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-85 transition-all"
                                onClick={() => setZoomedImage(photo)}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* DISPATCH / WORK FLOW SECTION */}
                      <div className="border-t border-slate-100 pt-4 space-y-4">
                        
                        {/* CASE 0: ALREADY ARCHIVED & CLOSED (READ ONLY) */}
                        {(selectedIssueDetail.closedByManager || selectedIssueDetail.isClosed) ? (
                          <div className="space-y-4 animate-fadeIn">
                            <div className="bg-emerald-50/90 border border-emerald-300 p-5 rounded-2xl space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-emerald-950 font-black text-sm">
                                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                                  <span>Work Order Marked as Success & Archived in History</span>
                                </div>
                                <span className="px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-extrabold rounded-full uppercase tracking-wider">
                                  Success Audit Record
                                </span>
                              </div>
                              <p className="text-xs text-emerald-800 leading-relaxed">
                                This work order is marked as success and kept in history. You can view all details and photos here, but cannot alter this work order.
                              </p>
                              {selectedIssueDetail.closedAt && (
                                <div className="text-[10px] text-emerald-700 font-bold pt-1 border-t border-emerald-200/60">
                                  Archived on: {new Date(selectedIssueDetail.closedAt).toLocaleString()}
                                </div>
                              )}
                            </div>

                            {/* ASSIGNED STAFF DETAILS (READ ONLY) */}
                            <div className="bg-slate-50 border border-slate-200 p-4.5 rounded-2xl space-y-3">
                              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Assigned Staff & Completion Details:</span>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-xs font-bold text-slate-900">{selectedIssueDetail.assignedStaffName || 'Assigned Vocational Staff'}</div>
                                  <div className="text-[10px] text-slate-500 font-medium">{selectedIssueDetail.assignedStaffRole || 'Staff Member'}</div>
                                </div>
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">Task Completed</span>
                              </div>
                              {selectedIssueDetail.staffCompletionNotes && (
                                <div className="text-xs text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                                  <strong>Staff Completion Remarks:</strong> "{selectedIssueDetail.staffCompletionNotes}"
                                </div>
                              )}
                              {selectedIssueDetail.staffCompletionPhoto && (
                                <div className="space-y-1.5 pt-1">
                                  <strong className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Technician Proof Photo:</strong>
                                  <img 
                                    src={selectedIssueDetail.staffCompletionPhoto} 
                                    alt="Technician Completion" 
                                    className="w-24 h-24 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-80 transition-opacity"
                                    onClick={() => setZoomedImage(selectedIssueDetail.staffCompletionPhoto)}
                                  />
                                </div>
                              )}
                            </div>

                            {/* RESIDENT VALIDATION (READ ONLY) */}
                            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-bold flex items-center gap-2">
                              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Resident Verification: Inspected and confirmed by student resident.</span>
                            </div>

                            {/* MANAGER CLOSE BUTTON (ONLY VIEW / CLOSE MODAL) */}
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => setSelectedIssueDetail(null)}
                                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <span>Close</span>
                              </button>
                            </div>
                          </div>
                        ) : !selectedIssueDetail.assignedStaffId ? (
                          
                          // CASE 1: UNASSIGNED
                          <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                            <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                              <span>Dispatch Vocational Staff Member</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Choose Urgency SLA Timeframe</label>
                                <select 
                                  value={selectedIssueTimeframe} 
                                  onChange={(e) => setSelectedIssueTimeframe(e.target.value)}
                                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                                >
                                  <option value="12h">12 Hours SLA (Emergency)</option>
                                  <option value="24h">24 Hours (1 Day)</option>
                                  <option value="48h">48 Hours (2 Days)</option>
                                  <option value="3d">3 Days (Normal Repair)</option>
                                  <option value="5d">5 Days</option>
                                  <option value="7d">7 Days (Low Priority)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Select Residence Staff</label>
                                <select 
                                  value={selectedAssigneeId} 
                                  onChange={(e) => setSelectedAssigneeId(e.target.value)}
                                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                                >
                                  <option value="">-- Choose Residence Staff --</option>
                                  {staffList.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <button 
                              type="button"
                              disabled={assigningStaffState || !selectedAssigneeId}
                              onClick={() => handleAssignStaff(selectedIssueDetail.id)}
                              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {assigningStaffState ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                              <span>Assign and Dispatch Work Order</span>
                            </button>
                          </div>
                        ) : (
                          
                          // CASE 2: ALREADY ASSIGNED
                          <div className="space-y-4">
                            <div className="bg-blue-50/50 border border-blue-200/50 p-4.5 rounded-2xl">
                              <span className="block text-[10px] font-black text-blue-800 uppercase tracking-wider mb-2">Dispatched Vocational Staff:</span>
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-bold text-slate-900">{selectedIssueDetail.assignedStaffName}</div>
                                  <div className="text-[10px] text-slate-500 font-semibold">{selectedIssueDetail.assignedStaffRole}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] font-bold text-blue-700 uppercase">SLA TIMEFRAME: {selectedIssueDetail.timeframe || '24h'}</div>
                                  {selectedIssueDetail.deadline && (
                                    <div className="text-[9px] text-slate-400">Deadline: {new Date(selectedIssueDetail.deadline).toLocaleString()}</div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* DECLINE HANDOVER WARNING */}
                            {selectedIssueDetail.staffDeclineRequested && (
                              <div className="bg-rose-50 border border-rose-200 p-4.5 rounded-2xl space-y-3">
                                <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                                  <XCircle className="w-4 h-4 text-rose-600" />
                                  <span>Technician Declined Work Order Handover</span>
                                </div>
                                <p className="text-xs text-rose-700 leading-relaxed">
                                  <strong>Reason Given:</strong> "{selectedIssueDetail.staffDeclineReason || "No details provided."}"
                                </p>
                                <div className="border-t border-rose-200/60 pt-3">
                                  <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase">Re-assign to Another Residence Staff Member:</label>
                                  <div className="flex gap-2">
                                    <select 
                                      value={selectedAssigneeId} 
                                      onChange={(e) => setSelectedAssigneeId(e.target.value)}
                                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-850 focus:outline-none focus:border-blue-600"
                                    >
                                      <option value="">-- Choose Replacement Technician --</option>
                                      {staffList.filter(s => s.id !== selectedIssueDetail.assignedStaffId).map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                                      ))}
                                    </select>
                                    <button 
                                      onClick={() => handleAssignStaff(selectedIssueDetail.id)}
                                      disabled={assigningStaffState || !selectedAssigneeId}
                                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shrink-0 flex items-center justify-center gap-1 disabled:opacity-50"
                                    >
                                      Re-assign
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* RESCHEDULE REQUEST FLOW */}
                            {selectedIssueDetail.rescheduleRequested && (
                              <div className="bg-amber-50 border border-amber-200 p-4.5 rounded-2xl space-y-3">
                                <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                                  <AlertCircle className="w-4 h-4 text-amber-600" />
                                  <span>Technician Requested SLA Timeframe Extension</span>
                                </div>
                                <div className="text-xs text-amber-700 leading-relaxed space-y-1">
                                  <div><strong>Requested SLA Limit:</strong> {selectedIssueDetail.requestedTimeframe === '12h' ? '12 Hours' : selectedIssueDetail.requestedTimeframe === '24h' ? '24 Hours' : selectedIssueDetail.requestedTimeframe === '48h' ? '48 Hours' : selectedIssueDetail.requestedTimeframe === '3d' ? '3 Days' : selectedIssueDetail.requestedTimeframe === '5d' ? '5 Days' : '7 Days'}</div>
                                  <div><strong>Reason for Extension:</strong> "{selectedIssueDetail.rescheduleReason || "No details provided."}"</div>
                                </div>
                                <div className="flex gap-2.5 pt-1.5">
                                  <button 
                                    onClick={() => handleAcceptReschedule(selectedIssueDetail.id)}
                                    className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs"
                                  >
                                    Approve New Extension Timeframe
                                  </button>
                                  <button 
                                    onClick={() => handleDeclineReschedule(selectedIssueDetail.id)}
                                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all"
                                  >
                                    Decline Request
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* SLA DELAY PENALTY BANNER */}
                            {selectedIssueDetail.deadline && new Date() > new Date(selectedIssueDetail.deadline) && !selectedIssueDetail.staffCompleted && !selectedIssueDetail.rescheduleRequested && (
                              <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-xs text-red-800 leading-relaxed space-y-1 animate-pulse">
                                <div className="font-bold flex items-center gap-1.5">
                                  <XCircle className="w-4 h-4 text-red-600" />
                                  <span>⚠️ SLA WORK TIMEFRAME EXCEEDED (DELAY PENALTY ACTIVE)</span>
                                </div>
                                <p>Technician has missed the assigned timeframe of {selectedIssueDetail.timeframe} without marking the ticket completed or receiving an authorized reschedule extension. Dynamic penalty logged.</p>
                              </div>
                            )}

                            {/* STAFF COMPLETION AND SIGN OFF FEEDBACK */}
                            {selectedIssueDetail.staffCompleted && (
                              <div className="bg-emerald-50/70 border border-emerald-200 p-4.5 rounded-2xl space-y-4">
                                <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 animate-bounce" />
                                  <span>Technician Marked Task Completed!</span>
                                </div>
                                <div className="text-xs text-emerald-900 leading-relaxed space-y-1">
                                  <div><strong>Completion Remarks:</strong> "{selectedIssueDetail.staffCompletionNotes || "No completion notes submitted."}"</div>
                                  {selectedIssueDetail.staffCompletionPhoto && (
                                    <div className="space-y-1.5 pt-1.5">
                                      <strong>Completion Photo Proof:</strong>
                                      <img 
                                        src={selectedIssueDetail.staffCompletionPhoto} 
                                        alt="Technician Proof" 
                                        className="w-24 h-24 object-cover rounded-xl border border-emerald-200 cursor-zoom-in hover:opacity-80 transition-opacity"
                                        onClick={() => setZoomedImage(selectedIssueDetail.staffCompletionPhoto)}
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* STUDENT CONFIRMATION STATUS */}
                                {selectedIssueDetail.studentConfirmed ? (
                                  <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-bold flex items-center gap-1.5">
                                    <Check className="w-4 h-4" />
                                    <span>Verified & Confirmed by Student Resident! Work order is successfully validated.</span>
                                  </div>
                                ) : (
                                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium leading-relaxed">
                                    🕒 Awaiting Resident Student verification from their dashboard... (Manager can override signoff below if necessary)
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ACTION BUTTONS */}
                            <div className="pt-2 flex gap-3">
                              {/* CLOSE TICKET PERMANENTLY */}
                              {selectedIssueDetail.staffCompleted && !selectedIssueDetail.closedByManager && !selectedIssueDetail.isClosed && (
                                <button
                                  type="button"
                                  onClick={() => handleCloseIssue(selectedIssueDetail.id, "Verified and signed off by hostel desk.")}
                                  disabled={closingIssueState}
                                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                  title="Archive & Close Work Order"
                                >
                                  {closingIssueState ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                  <span>{closingIssueState ? "Archiving & Closing..." : "Archive & Close Work Order"}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </DashboardOverlay>
                )}

                {/* LOG MAINTENANCE MODAL */}
                {showAddIssueModal && (
                  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-blue-200/80 space-y-6">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                        <h3 className="text-lg font-bold text-slate-900">Log Maintenance Work Order</h3>
                        <button onClick={() => setShowAddIssueModal(false)} className="text-slate-400 hover:text-slate-600">
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>

                      <form onSubmit={handleAddMaintenance} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Issue Title</label>
                          <input 
                            type="text" 
                            value={newIssueTitle} 
                            onChange={(e) => setNewIssueTitle(e.target.value)} 
                            placeholder="e.g. Water leak in Room A104 bathroom" 
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                            <select 
                              value={newIssueCategory} 
                              onChange={(e) => setNewIssueCategory(e.target.value)}
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                            >
                              <option value="Plumbing & Water">Plumbing & Water</option>
                              <option value="Electrical & Power">Electrical & Power</option>
                              <option value="Wi-Fi & Telecom">Wi-Fi & Telecom</option>
                              <option value="Doors & Biometric Locks">Doors & Biometric Locks</option>
                              <option value="Structural & Air Conditioning">Structural & Air Conditioning</option>
                              <option value="Sanitation & Housekeeping">Sanitation & Housekeeping</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Location / Room Number</label>
                            <input 
                              type="text" 
                              value={newIssueRoom} 
                              onChange={(e) => setNewIssueRoom(e.target.value)} 
                              placeholder="e.g. Room A104" 
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Urgency</label>
                          <select 
                            value={newIssueUrgency} 
                            onChange={(e) => setNewIssueUrgency(e.target.value as any)}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                          >
                            <option value="Normal">Normal Priority</option>
                            <option value="High">High Priority</option>
                            <option value="Emergency">Emergency Priority</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                          <textarea 
                            rows={3} 
                            value={newIssueDescription} 
                            onChange={(e) => setNewIssueDescription(e.target.value)} 
                            placeholder="Provide any additional technical notes or technician directions..."
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white resize-none"
                          />
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                          <button 
                            type="button" 
                            onClick={() => setShowAddIssueModal(false)}
                            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
                          >
                            Cancel
                          </button>
                          <button 
                            type="submit" 
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
                          >
                            Dispatch Work Order
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: MEETINGS & CONSULTATION LOGS */}
            {activeTab === 'meetings' && (
              <div className="animate-fadeIn relative z-10 max-w-5xl mx-auto space-y-6 pt-2">
                <ManagerMeetingsTab 
                  currentUser={user} 
                  primaryHostel={primaryProperty} 
                />
              </div>
            )}

            {/* TAB 7: NOTIFICATIONS & ADMIN BOARD */}
            {activeTab === 'notifications' && (
              <div className="animate-fadeIn relative z-10 max-w-4xl mx-auto space-y-6 pt-2">
                {!hasAnyProperty && (
                  <div className="bg-gradient-to-br from-blue-600 to-cyan-700 border border-blue-400/50 p-8 md:p-10 rounded-3xl shadow-xl shadow-blue-900/20 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
                    <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-cyan-400/10 rounded-full blur-3xl mix-blend-overlay"></div>
                    <div className="relative z-10 space-y-4">
                      <h2 className="text-3xl font-black tracking-tight">Welcome to PineVela, {user?.name || 'Manager'}!</h2>
                      <p className="text-sm font-medium text-blue-100 max-w-2xl leading-relaxed">
                        Your manager account has been successfully verified. To unlock your dashboard and begin accepting students, you need to register your official residence property.
                      </p>
                      <button
                        onClick={() => setShowRegistration(true)}
                        className="mt-6 px-6 py-3.5 bg-white text-blue-800 font-extrabold text-sm rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer inline-flex items-center gap-2"
                      >
                        <Building2 className="w-5 h-5" />
                        <span>Register a Hostel to Start Onboarding</span>
                      </button>
                    </div>
                  </div>
                )}

                {hasAnyProperty && !hasApprovedProperty && (
                  <div className="bg-gradient-to-br from-amber-500 to-orange-500 border border-amber-400/50 p-8 md:p-10 rounded-3xl shadow-xl shadow-amber-900/20 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
                    <div className="relative z-10 space-y-4">
                      <h2 className="text-3xl font-black tracking-tight">Property Registration Pending Review</h2>
                      <p className="text-sm font-medium text-amber-50 max-w-2xl leading-relaxed">
                        Your property <strong>"{properties[0]?.name}"</strong> is currently under review by the administration. Once approved, your operational dashboard will be fully unlocked.
                      </p>
                    </div>
                  </div>
                )}

                {hasApprovedProperty && (
                  <>
                    {/* OFFICIAL WELCOME BANNER FOR APPROVED MANAGERS */}
                    {!isWelcomeBannerDismissed ? (
                      <div className="bg-gradient-to-br from-emerald-700 via-teal-800 to-blue-950 border border-emerald-400/40 p-6 md:p-8 rounded-3xl shadow-2xl shadow-emerald-950/20 text-white relative overflow-hidden transition-all duration-300">
                        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-teal-400/10 rounded-full blur-3xl mix-blend-overlay pointer-events-none"></div>
                        
                        <div className="relative z-10 space-y-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 border border-white/25 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                              <span>Accredited Community Partner</span>
                            </div>

                            <button
                              onClick={handleDismissWelcomeBanner}
                              title="Dismiss welcome notice"
                              className="px-3 py-1 bg-white/10 hover:bg-white/25 border border-white/20 rounded-xl text-xs font-bold text-emerald-100 hover:text-white transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Dismiss Notice</span>
                            </button>
                          </div>

                          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                            Welcome to the PineVela Community, {user?.name || 'Manager'}!
                          </h2>

                          <p className="text-sm font-medium text-emerald-50 max-w-2xl leading-relaxed">
                            Congratulations on successfully registering your residence with the PineVela community! Your property <strong>"{primaryProperty?.name || 'Your Residence'}"</strong> has been approved by the housing administration. All operational tabs are now fully unlocked — you can manage room capacity, activate resident access, assign staff, and coordinate student services.
                          </p>

                          <div className="pt-2 flex flex-wrap items-center gap-3">
                            <button
                              onClick={() => setActiveTab('overview')}
                              className="px-5 py-2.5 bg-white text-emerald-950 font-black text-xs rounded-xl shadow-lg hover:bg-emerald-50 hover:scale-[1.02] transition-all cursor-pointer inline-flex items-center gap-2"
                            >
                              <ShieldCheck className="w-4 h-4 text-emerald-700" />
                              <span>Go to Operations Overview</span>
                            </button>
                            <button
                              onClick={() => setActiveTab('blocks')}
                              className="px-5 py-2.5 bg-white/20 hover:bg-white/30 border border-white/30 text-white font-bold text-xs rounded-xl transition-all cursor-pointer inline-flex items-center gap-2"
                            >
                              <Layers className="w-4 h-4" />
                              <span>Explore Blocks & Room Rates</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-900/10 border border-emerald-500/20 p-3.5 px-5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-emerald-800">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Accredited Community Partner • Property Active ({primaryProperty?.name || 'Residence Approved'})</span>
                        </div>
                        <button
                          onClick={handleRestoreWelcomeBanner}
                          className="text-emerald-700 hover:text-emerald-950 hover:underline transition-all cursor-pointer text-xs font-extrabold"
                        >
                          View Accreditation Welcome Notice →
                        </button>
                      </div>
                    )}

                    <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Bell className="w-6 h-6 text-blue-600" />
                        <span>System Notifications & Operational Alerts</span>
                      </span>
                      {(systemNotifications || []).filter(n => !n.read).length > 0 && (
                        <span className="px-3 py-1 bg-red-600 text-white text-xs font-black rounded-full animate-pulse ring-2 ring-red-300">
                          {(systemNotifications || []).filter(n => !n.read).length} New Alerts
                        </span>
                      )}
                    </h2>

                    {/* REAL-TIME NOTIFICATIONS FEED */}
                    <div className="bg-white/90 border border-blue-200/70 p-6 rounded-3xl backdrop-blur-xl shadow-lg space-y-4">
                      <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">Live Activity & Dispatch Alerts</h3>
                          <p className="text-xs text-slate-500">Staff job requests, maintenance progress, and critical residence updates</p>
                        </div>
                        {(systemNotifications || []).some(n => !n.read) && (
                          <button
                            onClick={() => {
                              (systemNotifications || []).filter(n => !n.read).forEach(n => markAsRead(n.id));
                            }}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all cursor-pointer"
                          >
                            Mark All as Read
                          </button>
                        )}
                      </div>

                      {(!systemNotifications || systemNotifications.length === 0) ? (
                        <div className="text-center py-6 text-xs text-slate-400">
                          No alerts or notifications recorded yet.
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                          {systemNotifications.slice(0, 15).map((n: any) => (
                            <div 
                              key={n.id}
                              onClick={() => {
                                if (!n.read) markAsRead(n.id);
                                if (n.link === '/manager-dashboard?tab=staff' || (n.title || '').toLowerCase().includes('staff') || (n.title || '').toLowerCase().includes('job')) {
                                  setActiveTab('staff');
                                  setStaffSubTab('roster');
                                } else if (n.type === 'issue_report' || (n.title || '').toLowerCase().includes('maintenance') || (n.title || '').toLowerCase().includes('repair')) {
                                  setActiveTab('maintenance');
                                }
                              }}
                              className={`p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                                !n.read 
                                  ? 'bg-blue-50/80 border-blue-300 shadow-sm ring-1 ring-blue-400/20' 
                                  : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${!n.read ? 'bg-red-500 animate-ping ring-2 ring-red-300' : 'bg-slate-300'}`} />
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className={`text-xs font-black ${!n.read ? 'text-blue-950' : 'text-slate-800'}`}>{n.title}</h4>
                                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${

                                      n.type === 'issue_report' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                      'bg-slate-200 text-slate-700'
                                    }`}>
                                      {n.type === 'issue_report' ? 'Maintenance' : (n.type || 'Notice')}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-600 leading-snug">{n.message}</p>
                                  <span className="text-[10px] text-slate-400">{n.date || 'Today'}</span>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">

                                {(n.type === 'issue_report' || (n.title || '').toLowerCase().includes('maintenance')) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!n.read) markAsRead(n.id);
                                      setActiveTab('maintenance');
                                    }}
                                    className="px-2.5 py-1 bg-amber-600 text-white font-bold text-[10px] rounded-lg hover:bg-amber-700 transition-all"
                                  >
                                    View Fix
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Admin Board Direct Line</h2>

                    {/* MANAGER TO ADMIN BOARD REQUESTS */}
                    <div className="bg-white/90 border border-blue-200/70 p-6 md:p-8 rounded-3xl backdrop-blur-xl shadow-lg space-y-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-blue-100 pb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-blue-600" />
                            <span>Send Operational Request to Admin Board</span>
                          </h3>
                          <p className="text-xs text-slate-500">Submit official requests, capacity updates, inquiries, or urgent alerts directly to the PineVela administrative board.</p>
                        </div>
                        <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full self-start md:self-auto">
                          Direct Line to Admin
                        </span>
                      </div>

                      <form onSubmit={handleSendBoardRequest} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Request Category</label>
                        <select
                          value={newRequestCategory}
                          onChange={(e) => setNewRequestCategory(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                        >
                          <option value="Room Capacity Adjustment">Room Capacity Adjustment</option>
                          <option value="Property Details Revision">Property Details Revision</option>
                          <option value="Verification & Compliance">Verification & Compliance</option>
                          <option value="Urgent Maintenance / Inspection">Urgent Maintenance / Inspection</option>
                          <option value="General Inquiry">General Inquiry</option>
                        </select>
                      </div>

                      <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Priority Level</label>
                        <select
                          value={newRequestPriority}
                          onChange={(e) => setNewRequestPriority(e.target.value as any)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                        >
                          <option value="Normal">Normal Priority</option>
                          <option value="High">High Priority</option>
                          <option value="Urgent">Urgent Priority</option>
                        </select>
                      </div>

                      <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Request Subject</label>
                        <input
                          type="text"
                          value={newRequestSubject}
                          onChange={(e) => setNewRequestSubject(e.target.value)}
                          placeholder="e.g., Request to add 10 beds to North Wing"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Detailed Explanation / Justification</label>
                      <textarea
                        rows={3}
                        value={newRequestMessage}
                        onChange={(e) => setNewRequestMessage(e.target.value)}
                        placeholder="Provide relevant details or documentation regarding your operational request..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all resize-none"
                        required
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSubmittingRequest}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isSubmittingRequest ? 'Transmitting...' : 'Send Request to Admin Board'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Sent Requests Audit */}
                  <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                      <span>Your Sent Requests to Admin Board</span>
                      <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded-full">{boardRequests.length} Total</span>
                    </h4>

                    {boardRequests.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-xs text-slate-400">No requests sent to the Admin Board yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {boardRequests.map((req: any, i: number) => (
                          <div key={`${req.id || 'board'}-${i}`} className="bg-slate-50/80 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-start justify-between gap-3">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                                  req.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                  req.status === 'Acknowledged' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                  'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                  Status: {req.status || 'Pending'}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                                  {req.category}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  req.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                                  req.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                                  'bg-slate-200 text-slate-700'
                                }`}>
                                  {req.priority} Priority
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'Recent'}
                                </span>
                              </div>
                              <h5 className="text-sm font-bold text-slate-900">{req.subject}</h5>
                              <p className="text-xs text-slate-600 leading-relaxed">{req.message}</p>

                              {req.adminNotes && (
                                <div className="mt-2 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                                  <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Admin Board Response:</p>
                                  <p className="text-xs text-emerald-900 mt-0.5">{req.adminNotes}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                </>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* SECURE ENCRYPTED CHAT TAB VIEW                                            */}
            {/* ========================================================================= */}

          </>
        )}
      </main>

      {/* ======================================================== */}
      {/* MODAL: MANAGER BARGAIN RESPONSE MODAL                     */}
      {/* ======================================================== */}
      {selectedBargainToReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Staff Retention & Bargain Review
                  </h3>
                  <p className="text-xs text-slate-500">
                    Responding to {selectedBargainToReview.staffName} ({selectedBargainToReview.role})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBargainToReview(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Overview of Staff's Request */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider">Reason For Wanting to Quit:</span>
                <p className="text-slate-800 font-semibold italic mt-0.5">"{selectedBargainToReview.reasonToQuit}"</p>
              </div>
              {selectedBargainToReview.isBargain && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="font-bold text-purple-700 uppercase text-[10px] tracking-wider">Proposed Deal Terms to Stay:</span>
                  <p className="text-purple-950 font-bold mt-0.5 bg-purple-50 p-2.5 rounded-xl border border-purple-100">
                    "{selectedBargainToReview.bargainProposal?.proposedTerms || 'No specific terms'}"
                  </p>
                  {selectedBargainToReview.bargainProposal?.notes && (
                    <p className="text-slate-500 text-[11px] italic mt-1">
                      Staff Note: "{selectedBargainToReview.bargainProposal.notes}"
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Decision Selector */}
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Choose Your Response Decision:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setManagerResponseAction('accept')}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex items-start gap-2.5 ${
                    managerResponseAction === 'accept'
                      ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-200'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <ThumbsUp className={`w-4 h-4 mt-0.5 ${managerResponseAction === 'accept' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div>
                    <div className="text-xs font-black">Accept Deal</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Retain staff on agreed terms</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setManagerResponseAction('reject')}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex items-start gap-2.5 ${
                    managerResponseAction === 'reject'
                      ? 'border-rose-500 bg-rose-50/70 text-rose-950 ring-2 ring-rose-200'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <ThumbsDown className={`w-4 h-4 mt-0.5 ${managerResponseAction === 'reject' ? 'text-rose-600' : 'text-slate-400'}`} />
                  <div>
                    <div className="text-xs font-black">Decline Deal</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Staff will then choose to quit or stay</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Fields based on action */}
            {managerResponseAction === 'accept' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Updated Shift Schedule
                    </label>
                    <select
                      value={managerUpdatedShift}
                      onChange={e => setManagerUpdatedShift(e.target.value)}
                      className="w-full text-xs font-medium p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-500"
                    >
                      <option value="">(Keep current schedule)</option>
                      <option value="Day Shift (8 AM - 5 PM)">Day Shift (8 AM - 5 PM)</option>
                      <option value="Night Shift (8 PM - 6 AM)">Night Shift (8 PM - 6 AM)</option>
                      <option value="Flexible / Split Shift">Flexible / Split Shift</option>
                      <option value="Weekend Shift Only">Weekend Shift Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Updated Assigned Block/Wing
                    </label>
                    <select
                      value={managerUpdatedBlock}
                      onChange={e => setManagerUpdatedBlock(e.target.value)}
                      className="w-full text-xs font-medium p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-500"
                    >
                      <option value="">(Keep current block)</option>
                      <option value="All Blocks">All Blocks</option>
                      {staffWingNames.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Acceptance Response Note to Staff
                  </label>
                  <textarea
                    rows={2}
                    value={managerResponseNote}
                    onChange={e => setManagerResponseNote(e.target.value)}
                    placeholder="e.g. We have agreed to adjust your shift hours and wage as requested. Glad to have you continue on our team!"
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-500 font-medium"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-medium">
                  When you decline this deal, {selectedBargainToReview.staffName} will receive your explanation and will be prompted on their dashboard to make their final choice: <strong>either proceed to quit or decide to stay in their job</strong>.
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Explanatory Reason to Staff (Required) *
                  </label>
                  <textarea
                    rows={3}
                    value={managerResponseNote}
                    onChange={e => setManagerResponseNote(e.target.value)}
                    placeholder="e.g. Due to current payroll constraints we are unable to meet the requested wage increase at this time, but would value retaining you on current terms."
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-500 font-medium"
                  />
                </div>
              </div>
            )}

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedBargainToReview(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingManagerResponse}
                onClick={handleManagerBargainResponse}
                className={`px-5 py-2.5 text-white font-black text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md ${
                  managerResponseAction === 'accept'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submittingManagerResponse ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : managerResponseAction === 'accept' ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                <span>
                  {submittingManagerResponse ? 'Submitting...' : managerResponseAction === 'accept' ? 'Confirm & Accept Deal' : 'Confirm & Decline Deal'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGER PROFILE EDIT MODAL */}
      {showEditProfileModal && <ManagerProfileModal
        isOpen={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        currentUser={user}
        onSave={handleSaveProfile}
      />}

      {/* ======================================================== */}
      {/* MODAL: DIGITAL ROOM KEY DISPATCH MODAL                    */}
      {/* ======================================================== */}
      {dispatchModalOpen && selectedKeyForDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white/95 rounded-[2rem] max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-blue-100 backdrop-blur-2xl space-y-5 animate-scaleUp">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Dispatch Digital Room Key</h3>
                  <p className="text-xs text-slate-500">Transmitting official resident room access credentials</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDispatchModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Room & Key Badge Container */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-100 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">
                  {selectedKeyForDispatch.hostelName || primaryProperty?.name || 'Residence'} • {selectedKeyForDispatch.blockName}
                </span>
                <span className="font-black text-blue-800 bg-white px-2.5 py-0.5 rounded-md border border-blue-200/60">
                  Room {selectedKeyForDispatch.roomNumber}
                </span>
              </div>
              
              <div className="p-3 bg-slate-900 text-cyan-300 rounded-xl font-mono text-sm font-black tracking-widest flex items-center justify-between shadow-inner">
                <span className="select-all">{selectedKeyForDispatch.roomKey}</span>
                <button
                  type="button"
                  onClick={() => handleCopyKey(selectedKeyForDispatch.roomKey, 'modal-key')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-sans font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            {/* Alerts */}
            {dispatchErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{dispatchErrorMsg}</span>
              </div>
            )}

            {dispatchSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-fadeIn">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{dispatchSuccessMsg}</span>
              </div>
            )}

            {/* Dispatch Form */}
            <form onSubmit={handleSendDigitalKey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recipient Name
                </label>
                <input
                  type="text"
                  value={dispatchRecipientName}
                  onChange={(e) => setDispatchRecipientName(e.target.value)}
                  placeholder="e.g. Kwame Mensah / Student Name"
                  className="w-full text-xs font-semibold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-blue-600" />
                    <span>Recipient Email</span>
                  </label>
                  <input
                    type="email"
                    value={dispatchRecipientEmail}
                    onChange={(e) => setDispatchRecipientEmail(e.target.value)}
                    placeholder="student@university.edu.gh"
                    className="w-full text-xs font-semibold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Phone / WhatsApp</span>
                  </label>
                  <input
                    type="tel"
                    value={dispatchRecipientPhone}
                    onChange={(e) => setDispatchRecipientPhone(e.target.value)}
                    placeholder="+233 24 000 0000"
                    className="w-full text-xs font-semibold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Welcome & Access Note
                </label>
                <textarea
                  rows={2}
                  value={dispatchCustomNote}
                  onChange={(e) => setDispatchCustomNote(e.target.value)}
                  placeholder="e.g. Welcome to PineVela! Use this key to sign into your student room console."
                  className="w-full text-xs font-medium p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-500 transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDispatchModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchSending || Boolean(dispatchSuccessMsg)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {dispatchSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending Digital Key...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Transmit Key Digitally</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD STAFF MODAL */}
      {showAddStaffModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 z-[999] overflow-y-auto">
          <div className="onboarding-fields my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6 relative z-[1000] text-slate-900">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Staff Member</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tied to {primaryProperty?.name || 'this property'}</p>
              </div>
              <button onClick={() => setShowAddStaffModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <OnboardingProgress steps={STAFF_ACCOUNT_STEPS} step={newStaffName.trim() && newStaffPhone.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newStaffEmail) ? (newStaffPassword.trim() ? 3 : 2) : 1} label="Staff creation" />

            <div className="p-3 bg-emerald-50/80 border border-emerald-200/90 rounded-2xl text-xs text-emerald-900 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Instant System Verification</p>
                <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                  Manager-enrolled staff are automatically verified by the system and tied to {primaryProperty?.name || 'your property'}. No waiting for administrator verification required.
                </p>
              </div>
            </div>

            <form onSubmit={handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name <span className="text-rose-500">*</span></label>
                <input 
                  type="text" 
                  value={newStaffName} 
                  onChange={(e) => setNewStaffName(e.target.value)} 
                  placeholder="e.g. Kwame Mensah" 
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Role & Department</label>
                  <select 
                    value={newStaffRole} 
                    onChange={(e) => setNewStaffRole(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                  >
                    <option value="Front Desk Operations Lead">Front Desk Operations Lead</option>
                    <option value="Head of Security & Biometrics">Head of Security & Biometrics</option>
                    <option value="Security Officer">Security Officer</option>
                    <option value="Facilities & Maintenance Technician">Facilities & Maintenance Technician</option>
                    <option value="Plumber & Water Systems Lead">Plumber & Water Systems Lead</option>
                    <option value="Electrical & Power Lead">Electrical & Power Lead</option>
                    <option value="Housekeeping Supervisor">Housekeeping Supervisor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number <span className="text-rose-500">*</span></label>
                  <input 
                    type="text" 
                    value={newStaffPhone} 
                    onChange={(e) => setNewStaffPhone(e.target.value)} 
                    placeholder="+233 24 000 0000" 
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email / Username</label>
                  <input 
                    type="email" 
                    value={newStaffEmail} 
                    onChange={(e) => setNewStaffEmail(e.target.value)} 
                    placeholder="staff@pinevela.com" 
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Account Password <span className="text-rose-500">*</span></label>
                    <button
                      type="button"
                      onClick={() => {
                        const autoPass = `Staff@${Math.floor(1000 + Math.random() * 9000)}`;
                        setNewStaffPassword(autoPass);
                        setShowStaffPassword(true);
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Generate
                    </button>
                  </div>
                  <div className="relative">
                    <input 
                      type={showStaffPassword ? "text" : "password"} 
                      value={newStaffPassword} 
                      onChange={(e) => setNewStaffPassword(e.target.value)} 
                      placeholder="Password for login" 
                      className="w-full pl-3.5 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowStaffPassword(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrengthGauge password={newStaffPassword} />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                The staff member will use their email (or phone/username) and this password to log into their staff account.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Work Shift</label>
                  <select 
                    value={newStaffShift} 
                    onChange={(e) => setNewStaffShift(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                  >
                    <option value="Day Shift (8 AM - 5 PM)">Day Shift (8 AM - 5 PM)</option>
                    <option value="Night Shift (6 PM - 6 AM)">Night Shift (6 PM - 6 AM)</option>
                    <option value="Morning Shift (6 AM - 2 PM)">Morning Shift (6 AM - 2 PM)</option>
                    <option value="On-Call 24/7">On-Call 24/7</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="staff-assigned-wing" className="block text-xs font-bold text-slate-700 mb-1">Assigned Wing</label>
                  <select 
                    id="staff-assigned-wing"
                    value={newStaffBlock} 
                    onChange={(e) => setNewStaffBlock(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                  >
                    <option value="All Blocks">All Blocks</option>
                    {staffWingNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingStaff}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                >
                  {isSubmittingStaff ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving Staff...</span>
                    </>
                  ) : (
                    <span>Save & Enroll Staff</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOGOUT CONFIRMATION MODAL */}
      <LogoutConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        userRole="Hostel Manager"
        userName={user?.name || 'Manager'}
      />

      {/* WELCOME ONBOARDING POPUP */}
      <AnimatePresence>
        {showWelcomePopup && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-blue-950/40 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative max-w-md w-full bg-blue-50/90 backdrop-blur-2xl rounded-3xl p-8 border border-white/80 shadow-2xl shadow-blue-950/30 text-center space-y-6"
            >
              <button
                onClick={() => setShowWelcomePopup(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-white/50 transition-colors cursor-pointer"
                title="Dismiss dialog"
              >
                <XCircle size={20} />
              </button>

              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 animate-pulse">
                <Building2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-black text-blue-950 tracking-tight">
                  Welcome to PineVela!
                </h3>
                <p className="text-xs font-bold text-blue-800 uppercase tracking-widest flex items-center justify-center gap-1">
                  <span>Onboarding Initiated</span>
                </p>
              </div>

              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                Hello, <strong>{user?.name || 'Manager'}</strong>! Your manager profile is successfully verified. 
                To unlock your operational dashboard and start accepting students, tap the button below to register your official residence property.
              </p>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setShowWelcomePopup(false);
                    setShowRegistration(true);
                  }}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black rounded-2xl text-sm shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Building2 className="w-5 h-5" />
                  <span>Register a Hostel to Start</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {roomAccessAction && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4" role="dialog" aria-modal="true" aria-labelledby="room-access-title">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 space-y-4 shadow-2xl">
            <h3 id="room-access-title" className="text-lg font-black text-slate-900">
              {roomAccessAction.type === 'release' ? `Remove occupant from Room ${roomAccessAction.room.roomNumber}?` : 'Reshuffle all room keys?'}
            </h3>
            <p className="text-sm text-slate-600">
              {roomAccessAction.type === 'release'
                ? 'This removes the resident’s room account and active session, unlinks the room from their user account, and makes it available with a new key.'
                : 'This ends occupancy for every room in this residence, removes all resident room accounts and sessions, and generates new random keys. Use it at the start of a new academic year. Residents must activate their rooms again with the new keys.'}
            </p>
            {roomAccessAction.type === 'reshuffle' && (
              <label className="block text-xs font-bold text-slate-700">
                Academic year
                <input value={keysAcademicYear} onChange={(event) => setKeysAcademicYear(event.target.value)} placeholder="2026/2027" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
            )}
            {roomAccessError && <p role="alert" className="text-xs font-semibold text-rose-700">{roomAccessError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={roomAccessBusy} onClick={() => setRoomAccessAction(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 cursor-pointer">Cancel</button>
              <button
                type="button"
                disabled={roomAccessBusy}
                onClick={async () => {
                  setRoomAccessBusy(true);
                  setRoomAccessError(null);
                  try {
                    const endpoint = roomAccessAction.type === 'release'
                      ? `/api/room-keys/${encodeURIComponent(roomAccessAction.room.id)}/release`
                      : `/api/hostels/${encodeURIComponent(primaryProperty.id)}/reshuffle-room-keys`;
                    const result = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ confirm: true, academicYear: keysAcademicYear }) });
                    if (!result?.success) throw new Error('Could not update room access. Please sign in again.');
                    await fetchRoomKeys();
                    triggerToast(result.message);
                    setRoomAccessAction(null);
                  } catch (error: any) {
                    setRoomAccessError(error.message || 'Could not update room access.');
                  } finally {
                    setRoomAccessBusy(false);
                  }
                }}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
              >{roomAccessBusy ? 'Updating...' : roomAccessAction.type === 'release' ? 'Remove Occupant' : 'Reshuffle & End Occupancy'}</button>
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
            className="fixed inset-0 bg-black/90 z-55 flex items-center justify-center p-4 cursor-zoom-out"
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
              <XCircle className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
