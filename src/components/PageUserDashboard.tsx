import OrderTimeline from './OrderTimeline';
import OrderNotifications from './OrderNotifications';
import OrderCancelButton from './OrderCancelButton';
import {readOrderHistoryPage,mergeOrderHistory} from '../lib/orderHistory';
import SupportNotificationLink from './SupportNotificationLink';
import HelpLink from './HelpLink';
import AppearanceSettings from './AppearanceSettings';
import PineVelaCompanion from './PineVelaCompanion';
import { isMarketService,marketListingAvailable } from '../../marketListingAvailability';
import { activateOnKeyboard } from '../lib/keyboardActivation';

import { useQuery } from '@tanstack/react-query';
import {
AlertCircle,
ArrowLeft,
ArrowRight,
Bell,
Building2,
Camera,
Check,
CheckCircle,
CheckCircle2,
ChevronRight,
Clock,
Compass,
Copy,
Eye,
EyeOff,
Heart,
Home,
Key,
KeyRound,
Lock,
LogIn,
LogOut,
Mail,
MapPin,
MessageSquare,
Package,
Phone,
Plus,
RefreshCw,
Send,
Settings,
ShieldAlert,
ShieldCheck,
ShoppingBag,
Star,
Store,
Tag,
Trash2,
Upload,
User,
Wrench,
X
} from 'lucide-react';
import { AnimatePresence,motion } from 'motion/react';
import React,{ useCallback,useEffect,useId,useMemo,useRef,useState } from 'react';
import { useNavigate,useSearchParams } from 'react-router-dom';
import { compareMarketPriority } from '../../marketPlans';
import { servicePoint } from '../../serviceLocation';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { safeJson } from '../lib/api';
import { routePopupFeedback } from '../lib/feedback';
import { optimizeImageDisplayUrl } from '../lib/imageOptimizer';
import { matchesMarketCategory } from '../lib/marketCatalog';
import { marketNoticeKind } from '../lib/marketNotifications';
import { saveNavigationLayout,usesTopNavigation } from '../lib/navigationLayout';
import { queryClient } from '../lib/queryClient';
import { managerRegistrationStatus,merchantRegistrationStatus,type ManagerRegistration } from '../lib/registrationStatus';
import { filterResidences } from '../lib/residenceCatalog';
import { sessionFetch as fetch } from '../lib/session';
import { DigitalMarketApplication,DigitalMarketOrder,DigitalMarketProduct,DigitalMarketStore,HostelRoomKey,IssueReport } from '../types';
import AccountStatusDialog from './AccountStatusDialog';
import CampusMeetupMapPicker from './LazyCampusMeetupMapPicker';
import DashboardOverlay from './DashboardOverlay';
import ListingPlanBadge from './ListingPlanBadge';
import ManagerRegistrationCard from './ManagerRegistrationCard';
import MarketImageGallery from './MarketImageGallery';
import MarketItemCard,{ getServiceActionLabel } from './MarketItemCard';
import MarketplaceFilters from './MarketplaceFilters';
import MarketplaceInbox from './MarketplaceInbox';
import ReportButton from './ReportButton';
import MarketStorefront from './MarketStorefront';
import MerchantAccountPanel from './MerchantAccountPanel';
import UserDashboardNavigation, { userDashboardDestinations } from './UserDashboardNavigation';
import NearbyServicesMap from './LazyNearbyServicesMap';
import { readDashboardSnapshot, saveDashboardSnapshot } from '../lib/dashboardSnapshot';
import { currentSessionGeneration } from '../lib/session';
import { useDashboardScroll } from '../hooks/useDashboardScroll';
import UserCatalogSwitcher from './UserCatalogSwitcher';
import OnboardingProgress,{ MARKET_APPLICATION_STEPS,ROOM_ACTIVATION_STEPS } from './OnboardingProgress';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import PineLogo, { PineWordmark } from './PineLogo';
import WelcomePopup from './WelcomePopup';
import RegistrationStatusButton from './RegistrationStatusButton';
import ResidenceCard from './ResidenceCard';
import ResidenceDetails from './ResidenceDetails';
import RouteSkeleton from './RouteSkeleton';
import SupabaseResidentActivation from './SupabaseResidentActivation';
import SupabaseSellerRegistration from './SupabaseSellerRegistration';
import UserAvatarSelector,{ renderAvatarGraphic } from './UserAvatarSelector';
import '../userDashboard.css';

export interface PageUserDashboardProps {
  initialTab?: 'home' | 'notifications' | 'options' | 'overview' | 'issues' | 'announcements' | 'settings' | 'register-resident' | 'login-room' | 'digital-market';
  initialMarketMode?: 'catalog' | 'vendor' | 'orders';
}

type PrimaryDashboardSnapshot = {
  profile: { user: any; rooms: any[]; roomKeyDetails?: HostelRoomKey | null };
  residences: any[];
  catalog: DigitalMarketProduct[];
  orders: DigitalMarketOrder[];
};

export default function PageUserDashboard({ initialTab, initialMarketMode }: PageUserDashboardProps = {}) {
  const navigationId = useId();
  const { user, logout, apiFetch, updateUser, setSessionUser } = useAuth();
  const cachedDashboard = readDashboardSnapshot<PrimaryDashboardSnapshot>('primary', user?.id);
  const marketAccount=useRef(user?.id),marketEpoch=useRef(0),marketGeneration=useRef(0),marketMounted=useRef(true);
  if(marketAccount.current!==user?.id){marketAccount.current=user?.id;marketEpoch.current++;marketGeneration.current++;}
  useEffect(()=>{marketMounted.current=true;return()=>{marketMounted.current=false;};},[]);
  const marketAccountCurrent=(id:string|undefined,generation?:number)=>marketMounted.current && marketAccount.current===id && (generation===undefined || generation===marketGeneration.current);
  const orderRequest=useRef<{params:string;id:string}|null>(null);
  const [marketOrdersAccount,setMarketOrdersAccount]=useState<string|undefined>(cachedDashboard ? user?.id : undefined);
  const [marketReadError,setMarketReadError]=useState('');
  const { notifications, unreadCount, registeredAccounts, markAsRead, pushToast, refreshNotifications } = useNotifications();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedTab = searchParams.get('tab');
  const queryTab = ['home', 'notifications', 'options', 'overview', 'issues', 'announcements', 'settings', 'register-resident', 'login-room', 'digital-market'].includes(requestedTab || '') ? requestedTab as any : undefined;
  const [companionNavigationTarget, setCompanionNavigationTarget] = useState<HTMLDivElement | null>(null);
  const requestedMode = searchParams.get('mode');
  const queryMode = ['catalog', 'vendor', 'orders', 'chats'].includes(requestedMode || '') ? requestedMode as any : undefined;
  const isMerchantUser = user?.role === 'merchant';

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'home' | 'notifications' | 'options' | 'overview' | 'issues' | 'announcements' | 'settings' | 'register-resident' | 'login-room' | 'digital-market'>(
    (queryTab || initialTab) === 'register-resident' ? 'home' : queryTab || initialTab || (isMerchantUser ? 'digital-market' : 'home')
  );

  // Registration status comes from the current authenticated account, including deletions.
  const merchantRegistration = useQuery<{ application: DigitalMarketApplication | null; store: DigitalMarketStore | null }>({
    queryKey: ['digital-market', 'registration', user?.id],
    queryFn: async ({signal}) => { const data = await apiFetch('/api/digital-market/status',{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])}); if (!data || !('application' in data) || !('store' in data)) throw new Error('Could not check merchant registration.'); return data; },
    enabled: Boolean(user), staleTime: 15000, refetchInterval: 30000, refetchOnWindowFocus: true,
  });
  const managerRegistration = useQuery<{ managerAccount: ManagerRegistration | null }>({
    queryKey: ['userData', 'registration', user?.id],
    queryFn: async ({signal}) => { const data = await apiFetch('/api/users/my-registered-accounts',{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])}); if (!data || !('managerAccount' in data)) throw new Error('Could not check manager registration.'); return data; },
    enabled: Boolean(user), staleTime: 15000, refetchInterval: 30000, refetchOnWindowFocus: true,
  });
  const digitalMarketApp = merchantRegistration.data?.application || null;
  const digitalMarketStore = merchantRegistration.data?.store || null;
  const managerAccount = managerRegistration.data?.managerAccount || null;
  const merchantStatus = merchantRegistrationStatus(digitalMarketApp, digitalMarketStore);
  const managerStatus = managerRegistrationStatus(managerAccount);
  const [showMerchantCard, setShowMerchantCard] = useState(false);
  const [showManagerCard, setShowManagerCard] = useState(false);
  const [showMarketChat, setShowMarketChat] = useState(false);
  const [checkingMerchant, setCheckingMerchant] = useState(false);
  const [checkingManager, setCheckingManager] = useState(false);
  const [orderCursor,setOrderCursor]=useState<string|null|undefined>(undefined),[olderOrdersLoading,setOlderOrdersLoading]=useState(false);
  const [savedMarketOrders, setDigitalMarketOrders] = useState<DigitalMarketOrder[]>(cachedDashboard?.orders || []);
  const digitalMarketOrders=marketOrdersAccount===user?.id ? savedMarketOrders : [];
  const [digitalMarketProducts, setDigitalMarketProducts] = useState<DigitalMarketProduct[]>([]);
  const [publicCatalog, setPublicCatalog] = useState<DigitalMarketProduct[]>(cachedDashboard?.catalog || []);

  // Store Rating States for Buyers
  const [ratingOrderTarget, setRatingOrderTarget] = useState<DigitalMarketOrder | null>(null);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingReview, setRatingReview] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);

  // Keep the user-facing market scrollable while removing the browser's side gutter.
  useEffect(() => {
    const root = document.documentElement;
    if (activeTab === 'digital-market') {
      root.classList.add('marketplace-scrollbar-hidden');
    } else {
      root.classList.remove('marketplace-scrollbar-hidden');
    }
    return () => root.classList.remove('marketplace-scrollbar-hidden');
  }, [activeTab]);

  // Forward only direct merchant-only accounts to their digital onboarding or registered store
  useEffect(() => {
    const isDedicatedMerchantAccount = user?.role === 'merchant' && (user as any)?.isDigitalMarketOnly === true;

    if (isDedicatedMerchantAccount && !queryTab && searchParams.get('browse') !== 'true') {
      if (user?.merchantSetupCompleted === false || !user?.merchantRegistrationFeePaid) {
        navigate('/digital-market/onboard', { replace: true });
      } else {
        navigate('/digital-market', { replace: true });
      }
    }
  }, [user, queryTab, searchParams, navigate]);
  
  // Order placement & PIN verification state
  const [selectedProdForOrder, setSelectedProdForOrder] = useState<DigitalMarketProduct | null>(null);
  const [orderMeetupLocation, setOrderMeetupLocation] = useState<string>((''));
  const [orderMeetupLat, setOrderMeetupLat] = useState<number | null>((null));
  const [orderMeetupLng, setOrderMeetupLng] = useState<number | null>((null));
  const [serviceLocationOption, setServiceLocationOption] = useState<'seller-location' | 'buyer-location'>('buyer-location');
  const [showMeetupMapModal, setShowMeetupMapModal] = useState<boolean>(false);
  const [viewingOrderMap, setViewingOrderMap] = useState<DigitalMarketOrder | null>(null);
  const [confirmingLocationId, setConfirmingLocationId] = useState<string | null>(null);
  const [orderQtyInput, setOrderQtyInput] = useState<number>(1);
  const [buyerPhoneInput, setBuyerPhoneInput] = useState<string>('');
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [verifyingOrderTarget, setVerifyingOrderTarget] = useState<DigitalMarketOrder | null>(null);
  useEffect(()=>{orderRequest.current=null;setDigitalMarketOrders([]);setMarketOrdersAccount(undefined);setMarketReadError('');setSelectedProdForOrder(null);setVerifyingOrderTarget(null);setSubmittingOrder(false);setPinSubmitting(false);setShowMarketChat(false);setActiveChatEmail(null);setActiveChatStore(undefined);setRatingOrderTarget(null);setIsSubmittingRating(false);},[user?.id]);
  // Old registration/chat links open their relocated dialog instead of restoring retired tabs.
  useEffect(() => {
    const tab = queryTab || initialTab;
    const mode = queryMode || (!queryTab ? initialMarketMode : undefined);
    if (tab === 'register-resident') {
      setActiveTab('home');
      setHomeFilterType('hostels');
      setShowManagerCard(true);
    } else if (tab === 'digital-market' && mode && mode !== 'orders') {
      setActiveTab('home');
      setHomeFilterType('market');
      if (mode === 'vendor') setShowMerchantCard(true);
      if (mode === 'chats') setShowMarketChat(true);
    } else if (tab) {
      setActiveTab(tab);
    }
  }, [user?.id, initialTab, queryTab, initialMarketMode, queryMode]);

  const [inputPinValue, setInputPinValue] = useState<string>('');
  const [renewingPinOrderId, setRenewingPinOrderId] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState<boolean>(false);
  const [activeChatEmail, setActiveChatEmail] = useState<string | null>(null);
  const [activeChatStore,setActiveChatStore]=useState<{id:string;name:string}|undefined>();
  
  // Categories for Student Digital Market
  const DIGITAL_MARKET_CATEGORIES = [
    "Electronics, Gadgets & Accessories",
    "Laptops, Phones & Computing Gear",
    "Textbooks, Handouts & Study Materials",
    "Hostel Furniture & Room Appliances",
    "Student Fashion, Footwear & Thrift Boutique",
    "Beauty, Skincare, Haircare & Grooming",
    "Groceries, Packed Foods, Snacks & Drinks",
    "Beddings, Mattresses, Curtains & Room Decor",
    "Stationery, Printing, Binding & Graphic Design",
    "Campus Services, Peer Tutoring & Tech Repair",
    "Sports, Fitness, Gym Wear & Supplements",
    "Provisions, Cookware & Kitchen Utensils",
    "Handmade Crafts, Art & Campus Merchandise",
    "Musical Instruments & Audio Equipment",
    "General Campus Essentials"
  ];

  // Registration form wizard state (PineVela Frosty Glass 3-Phase Wizard)
  const [showDMRegModal, setShowDMRegModal] = useState<boolean>(false);
  const [dmWizardPhase, setDmWizardPhase] = useState<1 | 2 | 3>(1);
  const [dmFullName, setDmFullName] = useState<string>('');
  const [dmUniversity, setDmUniversity] = useState<string>('Kwame Nkrumah University of Science and Technology (KNUST)');
  const [dmCategory, setDmCategory] = useState<string>(DIGITAL_MARKET_CATEGORIES[0]);
  const [dmStudentEmail, setDmStudentEmail] = useState<string>('');
  const [dmPassword, setDmPassword] = useState<string>('');
  const [dmConfirmPassword, setDmConfirmPassword] = useState<string>('');
  const [showDmPassword, setShowDmPassword] = useState<boolean>(false);
  const [dmIdNumber, setDmIdNumber] = useState<string>('');
  const [dmProposedStoreName, setDmProposedStoreName] = useState<string>('');
  const [dmCertifyAccepted, setDmCertifyAccepted] = useState<boolean>(false);

  const [dmRegError, setDmRegError] = useState<string | null>(null);

  // Helper to check if email domain is a commercial provider

  // Helper to check if email is valid accredited student email

  // Wizard Phase Validation & Navigation Handlers

  // Store setup navigation state
  const [showStoreSetupModal, setShowStoreSetupModal] = useState<boolean>(false);

  const [storeOnboardingModalOpen, setStoreOnboardingModalOpen] = useState<boolean>(false);

  const initialStoreSetupFilledRef = useRef<boolean>(false);

  // Add Product state
  const [showAddProductModal, setShowAddProductModal] = useState<boolean>(false);
  const [prodTitle, setProdTitle] = useState<string>('');
  const [prodDesc, setProdDesc] = useState<string>('');
  const [prodPrice, setProdPrice] = useState<string>('');
  const [prodCategory, setProdCategory] = useState<string>('Electronics');
  const [prodStock, setProdStock] = useState<string>('5');
  const [prodImage, setProdImage] = useState<string>('https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=60');
  const [submittingProd, setSubmittingProd] = useState<boolean>(false);

  // Catalog filtering, price range slider & Buying modal
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [catalogCategory, setCatalogCategory] = useState<string>('All');

  const [minPriceFilter, setMinPriceFilter] = useState<number>(0);
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(5000);
  const [priceSortOption, setPriceSortOption] = useState<'featured' | 'price-asc' | 'price-desc' | 'newest'>('featured');
  const [showPriceFilterPanel, setShowPriceFilterPanel] = useState<boolean>(false);
  const [marketActionError, setMarketActionError] = useState('');
  const [viewingStoreId, setViewingStoreId] = useState<string | null>(null);
  const [storeMessageOnOpen, setStoreMessageOnOpen] = useState(false);
  const [selectedProductForBuy, setSelectedProductForBuy] = useState<DigitalMarketProduct | null>(null);
  const [showNearbyServices, setShowNearbyServices] = useState(false);
  const [nearbyDirections, setNearbyDirections] = useState('');
  const previousInspection = useRef(false);
  useEffect(() => {
    if (previousInspection.current && !selectedProductForBuy) { setShowNearbyServices(false); setNearbyDirections(''); }
    previousInspection.current = !!selectedProductForBuy;
  }, [selectedProductForBuy]);
  const [selectedPriceCategory, setSelectedPriceCategory] = useState<{ id?: string; name: string; price: number; imageUrl?: string } | null>(null);

  // Data states
  const [issueReports, setIssueReports] = useState<IssueReport[]>([]);
  const [roomKeyDetails, setRoomKeyDetails] = useState<HostelRoomKey | null>(cachedDashboard?.profile.roomKeyDetails || null);
  const [userRooms, setUserRooms] = useState<any[]>(cachedDashboard?.profile.rooms || []);
  const [studentProfile, setStudentProfile] = useState<any>(cachedDashboard?.profile.user || null);
  const [loadingData, setLoadingData] = useState<boolean>(!cachedDashboard);
  const [dashboardLoadError,setDashboardLoadError]=useState('');
  const [dashboardRefreshing,setDashboardRefreshing]=useState(false);
  const dashboardRead=useRef<{accountId:string|undefined;controller:AbortController}|null>(null);
  const [availableHostels, setAvailableHostels] = useState<any[]>(cachedDashboard?.residences || []);
  const [viewingHostelModal, setViewingHostelModal] = useState<any | null>(null);

  // Add Room Modal states (Up to 5 rooms)

  // Delete Room Modal state

  const currentUser = {
    ...(studentProfile || {}),
    ...(user || {}),
    avatar: user?.avatar || user?.photo || user?.photoUrl || user?.avatarUrl || user?.profilePicture || 'preset:pine-classic',
    photo: user?.photo || user?.avatar || '',
    photoUrl: user?.photoUrl || user?.avatar || '',
    avatarUrl: user?.avatarUrl || user?.avatar || '',
    profilePicture: user?.profilePicture || user?.avatar || '',
    role: user?.role || studentProfile?.role || 'user',
    id: user?.id || (studentProfile?.id)
  };

  const handleStartChat = (product: DigitalMarketProduct) => {
    if (!user?.id) {
      triggerToast("Please log in first to message the merchant.");
      return;
    }

    if (!product.storeId) { triggerToast('This listing does not have an available store to message.'); return; }
    setShowMarketChat(true);
    setActiveChatEmail(product.sellerEmail || null);
    setActiveChatStore({ id: product.storeId, name: product.storeName });
    setSelectedProductForBuy(null);
    triggerToast('Write an encrypted message in the inbox.');
  };
  const [showSignoutConfirmModal, setShowSignoutConfirmModal] = useState<boolean>(false);

  // New Issue Modal states
  const [showNewIssueModal, setShowNewIssueModal] = useState<boolean>(false);
  const [issueTitle, setIssueTitle] = useState<string>('');
  const [issueCategory, setIssueCategory] = useState<string>('Plumbing');
  const [issueUrgency, setIssueUrgency] = useState<'Low' | 'Medium' | 'High' | 'Emergency'>('Medium');
  const [issueSubArea, setIssueSubArea] = useState<string>('Bathroom / Shower / WC');
  const [issueDescription, setIssueDescription] = useState<string>('');
  const [issuePhotos, setIssuePhotos] = useState<string[]>([]);
  const [issueVisitWindow, setIssueVisitWindow] = useState<string>('Morning (8:00 AM - 12:00 PM)');
  const [issueContactPhone, setIssueContactPhone] = useState<string>('');
  const [issueContactMethod, setIssueContactMethod] = useState<'In-app Notification' | 'Phone Call' | 'Email'>('In-app Notification');
  const [submittingIssue, setSubmittingIssue] = useState<boolean>(false);

  // Student Confirmation Modal for completed tasks
  const [selectedIssueForConfirm, setSelectedIssueForConfirm] = useState<IssueReport | null>(null);
  const [confirmFeedback, setConfirmFeedback] = useState<string>('');
  const [submittingConfirm, setSubmittingConfirm] = useState<boolean>(false);

  // Room Key Claim Modal & Resident Account Creation states
  const [showClaimModal, setShowClaimModal] = useState<boolean>(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState<boolean>(false);
  const [claimRoomKeyInput, setClaimRoomKeyInput] = useState<string>('');

  const [verifiedKeyInfo, setVerifiedKeyInfo] = useState<any | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const [claimStep, setClaimStep] = useState<1 | 2 | 3 | 4>(1);

  // Resident Account Creation fields on key claim

  // Reset Password Modal states
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<boolean>(false);
  const [resetTargetRole, setResetTargetRole] = useState<'resident'>('resident');
  const [resetTargetEmail, setResetTargetEmail] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState<string>('');
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState<boolean>(false);

  // Delete Account Modal states
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState<boolean>(false);

  const [deleteTargetEmail, setDeleteTargetEmail] = useState<string>('');
  const [deletePasswordInput, setDeletePasswordInput] = useState<string>('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);

  useEffect(() => {
    if (user && user.id && !searchParams.has('residence') && !searchParams.has('marketItem') && !searchParams.has('marketStore')) {
      const shown = localStorage.getItem(`pinevela_welcome_shown_${user.id}`);
      if (!shown) {
        setShowWelcomePopup(true);
        localStorage.setItem(`pinevela_welcome_shown_${user.id}`, 'true');
      }
    }
  }, [user?.id]);

  useEffect(() => {
    const itemId = searchParams.get('marketItem');
    if (showWelcomePopup || !itemId || user?.role !== 'user' || !publicCatalog.length) return;
    const product = publicCatalog.find(item => item.id === itemId);
    if (product) {
      setActiveTab('home');
      setSelectedProductForBuy(product);
      const priceIndex = Number(searchParams.get('marketPrice'));
      setSelectedPriceCategory((Number.isSafeInteger(priceIndex) && priceIndex >= 0 ? product.priceCategories?.[priceIndex] : null) || product.priceCategories?.[0] || null);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('marketItem');
    next.delete('marketPrice');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, publicCatalog, user?.role, showWelcomePopup]);

  const [claimHostelId, setClaimHostelId] = useState<string | undefined>();
  const [residencesLoaded, setResidencesLoaded] = useState(!!cachedDashboard);
  function openResidenceActivation(hostel: { id: string }) {
    setViewingHostelModal(null);
    setClaimHostelId(hostel.id);
    setShowClaimModal(true);
    setClaimStep(1);
    setClaimRoomKeyInput('');
    setClaimError(null);
    setVerifiedKeyInfo(null);
  }
  useEffect(() => { if (!showClaimModal) setClaimHostelId(undefined); }, [showClaimModal]);
  useEffect(() => {
    const residenceId = searchParams.get('residence');
    if (!residenceId || user?.role !== 'user' || !residencesLoaded) return;
    const hostel = filterResidences(availableHostels, '').find(hostel => hostel.id === residenceId);
    setActiveTab('home');
    setHomeFilterType('hostels');
    if (hostel) {
      if (searchParams.get('residenceAction') === 'activate') openResidenceActivation(hostel);
      else setViewingHostelModal(hostel);
    } else triggerToast('This residence is no longer available.', 'error');
    const next = new URLSearchParams(searchParams);
    next.delete('residence'); next.delete('residenceAction');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, availableHostels, residencesLoaded, user?.role]);

  useEffect(() => {
    const id = searchParams.get('marketStore');
    if (!id || user?.role !== 'user') return;
    setViewingStoreId(id); setStoreMessageOnOpen(searchParams.get('storeAction') === 'message');
    const next = new URLSearchParams(searchParams); next.delete('marketStore'); next.delete('storeAction');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, user?.role]);

  // Image zoom viewer modal
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Let desktop users switch to the compact, fixed top navigation when they need more room.
  const [isSidebarHidden, setIsSidebarHidden] = useState(usesTopNavigation);

  useEffect(() => {
    saveNavigationLayout(isSidebarHidden);
  }, [isSidebarHidden]);

  // Catalog selection for the home tab
  const [homeFilterType, setHomeFilterType] = useState<'hostels' | 'market'>('market');
  const [marketVisibleCount, setMarketVisibleCount] = useState<number>(24);

  useEffect(() => {
    setMarketVisibleCount(24);
  }, [catalogCategory, catalogSearch, minPriceFilter, maxPriceFilter, priceSortOption]);

  // Persistent wishlist states for market items
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`pv_wishlist_${user?.id || 'guest'}`);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const toggleFavorite = useCallback((productId: string) => {
    setWishlist(prev => {
      const exists = prev.includes(productId);
      const updated = exists ? prev.filter(id => id !== productId) : [...prev, productId];
      try {
        localStorage.setItem(`pv_wishlist_${user?.id || 'guest'}`, JSON.stringify(updated));
      } catch (e) {}
      triggerToast(exists ? "Removed from wishlist 💔" : "Saved to wishlist 💖", exists ? "info" : "success");
      return updated;
    });
  }, [user?.id]);

  const mainScrollRef = React.useRef<HTMLDivElement>(null);
  useDashboardScroll(mainScrollRef, user?.id, activeTab === 'home' ? `home:${homeFilterType}` : activeTab, !loadingData);

  // Memoized search and filter results for high performance 60fps scrolling
  const filteredProducts = useMemo(() => {
    const query = catalogSearch.toLowerCase().trim();
    return publicCatalog
      .filter(p => {
        if (catalogCategory !== 'All') {
          const isServ = isMarketService(p);
          if (catalogCategory === 'Services') {
            if (!isServ) return false;
          } else {
            if (isServ) return false;
            if (!matchesMarketCategory(p.category, catalogCategory)) return false;
          }
        }
        if (query) {
          if (!p.title.toLowerCase().includes(query) && !p.description.toLowerCase().includes(query) && !p.storeName.toLowerCase().includes(query)) {
            return false;
          }
        }
        const itemPrice = Number(p.price) || 0;
        if (itemPrice < minPriceFilter) return false;
        if (maxPriceFilter < 5000 && itemPrice > maxPriceFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (priceSortOption === 'price-asc') return (a.price || 0) - (b.price || 0);
        if (priceSortOption === 'price-desc') return (b.price || 0) - (a.price || 0);
        if (priceSortOption === 'newest') return (b.id || '').localeCompare(a.id || '');
        return compareMarketPriority(a, b);
      });
  }, [publicCatalog, catalogCategory, catalogSearch, minPriceFilter, maxPriceFilter, priceSortOption]);

  const filteredHostels = useMemo(() => filterResidences(availableHostels, ''), [availableHostels]);

  const scrollToSection = (id: string, sectionKey: string) => {
    if (sectionKey === 'market') setHomeFilterType('market');
    else if (sectionKey === 'hostels') setHomeFilterType('hostels');
    // Timeout to allow filters to update and components to render
    setTimeout(() => {
      const container = mainScrollRef.current;
      const element = document.getElementById(id);
      if (container && element) {
        const offsetTop = element.offsetTop - container.offsetTop;
        container.scrollTo({
          top: Math.max(0, offsetTop - 12),
          behavior: 'smooth'
        });
      }
    }, 60);
  };

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string, type: 'success' | 'warning' | 'info' | 'error' = 'info') => {
    if (routePopupFeedback(msg, type)) return;
    pushToast(msg, undefined, type);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadSupabaseDashboard=async(isSilent=false)=>{
    const accountId=user?.id,generation=marketGeneration.current;
    const sessionGeneration=currentSessionGeneration();
    const snapshot:Partial<PrimaryDashboardSnapshot>={};
    if(dashboardRead.current?.accountId===accountId&&!dashboardRead.current.controller.signal.aborted)return;
    dashboardRead.current?.controller.abort();
    const request={accountId,controller:new AbortController()};dashboardRead.current=request;
    const current=()=>dashboardRead.current===request&&!request.controller.signal.aborted&&marketAccountCurrent(accountId,generation);
    const signal=AbortSignal.any([request.controller.signal,AbortSignal.timeout(30000)]);
    setDashboardRefreshing(true);
    if(!isSilent){setLoadingData(!readDashboardSnapshot('primary',accountId));setDashboardLoadError('');}
    const failedMessage='Some account information could not load. Your connection may be slow or temporarily unavailable. Retry to refresh it.';
    const read=async(url:string,save:(data:any)=>void,opensDashboard=false)=>{
      try{
        const data=await apiFetch(url,{signal});if(!current())return false;
        save(data);return true;
      }catch{
        if(current())setDashboardLoadError(failedMessage);return false;
      }finally{
        // Only the account profile gates the initial page. Catalog/order reads
        // finish independently and cannot keep the whole dashboard on a skeleton.
        if(opensDashboard&&current()&&!isSilent)setLoadingData(false);
      }
    };
    try{
      const results=await Promise.all([
        read('/api/student/my-profile',data=>{
          if(!data||Array.isArray(data)||!data.user||!Array.isArray(data.rooms))throw Error('Could not read your account profile.');
          snapshot.profile=data;
          setStudentProfile(data.user);setUserRooms(data.rooms);setRoomKeyDetails(data.roomKeyDetails||null);
        },true),
        read('/api/hostels',data=>{
          if(!Array.isArray(data))throw Error('Could not read residences.');
          snapshot.residences=data;
          setAvailableHostels(data);setResidencesLoaded(true);
        }),
        read('/api/digital-market/products?includeAll=true',data=>{
          if(!Array.isArray(data))throw Error('Could not read market listings.');
          snapshot.catalog=data.filter(marketListingAvailable);
          setPublicCatalog(data.filter(marketListingAvailable));
          const storeId=merchantRegistration.data?.store?.id,email=user?.email?.toLowerCase();
          setDigitalMarketProducts(data.filter(p=>storeId&&p.storeId===storeId||email&&p.sellerEmail?.toLowerCase()===email));
        }),
        read('/api/digital-market/my-orders?paged=1',raw=>{
          const data=readOrderHistoryPage<DigitalMarketOrder>(raw);
          snapshot.orders=data.orders;
          setOrderCursor(previous=>previous===undefined?data.nextCursor:previous);
          setDigitalMarketOrders(previous=>mergeOrderHistory(previous,data.orders));setMarketOrdersAccount(accountId);setMarketReadError('');
        }),
      ]);
      if(current()&&results.every(Boolean)){setDashboardLoadError('');saveDashboardSnapshot('primary',accountId,sessionGeneration,snapshot as PrimaryDashboardSnapshot);}
    }finally{
      if(dashboardRead.current===request){
        dashboardRead.current=null;
        if(marketAccountCurrent(accountId,generation)){if(!isSilent)setLoadingData(false);setDashboardRefreshing(false);}
      }
    }
  };

  const loadStudentData = async (isSilent = false) => { if(user?.role==='user')return loadSupabaseDashboard(isSilent); };

  const loadDigitalMarketData = async () => {
    const accountId=user?.id,epoch=marketEpoch.current;
    const current=()=>marketAccountCurrent(accountId) && marketEpoch.current===epoch;
    try {
      const targetEmail = currentUser?.email || user?.email || '';
      const targetId = currentUser?.id || user?.id || '';
      const { data: statusRes } = await merchantRegistration.refetch();
      if(!current())return;
      if (statusRes) {

      }

      const productsRes = await apiFetch('/api/digital-market/products?includeAll=true');
      if(!current())return;
      if (Array.isArray(productsRes)) {
        const availableCatalog = productsRes.filter(marketListingAvailable);
        setPublicCatalog(prev => JSON.stringify(prev) === JSON.stringify(availableCatalog) ? prev : availableCatalog);
        const currentStoreId = statusRes?.store?.id;
        if (currentStoreId || targetEmail) {
          const myStoreProducts = productsRes.filter((p: any) => 
            (currentStoreId && p.storeId === currentStoreId) ||
            (targetEmail && p.sellerEmail?.toLowerCase() === targetEmail.toLowerCase())
          );
          setDigitalMarketProducts(prev => JSON.stringify(prev) === JSON.stringify(myStoreProducts) ? prev : myStoreProducts);
        }
      }

      const ordersRes = readOrderHistoryPage<DigitalMarketOrder>(await apiFetch('/api/digital-market/my-orders?paged=1'));
      if(!current())return;
      setMarketOrdersAccount(accountId);setMarketReadError('');
      setOrderCursor(previous=>previous===undefined?ordersRes.nextCursor:previous);
      setDigitalMarketOrders(prev=>mergeOrderHistory(prev,ordersRes.orders));
    } catch (e:any) {
      if(current())setMarketReadError(e?.message || 'Could not refresh your market orders.');
    }
  };

  const loadOlderOrders=async()=>{
    if(!orderCursor||olderOrdersLoading)return;const accountId=user?.id,epoch=marketEpoch.current;setOlderOrdersLoading(true);
    try{const page=readOrderHistoryPage<DigitalMarketOrder>(await apiFetch('/api/digital-market/my-orders?paged=1&before='+encodeURIComponent(orderCursor)));
      if(!marketAccountCurrent(accountId)||marketEpoch.current!==epoch)return;setDigitalMarketOrders(previous=>mergeOrderHistory(previous,page.orders));setOrderCursor(page.nextCursor);setMarketReadError('');
    }catch(e:any){if(marketAccountCurrent(accountId)&&marketEpoch.current===epoch)setMarketReadError(e.message);}
    finally{if(marketAccountCurrent(accountId)&&marketEpoch.current===epoch)setOlderOrdersLoading(false);}
  };
  useEffect(() => {
    const saved=readDashboardSnapshot<PrimaryDashboardSnapshot>('primary',user?.id);
    setDashboardLoadError('');setStudentProfile(saved?.profile.user || null);setUserRooms(saved?.profile.rooms || []);
    setRoomKeyDetails(saved?.profile.roomKeyDetails || null);setAvailableHostels(saved?.residences || []);
    setPublicCatalog(saved?.catalog || []);setResidencesLoaded(!!saved);setDigitalMarketOrders(saved?.orders || []);
    setMarketOrdersAccount(saved ? user?.id : undefined);setOrderCursor(undefined);setOlderOrdersLoading(false);setLoadingData(!saved);
    loadStudentData(!!saved);
    const refreshVisible = () => { if (!document.hidden) void loadStudentData(true); };
    let interval: ReturnType<typeof setInterval> | undefined;
    const stopPolling = () => { clearInterval(interval); interval = undefined; };
    const startPolling = () => { if (!document.hidden && interval === undefined) interval = setInterval(refreshVisible, 30000); };
    const refreshVisibility = () => {
      if (document.hidden) { stopPolling(); dashboardRead.current?.controller.abort(); }
      else { startPolling(); refreshVisible(); }
    };
    startPolling();
    let changeTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshChanged = () => { clearTimeout(changeTimer); changeTimer = setTimeout(refreshVisible, 250); };
    document.addEventListener('visibilitychange', refreshVisibility);
    window.addEventListener('pinevela-data-change', refreshChanged);
    return () => {stopPolling();clearTimeout(changeTimer);window.removeEventListener('pinevela-data-change',refreshChanged);document.removeEventListener('visibilitychange',refreshVisibility);dashboardRead.current?.controller.abort();dashboardRead.current=null;};
  }, [user?.id, user?.email]);

  // Handle Photo Upload (Base64)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        triggerToast("Each image must be under 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setIssuePhotos(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setIssuePhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Submit New Maintenance Issue
  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDescription.trim()) {
      triggerToast("Please fill in title and description");
      return;
    }

    setSubmittingIssue(true);
    try {
      const payload = {
        title: issueTitle.trim(),
        category: issueCategory,
        urgency: issueUrgency,
        subArea: issueSubArea,
        locationTag: issueSubArea,
        description: issueDescription.trim(),
        photos: issuePhotos,
        visitWindow: issueVisitWindow,
        contactPhone: issueContactPhone || currentUser?.phone || '',
        contactMethod: issueContactMethod,
        studentId: currentUser?.studentId || currentUser?.id,
        studentName: currentUser?.name || 'Student Resident',
        studentEmail: currentUser?.email || '',
        studentPhone: issueContactPhone || currentUser?.phone || '',
        hostelId: currentUser?.hostelId || roomKeyDetails?.hostelId || '',
        hostelName: currentUser?.hostelName || roomKeyDetails?.hostelName || 'PineVela Student Residence',
        blockName: currentUser?.blockName || roomKeyDetails?.blockName || 'Block A',
        roomNumber: currentUser?.roomNumber || roomKeyDetails?.roomNumber || 'Room 101'
      };

      const newIssue = await apiFetch('/api/issue-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setIssueReports(prev => [newIssue, ...prev]);
      setShowNewIssueModal(false);
      setIssueTitle('');
      setIssueDescription('');
      setIssuePhotos([]);
      triggerToast("Maintenance Report Submitted! Dispatched to Manager & Staff.");
    } catch (err: any) {
      triggerToast(err.message || "Failed to submit maintenance report");
    } finally {
      setSubmittingIssue(false);
    }
  };

  // Student Confirm Resolution of Repair
  const handleConfirmResolution = async (isResolved: boolean) => {
    if (!selectedIssueForConfirm) return;

    setSubmittingConfirm(true);
    try {
      const updated = await apiFetch(`/api/issue-reports/${selectedIssueForConfirm.id}/student-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentAcceptedResolved: isResolved,
          studentFeedback: confirmFeedback.trim(),
          studentName: currentUser?.name || 'Student Resident'
        })
      });

      setIssueReports(prev => prev.map(i => i.id === updated.id ? updated : i));
      setSelectedIssueForConfirm(null);
      setConfirmFeedback('');
      triggerToast(
        isResolved 
          ? "Resolution Confirmed! Thank you. Ready for manager final sign-off." 
          : "Feedback Sent! Manager and staff notified to re-inspect."
      );
    } catch (err: any) {
      triggerToast(err.message || "Failed to update confirmation");
    } finally {
      setSubmittingConfirm(false);
    }
  };

  // Verify room key during claim modal

  // Confirm claim room key & initiate resident account creation

  // Open reset password modal
  const openResetPasswordModal = (role: 'resident', email: string) => {
    setResetTargetRole(role);
    setResetTargetEmail(email);
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setResetPasswordError(null);
    setShowResetPasswordModal(true);
  };

  // Submit password reset

  // Open delete account modal
  const openDeleteAccountModal = (role: 'resident', email: string) => {
    {
      triggerToast('Sign in to your separately verified resident portal, then open Settings → End resident room access. Your primary account cannot close a separate portal.');
      return;
    }

  };

  // Submit account deletion (unlocks registration)
  const handleDeleteRegisteredAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    return;

  };

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;
  const marketUnread = notifications.filter(n => !n.read && marketNoticeKind(n) !== null);
  const orderUnreadCount = marketUnread.filter(n => marketNoticeKind(n) === 'order').length;
  const tabUnreadCount = (id: string) => id === 'notifications' ? unreadNotificationsCount : id === 'digital-market' ? orderUnreadCount : 0;

  const navItems = userDashboardDestinations(Boolean(roomKeyDetails || currentUser?.roomKey),
    `${roomKeyDetails?.blockName || 'Block'} - Room ${roomKeyDetails?.roomNumber || currentUser?.roomNumber || ''}`,
    unreadNotificationsCount);

  const handleNavClick = (tabId: string) => {
    setActiveTab(tabId as any);
    // Replace stale mode links when navigating so reloads stay on the selected destination.
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', tabId); next.delete('mode'); return next; });
  };

  const startMerchantRegistration = () => {
    setShowMerchantCard(false);
    setDmWizardPhase(1);
    setDmFullName(''); setDmStudentEmail(''); setDmPassword(''); setDmConfirmPassword('');
    setShowDmPassword(false); setDmIdNumber(''); setDmProposedStoreName(''); setDmCertifyAccepted(false);
    setDmUniversity('Kwame Nkrumah University of Science and Technology (KNUST)');
    setDmCategory(DIGITAL_MARKET_CATEGORIES[0]); setDmRegError(null);
    setShowDMRegModal(true);
  };

  const openMerchantRegistration = async () => {
    setCheckingMerchant(true);
    try {
      const result = await merchantRegistration.refetch();
      if (!result.data || result.isError) { triggerToast('Could not check merchant registration. Please try again.', 'error'); return; }
      if ((!result.data.application && !result.data.store) || ((result.data.application?.status === 'rejected'))) startMerchantRegistration();
      else setShowMerchantCard(true);
    } finally { setCheckingMerchant(false); }
  };

  const openManagerRegistration = async () => {
    setCheckingManager(true);
    try {
      const result = await managerRegistration.refetch();
      if (!result.data || result.isError) { triggerToast('Could not check manager registration. Please try again.', 'error'); return; }
      if (managerRegistrationStatus(result.data.managerAccount) === 'unregistered' || ((result.data.managerAccount?.requiresPropertyRegistration))) navigate('/register-manager');
      else setShowManagerCard(true);
    } finally { setCheckingManager(false); }
  };

  // Dedicated merchant login entry point

  const [showMerchantStoreLoginModal, setShowMerchantStoreLoginModal] = useState<boolean>(false);
  const [storeLoginEmail, setStoreLoginEmail] = useState<string>('');
  const [storeLoginPassword, setStoreLoginPassword] = useState<string>('');
  const [storeLoginError, setStoreLoginError] = useState<string | null>(null);
  const [storeLoginLoading, setStoreLoginLoading] = useState<boolean>(false);
  const [storeNeedsPin,setStoreNeedsPin] = useState(false);
  const [storePortalPin,setStorePortalPin] = useState('');

  const handleQuickMerchantLogin = async () => {
    navigate('/login');
  };

  const handleMerchantStoreLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoreLoginLoading(true);
    setStoreLoginError(null);

    try {
      const res = await fetch('/api/digital-market/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentEmail: storeLoginEmail.trim(),
          password: storeLoginPassword,
          ...(storeNeedsPin ? { portalPin:storePortalPin } : {})
        })
      });
      const data = await safeJson(res);
      if (!res.ok) {
        if (data.code === 'portal_pin_required') { setStoreNeedsPin(true);setStorePortalPin(''); }
        setStoreLoginError(data?.error || "Invalid student email or store password. Please check your credentials.");
        return;
      }

      if (setSessionUser && data.user) {
        setSessionUser(data.user);
      }
      setShowMerchantStoreLoginModal(false);

      if (data.needsSetup || (data.store && !data.store.setupCompleted)) {
        triggerToast("Store verified. Launching multi-phase onboarding wizard...", "success");
        setShowMerchantStoreLoginModal(false);
        navigate('/digital-market/onboard');
      } else {
        triggerToast("Store verified! Redirecting to Digital Market Console...", "success");
        navigate('/digital-market');
      }
    } catch (err: any) {
      setStoreLoginError(err.message || "Failed to log in to digital store.");
    } finally {
      setStoreLoginLoading(false);
    }
  };

  // Submit Digital Market Application Handler (Phase 3 Submission)

  const { settings: marketPrices } = usePlatformSettings();

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingProd(true);

    try {
      if (!digitalMarketStore) {
        triggerToast("You must have an active store to list products.");
        setSubmittingProd(false);
        return;
      }

      const payload = {
        storeId: digitalMarketStore.id,
        title: prodTitle,
        description: prodDesc,
        price: Number(prodPrice) || 0,
        category: prodCategory,
        stockQuantity: Number(prodStock) || 1,
        imageUrl: prodImage,
        userEmail: currentUser?.email || user?.email || ''
      };

      const res = await apiFetch('/api/digital-market/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        setShowAddProductModal(false);
        setCatalogCategory('All');
        setCatalogSearch('');
        setMinPriceFilter(0);
        setMaxPriceFilter(5000);
        setProdTitle('');
        setProdDesc('');
        setProdPrice('');
        triggerToast("Product listed in Digital Market! 🛍️");
        await loadDigitalMarketData();
      } else {
        triggerToast(res?.error || "Failed to add product.");
      }
    } catch (err: any) {
      triggerToast(err.message || "Failed to add product.");
    } finally {
      setSubmittingProd(false);
    }
  };

  useEffect(() => { setMarketActionError(''); }, [selectedProductForBuy?.id, selectedProdForOrder?.id]);
  useEffect(() => {
    if (marketActionError) document.querySelector('[data-market-action-error]')?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [marketActionError]);

  // Place Order / Request Meetup Handler
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProdForOrder) return;
    setMarketActionError('');
    setSubmittingOrder(true);

    const accountId=user?.id,generation=marketGeneration.current;marketEpoch.current++;
    try {
      const payload = {
        productId: selectedProdForOrder.id,
        quantity: orderQtyInput,
        priceCategoryId: selectedPriceCategory?.id || undefined,
        priceCategoryName: selectedPriceCategory?.name || undefined,
        ...(({})),
        buyerPhone: buyerPhoneInput || currentUser?.phone || '',
        meetingLocation: orderMeetupLocation,
        meetingLatitude: orderMeetupLat,
        meetingLongitude: orderMeetupLng,
        serviceLocationOption
      };

      {const params=JSON.stringify(payload);if(orderRequest.current?.params!==params)orderRequest.current={params,id:crypto.randomUUID()};Object.assign(payload,{requestId:orderRequest.current.id});}
      const res = await apiFetch('/api/digital-market/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if(!marketAccountCurrent(accountId,generation))return;
      marketEpoch.current++;
      if (res && res.success) {
        orderRequest.current=null;
        setSelectedProdForOrder(null);
        handleNavClick('digital-market');
        triggerToast("Campus Meetup Coordinates Transmitted to Seller! 📍🛍️");
        await loadDigitalMarketData();
      } else {
        setMarketActionError(res?.error || "Failed to place order.");
      }
    } catch (err: any) {
      if(marketAccountCurrent(accountId,generation))setMarketActionError(err.message || "Failed to place order.");
    } finally {
      if(marketAccountCurrent(accountId,generation))setSubmittingOrder(false);
    }
  };

  // Seller Agrees to Proposed Meetup Location & Confirms Order
  const handleAgreeToMeetupLocation = async (orderId: string) => {
    setConfirmingLocationId(orderId);
    const accountId=user?.id,generation=marketGeneration.current;marketEpoch.current++;
    try {
      const res = await apiFetch(`/api/digital-market/orders/${orderId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'agree-location' })
      });
      if(!marketAccountCurrent(accountId,generation))return;
      marketEpoch.current++;
      if (res && res.success) {
        triggerToast("Meetup location agreed! Purchase confirmed for handover. 🤝");
        await loadDigitalMarketData();
      } else {
        triggerToast(res?.error || "Failed to confirm location.");
      }
    } catch (err: any) {
      if(marketAccountCurrent(accountId,generation))triggerToast(err.message || "Failed to confirm location.");
    } finally {
      if(marketAccountCurrent(accountId,generation))setConfirmingLocationId(null);
    }
  };

  // Seller Declines Proposed Meetup Location
  const handleDeclineMeetupLocation = async (orderId: string) => {
    if (!window.confirm("Are you sure you want to decline this proposed meetup spot?")) return;
    setConfirmingLocationId(orderId);
    const accountId=user?.id,generation=marketGeneration.current;marketEpoch.current++;
    try {
      const res = await apiFetch(`/api/digital-market/orders/${orderId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject-location' })
      });
      if(!marketAccountCurrent(accountId,generation))return;
      marketEpoch.current++;
      if (res && res.success) {
        triggerToast("Proposed meetup location declined.");
        await loadDigitalMarketData();
      } else {
        triggerToast(res?.error || "Failed to decline location.");
      }
    } catch (err: any) {
      if(marketAccountCurrent(accountId,generation))triggerToast(err.message || "Failed to decline location.");
    } finally {
      if(marketAccountCurrent(accountId,generation))setConfirmingLocationId(null);
    }
  };

  const handleRenewDeliveryPin = async (orderId: string) => {
    setRenewingPinOrderId(orderId);
    const accountId=user?.id,generation=marketGeneration.current;marketEpoch.current++;
    try {
      const result = await apiFetch(`/api/digital-market/orders/${orderId}/renew-pin`, { method: 'POST', body: JSON.stringify({}) });
      if(!marketAccountCurrent(accountId,generation))return;marketEpoch.current++;
      setDigitalMarketOrders(prev => prev.map(order => order.id === orderId ? result.order : order));
      triggerToast('New delivery PIN issued. Your previous PIN is no longer valid.');
    } catch (error: any) {
      if(marketAccountCurrent(accountId,generation))triggerToast(error.message || 'Could not renew delivery PIN.');
    } finally {
      if(marketAccountCurrent(accountId,generation))setRenewingPinOrderId(null);
    }
  };

  // Complete Order with six-digit delivery PIN
  const handleVerifyPinOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingOrderTarget || pinSubmitting) return;

    setPinSubmitting(true);
    const accountId=user?.id,generation=marketGeneration.current;marketEpoch.current++;
    try {
      const res = await apiFetch(`/api/digital-market/orders/${verifyingOrderTarget.id}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newStatus: 'Completed & Paid',
          inputPin: inputPinValue,
          notes: 'Inspected on campus. Delivery PIN verified by merchant.'
        })
      });

      if(!marketAccountCurrent(accountId,generation))return;
      marketEpoch.current++;
      if (res && res.success) {
        setDigitalMarketOrders(prev => prev.map(o => o.id === verifyingOrderTarget.id ? { ...o, status: 'Completed & Paid' } : o));
        setVerifyingOrderTarget(null);
        setInputPinValue('');
        triggerToast("PIN Verified! Transaction completed & stock updated. 🎉");
        await loadDigitalMarketData();
      } else {
        triggerToast(res?.error || "Invalid PIN. Please check PIN with buyer.");
      }
    } catch (err: any) {
      if(marketAccountCurrent(accountId,generation))triggerToast(err.message || "PIN verification failed.");
    } finally {
      if(marketAccountCurrent(accountId,generation))setPinSubmitting(false);
    }
  };

  const handleOpenRatingModal = (order: DigitalMarketOrder) => {
    setRatingOrderTarget(order);
    const existing = (order as any).userRating;
    setRatingStars(existing?.rating || 5);
    setRatingReview(existing?.review || '');
  };

  const handleSubmitStoreRating = async () => {
    if (!ratingOrderTarget) return;
    setIsSubmittingRating(true);
    const accountId=user?.id,generation=marketGeneration.current;marketEpoch.current++;
    try {
      const res = await apiFetch('/api/digital-market/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: ratingOrderTarget.id,
          rating: ratingStars,
          review: ratingReview
        })
      });

      if(!marketAccountCurrent(accountId,generation))return;marketEpoch.current++;
      if (res?.success) {
        triggerToast(`Thank you! Rated ${ratingStars} stars for ${ratingOrderTarget.storeName} ⭐`, 'success');
        setRatingOrderTarget(null);
        await loadDigitalMarketData();
      } else {
        triggerToast(res?.error || 'Failed to submit rating.', 'error');
      }
    } catch (err: any) {
      if(marketAccountCurrent(accountId,generation))triggerToast(err.message || 'Error submitting store rating.', 'error');
    } finally {
      if(marketAccountCurrent(accountId,generation))setIsSubmittingRating(false);
    }
  };

  if (loadingData && issueReports.length === 0) return <RouteSkeleton />;

  return (
    <div data-dashboard-shell data-navigation-layout={isSidebarHidden ? 'top' : 'sidebar'} className="user-dashboard page-canvas min-h-screen h-screen flex flex-col lg:flex-row text-slate-800 overflow-hidden font-sans relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div role="status"
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="ux-dashboard-toast fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 text-white px-4 py-2 rounded-full shadow-lg border border-slate-800 flex items-center gap-2 backdrop-blur-md text-xs font-semibold"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <UserDashboardNavigation items={navItems} activeTab={activeTab} onSelect={handleNavClick}
        isSidebarHidden={isSidebarHidden} onLayoutChange={setIsSidebarHidden} profile={currentUser}
        hostelName={user?.hostelName} unreadCount={unreadNotificationsCount} badgeFor={tabUnreadCount}
        navigationId={navigationId} onCompanionTarget={setCompanionNavigationTarget} onSignOut={() => setShowSignoutConfirmModal(true)} />

      {/* MAIN CONTENT AREA */}
      <main ref={mainScrollRef} data-dashboard-view={activeTab} className={`user-dashboard-content hide-scrollbar flex-1 p-6 pb-28 lg:px-10 lg:pb-10 space-y-8 overflow-y-auto h-full relative z-10 ${isSidebarHidden ? 'lg:pt-24 lg:w-[calc(100vw-22rem)] lg:max-w-[calc(100vw-22rem)] lg:mx-auto' : 'lg:pt-10'}`}>

        {(dashboardLoadError)&&<section role="alert" className="space-y-3 rounded-2xl border border-blue-200 bg-[var(--pv-panel)] p-5 text-[var(--pv-text)]">
          <h2 className="text-lg font-semibold">Could not refresh your dashboard</h2><p className="text-sm">{dashboardLoadError}</p>
          <button type="button" disabled={dashboardRefreshing} onClick={()=>void loadStudentData(false)} className="min-h-11 rounded-xl bg-blue-700 px-5 font-semibold text-white disabled:opacity-60">{dashboardRefreshing?'Refreshing…':'Retry dashboard'}</button>
        </section>}

        {/* TAB 0: HOME TAB (Residents View, Staff View & Gateways) */}
        {activeTab === 'home' && (
          <div data-home-catalog={homeFilterType} className="user-home-content space-y-8 animate-fadeIn relative z-10">
            <UserCatalogSwitcher value={homeFilterType} onChange={setHomeFilterType} />

            {/* Pinevela Digital Marketplace Section */}
            {homeFilterType === 'market' && (
              <div key="market" id="home-market-section" className="user-market-panel user-catalog-panel bg-transparent border-0 rounded-3xl p-0 shadow-none space-y-6 animate-fadeIn">
                  <MarketplaceFilters compactCatalog onNearbyServices={() => setShowNearbyServices(true)} catalogSearch={catalogSearch} setCatalogSearch={setCatalogSearch}
                    catalogCategory={catalogCategory} setCatalogCategory={setCatalogCategory}
                    minPriceFilter={minPriceFilter} setMinPriceFilter={setMinPriceFilter}
                    maxPriceFilter={maxPriceFilter} setMaxPriceFilter={setMaxPriceFilter}
                    priceSortOption={priceSortOption} setPriceSortOption={setPriceSortOption}
                    showPriceFilterPanel={showPriceFilterPanel} setShowPriceFilterPanel={setShowPriceFilterPanel}
                    itemCount={filteredProducts.length} />

                  {/* Main Marketplace Grid */}
                  <div className="space-y-4">
                    {filteredProducts.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 space-y-2">
                        <Store className="w-8 h-8 text-slate-300 mx-auto" />
                        <div className="text-sm font-bold text-slate-700">No items match your criteria</div>
                        <p className="text-xs text-slate-500 font-medium">Try checking another category or refining your search text.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="market-catalog-grid pb-2">
                          {filteredProducts.slice(0, marketVisibleCount).map(product => (
                            <MarketItemCard
                              key={product.id}
                              product={product as any}
                              isFavorite={wishlist.includes(product.id)}
                              onToggleFavorite={toggleFavorite}
                              onInspect={(prod) => {
                                setSelectedProductForBuy(prod as any);
                                const cats = (prod as any).priceCategories;
                                setSelectedPriceCategory(Array.isArray(cats) && cats.length > 0 ? cats[0] : null);
                              }}
                            />
                          ))}
                        </div>

                        {marketVisibleCount < filteredProducts.length && (
                          <div className="flex justify-center pt-2 pb-4">
                            <button
                              type="button"
                              onClick={() => setMarketVisibleCount(prev => prev + 32)}
                              className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl border border-slate-200 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              <span>Load More Items</span>
                              <span className="text-[10px] text-slate-400 font-bold">
                                (Showing {Math.min(marketVisibleCount, filteredProducts.length)} of {filteredProducts.length})
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
            )}

            {/* Available Hostels Section */}
            {homeFilterType === 'hostels' && (
                <div key="residences" id="home-hostels-section" className="user-catalog-panel bg-transparent border-0 rounded-3xl p-0 shadow-none space-y-6 animate-fadeIn">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="user-section-title text-lg font-black text-slate-900 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-blue-700" />
                        Available Residences & Student Accommodations
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        Explore verified student residences and accommodations available across PineVela.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                    <RegistrationStatusButton kind="manager" status={managerStatus} loading={managerRegistration.isPending || checkingManager}
                      error={managerRegistration.isError} onClick={() => void openManagerRegistration()} />
                    <span className="px-3 py-1 bg-blue-100/70 text-blue-900 border border-blue-200/70 font-black text-xs rounded-full animate-pulse-subtle">
                      {filteredHostels.length} {filteredHostels.length === 1 ? 'Residence' : 'Residences'} Found
                    </span>
                    </div>
                  </div>

                  {filteredHostels.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 space-y-2">
                      <Building2 className="w-8 h-8 text-slate-400 mx-auto animate-bounce-subtle" />
                      <div className="text-sm font-bold text-slate-700">No matching residences found</div>
                      <p className="text-xs text-slate-500 font-medium">Verified residences will appear here when available.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {filteredHostels.map(hostel => <ResidenceCard key={hostel.id} hostel={hostel} onInspect={setViewingHostelModal} onActivate={openResidenceActivation} />)}
                    </div>
                  )}
                </div>
            )}

            {/* Staff & Hire Staff Section (Staff View) */}

              {/* Staff Reviews Modal */}

              {/* Job Offer Proposal Modal */}

          </div>
        )}

        {/* TAB 1: NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 animate-fadeIn relative z-10 max-w-4xl">
            <div className="bg-white/90 border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="user-section-title text-lg font-black text-slate-900 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-700" />
                    Notifications & Bulletins
                  </h3>
                  <p className="user-section-description text-xs text-slate-500 font-semibold mt-0.5">
                    Official notices, digital room key clearances, and maintenance updates.
                  </p>
                </div>
                <span className="px-3 py-1 bg-blue-100/70 text-blue-900 border border-blue-200/70 font-black text-xs rounded-full">
                  Live Feed
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0">
                  </div>
                  <div className="space-y-1 w-full">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-900">Welcome to PineVela, {user?.name || 'Resident'}!</h4>
                      <span className="text-[10px] text-slate-400">Account created</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      Your account is ready. You can now discover hostels, activate your room key, and access maintenance tools.
                    </p>
                  </div>
                </div>

                {notifications.map((notif, index) => (
                  <div key={`${notif.id}-${index}`} data-notification-id={notif.id} className={`p-4 ${notif.read ? 'bg-slate-50/70' : 'bg-white'} border ${notif.read ? 'border-slate-200/80' : 'border-blue-200/80 shadow-sm'} rounded-2xl flex items-start gap-3.5`}>
                    <div className={`p-2.5 rounded-xl ${notif.type === 'success' ? 'bg-emerald-600' : notif.type === 'warning' ? 'bg-amber-600' : 'bg-slate-800'} text-white shrink-0`}>
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="space-y-1 w-full">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-900">{notif.title}</h4>
                        <span className="text-[10px] text-slate-400">{notif.date || 'Recently'}</span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        {notif.message}
                      </p>
                      <SupportNotificationLink notification={notif} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BECOME A STAFF TAB */}

                {/* TAB 5: RESIDENT ROOM TAB (SUPPORTS UP TO 5 REGISTERED ROOMS & DELETION) */}
        {activeTab === 'login-room' && (
          <div className="space-y-6 animate-fadeIn relative z-10 max-w-5xl">
            {/* TOP BAR / ACTION HEADER */}
            <div className="bg-white/95 border border-slate-200/80 rounded-3xl p-6 shadow-xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="w-12 h-12 shrink-0 aspect-square rounded-full bg-blue-100 text-blue-900 flex items-center justify-center font-bold shadow-xs">
                  <Key className="w-6 h-6 text-blue-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="user-section-title text-xl font-black text-slate-900 flex flex-wrap items-center gap-2">
                    Resident Room Management
                    <span className="text-xs font-black px-2.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 rounded-full">
                      {userRooms.length} / 1 Active Room
                    </span>
                  </h3>
                  <p className="user-section-description text-xs text-slate-500 font-medium mt-0.5">
                    View your active digital room key and manage your room account (restricted to 1 room per user account).
                  </p>
                </div>
              </div>

              {userRooms.length > 0 && (
                <div className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  <span>Max Capacity (1 Room Per Account) Reached</span>
                </div>
              )}
            </div>

            {/* ROOM CARDS LIST */}
            {userRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {userRooms.map((roomItem: any, idx: number) => {
                  const rKey = roomItem.roomKey || roomItem.id;
                  const hostelName = roomItem.hostelName || registeredAccounts.residentAccount?.hostelName || 'Residence details unavailable';
                  const blockName = roomItem.blockName || 'Block details unavailable';
                  const roomNum = roomItem.roomNumber || 'Unavailable';
                  const resName = roomItem.assignedStudentName || registeredAccounts.residentAccount?.name || 'Not specified';
                  const managerName = roomItem.managerName || 'Manager details unavailable';
                  const managerPhone = roomItem.managerPhone;

                  return (
                    <div
                      key={rKey || idx}
                      className="bg-white/95 border border-blue-200/90 hover:border-blue-400 rounded-3xl p-6 shadow-xl space-y-5 backdrop-blur-md transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-extrabold text-sm">
                              {idx + 1}
                            </div>
                            <div>
                              <h4 className="text-base font-black text-slate-900 leading-tight">
                                {hostelName}
                              </h4>
                              <span className="text-xs font-bold text-blue-700">
                                {blockName} • Room {roomNum}
                              </span>
                            </div>
                          </div>

                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-black shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Active</span>
                          </span>
                        </div>

                        {/* DOSSIER DETAILS */}
                        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-medium">Digital Room Key:</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                {roomItem.roomKey || 'Unavailable'}
                              </span>
                              {roomItem.roomKey && <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(roomItem.roomKey);
                                  triggerToast(`Copied Room Key ${roomItem.roomKey}`, 'success');
                                }}
                                className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                                title="Copy Key"
                              >
                                <Copy className="w-3 h-3" />
                              </button>}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                            <div>
                              <span className="text-slate-400 block font-medium text-[10px]">Resident Name</span>
                              <span className="font-bold text-slate-800">{resName}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium text-[10px]">Phone Number</span>
                              <span className="font-bold text-slate-800">{roomItem.assignedStudentPhone || roomItem.phone || 'Not specified'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium text-[10px]">Resident Email</span>
                              <span className="font-bold text-slate-800 truncate block">{roomItem.assignedStudentEmail || roomItem.email || 'Not specified'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium text-[10px]">Hostel Manager</span>
                              <span className="font-bold text-slate-800 truncate block">{managerName}{managerPhone ? ` (${managerPhone})` : ''}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CARD ACTIONS */}
                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            {openDeleteAccountModal('resident','');return;}

                          }}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>{('Resident room access')}</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab('home')}
                            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Overview</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white/95 border border-blue-200/80 rounded-3xl p-8 shadow-xl space-y-6 text-center backdrop-blur-md max-w-2xl mx-auto">
                <div className="w-16 h-16 rounded-3xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold mx-auto">
                  <Key className="w-8 h-8 text-blue-700" />
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <h3 className="text-xl font-black text-slate-900">
                    Have a Digital Room Key?
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                    If your hostel manager issued you a Digital Room Key, click below to verify your room and complete your resident account setup.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Verify room key and start resident onboarding"
                  onClick={() => {
                    setShowClaimModal(true);
                    setClaimRoomKeyInput('');
                    setVerifiedKeyInfo(null);
                    setClaimError(null);
                    setClaimStep(1);
                  }}
                  className="user-room-key-action pv-primary-action min-w-0 min-h-11 w-full sm:w-auto px-4 sm:px-8 py-3.5 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-850 hover:to-indigo-850 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-900/20 transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck size={16} className="shrink-0" />
                  <span className="user-room-key-label-full min-w-0">Verify Room Key &amp; Start Onboarding</span>
                  <span className="user-room-key-label-compact min-w-0">Verify Room Key</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB: DIGITAL STUDENT MARKET */}
        {activeTab === 'digital-market' && (
          <div className="space-y-6 animate-fadeIn relative z-10 max-w-6xl">
            <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white/90 p-5 sm:p-6 shadow-xl">
              <div className="rounded-2xl bg-blue-600 p-3 text-white"><Package className="h-6 w-6" /></div>
              <div><h2 className="user-section-title text-xl font-black text-slate-900">Purchases & Tracking</h2>
                <p className="user-section-description mt-1 text-xs font-medium text-slate-500">View your purchases, follow order updates, and track pickup or delivery.</p>
              </div>
            </div>
            {/* MODE 3: PURCHASES & ORDER TRACKING */}
            {(
              <div className="space-y-6">
                <div className="bg-white/90 border border-slate-200/80 rounded-3xl p-6 shadow-xl space-y-6 backdrop-blur-md">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        Purchases & Order History Tracking
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Track campus meetup schedules, delivery PIN handshakes, and chronological purchasing progress.
                      </p>
                    </div>
                  </div>

                  {orderCursor&&<button type="button" onClick={()=>void loadOlderOrders()} disabled={olderOrdersLoading} className="mb-4 rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-50">{olderOrdersLoading?'Loading older orders…':'Load older orders'}</button>}
                  {/* Order History Cards List */}
                  {marketReadError && <p role="status" className="mb-3 text-sm text-red-700">{marketReadError}</p>}
                  {digitalMarketOrders.length > 0 ? (
                    <div className="space-y-6">
                      {digitalMarketOrders.map(order => {
                        const isBuyer = user?.role === 'user' && (currentUser?.id || user?.id) === order.buyerId;
                        return (
                          <div key={order.id} className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
                            <OrderNotifications orderId={order.id}/>
                            {/* Order Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 text-blue-800 rounded-xl font-mono text-xs font-bold">
                                  {order.id}
                                </div>
                                <div>
                                  <div className="text-xs font-extrabold text-slate-900">
                                    {isBuyer ? `Merchant: ${order.storeName}` : `Buyer: ${order.buyerName}`}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Placed on {new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <OrderCancelButton order={order} onCancelled={next=>{setDigitalMarketOrders(previous=>previous.map(row=>row.id===next.id?next:row));void loadDigitalMarketData();}}/>
                                <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                                  order.status === 'Completed & Paid' 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                    : (order.status === 'Cancelled' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-900 border border-blue-300')
                                }`}>
                                  {order.status}
                                </span>
                              </div>
                            </div>

                            {/* Order Product & Location Info */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <img src={order.productImage} alt={order.productTitle} className="w-14 h-14 rounded-xl object-cover bg-white border border-slate-200" />
                                <div>
                                  <h4 className="text-sm font-black text-slate-900">{order.productTitle}</h4>
                                  <div className="text-xs text-slate-600 font-semibold mt-0.5">
                                    Quantity: {order.quantity} × GHS {order.productPrice} = <span className="text-blue-900 font-black">GHS {order.totalAmount}</span>
                                  </div>
                                  <div className="text-[11px] text-blue-800 font-bold mt-1 flex flex-wrap items-center gap-1.5">
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                                      <span>Meetup Point: {order.meetingLocation}</span>
                                    </span>
                                    {order.meetingLatitude != null && order.meetingLongitude != null && (
                                      <button
                                        type="button"
                                        onClick={() => setViewingOrderMap(order)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-md text-[10px] font-extrabold cursor-pointer transition-colors"
                                      >
                                        <Compass className="w-3 h-3 text-blue-700" />
                                        <span>View Map ({order.meetingLatitude.toFixed(3)}, {order.meetingLongitude.toFixed(3)})</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* PIN Box / Rate Store Box */}
                              {!['Completed & Paid', 'Cancelled', 'Location Rejected', 'Rejected by Seller','Expired'].includes(order.status) ? (
                                <div className="w-full sm:w-auto bg-white border border-slate-200 rounded-2xl p-3.5 text-center shadow-xs">
                                  {isBuyer ? (
                                    <div>
                                      <div className="text-[10px] font-extrabold uppercase text-slate-400">Delivery handover PIN</div>
                                      {order.otpPin && order.deliveryPinExpiresAt && Date.parse(order.deliveryPinExpiresAt) > Date.now() ? (
                                        <>
                                          <div className="text-2xl font-black text-blue-700 tracking-widest my-0.5">{order.otpPin}</div>
                                          <div className="text-[10px] text-slate-500">Expires {new Date(order.deliveryPinExpiresAt).toLocaleString()}</div>
                                        </>
                                      ) : <div className="text-xs text-slate-600 my-1">{order.deliveryPinState === 'locked' ? 'PIN locked after failed attempts.' : 'Request a new delivery PIN.'}</div>}
                                      <div className="text-[10px] text-slate-500 font-medium">Share only after inspecting the delivery.</div>
                                      <button type="button" disabled={renewingPinOrderId === order.id} onClick={() => handleRenewDeliveryPin(order.id)} className="mt-2 text-xs font-bold text-blue-700 underline disabled:opacity-50">
                                        {renewingPinOrderId === order.id ? 'Renewing…' : 'Get a new PIN'}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="text-[10px] font-extrabold uppercase text-slate-400">Verify Delivery PIN</div>
                                      <button
                                        type="button"
                                        disabled={order.status === 'Awaiting Seller Confirmation'}
                                        onClick={() => {
                                          setVerifyingOrderTarget(order);
                                          setInputPinValue('');
                                        }}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                                      >
                                        Verify Buyer PIN & Complete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : isBuyer && order.status === 'Completed & Paid' ? (
                                <div className="w-full sm:w-auto bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-center shadow-xs shrink-0 min-w-[150px]">
                                  {(order as any).userRating ? (
                                    <div className="space-y-1">
                                      <div className="text-[9.5px] font-extrabold uppercase text-amber-800">Your Store Rating</div>
                                      <div className="flex items-center justify-center gap-1 text-amber-600 font-black text-sm">
                                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                                        <span>{(order as any).userRating.rating}.0 / 5.0</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenRatingModal(order)}
                                        className="text-[10px] text-amber-900 font-bold underline hover:text-amber-950 cursor-pointer"
                                      >
                                        Edit Store Rating
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="space-y-1.5">
                                      <div className="text-[9.5px] font-extrabold uppercase text-amber-800">Successful Purchase</div>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenRatingModal(order)}
                                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
                                      >
                                        <Star className="w-3.5 h-3.5 fill-amber-200 text-amber-100" />
                                        <span>Rate Store & Seller</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>

                            {order.status==='Expired'&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-blue-950"><p>This reservation has ended. No payment was charged by PineVela. A new request checks current price and availability.</p><button type="button" className="mt-2 font-bold underline" onClick={()=>{const product=publicCatalog.find(item=>item.id===order.productId);if(product)setSelectedProductForBuy(product as DigitalMarketProduct);else{setActiveTab('home');triggerToast('This listing is no longer available. Browse the current market.');}}}>View current listing</button></div>}
                            {/* Seller Location Agreement Action Box / Buyer Status Notice */}
                            {!isBuyer && (order.status === 'Awaiting Seller Confirmation' || !order.sellerConfirmed) && (
                              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2.5">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                  <div className="space-y-0.5">
                                    <div className="text-xs font-black text-amber-950">
                                      Action Required: Confirm Proposed Campus Meetup Location
                                    </div>
                                    <p className="text-[11px] text-amber-800 font-medium">
                                      The buyer selected <strong>"{order.meetingLocation}"</strong> as the proposed handover spot. Please inspect the coordinates and confirm if you agree.
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  {order.meetingLatitude != null && order.meetingLongitude != null && (
                                    <button
                                      type="button"
                                      onClick={() => setViewingOrderMap(order)}
                                      className="px-3 py-1.5 bg-white hover:bg-amber-100/70 border border-amber-300 text-amber-900 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                    >
                                      <Compass className="w-3.5 h-3.5 text-amber-700" />
                                      <span>Inspect on Campus Map</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={confirmingLocationId === order.id}
                                    onClick={() => handleAgreeToMeetupLocation(order.id)}
                                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>{confirmingLocationId === order.id ? 'Confirming...' : 'Agree & Confirm Purchase'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={confirmingLocationId === order.id}
                                    onClick={() => handleDeclineMeetupLocation(order.id)}
                                    className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    Decline Spot
                                  </button>
                                </div>
                              </div>
                            )}

                            {isBuyer && order.status === 'Awaiting Seller Confirmation' && (
                              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-blue-600 animate-spin-slow shrink-0" />
                                  <p className="text-xs text-blue-900 font-semibold">
                                    Map coordinates sent to merchant. Awaiting seller's confirmation on the meetup location before handover.
                                  </p>
                                </div>
                                {order.meetingLatitude != null && order.meetingLongitude != null && (
                                  <button
                                    type="button"
                                    onClick={() => setViewingOrderMap(order)}
                                    className="px-3 py-1 bg-white hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                  >
                                    View Pinned Spot
                                  </button>
                                )}
                              </div>
                            )}

                            {(order.sellerConfirmed || order.status === 'Pending Meetup') && (
                              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span>Meetup location agreed by seller. Purchase is locked in! 📍</span>
                                </div>
                                {order.meetingLatitude != null && order.meetingLongitude != null && (
                                  <button
                                    type="button"
                                    onClick={() => setViewingOrderMap(order)}
                                    className="text-[11px] text-emerald-700 underline font-extrabold hover:text-emerald-900 cursor-pointer"
                                  >
                                    View on Map
                                  </button>
                                )}
                              </div>
                            )}

                            <OrderTimeline order={order}/>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-10 text-center text-slate-400 space-y-3">
                      <Clock className="w-10 h-10 mx-auto text-slate-300" />
                      <div>
                        <h4 className="text-sm font-bold text-slate-700">No Orders or Campus Meetups Yet</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Browse the Student Marketplace to place an order and schedule a safe campus meetup.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {showMerchantCard && <AccountStatusDialog title="Merchant Registration" overlayClassName="pv-merchant-registration-overlay" onClose={() => setShowMerchantCard(false)}>
          {merchantRegistration.isPending ? <p role="status">Checking registration…</p> : merchantRegistration.isError ?
            <p role="alert">Could not refresh your merchant registration. Close this card and retry the status button.</p> :
            <MerchantAccountPanel digitalMarketApp={digitalMarketApp} digitalMarketStore={digitalMarketStore} marketPrices={marketPrices}
              onRegister={() => void openMerchantRegistration()} handleQuickMerchantLogin={handleQuickMerchantLogin} />}
        </AccountStatusDialog>}
        {showManagerCard && <AccountStatusDialog title="Manager Registration" onClose={() => setShowManagerCard(false)}>
          {managerRegistration.isPending ? <p role="status">Checking registration…</p> : managerRegistration.isError ?
            <p role="alert">Could not refresh your manager registration. Close this card and retry the status button.</p> :
            <ManagerRegistrationCard managerAccount={managerAccount} onRegister={() => void openManagerRegistration()} onLogin={() => navigate('/login')} />}
        </AccountStatusDialog>}
        {showMarketChat && <AccountStatusDialog title="Buyer–Seller Messages" onClose={() => setShowMarketChat(false)}>
          <MarketplaceInbox initialPeerEmail={activeChatEmail} initialStore={(activeChatStore)} />
        </AccountStatusDialog>}

        {showStoreSetupModal && <DashboardOverlay onClose={() => setShowStoreSetupModal(false)} aria-label="Seller checkout" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6"><h2 className="text-xl font-bold">Activate your seller account</h2><p>Sign in with your seller password to save store details and pay the current registration, monthly plan and two-month fees through Paystack.</p><button onClick={() => navigate('/login')} className="rounded-xl bg-blue-600 px-5 py-3 text-white">Sign in as seller</button><button onClick={() => setShowStoreSetupModal(false)} className="ml-3 text-slate-600">Close</button></section></DashboardOverlay>}

        {/* DIGITAL STORE LOGIN MODAL */}
        {showMerchantStoreLoginModal && (
          <DashboardOverlay aria-label="Digital Store Secure Login" onClose={() => setShowMerchantStoreLoginModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 animate-scaleIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Store className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Digital Store Secure Login</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Merchant Authentication Gateway</p>
                  </div>
                </div>

                <button aria-label="Close dialog"
                  type="button"
                  onClick={() => setShowMerchantStoreLoginModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-[11px] text-blue-900 space-y-1">
                <div className="font-extrabold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                  <span>Institutional Credential Check</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {('Enter your verified student email and password. If this email also opens your resident account, use the seller portal PIN when prompted.')}
                </p>
              </div>

              {storeLoginError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                  <X className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{storeLoginError}</span>
                </div>
              )}

              <form onSubmit={handleMerchantStoreLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    Student Email (Registered during Store Creation)
                  </label>
                  <input aria-label="Student Email (Registered during Store Creation)"
                    type="email"
                    required
                    placeholder="e.g. alex@st.knust.edu.gh"
                    value={storeLoginEmail}
                    onChange={(e) => { setStoreLoginEmail(e.target.value);setStoreNeedsPin(false);setStorePortalPin(''); }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    Digital Store Password
                  </label>
                  <input aria-label="Digital Store Password"
                    type="password"
                    required
                    placeholder="Enter store password"
                    value={storeLoginPassword}
                    onChange={(e) => setStoreLoginPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>

                {storeNeedsPin && <div>
                  <label htmlFor="seller-portal-pin" className="block text-xs font-bold text-slate-800 mb-1">Seller portal access PIN</label>
                  <input id="seller-portal-pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required
                    value={storePortalPin} onChange={e => setStorePortalPin(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600" />
                </div>}
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowMerchantStoreLoginModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={storeLoginLoading}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <LogIn className="w-4 h-4 text-white" />
                    <span>{storeLoginLoading ? "Validating..." : "Log In to Digital Store"}</span>
                  </button>
                </div>
              </form>
            </div>
          </DashboardOverlay>
        )}

        {/* MULTI-PHASE DIGITAL MARKET STORE ONBOARDING WIZARD MODAL */}
        {storeOnboardingModalOpen && <DashboardOverlay onClose={() => setStoreOnboardingModalOpen(false)} aria-label="Seller onboarding checkout" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6"><h2 className="text-xl font-bold">Activate your seller account</h2><p>Sign in with your seller password to save store details and pay the current registration, monthly plan and two-month fees through Paystack.</p><button onClick={() => navigate('/login')} className="rounded-xl bg-blue-600 px-5 py-3 text-white">Sign in as seller</button><button onClick={() => setStoreOnboardingModalOpen(false)} className="ml-3 text-slate-600">Close</button></section></DashboardOverlay>}

        {/* ADD PRODUCT MODAL */}
        {showAddProductModal && (
          <DashboardOverlay aria-label="List New Product" onClose={() => setShowAddProductModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  List New Product
                </h3>
                <button aria-label="Close dialog" type="button" onClick={() => setShowAddProductModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddProduct} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Product Title</label>
                  <input aria-label="Product Title"
                    type="text"
                    required
                    placeholder="e.g. Pharmacy Textbook / HP Laptop"
                    value={prodTitle}
                    onChange={e => setProdTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Price (GHS)</label>
                    <input aria-label="Price (GHS)"
                      type="number"
                      required
                      placeholder="150"
                      value={prodPrice}
                      onChange={e => setProdPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Stock Quantity</label>
                    <input aria-label="Stock Quantity"
                      type="number"
                      required
                      placeholder="5"
                      value={prodStock}
                      onChange={e => setProdStock(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select aria-label="Category"
                    value={prodCategory}
                    onChange={e => setProdCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  >
                    {DIGITAL_MARKET_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Item Description</label>
                  <textarea aria-label="Item Description"
                    rows={2}
                    placeholder="Condition, specs, or details..."
                    value={prodDesc}
                    onChange={e => setProdDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddProductModal(false)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingProd}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    {submittingProd ? 'Listing...' : 'List Item'}
                  </button>
                </div>
              </form>
            </div>
          </DashboardOverlay>
        )}

        {showNearbyServices && <NearbyServicesMap products={publicCatalog} onClose={() => { setShowNearbyServices(false); setNearbyDirections(''); }} onInspect={(product, url) => {
          setSelectedProductForBuy(product as DigitalMarketProduct);
          setSelectedPriceCategory(product.priceCategories?.[0] || null);
          setNearbyDirections(url);
        }} />}

        {/* BUY / INSPECT / SERVICE PRODUCT MODAL */}
        {viewingStoreId && <DashboardOverlay aria-label="Merchant storefront" onClose={() => setViewingStoreId(null)} className="fixed inset-0 bg-slate-950/65 backdrop-blur-xl flex items-center justify-center p-2 sm:p-5"><section className="relative w-full max-w-6xl max-h-[94dvh] overflow-y-auto rounded-3xl border border-blue-200 bg-white/75 backdrop-blur-2xl p-4 sm:p-7"><div className="flex justify-end mb-3"><button type="button" aria-label="Close storefront" onClick={() => setViewingStoreId(null)} className="p-2 text-slate-600"><X size={20} /></button></div><MarketStorefront key={viewingStoreId} storeId={viewingStoreId} initialMessage={storeMessageOnOpen} onInspect={product => { setSelectedProductForBuy(product as DigitalMarketProduct); setSelectedPriceCategory(product.priceCategories?.[0] as any || null); }} /></section></DashboardOverlay>}

        {selectedProductForBuy && (() => {
          const isSelectedService = isMarketService(selectedProductForBuy);
          const serviceActionLabel = isSelectedService ? getServiceActionLabel(selectedProductForBuy as any) : 'Request to Buy';
          const displayLoc = (selectedProductForBuy as any).location || (selectedProductForBuy as any).meetingLocation;
          const serviceCallLine = (selectedProductForBuy as any).callLine || selectedProductForBuy.sellerPhone;
          const serviceSchedule = (selectedProductForBuy as any).isOpen247
            ? 'Available 24/7'
            : [(selectedProductForBuy as any).workingDays,
               [(selectedProductForBuy as any).openingTime, (selectedProductForBuy as any).closingTime].filter(Boolean).join(' – ')
              ].filter(Boolean).join(' · ');

          return (
            <DashboardOverlay aria-label={`Inspect ${selectedProductForBuy.title}`} onClose={() => setSelectedProductForBuy(null)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4">
              <div className="bg-white rounded-3xl max-w-[calc(100vw-1rem)] sm:max-w-lg w-full max-h-[88dvh] sm:max-h-[92vh] overflow-y-auto p-3 sm:p-6 shadow-2xl border border-slate-200 space-y-3 sm:space-y-4 animate-scaleIn">
                {marketActionError && <p data-market-action-error role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{marketActionError}</p>}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <h3 className="text-base font-black text-slate-900 break-words">{selectedProductForBuy.title}</h3>
                    {isSelectedService && (
                      <span className="px-2 py-0.5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white text-[9px] font-black rounded-md shadow-2xs shrink-0 flex items-center gap-1 border border-blue-400/30">
                        <PineWordmark />
                        <span>(Service)</span>
                      </span>
                    )}
                  </div>
                  <button aria-label="Close dialog" type="button" onClick={() => setSelectedProductForBuy(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {isSelectedService && nearbyDirections && <a href={nearbyDirections} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="block text-xs font-bold text-blue-700">Open Google Maps directions</a>}
                  <ReportButton targetType="listing" targetId={selectedProductForBuy.id} targetName={selectedProductForBuy.title} />
                  <MarketImageGallery title={selectedProductForBuy.title} imageUrl={selectedPriceCategory?.imageUrl || selectedProductForBuy.imageUrl}
                    additionalImages={isSelectedService ? [selectedProductForBuy.imageUrl, ...(selectedProductForBuy.priceCategories || []).map(c => c.imageUrl || '')] : selectedProductForBuy.additionalImages} />

                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-black text-emerald-600">
                        GHS {selectedPriceCategory ? selectedPriceCategory.price : selectedProductForBuy.price}
                      </span>
                      {selectedPriceCategory ? (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100/90 px-2 py-0.5 rounded-md">
                          {selectedPriceCategory.name}
                        </span>
                      ) : isSelectedService ? (
                        <span className="text-[10px] font-bold text-slate-400">(starting rate)</span>
                      ) : null}
                    </div>
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg">
                      {selectedProductForBuy.sellerUniversity}
                    </span>
                  </div>

                  {/* Price Categories Selection in Inspect Modal */}
                  {Array.isArray((selectedProductForBuy as any).priceCategories) && (selectedProductForBuy as any).priceCategories.length > 0 && (
                    <div className="p-2 sm:p-3 bg-blue-50/70 border border-blue-200/90 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-blue-600" />
                          <span>Choose Price Category:</span>
                        </span>
                        <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200 shadow-2xs">
                          In Cedis (GH₵)
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(selectedProductForBuy as any).priceCategories.map((cat: any, idx: number) => {
                          const isSelected = selectedPriceCategory?.name === cat.name;
                          return (
                            <button
                              key={cat.id || idx}
                              type="button"
                              onClick={() => setSelectedPriceCategory(cat)}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm ring-2 ring-blue-400/30'
                                  : 'bg-white border-slate-200 text-slate-800 hover:border-blue-300 hover:bg-slate-50'
                              }`}
                            >
                              {cat.imageUrl && <img src={cat.imageUrl} alt={cat.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                              <div className="min-w-0">
                                <div className={`text-xs font-black truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                  {cat.name}
                                </div>
                                <div className={`text-[10px] font-semibold ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                  Option
                                </div>
                              </div>
                              <div className={`text-xs font-black font-mono shrink-0 px-2 py-0.5 rounded-lg ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              }`}>
                                GH₵ {cat.price}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Campus Service Details: Location & Call Line */}
                  {isSelectedService && (displayLoc || serviceCallLine || serviceSchedule) && (
                    <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-2">
                      <div className="text-[10px] font-black text-blue-900 uppercase tracking-wider flex items-center gap-1">
                        <span>Campus Service Provider Info</span>
                      </div>
                      {serviceSchedule && (
                        <p className="text-xs text-slate-700 font-semibold break-words">Hours: {serviceSchedule}</p>
                      )}
                      {displayLoc && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-semibold">
                          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Campus Location: <strong>{displayLoc}</strong></span>
                        </div>
                      )}
                      {serviceCallLine && (
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-blue-100">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-mono">Call Line: {serviceCallLine}</span>
                          </div>
                          <a
                            href={`tel:${serviceCallLine}`}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg transition-colors shadow-2xs"
                          >
                            Call Provider
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedProductForBuy.storeId && <button type="button" onClick={() => { setStoreMessageOnOpen(false); setViewingStoreId(selectedProductForBuy.storeId); setSelectedProductForBuy(null); }} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black text-blue-800">View Store</button>}
                  <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words font-medium">
                    {selectedProductForBuy.description || 'No description provided.'}
                  </p>

                  {/* Seller Information Block */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center overflow-hidden border border-blue-400/20 shrink-0 shadow-xs">
                          {(selectedProductForBuy as any).storeLogoUrl ? (
                            <img src={(selectedProductForBuy as any).storeLogoUrl} alt={selectedProductForBuy.storeName} className="w-full h-full object-cover" />
                          ) : (
                            <Store className="w-5 h-5 text-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate">{selectedProductForBuy.storeName}</div>
                          <div className="text-[10px] font-bold text-slate-500 truncate">
                            {isSelectedService ? 'Service Provider' : 'Merchant'}: {selectedProductForBuy.sellerName || 'Verified Merchant'}
                          </div>
                        </div>
                      </div>

                      {/* Calculated Average Star Rating */}
                      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl text-amber-900 shadow-2xs shrink-0">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-500 shrink-0" />
                        <div className="flex flex-col items-start leading-none">
                          <span className="text-xs font-black">
                            {(selectedProductForBuy as any).ratingCount
                              ? Number((selectedProductForBuy as any).storeRating).toFixed(1)
                              : 'Unrated'}
                          </span>
                          <span className="text-[8.5px] text-amber-700/80 font-extrabold">
                            {(selectedProductForBuy as any).ratingCount ? `${(selectedProductForBuy as any).ratingCount} ratings` : 'New Store'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-500 space-y-1 pl-1">
                      <div>Email: <span className="text-slate-700 font-bold">{selectedProductForBuy.sellerEmail}</span></div>
                      {(selectedProductForBuy.sellerPhone || (selectedProductForBuy as any).callLine) && (
                        <div>Phone / WhatsApp: <span className="text-slate-700 font-bold">{(selectedProductForBuy as any).callLine || selectedProductForBuy.sellerPhone}</span></div>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-900 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      {isSelectedService ? (
                        <span><strong>Service Safety Guarantee:</strong> Confirm details and meet the student service provider on campus. Never make unverified advance payments.</span>
                      ) : (
                        <span><strong>Anti-Scam Guarantee:</strong> Meet the student merchant at a safe campus location to inspect this item before paying.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 font-bold self-start sm:self-center">
                    Contact: <span className="text-slate-900 font-black">{selectedProductForBuy.sellerEmail}</span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => handleStartChat(selectedProductForBuy)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                      <span>Chat</span>
                    </button>
                    <button disabled={!marketListingAvailable(selectedProductForBuy)}
                      type="button"
                      onClick={() => {
                        setSelectedProdForOrder(selectedProductForBuy);
                        setOrderQtyInput(1);
                        setBuyerPhoneInput(currentUser?.phone || '');
                        const isService = isMarketService(selectedProductForBuy);
                        const serviceMode = (selectedProductForBuy as any).serviceLocationMode || 'flexible';
                        const useSellerLocation = isService && (serviceMode === 'fixed' || serviceMode === 'hybrid');
                        setServiceLocationOption(useSellerLocation ? 'seller-location' : 'buyer-location');
                        if (useSellerLocation) {
                          setOrderMeetupLocation((selectedProductForBuy as any).location || selectedProductForBuy.meetingLocation || 'Provider service location');
                          const pin = servicePoint(selectedProductForBuy.lat, selectedProductForBuy.lng);
                          setOrderMeetupLat(pin?.lat ?? null);
                          setOrderMeetupLng(pin?.lng ?? null);
                        } else if (isService) {
                          setOrderMeetupLocation('');
                          setOrderMeetupLat(null);
                          setOrderMeetupLng(null);
                        }
                        setSelectedProductForBuy(null);
                      }}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                    >
                      <span>{!marketListingAvailable(selectedProductForBuy) ? isSelectedService ? 'Unavailable' : 'Sold out' : serviceActionLabel}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </DashboardOverlay>
          );
        })()}

        {/* ORDER / MEETUP / SERVICE REQUEST MODAL */}
        {selectedProdForOrder && (() => {
          const isOrderService = isMarketService(selectedProdForOrder);
          const orderActionVerb = isOrderService ? getServiceActionLabel(selectedProdForOrder as any) : 'Initiate Buy Request';
          const activeOrderUnitPrice = (selectedPriceCategory && selectedPriceCategory.price !== undefined)
            ? Number(selectedPriceCategory.price)
            : selectedProdForOrder.price;
          const serviceLocationMode = isOrderService ? ((selectedProdForOrder as any).serviceLocationMode || 'flexible') : 'flexible';
          const buyerChoosesLocation = !isOrderService || serviceLocationMode === 'flexible' || (serviceLocationMode === 'hybrid' && serviceLocationOption === 'buyer-location');

          return (
            <DashboardOverlay aria-label="Request to Buy or Book" onClose={() => setSelectedProdForOrder(null)} layer={200} className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4">
              <div className={`bg-white rounded-3xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleIn max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] overflow-y-auto overscroll-contain scroll-pb-24 ${
                isOrderService ? 'max-w-[calc(100vw-1rem)] sm:max-w-2xl lg:max-w-4xl pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6' : 'max-w-md'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      {isOrderService ? 'Request Campus Service' : 'Request to Buy'}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold">{selectedProdForOrder.title}</p>
                  </div>
                  <button aria-label="Close dialog" type="button" onClick={() => setSelectedProdForOrder(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handlePlaceOrder} className={isOrderService ? 'grid gap-4 lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4' : 'space-y-4'}>
                {marketActionError && <p data-market-action-error role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{marketActionError}</p>}
                  {/* Price Categories Choice in Order Modal */}
                  {Array.isArray((selectedProdForOrder as any).priceCategories) && (selectedProdForOrder as any).priceCategories.length > 0 && (
                    <div className={`p-3 bg-blue-50/80 border border-blue-200/90 rounded-2xl space-y-2 ${isOrderService ? 'lg:col-span-2' : ''}`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-blue-600" />
                          <span>Price Category Selected:</span>
                        </label>
                        <span className="text-[9.5px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200 shadow-2xs">
                          In Cedis (GH₵)
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(selectedProdForOrder as any).priceCategories.map((cat: any, idx: number) => {
                          const isSelected = selectedPriceCategory?.name === cat.name;
                          return (
                            <button
                              key={cat.id || idx}
                              type="button"
                              onClick={() => setSelectedPriceCategory(cat)}
                              className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs ring-2 ring-blue-400/30'
                                  : 'bg-white border-slate-200 text-slate-800 hover:border-blue-300'
                              }`}
                            >
                              {cat.imageUrl && <img src={cat.imageUrl} alt={cat.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                              <span className={`text-[11px] font-black truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>{cat.name}</span>
                              <span className={`text-[11px] font-bold font-mono shrink-0 ${isSelected ? 'text-white' : 'text-emerald-700'}`}>
                                GH₵ {cat.price}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      {isOrderService ? 'Unit Rate / Fee' : 'Item Unit Price'}
                    </label>
                    <div className="text-base font-extrabold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <span>GHS {activeOrderUnitPrice}</span>
                      {selectedPriceCategory && (
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md">
                          {selectedPriceCategory.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        {isOrderService ? 'Quantity / Portions / Sessions' : 'Quantity'}
                      </label>
                      <input aria-label="Order quantity"
                        type="number"
                        min={1}
                        max={isOrderService ? 50 : (selectedProdForOrder.stockQuantity || 1)}
                        value={orderQtyInput}
                        onChange={e => setOrderQtyInput(Math.min(isOrderService ? 50 : (selectedProdForOrder.stockQuantity || 1), Math.max(1, Number(e.target.value) || 1)))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <span className="text-[10px] text-slate-400 font-medium">
                        {isOrderService ? 'Open for student bookings' : `Stock: ${selectedProdForOrder.stockQuantity} available`}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Total Price</label>
                      <div className="text-base font-extrabold text-slate-800 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 h-9 flex items-center">
                        GHS {activeOrderUnitPrice * orderQtyInput}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {isOrderService && serviceLocationMode === 'hybrid' && (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3 space-y-2">
                        <p className="text-xs font-black text-slate-800">Choose how you want this service fulfilled</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button type="button" onClick={() => { setServiceLocationOption('seller-location'); setOrderMeetupLocation((selectedProdForOrder as any).location || selectedProdForOrder.meetingLocation || 'Provider service location'); const pin = servicePoint(selectedProdForOrder.lat, selectedProdForOrder.lng); setOrderMeetupLat(pin?.lat ?? null); setOrderMeetupLng(pin?.lng ?? null); }} className={`rounded-xl border p-2 text-left text-[11px] font-bold ${serviceLocationOption === 'seller-location' ? 'border-blue-600 bg-white text-blue-900' : 'border-blue-100 bg-white/60 text-slate-600'}`}>Meet at provider's fixed location</button>
                          <button type="button" onClick={() => setServiceLocationOption('buyer-location')} className={`rounded-xl border p-2 text-left text-[11px] font-bold ${serviceLocationOption === 'buyer-location' ? 'border-blue-600 bg-white text-blue-900' : 'border-blue-100 bg-white/60 text-slate-600'}`}>Request delivery / choose my location</button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-600" />
                        <span>{!buyerChoosesLocation ? 'Provider\'s Fixed Service Location' : (isOrderService ? 'Your Service / Delivery Location' : 'Proposed Campus Meetup Location')}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowMeetupMapModal(true)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Compass className="w-3 h-3 text-blue-600" />
                        <span>{buyerChoosesLocation ? (orderMeetupLat ? '📍 Update Map Coordinates' : '🗺️ Select on Campus Map') : '🗺️ View on Map'}</span>
                      </button>
                    </div>

                    <input aria-label="Delivery or handover location"
                      type="text"
                      required={buyerChoosesLocation}
                      readOnly={!buyerChoosesLocation}
                      value={orderMeetupLocation}
                      onChange={e => setOrderMeetupLocation(e.target.value)}
                      placeholder="e.g. Unity Hall Block B, Room 14 / KNUST Commercial Area"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />

                    {orderMeetupLat!==null && orderMeetupLng!==null ? (
                      <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800">
                        <div className="flex items-center gap-1.5 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Exact GPS Coordinates: <span className="font-mono">{orderMeetupLat.toFixed(4)}, {orderMeetupLng.toFixed(4)}</span></span>
                        </div>
                        {buyerChoosesLocation && <button
                          type="button"
                          onClick={() => setShowMeetupMapModal(true)}
                          className="text-[10px] text-emerald-700 underline font-bold hover:text-emerald-900 cursor-pointer"
                        >
                          Adjust Pin
                        </button>}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 font-medium">{buyerChoosesLocation ? <>Click <strong>"🗺️ Select on Campus Map"</strong> to pin the exact place and transmit coordinates to the provider.</> : 'This provider requires bookings at their pinned service location. You can view it on the map.'}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Your Contact Phone Number</label>
                    <input aria-label="Your Contact Phone Number"
                      type="tel"
                      required
                      value={buyerPhoneInput}
                      onChange={e => setBuyerPhoneInput(e.target.value)}
                      placeholder="Enter your active mobile number"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-[10px] text-slate-400 font-medium">Make sure your phone number is correct so the provider can reach you directly.</p>
                  </div>

                  <div className={`pt-3 border-t border-slate-100 flex items-center justify-end gap-2 ${isOrderService ? 'lg:col-span-2' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedProdForOrder(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingOrder}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {submittingOrder ? 'Submitting Request...' : (isOrderService ? `Confirm ${orderActionVerb}` : 'Initiate Buy Request')}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              </div>
            </DashboardOverlay>
          );
        })()}

        {/* CAMPUS MEETUP MAP PICKER MODAL */}
        {showMeetupMapModal && (
          <DashboardOverlay aria-label="Choose Meetup Location" onClose={() => setShowMeetupMapModal(false)} layer={300} className="fixed inset-0 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
            <div className="max-w-2xl w-full">
              <CampusMeetupMapPicker
                latitude={orderMeetupLat ?? 6.6745}
                longitude={orderMeetupLng ?? -1.5716}
                initialLocationName={orderMeetupLocation}
                preferredUniversity={selectedProdForOrder?.sellerUniversity || currentUser?.hostelName || 'KNUST'}
                readOnly={Boolean(selectedProdForOrder && ((selectedProdForOrder as any).serviceLocationMode === 'fixed' || ((selectedProdForOrder as any).serviceLocationMode === 'hybrid' && serviceLocationOption === 'seller-location')))}
                onLocationSelect={(data) => {
                  setOrderMeetupLocation(data.locationName);
                  setOrderMeetupLat(data.latitude);
                  setOrderMeetupLng(data.longitude);
                  setShowMeetupMapModal(false);
                  triggerToast(`Pinned: ${data.locationName}`);
                }}
                onClose={() => setShowMeetupMapModal(false)}
              />
            </div>
          </DashboardOverlay>
        )}

        {/* VIEW ORDER PINNED MEETUP SPOT MODAL */}
        {viewingOrderMap && (
          <DashboardOverlay aria-label="Order Meetup Location" onClose={() => setViewingOrderMap(null)} className="fixed inset-0 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
            <div className="max-w-2xl w-full">
              <CampusMeetupMapPicker
                latitude={viewingOrderMap.meetingLatitude ?? 6.6745}
                longitude={viewingOrderMap.meetingLongitude ?? -1.5716}
                initialLocationName={viewingOrderMap.meetingLocation}
                readOnly={true}
                preferredUniversity={viewingOrderMap.university}
                onClose={() => setViewingOrderMap(null)}
              />
            </div>
          </DashboardOverlay>
        )}

        {/* VERIFY DELIVERY / BUYER PIN MODAL */}
        {verifyingOrderTarget && (
          <DashboardOverlay aria-label="Verify Customer Pickup PIN" onClose={() => setVerifyingOrderTarget(null)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 animate-scaleIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Verify Customer Pickup PIN</h3>
                    <p className="text-[11px] text-slate-400">Order ID: #{verifyingOrderTarget.id.slice(-8)}</p>
                  </div>
                </div>

                <button aria-label="Close dialog"
                  type="button"
                  onClick={() => setVerifyingOrderTarget(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Product:</span>
                  <span className="font-bold text-slate-950">{verifyingOrderTarget.productTitle}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Buyer:</span>
                  <span className="font-bold text-slate-950">{verifyingOrderTarget.buyerName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Quantity:</span>
                  <span className="font-bold text-slate-950">{verifyingOrderTarget.quantity} unit(s)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Total Amount:</span>
                  <span className="font-black text-emerald-600 font-mono">GHS {verifyingOrderTarget.totalAmount?.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Meetup Spot:</span>
                  <span className="font-bold text-slate-950 truncate max-w-[200px]">{verifyingOrderTarget.meetingLocation}</span>
                </div>
              </div>

              <form onSubmit={handleVerifyPinOrder} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-800">
                    Ask Buyer for 6-Digit Delivery PIN:
                  </label>
                  <p className="text-[11px] text-slate-500">
                    The student buyer sees this six-digit code in their order history. Enter it to confirm physical handover and release payment.
                  </p>
                  <input aria-label="Ask Buyer for 6-Digit Delivery PIN:"
                    type="text"
                    maxLength={6}
                    required
                    placeholder="• • • •"
                    value={inputPinValue}
                    onChange={(e) => setInputPinValue(e.target.value.replace(/\D/g, ''))}
                    className="w-full py-3 bg-blue-50 border-2 border-blue-400 rounded-2xl text-center text-3xl font-black font-mono tracking-widest text-blue-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setVerifyingOrderTarget(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pinSubmitting || inputPinValue.length !== 6}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {pinSubmitting ? "Verifying..." : "Verify & Complete"}
                  </button>
                </div>
              </form>
            </div>
          </DashboardOverlay>
        )}

        {/* TAB 2: OPTIONS TAB */}
        {activeTab === 'options' && (
          <div className="space-y-6 animate-fadeIn relative z-10 max-w-[1400px]">
            <AppearanceSettings />
            <section className="user-merchant-settings rounded-2xl border border-blue-200 bg-white p-4 space-y-3" aria-labelledby="merchant-settings-title">
              <div><h3 id="merchant-settings-title" className="font-bold text-slate-900">Merchant account</h3>
                <p className="mt-1 text-sm text-slate-600">Apply, track your registration or open your store.</p></div>
              <RegistrationStatusButton kind="merchant" status={merchantStatus} loading={merchantRegistration.isPending || checkingMerchant}
                error={merchantRegistration.isError} onClick={() => void openMerchantRegistration()} />
            </section>
            <div className="user-options-card bg-white/90 border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="user-section-title text-lg font-black text-slate-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-slate-800" />
                    User Options & Account Preferences
                  </h3>
                  <p className="user-section-description text-xs text-slate-500 font-semibold mt-0.5">
                    Manage your resident profile, avatar, registered accounts, security credentials, and session options.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="space-y-4">
              {/* USER AVATAR SELECTOR & DISPLAY COMPONENT */}
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
                  triggerToast('Profile avatar updated successfully!');
                }}
              />

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {renderAvatarGraphic(currentUser?.avatar, "w-10 h-10 text-xs")}
                    <div>
                      <div className="text-xs font-black text-slate-900">{currentUser?.name || 'PineVela Resident'}</div>
                      <div className="text-[10px] text-slate-500">{currentUser?.email || 'resident@pinevela.com'}</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-lg">Verified Account</span>
                </div>

              </div>

              </div>

              <div className="space-y-4 pt-4 xl:pt-0 xl:border-t-0 border-t border-slate-100">
                {/* REGISTERED RESIDENT ACCOUNT MANAGEMENT */}
                {(roomKeyDetails || currentUser?.roomKey || registeredAccounts.residentAccount) && (
                  <div className="p-5 bg-gradient-to-br from-blue-50/80 to-indigo-50/60 border border-blue-200 rounded-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-blue-600 text-white">
                          <Key className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-900">Registered Resident Account</h4>
                          <p className="text-[10px] text-blue-700 font-bold">
                            {roomKeyDetails?.hostelName || registeredAccounts.residentAccount?.hostelName || 'PineVela Student Residence'}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-black">
                        Room Active
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-white/70 p-3 rounded-xl border border-blue-100">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Room & Block</span>
                        <span className="font-bold text-slate-800">{roomKeyDetails?.blockName || 'Block A'}, Room {roomKeyDetails?.roomNumber || '101'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Digital Room Key</span>
                        <span className="font-bold text-slate-800 font-mono text-[11px]">{roomKeyDetails?.roomKey || currentUser?.roomKey}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Student / Resident ID</span>
                        <span className="font-bold text-slate-800">{roomKeyDetails?.assignedStudentId || currentUser?.studentId || 'Resident'}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-blue-100">
                      <button
                        type="button"
                        onClick={() => openResetPasswordModal('resident', registeredAccounts.residentAccount?.email || currentUser?.email || '')}
                        className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{('Resident account security')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteAccountModal('resident', registeredAccounts.residentAccount?.email || currentUser?.email || '')}
                        className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{('Resident room access')}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
                    <h4 className="text-xs font-black text-slate-900">Digital Room Key Activation</h4>
                    <p className="text-xs text-slate-600 font-medium">
                      {roomKeyDetails ? `${roomKeyDetails.hostelName} (${roomKeyDetails.blockName}, ${roomKeyDetails.roomNumber})` : 'Not linked to a room key yet.'}
                    </p>
                    <button
                      onClick={() => setShowClaimModal(true)}
                      className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
                    >
                      {roomKeyDetails ? 'Switch Room Key' : 'Activate Room Key Now'}
                    </button>
                  </div>

                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
                    <h4 className="text-xs font-black text-slate-900">Session Management</h4>
                    <p className="text-xs text-slate-600 font-medium">
                      Securely sign out of your PineVela resident session across devices.
                    </p>
                    <button
                      onClick={() => setShowSignoutConfirmModal(true)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-black rounded-xl cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>

                {/* MY SAVED WISHLIST CARD */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="p-5 bg-gradient-to-br from-rose-50/70 to-amber-50/50 border border-rose-100 rounded-2xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 pb-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <div className="shrink-0 p-2 rounded-xl bg-rose-50 text-rose-600 shadow-md shadow-rose-500/20">
                          <Heart data-semantic-icon="favorite" className="w-4 h-4" fill="currentColor" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-900">My Saved Wishlist</h4>
                          <p className="text-[10px] text-slate-500">
                            Your saved marketplace products and room gear.
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-rose-100 text-rose-800 text-[10px] font-black uppercase rounded-lg">
                        {wishlist.length} {wishlist.length === 1 ? 'Item' : 'Items'} Saved
                      </span>
                    </div>

                    {wishlist.length === 0 ? (
                      <div className="p-6 text-center bg-white/70 rounded-xl border border-dashed border-rose-200/60 space-y-2">
                        <Heart data-semantic-icon="favorite" className="w-6 h-6 text-rose-600 mx-auto" />
                        <div className="text-xs font-bold text-slate-700">Your wishlist is empty</div>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Browse the Student Digital Market on the Home tab and tap the heart icon to save products!
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('home');
                            setHomeFilterType('market');
                            scrollToSection('home-market-section', 'market');
                          }}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Explore Marketplace
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                        {publicCatalog.filter(p => wishlist.includes(p.id)).map(product => (
                          <div 
                            key={product.id}
                            data-market-plan={product.subscriptionPlan || 'default'}
                            className="market-plan-card bg-white/75 border border-slate-200/60 rounded-3xl overflow-hidden shadow-2xs hover:bg-white/90 hover:border-rose-400 hover:shadow-xs transition-all duration-200 flex flex-col justify-between transform-gpu"
                          >
                            <div className="relative h-28 bg-slate-900/5 overflow-hidden flex items-center justify-center p-1 shrink-0">
                              <ListingPlanBadge plan={product.subscriptionPlan} />
                              <img 
                                src={optimizeImageDisplayUrl(product.imageUrl, 220, 30)}
                                alt={product.title}
                                className="w-full h-full object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => toggleFavorite(product.id)}
                                className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-white/90 text-rose-500 border border-rose-100 hover:scale-110 shadow-xs transition-transform cursor-pointer"
                                title="Remove item"
                              >
                                <Heart data-semantic-icon="favorite" className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                              </button>
                              <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-emerald-600 text-white text-[9px] font-black rounded-md shadow-xs">
                                GHS {product.price}
                              </div>
                            </div>
                            <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                              <div>
                                <h5 className="text-[11px] font-black text-slate-900 line-clamp-1">{product.title}</h5>
                                <p className="text-[9px] text-slate-500 line-clamp-1 mt-0.5">{product.storeName}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProductForBuy(product);
                                  setSelectedPriceCategory(product.priceCategories?.[0] || null);
                                }}
                                className="w-full py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-black rounded-lg transition-colors text-center border border-rose-100 cursor-pointer"
                              >
                                {(product.isService || product.category === 'Services' || (product as any).serviceCategory || product.category?.toLowerCase().includes('service')) 
                                  ? getServiceActionLabel(product as any) 
                                  : 'Inspect & Buy'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: NOTIFICATIONS TAB */}
      </main>

      <PineVelaCompanion unreadCount={unreadNotificationsCount} navigationTarget={companionNavigationTarget} />

      {/* ========================================================================= */}
      {/* MODAL 1: REPORT MAINTENANCE ISSUE (WITH PICTURE PROOF & GLASSY FINISH) */}
      {/* ========================================================================= */}
      {showNewIssueModal && (
        <DashboardOverlay aria-label="Report Room Maintenance Issue" onClose={() => setShowNewIssueModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-2xl rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-sky-200/80 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-blue-100">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Report Room Maintenance Issue</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Auto-dispatched to <strong>{currentUser?.hostelName || 'Hostel Operations Manager'}</strong>
                  </p>
                </div>
              </div>
              <button aria-label="Close dialog"
                type="button"
                onClick={() => setShowNewIssueModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitIssue} className="space-y-4">
              
              {/* Readonly Auto-filled Room & Student Details */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Student</div>
                  <div className="font-bold text-slate-900 truncate">{currentUser?.name || 'Resident'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Student ID</div>
                  <div className="font-bold text-slate-900 truncate">{currentUser?.studentId || 'STU-2026'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Block</div>
                  <div className="font-bold text-slate-900 truncate">{currentUser?.blockName || 'Block A'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Room</div>
                  <div className="font-bold text-slate-900 truncate">{currentUser?.roomNumber || 'Room 101'}</div>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 block">
                  Issue Title <span className="text-rose-600">*</span>
                </label>
                <input aria-label="Issue Title"
                  type="text"
                  required
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="e.g., Leaking bathroom pipe, Broken desk chair, AC cooling fault"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-400/20"
                />
              </div>

              {/* Category & Urgency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-800 block">Category</label>
                  <select aria-label="Category"
                    value={issueCategory}
                    onChange={(e) => setIssueCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                  >
                    {['Plumbing', 'Electrical', 'HVAC / Cooling', 'Carpentry & Doors', 'Furniture', 'Sanitation', 'Lock & Key', 'Wi-Fi / Network', 'Other'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-800 block">Urgency Level</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['Low', 'Medium', 'High'] as const).map(lvl => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setIssueUrgency(lvl)}
                        className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                          issueUrgency === lvl
                            ? lvl === 'High'
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : lvl === 'Medium'
                              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                              : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detailed Description */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 block">
                  Detailed Description <span className="text-rose-600">*</span>
                </label>
                <textarea aria-label="Detailed Description"
                  required
                  rows={3}
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="Provide complete details about what is broken, where exactly in the room it is located, and when it began..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-400/20 resize-none"
                />
              </div>

              {/* PICTURE PROOF UPLOAD */}
              <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-blue-600" />
                    <span>Upload Picture Proof & Evidence</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Max 5MB each
                  </span>
                </div>

                {/* Upload Button Box */}
                <label className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 bg-white cursor-pointer transition-all text-center">
                  <Upload className="w-6 h-6 text-blue-600" />
                  <span className="text-xs font-bold text-blue-900">Click or drag photos here</span>
                  <span className="text-[10px] text-slate-400">Supports JPG, PNG, WEBP</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>

                {/* Preview thumbnails */}
                {issuePhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {issuePhotos.map((photo, pIdx) => (
                      <div key={pIdx} className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 relative group">
                        <img src={photo} alt="Preview" className="w-full h-full object-cover" />
                        <button aria-label="Remove photograph"
                          type="button"
                          onClick={() => removePhoto(pIdx)}
                          className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-0.5 opacity-90 hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contact Method */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">Preferred Update Notification</label>
                <div className="flex gap-2">
                  {(['In-app Notification', 'Phone Call', 'Email'] as const).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setIssueContactMethod(method)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        issueContactMethod === method
                          ? 'bg-blue-50 text-blue-900 border-blue-300 ring-1 ring-blue-300'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewIssueModal(false)}
                  disabled={submittingIssue}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingIssue || !issueTitle.trim() || !issueDescription.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black text-xs shadow-md shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submittingIssue ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending to Manager...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Maintenance Report</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </DashboardOverlay>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: STUDENT CONFIRMATION OF COMPLETED TASK */}
      {/* ========================================================================= */}
      {selectedIssueForConfirm && (
        <DashboardOverlay aria-label="Verify & Confirm Resolution" onClose={() => setSelectedIssueForConfirm(null)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-2xl rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-emerald-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-emerald-100">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Verify & Confirm Resolution</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Issue: <strong>{selectedIssueForConfirm.title}</strong>
                  </p>
                </div>
              </div>
              <button aria-label="Close dialog"
                type="button"
                onClick={() => setSelectedIssueForConfirm(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Staff notes & completion proof */}
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
              <div className="text-xs font-black text-emerald-950">
                Staff Completion Report:
              </div>
              <p className="text-xs text-emerald-900 font-medium">
                "{selectedIssueForConfirm.staffCompletionNotes || 'Repairs finished and inspected.'}"
              </p>
              {selectedIssueForConfirm.staffCompletionPhoto && (
                <div className="pt-1">
                  <img role="button" tabIndex={0} aria-label="View repair completion photograph" onKeyDown={activateOnKeyboard}
                    src={selectedIssueForConfirm.staffCompletionPhoto}
                    alt="Proof"
                    onClick={() => setZoomedImage(selectedIssueForConfirm.staffCompletionPhoto!)}
                    className="w-20 h-20 object-cover rounded-xl border border-emerald-300 cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-slate-800 block">
                Resident Feedback / Notes (Optional)
              </label>
              <textarea aria-label="Resident Feedback / Notes (Optional)"
                rows={2}
                value={confirmFeedback}
                onChange={(e) => setConfirmFeedback(e.target.value)}
                placeholder="e.g., Tested water pressure and everything is clean and fixed perfectly!"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600 resize-none"
              />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={submittingConfirm}
                onClick={() => handleConfirmResolution(false)}
                className="px-4 py-2.5 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs transition-all cursor-pointer"
              >
                Issue Still Persists
              </button>
              <button
                type="button"
                disabled={submittingConfirm}
                onClick={() => handleConfirmResolution(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {submittingConfirm ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm Resolved</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2.5: WELCOME POPUP */}
      {/* ========================================================================= */}
      {showWelcomePopup && <WelcomePopup onClose={() => setShowWelcomePopup(false)} />}

      {/* ========================================================================= */}
      {/* MODAL 3: LINK / CLAIM DIGITAL ROOM KEY */}
      {/* ========================================================================= */}
      {showClaimModal && true && <SupabaseResidentActivation name={user?.name} phone={user?.phone} residenceId={claimHostelId} onClose={() => setShowClaimModal(false)} onActivated={() => { void queryClient.invalidateQueries({ queryKey:['userData'] }); }} />}

      {/* ========================================================================= */}
      {/* MODAL: RESET REGISTERED ACCOUNT PASSWORD */}
      {/* ========================================================================= */}
      {showResetPasswordModal && (
        <DashboardOverlay aria-label={('Resident account security')} onClose={() => setShowResetPasswordModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {('Resident account security')}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium truncate max-w-xs">{resetTargetEmail}</p>
                </div>
              </div>
              <button aria-label="Close dialog"
                type="button"
                onClick={() => setShowResetPasswordModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(<div className="space-y-4">
              <p className="text-sm text-slate-600">Sign in with the verified resident email to manage its credentials. If that email also opens your seller account, its email password is shared and each portal has a separate access PIN.</p>
              <p className="text-sm text-slate-600">The resident portal's Settings page lets you change its current PIN. Your primary account cannot change another verified identity's password.</p>
              <button type="button" disabled={resettingPassword} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" onClick={async () => {
                setResettingPassword(true);
                if (await logout()) navigate('/login', { replace: true });
                else setResettingPassword(false);
              }}>Sign in to resident account</button>
            </div>)}
          </div>
        </DashboardOverlay>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE REGISTERED ACCOUNT (ALLOWS RE-REGISTRATION) */}
      {/* ========================================================================= */}
      {showDeleteAccountModal && (
        <DashboardOverlay aria-label="Delete Registered Account" onClose={() => setShowDeleteAccountModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-rose-200 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-rose-100">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Delete Resident Account
                  </h3>
                  <p className="text-xs text-slate-500 font-medium truncate max-w-xs">{deleteTargetEmail}</p>
                </div>
              </div>
              <button aria-label="Close dialog"
                type="button"
                onClick={() => setShowDeleteAccountModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl text-xs text-rose-950 space-y-1 leading-relaxed">
              <span className="font-black text-rose-900 block">Are you sure you want to delete this account?</span>
              <p>
                This will delete your registered credentials and status from the system, giving you the option to start the registration process again from scratch.
              </p>
            </div>

            <form onSubmit={handleDeleteRegisteredAccount} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 block">
                  Resident Account Email
                </label>
                <input aria-label="Resident Account Email"
                  type="email"
                  value={deleteTargetEmail}
                  onChange={(e) => setDeleteTargetEmail(e.target.value)}
                  placeholder="Enter registered resident account email"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-rose-600"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 block">
                  Resident Account Password *
                </label>
                <input aria-label="Resident Account Password"
                  type="password"
                  value={deletePasswordInput}
                  onChange={(e) => setDeletePasswordInput(e.target.value)}
                  placeholder="Enter your resident account password"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-rose-600 font-mono"
                  required
                />
              </div>

              {deleteAccountError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deleteAccountError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteAccountModal(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deletingAccount}
                  className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {deletingAccount ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>Delete & Restart</span>
                </button>
              </div>
            </form>
          </div>
        </DashboardOverlay>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: IMAGE ZOOM VIEWER */}
      {/* ========================================================================= */}
      {zoomedImage && (
        <DashboardOverlay aria-label="Maintenance Proof Photograph" onClose={() => setZoomedImage(null)}
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl">
            <img src={zoomedImage} alt="Zoomed Proof" className="w-full h-full object-contain max-h-[85vh]" />
            <button aria-label="Close dialog"
              onClick={() => setZoomedImage(null)}
              className="absolute top-3 right-3 bg-black/60 hover:bg-black text-white p-2 rounded-full cursor-pointer transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DashboardOverlay>
      )}
      {/* ========================================================================= */}
      {/* MODAL 5: SIGN OUT CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {showSignoutConfirmModal && (
        <DashboardOverlay aria-label="Sign Out Confirmation" onClose={() => setShowSignoutConfirmModal(false)} className="pv-signout-overlay fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-5 border border-slate-100 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center shadow-xs mx-auto">
              <PineLogo size={36} hideText={true} />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Sign Out Confirmation</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
           See you later!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSignoutConfirmModal(false)}
                data-signout-action="cancel"
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowSignoutConfirmModal(false);
                  if (!await logout()) return;
                  navigate('/login');
                }}
                data-signout-action="confirm"
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}
      {/* ========================================================================= */}
      {/* MODAL 6: HOSTEL ACCOMMODATION DETAILS MODAL */}
      {/* ========================================================================= */}
      {viewingHostelModal && <ResidenceDetails key={viewingHostelModal.id} hostel={viewingHostelModal} onClose={() => setViewingHostelModal(null)} onActivate={openResidenceActivation} />}

      {/* ADD ADDITIONAL ROOM MODAL */}

      {/* DELETE / UNLINK ROOM CONFIRMATION MODAL */}

      {/* PINEVELA FULL-SCREEN STUDENT MERCHANT ONBOARDING WIZARD (WHITE FROSTY THEME & ROOT Z-INDEX) */}
      {showDMRegModal && true && <SupabaseSellerRegistration key={user?.id} name={user?.name} phone={user?.phone} categories={DIGITAL_MARKET_CATEGORIES} onClose={() => setShowDMRegModal(false)} onSubmitted={() => {void loadDigitalMarketData();void queryClient.invalidateQueries({queryKey:['userData']});triggerToast('Seller application submitted for review.');}} />}

    {/* STORE RATING & REVIEW MODAL FOR BUYERS */}
    {ratingOrderTarget && (
      <DashboardOverlay aria-label="Rate Store & Seller" onClose={() => setRatingOrderTarget(null)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                <span>Rate Store & Seller</span>
              </h3>
              <p className="text-[11px] text-slate-500 font-bold">{ratingOrderTarget.storeName}</p>
            </div>
            <button aria-label="Close dialog"
              type="button"
              onClick={() => setRatingOrderTarget(null)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-center gap-3">
              <img
                src={ratingOrderTarget.productImage}
                alt={ratingOrderTarget.productTitle}
                className="w-12 h-12 rounded-xl object-cover border border-amber-300/60 bg-white shrink-0"
              />
              <div>
                <div className="text-xs font-black text-slate-900">{ratingOrderTarget.productTitle}</div>
                <div className="text-[10px] text-amber-800 font-semibold">
                  Purchased on {new Date(ratingOrderTarget.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Interactive Star Picker */}
            <div className="space-y-2 text-center py-2">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                Your Rating ({ratingStars} Star{ratingStars > 1 ? 's' : ''})
              </label>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((starNum) => {
                  const isFilled = starNum <= ratingStars;
                  return (
                    <button
                      key={starNum}
                      type="button"
                      onClick={() => setRatingStars(starNum)}
                      className="p-1.5 transition-transform hover:scale-125 active:scale-95 cursor-pointer focus:outline-none"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          isFilled ? 'text-amber-500 fill-amber-400 shadow-xs' : 'text-slate-300 fill-slate-100'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="text-xs font-extrabold text-amber-700 font-mono">
                {ratingStars === 5 && '🌟 Exceptional / Highly Recommended'}
                {ratingStars === 4 && '⭐ Very Good / Smooth Handover'}
                {ratingStars === 3 && '👍 Good / Satisfactory'}
                {ratingStars === 2 && '😐 Fair / Could Be Better'}
                {ratingStars === 1 && '👎 Poor Experience'}
              </div>
            </div>

            {/* Optional Review Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Optional Written Feedback</label>
              <textarea aria-label="Optional Written Feedback"
                maxLength={4000}
                rows={3}
                placeholder="Describe your experience with this seller (e.g. quick delivery, good item condition, polite)..."
                value={ratingReview}
                onChange={(e) => setRatingReview(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRatingOrderTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingRating}
                onClick={handleSubmitStoreRating}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Star className="w-3.5 h-3.5 fill-white text-white" />
                <span>{isSubmittingRating ? 'Submitting...' : 'Submit Store Rating'}</span>
              </button>
            </div>
          </div>
        </div>
      </DashboardOverlay>
    )}
    </div>
  );
}
