import { activateOnKeyboard } from '../lib/keyboardActivation';
import {marketListingAvailable,isMarketService} from '../../marketListingAvailability';
import { usesSupabasePersistence } from '../lib/persistence';
import SupabaseResidentActivation from './SupabaseResidentActivation';
import SupabaseSellerRegistration from './SupabaseSellerRegistration';
import MobileNavigation from './MobileNavigation';
import MarketStorefront from './MarketStorefront';
import ResidenceCard from './ResidenceCard';
import ResidenceDetails from './ResidenceDetails';
import { filterResidences } from '../lib/residenceCatalog';
import { matchesMarketCategory } from '../lib/marketCatalog';
import MarketplaceFilters from './MarketplaceFilters';
import { servicePoint } from '../../serviceLocation';
import NearbyServicesMap from './NearbyServicesMap';
import ListingPlanBadge from './ListingPlanBadge';
import { compareMarketPriority } from '../../marketPlans';
import { routePopupFeedback } from '../lib/feedback';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import RouteSkeleton from './RouteSkeleton';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import OnboardingProgress, { ROOM_ACTIVATION_STEPS, MARKET_APPLICATION_STEPS } from './OnboardingProgress';
import MarketImageGallery from './MarketImageGallery';
import { marketNoticeKind } from '../lib/marketNotifications';
import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { queryClient } from '../lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import AccountStatusDialog from './AccountStatusDialog';
import MerchantAccountPanel from './MerchantAccountPanel';
import ManagerRegistrationCard from './ManagerRegistrationCard';
import RegistrationStatusButton from './RegistrationStatusButton';
import { managerRegistrationStatus, merchantRegistrationStatus, type ManagerRegistration } from '../lib/registrationStatus';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { safeJson } from '../lib/api';
import { optimizeImageDisplayUrl } from '../lib/imageOptimizer';
import { saveNavigationLayout, usesTopNavigation } from '../lib/navigationLayout';
import PineLogo from './PineLogo';
import TopNavBadge from './TopNavBadge';
import MarketplaceInbox from './MarketplaceInbox';
import DashboardOverlay from './DashboardOverlay';
import UserAvatarSelector, { renderAvatarGraphic } from './UserAvatarSelector';
import MarketItemCard, { getServiceActionLabel } from './MarketItemCard';
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
  ChevronLeft, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  X, 
  Plus, 
  RefreshCw, 
  LogOut, ArrowRight,
  ArrowLeft, 
  Search, MapPin,
  Calendar,
  Settings, AlertTriangle, Star, Trash2,
  KeyRound,
  Lock,
  ShieldAlert, School, User, CheckCircle, ShoppingBag,
  Store,
  Package,
  Tag,
  BadgeCheck, LogIn,
  Compass,
  Heart,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { IssueReport, HostelRoomKey, DigitalMarketApplication, DigitalMarketStore, DigitalMarketProduct, DigitalMarketOrder } from '../types';
import CampusMeetupMapPicker from './CampusMeetupMapPicker';

export interface PageUserDashboardProps {
  initialTab?: 'home' | 'notifications' | 'options' | 'overview' | 'issues' | 'announcements' | 'settings' | 'register-resident' | 'login-room' | 'digital-market';
  initialMarketMode?: 'catalog' | 'vendor' | 'orders';
}

export default function PageUserDashboard({ initialTab, initialMarketMode }: PageUserDashboardProps = {}) {
  const { user, logout, apiFetch, updateUser, setSessionUser } = useAuth();
  const marketAccount=useRef(user?.id),marketEpoch=useRef(0),marketGeneration=useRef(0),marketMounted=useRef(true);
  if(marketAccount.current!==user?.id){marketAccount.current=user?.id;marketEpoch.current++;marketGeneration.current++;}
  useEffect(()=>{marketMounted.current=true;return()=>{marketMounted.current=false;};},[]);
  const marketAccountCurrent=(id:string|undefined,generation?:number)=>marketMounted.current && marketAccount.current===id && (generation===undefined || generation===marketGeneration.current);
  const orderRequest=useRef<{params:string;id:string}|null>(null);
  const inquiryRequest=useRef<{params:string;id:string}|null>(null);
  const inquiryBusy=useRef(false);
  const [marketOrdersAccount,setMarketOrdersAccount]=useState<string|undefined>();
  const [marketReadError,setMarketReadError]=useState('');
  const { notifications, unreadCount, registeredAccounts, markAsRead, pushToast, refreshNotifications } = useNotifications();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedTab = searchParams.get('tab');
  const queryTab = ['home', 'notifications', 'options', 'overview', 'issues', 'announcements', 'settings', 'register-resident', 'login-room', 'digital-market'].includes(requestedTab || '') ? requestedTab as any : undefined;
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
    queryFn: async () => { const data = await apiFetch('/api/digital-market/status'); if (!data || !('application' in data) || !('store' in data)) throw new Error('Could not check merchant registration.'); return data; },
    enabled: Boolean(user), refetchInterval: 6000, refetchOnWindowFocus: true,
  });
  const managerRegistration = useQuery<{ managerAccount: ManagerRegistration | null }>({
    queryKey: ['userData', 'registration', user?.id],
    queryFn: async () => { const data = await apiFetch('/api/users/my-registered-accounts'); if (!data || !('managerAccount' in data)) throw new Error('Could not check manager registration.'); return data; },
    enabled: Boolean(user), refetchInterval: 6000, refetchOnWindowFocus: true,
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
  const [savedMarketOrders, setDigitalMarketOrders] = useState<DigitalMarketOrder[]>([]);
  const digitalMarketOrders=marketOrdersAccount===user?.id ? savedMarketOrders : [];
  const [digitalMarketProducts, setDigitalMarketProducts] = useState<DigitalMarketProduct[]>([]);
  const [publicCatalog, setPublicCatalog] = useState<DigitalMarketProduct[]>([]);

  // Store Rating States for Buyers
  const [ratingOrderTarget, setRatingOrderTarget] = useState<DigitalMarketOrder | null>(null);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingReview, setRatingReview] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);

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
  }, [initialTab, queryTab, initialMarketMode, queryMode]);

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
  const [orderMeetupLocation, setOrderMeetupLocation] = useState<string>(usesSupabasePersistence ? '' : 'KNUST Main Library Car Park');
  const [orderMeetupLat, setOrderMeetupLat] = useState<number | null>(usesSupabasePersistence ? null : 6.6745);
  const [orderMeetupLng, setOrderMeetupLng] = useState<number | null>(usesSupabasePersistence ? null : -1.5716);
  const [serviceLocationOption, setServiceLocationOption] = useState<'seller-location' | 'buyer-location'>('buyer-location');
  const [showMeetupMapModal, setShowMeetupMapModal] = useState<boolean>(false);
  const [viewingOrderMap, setViewingOrderMap] = useState<DigitalMarketOrder | null>(null);
  const [confirmingLocationId, setConfirmingLocationId] = useState<string | null>(null);
  const [orderQtyInput, setOrderQtyInput] = useState<number>(1);
  const [buyerPhoneInput, setBuyerPhoneInput] = useState<string>('');
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [verifyingOrderTarget, setVerifyingOrderTarget] = useState<DigitalMarketOrder | null>(null);
  useEffect(()=>{orderRequest.current=null;inquiryRequest.current=null;inquiryBusy.current=false;setDigitalMarketOrders([]);setMarketOrdersAccount(undefined);setMarketReadError('');setSelectedProdForOrder(null);setVerifyingOrderTarget(null);setSubmittingOrder(false);setPinSubmitting(false);setShowMarketChat(false);setActiveChatEmail(null);setActiveChatStore(undefined);setRatingOrderTarget(null);setIsSubmittingRating(false);},[user?.id]);
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
  const [submittingDMReg, setSubmittingDMReg] = useState<boolean>(false);
  const [dmRegError, setDmRegError] = useState<string | null>(null);

  // Helper to check if email domain is a commercial provider
  const isCommercialEmail = (email: string) => {
    const clean = (email || '').toLowerCase().trim();
    const domain = clean.split('@')[1] || '';
    return ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'mail.com', 'zoho.com', 'protonmail.com'].includes(domain);
  };

  // Helper to check if email is valid accredited student email
  const isValidStudentDomain = (email: string) => {
    const clean = (email || '').toLowerCase().trim();
    if (!clean.includes('@')) return false;
    const parts = clean.split('@');
    if (parts.length !== 2 || !parts[1]) return false;
    const domain = parts[1];
    if (isCommercialEmail(clean)) return false;
    return domain.endsWith('.edu.gh') || domain.endsWith('.ac.gh');
  };

  // Wizard Phase Validation & Navigation Handlers
  const handleNextDmPhase1 = () => {
    setDmRegError(null);
    if (!dmFullName.trim() || dmFullName.trim().length < 3) {
      setDmRegError("Please enter your full legal name as shown on your Ghana Card (minimum 3 characters).");
      return;
    }
    const cleanGhanaCard = dmIdNumber.trim().toUpperCase();
    const GHANA_CARD_REGEX = /^[A-Z0-9][A-Z0-9\-\/]{3,31}$/i;
    if (!cleanGhanaCard || !GHANA_CARD_REGEX.test(cleanGhanaCard)) {
      setDmRegError("Invalid Ghana Card format. Format must strictly match official NIA Ghana Card: GHA-XXXXXXXXX-X (e.g. GHA-712345678-9).");
      return;
    }
    setDmWizardPhase(2);
  };

  const handleNextDmPhase2 = () => {
    setDmRegError(null);
    const cleanEmail = dmStudentEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setDmRegError("Please enter your official university student email address.");
      return;
    }
    if (isCommercialEmail(cleanEmail)) {
      setDmRegError("Personal or commercial email addresses are strictly prohibited. Please use your official university student email.");
      return;
    }
    if (!isValidStudentDomain(cleanEmail)) {
      setDmRegError("Unrecognized student domain. Only official accredited university student emails ending in .edu.gh or .ac.gh are eligible.");
      return;
    }
    if (!dmPassword || dmPassword.length < 6) {
      setDmRegError("Please enter a secure merchant password of at least 6 characters.");
      return;
    }
    if (dmPassword !== dmConfirmPassword) {
      setDmRegError("Merchant passwords do not match. Please ensure both password fields are identical.");
      return;
    }
    setDmWizardPhase(3);
  };

  // Legacy store setup navigation state
  const [showStoreSetupModal, setShowStoreSetupModal] = useState<boolean>(false);
  const [setupStoreName, setSetupStoreName] = useState<string>('');
  const [setupUsername, setSetupUsername] = useState<string>('');
  const [setupLocation, setSetupLocation] = useState<string>('');
  const [setupDeliveryMode, setSetupDeliveryMode] = useState<string>('Campus Meetup & Secure Escrow');
  const [setupCategory, setSetupCategory] = useState<string>(DIGITAL_MARKET_CATEGORIES[0]);
  const [setupDescription, setSetupDescription] = useState<string>('');
  const [setupPhone, setSetupPhone] = useState<string>('');
  const [setupProfilePicture, setSetupProfilePicture] = useState<string>('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80');
  const [setupCoverPicture, setSetupCoverPicture] = useState<string>('https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80');
  const [paymentMomoNetwork, setPaymentMomoNetwork] = useState<string>('MTN Mobile Money');
  const [paymentMomoPhone, setPaymentMomoPhone] = useState<string>('0244123456');
  const [paymentPinSim, setPaymentPinSim] = useState<string>('1234');
  const [paymentStep, setPaymentStep] = useState<'form' | 'processing' | 'success'>('form');
  const [submittingSetup, setSubmittingSetup] = useState<boolean>(false);
  const [storeOnboardingModalOpen, setStoreOnboardingModalOpen] = useState<boolean>(false);
  const [onboardStep, setOnboardStep] = useState<1 | 2 | 3>(1);
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
  const [roomKeyDetails, setRoomKeyDetails] = useState<HostelRoomKey | null>(null);
  const [userRooms, setUserRooms] = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [availableHostels, setAvailableHostels] = useState<any[]>([]);
  const [viewingHostelModal, setViewingHostelModal] = useState<any | null>(null);

  // Add Room Modal states (Up to 5 rooms)
  const [showAddRoomModal, setShowAddRoomModal] = useState<boolean>(false);
  const [addRoomKeyInput, setAddRoomKeyInput] = useState<string>('');
  const [verifyingAddKey, setVerifyingAddKey] = useState<boolean>(false);
  const [verifiedAddKeyInfo, setVerifiedAddKeyInfo] = useState<any | null>(null);
  const [addRoomError, setAddRoomError] = useState<string | null>(null);
  const [submittingAddRoom, setSubmittingAddRoom] = useState<boolean>(false);

  // Delete Room Modal state
  const [deletingRoomTarget, setDeletingRoomTarget] = useState<any | null>(null);
  const [submittingDeleteRoom, setSubmittingDeleteRoom] = useState<boolean>(false);
  const [delRoomEmailInput, setDelRoomEmailInput] = useState<string>('');
  const [delRoomPasswordInput, setDelRoomPasswordInput] = useState<string>('');
  const [delRoomError, setDelRoomError] = useState<string | null>(null);

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

  const handleStartChat = async (product: DigitalMarketProduct) => {
    if (!user?.id) {
      triggerToast("Please log in first to message the merchant.");
      return;
    }
    if (!usesSupabasePersistence && currentUser?.email?.toLowerCase() === product.sellerEmail?.toLowerCase()) {
      setMarketActionError("This is your own product listed by your merchant account!");
      return;
    }
    
    
    const inquiryText = `Hi ${product.storeName}! I am interested in your item "${product.title}" (GHS ${product.price}). Is it still available for meetup?`;
    
    if(inquiryBusy.current)return;
    inquiryBusy.current=true;
    const accountId=user?.id,generation=marketGeneration.current;
    const inquiry={productId:product.id,sellerStoreId:product.storeId,content:inquiryText};
    if(usesSupabasePersistence){const params=JSON.stringify(inquiry);if(inquiryRequest.current?.params!==params)inquiryRequest.current={params,id:crypto.randomUUID()};}
    try {
      const res = await fetch('/api/digital-market/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify(usesSupabasePersistence?{...inquiry,requestId:inquiryRequest.current!.id}:{
          productId:product.id,productTitle:product.title,senderEmail:currentUser?.email,senderName:currentUser?.name,
          recipientEmail:product.sellerEmail,recipientName:product.storeName,content:inquiryText})
      });
      const data = await res.json();if(!marketAccountCurrent(accountId,generation))return;
      if (!res.ok) throw new Error(data.error || 'Could not contact the seller.');
      if (data.success) {
        inquiryRequest.current=null;
        setShowMarketChat(true);
        setActiveChatEmail(data.message?.recipientEmail || product.sellerEmail);
        setActiveChatStore({id:product.storeId,name:product.storeName});
        setSelectedProductForBuy(null);
        triggerToast(`Inquiry sent to ${product.storeName}! Chat is open below.`);
      }
    } catch (err) {
      if(marketAccountCurrent(accountId,generation))triggerToast(err instanceof Error ? err.message : "Could not contact the seller. Please try again.");
    } finally {
      if(marketAccountCurrent(accountId,generation))inquiryBusy.current=false;
    }
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
  const [verifyingKey, setVerifyingKey] = useState<boolean>(false);
  const [verifiedKeyInfo, setVerifiedKeyInfo] = useState<any | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [submittingClaim, setSubmittingClaim] = useState<boolean>(false);
  const [claimStep, setClaimStep] = useState<1 | 2 | 3 | 4>(1);
  const [claimConfirmPassword, setClaimConfirmPassword] = useState<string>('');
  const [showClaimPassword, setShowClaimPassword] = useState<boolean>(false);
  const [showClaimConfirmPassword, setShowClaimConfirmPassword] = useState<boolean>(false);
  const [claimAgreeTerms, setClaimAgreeTerms] = useState<boolean>(true);

  // Resident Account Creation fields on key claim
  const [claimStudentName, setClaimStudentName] = useState<string>('');
  const [claimStudentPhone, setClaimStudentPhone] = useState<string>('');
  const [claimEmail, setClaimEmail] = useState<string>('');
  const [claimPassword, setClaimPassword] = useState<string>('');

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
  const [deleteTargetRole, setDeleteTargetRole] = useState<'resident'>('resident');
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
  const [residencesLoaded, setResidencesLoaded] = useState(false);
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

  // Search & Filter state for the home tab
  const [homeSearchQuery, setHomeSearchQuery] = useState<string>('');
  const [homeFilterType, setHomeFilterType] = useState<'hostels' | 'market'>('market');
  const [marketVisibleCount, setMarketVisibleCount] = useState<number>(24);

  useEffect(() => {
    setMarketVisibleCount(24);
  }, [catalogCategory, catalogSearch, minPriceFilter, maxPriceFilter, priceSortOption, homeSearchQuery]);

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

  // Memoized search and filter results for high performance 60fps scrolling
  const filteredProducts = useMemo(() => {
    const query = catalogSearch.toLowerCase().trim();
    const mainQ = homeSearchQuery.toLowerCase().trim();
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
        if (mainQ) {
          const matchTitle = p.title?.toLowerCase().includes(mainQ);
          const matchDesc = p.description?.toLowerCase().includes(mainQ);
          const matchStore = p.storeName?.toLowerCase().includes(mainQ);
          const matchCat = p.category?.toLowerCase().includes(mainQ);
          if (!matchTitle && !matchDesc && !matchStore && !matchCat) {
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
  }, [publicCatalog, catalogCategory, catalogSearch, homeSearchQuery, minPriceFilter, maxPriceFilter, priceSortOption]);

  const filteredHostels = useMemo(() => filterResidences(availableHostels, homeSearchQuery), [availableHostels, homeSearchQuery]);

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

  const loadStudentData = async (isSilent = false) => {
    if (!isSilent) setLoadingData(true);
    try {
      // Fetch user registered Manager/Staff/Resident accounts
      try {
        const token = (user as any)?.token;
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const uEmail = (user?.email || '').toLowerCase().trim();
        const uId = user?.id || '';
        const regRes = await fetch(`/api/users/my-registered-accounts?email=${encodeURIComponent(uEmail)}&userId=${encodeURIComponent(uId)}`, { headers });
        if (regRes.ok) {
          const regData = await safeJson(regRes);
          
          if (!usesSupabasePersistence && regData.managerAccount && uEmail) {
            try {
              const localMgrs = JSON.parse(localStorage.getItem('pinevela_registered_managers') || '[]');
              let updated = false;
              const syncedMgrs = localMgrs.map((m: any) => {
                const mEmail = (m.email || '').toLowerCase().trim();
                const mParentEmail = (m.parentUserEmail || '').toLowerCase().trim();
                if ((mEmail !== '' && mEmail === uEmail) || (mParentEmail !== '' && mParentEmail === uEmail)) {
                  updated = true;
                  return {
                    ...m,
                    status: regData.managerAccount.status,
                    isApproved: regData.managerAccount.isApproved,
                    isVerified: regData.managerAccount.isVerified
                  };
                }
                return m;
              });
              if (updated) {
                localStorage.setItem('pinevela_registered_managers', JSON.stringify(syncedMgrs));
              }
            } catch (storageErr) {
              console.warn("Storage sync error:", storageErr);
            }
          }

          // Check local fallbacks if server is still indexing
          if (!usesSupabasePersistence && !regData.managerAccount && uEmail) {
            try {
              const localMgrs = JSON.parse(localStorage.getItem('pinevela_registered_managers') || '[]');
              const matchedLocalMgr = localMgrs.find((m: any) => {
                const mEmail = (m.email || '').toLowerCase().trim();
                const mParentEmail = (m.parentUserEmail || '').toLowerCase().trim();
                return Boolean(uEmail) && ((mEmail !== '' && mEmail === uEmail) || (mParentEmail !== '' && mParentEmail === uEmail));
              });
              if (matchedLocalMgr) {
                const isAppr = matchedLocalMgr.status === 'approved' || matchedLocalMgr.isApproved === true;
                const isRej = matchedLocalMgr.status === 'rejected' || matchedLocalMgr.isRejected === true;
                regData.managerAccount = {
                  id: `local-mgr-${Date.now()}`,
                  name: matchedLocalMgr.name || 'Hostel Manager',
                  email: matchedLocalMgr.email || uEmail,
                  organizationName: matchedLocalMgr.organization || 'PineVela Operations',
                  status: isAppr ? 'approved' : (isRej ? 'rejected' : 'pending'),
                  displayStatus: isAppr ? 'Approved' : (isRej ? 'Rejected' : 'Pending Admin Approval'),
                  isApproved: isAppr,
                  isVerified: isAppr,
                  isRejected: isRej,
                  submittedAt: matchedLocalMgr.savedAt || new Date().toISOString()
                };
              }
            } catch (storageErr) {
              console.warn("Storage fallback error:", storageErr);
            }
          }

          if (regData.residentRooms && Array.isArray(regData.residentRooms) && regData.residentRooms.length > 0) {
            const mappedRooms: HostelRoomKey[] = regData.residentRooms.map((rk: any) => ({
              id: rk.roomKey || rk.id,
              hostelId: rk.hostelId || '',
              hostelName: rk.hostelName || 'PineVela Student Residence',
              blockName: rk.blockName || 'Block A',
              blockInitial: ((rk.blockName || 'A')[0] || 'A').toUpperCase(),
              roomNumber: rk.roomNumber || '101',
              roomKey: rk.roomKey || rk.id,
              status: 'Occupied' as const,
              isAssigned: true,
              assignedStudentId: rk.assignedStudentId || rk.studentId || rk.residentId,
              assignedStudentName: rk.assignedStudentName || rk.studentName || rk.name,
              assignedStudentEmail: rk.assignedStudentEmail || rk.studentEmail || rk.email,
              assignedStudentPhone: rk.assignedStudentPhone || rk.studentPhone || rk.phone,
              assignedResidentType: rk.assignedResidentType || rk.residentType,
              assignedProgram: rk.assignedProgram || rk.programOfStudy,
              assignedDepartment: rk.assignedDepartment || rk.department,
              assignedInstitution: rk.assignedInstitution || rk.institution,
              managerName: rk.managerName,
              managerPhone: rk.managerPhone,
              assignedAt: rk.assignedAt || rk.submittedAt || rk.claimedAt || new Date().toISOString(),
              createdAt: rk.assignedAt || rk.submittedAt || rk.claimedAt || new Date().toISOString()
            }));
            setUserRooms(mappedRooms);
            if (mappedRooms[0]) {
              setRoomKeyDetails(mappedRooms[0]);
            }
          } else if (regData.residentAccount) {
            const defaultRoom: HostelRoomKey = {
              id: regData.residentAccount.roomKey,
              hostelId: regData.residentAccount.hostelId || '',
              hostelName: regData.residentAccount.hostelName || 'PineVela Student Residence',
              blockName: regData.residentAccount.blockName || 'Block A',
              blockInitial: ((regData.residentAccount.blockName || 'A')[0] || 'A').toUpperCase(),
              roomNumber: regData.residentAccount.roomNumber || '101',
              roomKey: regData.residentAccount.roomKey,
              status: 'Occupied' as const,
              isAssigned: true,
              assignedStudentId: regData.residentAccount.studentId,
              assignedStudentName: regData.residentAccount.name,
              assignedStudentEmail: regData.residentAccount.email,
              assignedStudentPhone: regData.residentAccount.phone,
              assignedResidentType: regData.residentAccount.residentType,
              assignedProgram: regData.residentAccount.programOfStudy,
              assignedDepartment: regData.residentAccount.department,
              assignedInstitution: regData.residentAccount.institution,
              managerName: regData.residentAccount.managerName,
              managerPhone: regData.residentAccount.managerPhone,
              assignedAt: regData.residentAccount.submittedAt || regData.residentAccount.claimedAt || new Date().toISOString(),
              createdAt: regData.residentAccount.submittedAt || regData.residentAccount.claimedAt || new Date().toISOString()
            };
            setRoomKeyDetails(defaultRoom);
            setUserRooms([defaultRoom]);
          } else {
            setUserRooms([]);
            setRoomKeyDetails(null);
          }
        }
      } catch (e) {
        console.warn("Notice loading registered accounts status:", e);
      }

      // 1. Fetch accredited staff and their resident ratings
      try {
      } catch (e) {
        console.warn("Notice loading accredited staff & reviews:", e);
      }

      // 2. Fetch available hostels
      try {
        const hostelsList = await apiFetch('/api/hostels').catch(() => []);
        if (Array.isArray(hostelsList)) {
          setAvailableHostels(prev => JSON.stringify(prev) === JSON.stringify(hostelsList) ? prev : hostelsList);
        }
      } catch (e) {
        console.warn("Notice loading available hostels:", e);
      } finally { setResidencesLoaded(true); }

      // 4. Fetch room key record and profile details
      try {
        const profileData = await apiFetch('/api/student/my-profile').catch(() => null);
        if (profileData) {
          setRoomKeyDetails((prev: any) => JSON.stringify(prev) === JSON.stringify(profileData.roomKeyDetails || null) ? prev : (profileData.roomKeyDetails || null));
          if (profileData.user) {
            setStudentProfile((prev: any) => JSON.stringify(prev) === JSON.stringify(profileData.user) ? prev : profileData.user);
          }
          if (Array.isArray(profileData.rooms)) {
            setUserRooms((prev: any) => JSON.stringify(prev) === JSON.stringify(profileData.rooms) ? prev : profileData.rooms);
          }
        }
      } catch (e) {
        console.warn("Notice loading student profile:", e);
      }

      // Always load digital market catalog and data in real-time for all users
      await loadDigitalMarketData();

      if (user?.role === 'user') {
        if (!isSilent) setLoadingData(false);
        return;
      }

      // 5. Fetch student's issue reports
      const issues = await apiFetch('/api/issue-reports').catch(() => []);
      if (Array.isArray(issues)) {
        setIssueReports(prev => JSON.stringify(prev) === JSON.stringify(issues) ? prev : issues);
      }
    } catch (err) {
      console.error("Error loading student dashboard data:", err);
    } finally {
      if (!isSilent) setLoadingData(false);
    }
  };

  const loadDigitalMarketData = async () => {
    const accountId=user?.id,epoch=marketEpoch.current;
    const current=()=>marketAccountCurrent(accountId) && marketEpoch.current===epoch;
    try {
      const targetEmail = currentUser?.email || user?.email || '';
      const targetId = currentUser?.id || user?.id || '';
      const { data: statusRes } = await merchantRegistration.refetch();
      if(!current())return;
      if (statusRes) {
        if (!usesSupabasePersistence && statusRes.application && !initialStoreSetupFilledRef.current) {
          initialStoreSetupFilledRef.current = true;
          const app = statusRes.application;
          setSetupStoreName(app.storeName || `${app.fullName || 'Student'}'s Campus Store`);
          setSetupUsername(app.fullName ? app.fullName.toLowerCase().replace(/[^a-z0-9]/g, '') : 'studentstore');
          setSetupLocation(`${app.university || 'KNUST'} Campus`);
          setSetupCategory(app.categoryToSell || 'Electronics, Gadgets & Accessories');
          setSetupDescription(`Official student digital market store by ${app.fullName || 'Student'} at ${app.university || 'Accredited University'}.`);
        }
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

      const ordersRes = await apiFetch(usesSupabasePersistence ? '/api/digital-market/my-orders' : `/api/digital-market/my-orders?email=${encodeURIComponent(targetEmail)}&userId=${encodeURIComponent(targetId)}`);
      if(!current())return;
      setMarketOrdersAccount(accountId);setMarketReadError('');
      if (Array.isArray(ordersRes)) {
        setDigitalMarketOrders(prev => JSON.stringify(prev) === JSON.stringify(ordersRes) ? prev : ordersRes);
      }
    } catch (e:any) {
      if(current())setMarketReadError(e?.message || 'Could not refresh your market orders.');
    }
  };

  useEffect(() => {
    loadStudentData(false);
    const interval = setInterval(() => {
      loadStudentData(true);
    }, 8000);
    return () => clearInterval(interval);
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
  const handleVerifyClaimKey = async () => {
    if (!claimRoomKeyInput.trim()) {
      setClaimError("Please enter your Digital Room Key");
      return;
    }
    setVerifyingKey(true);
    setClaimError(null);
    try {
      const res = await fetch('/api/room-keys/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user?.token || currentUser?.token || ''}` },
        body: JSON.stringify({ roomKey: claimRoomKeyInput.trim() })
      });
      const data = await safeJson(res);
      if (!res.ok || !data.valid) {
        setClaimError(data.error || "Invalid room key. Check with your manager.");
        setVerifiedKeyInfo(null);
      } else if (claimHostelId && data.hostelId !== claimHostelId) {
        setClaimError("This key belongs to a different residence. Enter a key for the selected residence.");
        setVerifiedKeyInfo(null);
      } else {
        setVerifiedKeyInfo(data);
        setClaimError(null);
        setClaimStudentName(data.assignedStudentName || currentUser?.name || '');
        setClaimStudentPhone(data.assignedStudentPhone || currentUser?.phone || '');
        if (data.assignedStudentEmail && data.assignedStudentEmail.toLowerCase().includes('knust.edu.gh')) {
          setClaimEmail(data.assignedStudentEmail);
        } else {
          setClaimEmail('');
        }
      }
    } catch (err: any) {
      setClaimError("Could not verify key. Check network connection.");
    } finally {
      setVerifyingKey(false);
    }
  };

  // Confirm claim room key & initiate resident account creation
  const handleClaimRoomKey = async () => {
    if (userRooms.length >= 1) {
      setClaimError("Users can now only activate one room per user account. You already have an active room on this account.");
      return;
    }

    if (!verifiedKeyInfo) return;
    if (!claimStudentName.trim()) {
      setClaimError("Please enter your username / full name for your resident account.");
      return;
    }
    if (!claimStudentPhone.trim()) {
      setClaimError("Please enter your phone number.");
      return;
    }

    const resolvedEmail = claimEmail.trim().toLowerCase();
    if (!resolvedEmail) {
      setClaimError("Please enter your official KNUST student email address.");
      return;
    }

    if (currentUser?.email && resolvedEmail === currentUser.email.toLowerCase().trim()) {
      setClaimError("You cannot use your primary user account email to activate your room account. Only your official KNUST student email is permitted.");
      return;
    }

    const knustEmailRegex = /^[a-zA-Z0-9._%+-]+@(st\.)?knust\.edu\.gh$/i;
    if (!knustEmailRegex.test(resolvedEmail)) {
      setClaimError("Only official KNUST student email format is permitted (e.g. yourname@st.knust.edu.gh or yourname@knust.edu.gh). This serves as your dedicated credential for logging into your digital room.");
      return;
    }

    if (!claimPassword.trim()) {
      setClaimError("Please create a password for your resident account.");
      return;
    }

    if (claimPassword.trim() && claimConfirmPassword.trim() && claimPassword.trim() !== claimConfirmPassword.trim()) {
      setClaimError("Passwords do not match. Please verify and repeat your password.");
      return;
    }

    const rawPassword = claimPassword.trim();

    setSubmittingClaim(true);
    try {
      const res = await fetch('/api/room-keys/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user?.token || ''}` },
        body: JSON.stringify({
          roomKey: verifiedKeyInfo.roomKey,
          name: claimStudentName.trim(),
          studentName: claimStudentName.trim(),
          username: claimStudentName.trim(),
          email: resolvedEmail,
          studentEmail: resolvedEmail,
          parentUserEmail: currentUser?.email || '',
          phone: claimStudentPhone.trim(),
          studentPhone: claimStudentPhone.trim(),
          password: rawPassword,
          userId: currentUser?.id
        })
      });
      const data = await safeJson(res);
      if (res.ok && data.success) {
        setRoomKeyDetails(verifiedKeyInfo);
        triggerToast(`Resident Account Created & Room Key Activated! Connected to ${verifiedKeyInfo.hostelName} (${verifiedKeyInfo.blockName}, Room ${verifiedKeyInfo.roomNumber})`, 'success');
        
        if (updateUser) {
          const newRoomRecord = {
            email: resolvedEmail,
            name: claimStudentName.trim() || currentUser?.name,
            phone: claimStudentPhone.trim() || currentUser?.phone,
            roomKey: verifiedKeyInfo.roomKey,
            roomNumber: verifiedKeyInfo.roomNumber,
            blockName: verifiedKeyInfo.blockName,
            hostelName: verifiedKeyInfo.hostelName,
            hostelId: verifiedKeyInfo.hostelId,
            managerName: data.user?.managerName,
            managerPhone: data.user?.managerPhone,
            active: true
          };

          const existingRoomsList = Array.isArray(currentUser?.registeredAccounts?.residentRooms)
            ? currentUser.registeredAccounts.residentRooms
            : (currentUser?.registeredAccounts?.residentAccount ? [currentUser.registeredAccounts.residentAccount] : []);
          
          const updatedRoomsList = [
            ...existingRoomsList.filter((r: any) => (r.roomKey || r.id)?.toUpperCase() !== verifiedKeyInfo.roomKey.toUpperCase()),
            newRoomRecord
          ];

          updateUser({
            registeredAccounts: {
              ...(currentUser?.registeredAccounts || {}),
              residentAccount: newRoomRecord,
              residentRooms: updatedRoomsList
            }
          });
        }
        await loadStudentData();
        setClaimStep(3); // Advance to success step
      } else {
        setClaimError(data.error || "Failed to link room key and create resident account");
      }
    } catch (err: any) {
      setClaimError("Failed to claim room key and create resident account");
    } finally {
      setSubmittingClaim(false);
    }
  };

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
  const handleResetRegisteredAccountPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetTargetRole === 'resident' && !currentPasswordInput) {
      setResetPasswordError("Please enter your current resident account password first.");
      return;
    }
    if (!newPasswordInput || newPasswordInput.length < 6) {
      setResetPasswordError("Password must be at least 6 characters long.");
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setResetPasswordError("Passwords do not match. Please verify.");
      return;
    }

    setResettingPassword(true);
    setResetPasswordError(null);
    try {
      const authToken = user?.token || '';
      const res = await fetch('/api/users/reset-registered-account-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          role: resetTargetRole,
          email: resetTargetEmail,
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput
        })
      });
      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        setResetPasswordError(data.error || "Failed to reset password.");
      } else {
        setShowResetPasswordModal(false);
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        triggerToast(`Password reset successfully for your registered ${resetTargetRole} account!`);
      }
    } catch (err: any) {
      setResetPasswordError(err.message || "Failed to reset password. Check connection.");
    } finally {
      setResettingPassword(false);
    }
  };

  // Open delete account modal
  const openDeleteAccountModal = (role: 'resident', email: string) => {
    setDeleteTargetRole(role);
    setDeleteTargetEmail(email);
    setDeletePasswordInput('');
    setDeleteAccountError(null);
    setShowDeleteAccountModal(true);
  };

  // Submit account deletion (unlocks registration)
  const handleDeleteRegisteredAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const authToken = user?.token || '';
      const res = await fetch('/api/users/delete-registered-account', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          role: deleteTargetRole,
          email: deleteTargetEmail,
          password: deletePasswordInput,
          deletionReason: ''
        })
      });
      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        setDeleteAccountError(data.error || "Failed to delete account.");
      } else {
        setShowDeleteAccountModal(false);
        setDeletePasswordInput('');
        triggerToast(`${deleteTargetRole.toUpperCase()} account deleted. You can now start the registration process again.`);
        
        const tEmail = (deleteTargetEmail || currentUser?.email || user?.email || '').toLowerCase().trim();
        const activeUserEmail = (user?.email || currentUser?.email || '').toLowerCase().trim();
        const isTargetingActiveSession = activeUserEmail !== '' && activeUserEmail === tEmail;
        setRoomKeyDetails(null);

        if (isTargetingActiveSession) {
          if (!await logout()) return;
          navigate('/login');
          return;
        }

        if (updateUser) {
          updateUser({
            role: 'user',
            registeredAccounts: {
              ...(currentUser?.registeredAccounts || user?.registeredAccounts || {}),
              residentAccount: null
            }
          });
        }

        await refreshNotifications();
        await loadStudentData();
      }
    } catch (err: any) {
      setDeleteAccountError(err.message || "Failed to delete account.");
    } finally {
      setDeletingAccount(false);
    }
  };

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;
  const marketUnread = notifications.filter(n => !n.read && marketNoticeKind(n) !== null);
  const orderUnreadCount = marketUnread.filter(n => marketNoticeKind(n) === 'order').length;
  const tabUnreadCount = (id: string) => id === 'notifications' ? unreadNotificationsCount : id === 'digital-market' ? orderUnreadCount : 0;
  useEffect(() => {
    if (activeTab !== 'digital-market') return;
    void Promise.all(notifications.filter(n => !n.read && marketNoticeKind(n) === 'order').map(n => markAsRead(n.id)));
  }, [activeTab, notifications, markAsRead]);

  const navItems = [
    { id: 'home', label: 'Home Tab', sub: 'Marketplace & residences', icon: Home },
    { id: 'digital-market', label: 'Purchases & Tracking', sub: 'Orders, Pickup & Delivery', icon: Package },
    { 
      id: 'login-room', 
      label: (roomKeyDetails || currentUser?.roomKey) ? 'Resident Room' : 'Log Into Your Room', 
      sub: (roomKeyDetails || currentUser?.roomKey) ? `${roomKeyDetails?.blockName || 'Block'} - Room ${roomKeyDetails?.roomNumber || currentUser?.roomNumber || ''}` : 'Activate Digital Room Key', 
      icon: Key 
    },
    { id: 'notifications', label: 'Notifications Tab', sub: `${unreadNotificationsCount > 0 ? `${unreadNotificationsCount} New Alert${unreadNotificationsCount > 1 ? 's' : ''}` : 'Bulletins & Alerts'}`, icon: Bell },
    { id: 'options', label: 'Options Tab', sub: 'Profile & Settings', icon: Settings },
  ];

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
      if ((!result.data.application && !result.data.store) || (usesSupabasePersistence && result.data.application?.status === 'rejected')) startMerchantRegistration();
      else setShowMerchantCard(true);
    } finally { setCheckingMerchant(false); }
  };

  const openManagerRegistration = async () => {
    setCheckingManager(true);
    try {
      const result = await managerRegistration.refetch();
      if (!result.data || result.isError) { triggerToast('Could not check manager registration. Please try again.', 'error'); return; }
      if (managerRegistrationStatus(result.data.managerAccount) === 'unregistered') navigate('/register-manager');
      else setShowManagerCard(true);
    } finally { setCheckingManager(false); }
  };

  // Dedicated merchant login entry point
  const [quickLoggingInMerchant, setQuickLoggingInMerchant] = useState<boolean>(false);
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
  const handleRegisterDigitalMarket = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmittingDMReg(true);
    setDmRegError(null);

    try {
      if (digitalMarketApp || digitalMarketStore) {
        setDmRegError("You already have an existing Digital Student Market registration. Duplicate applications are not allowed.");
        setSubmittingDMReg(false);
        return;
      }

      if (!dmFullName.trim() || dmFullName.trim().length < 3) {
        setDmRegError("Please enter your full legal name as recorded by your university.");
        setDmWizardPhase(1);
        setSubmittingDMReg(false);
        return;
      }

      const cleanStudentId = dmIdNumber.trim().toUpperCase();
      if (!cleanStudentId || !/^[A-Z0-9][A-Z0-9\-\/]{3,31}$/i.test(cleanStudentId)) {
        setDmRegError("Enter a valid student ID or school-issued identification number (4–32 letters, numbers, hyphens, or slashes).");
        setDmWizardPhase(1);
        setSubmittingDMReg(false);
        return;
      }
      
      const cleanEmail = dmStudentEmail.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        setDmRegError("Please enter your official university student email.");
        setDmWizardPhase(2);
        setSubmittingDMReg(false);
        return;
      }

      if (isCommercialEmail(cleanEmail)) {
        setDmRegError("Personal or commercial email addresses are strictly prohibited. Please use your official university student email.");
        setDmWizardPhase(2);
        setSubmittingDMReg(false);
        return;
      }

      if (!isValidStudentDomain(cleanEmail)) {
        setDmRegError("Unrecognized institutional email. Only official accredited university student emails ending in .edu.gh or .ac.gh are eligible.");
        setDmWizardPhase(2);
        setSubmittingDMReg(false);
        return;
      }

      if (!dmPassword || dmPassword.length < 6) {
        setDmRegError("Please enter a secure student password (at least 6 characters) for your merchant account.");
        setDmWizardPhase(2);
        setSubmittingDMReg(false);
        return;
      }

      if (dmPassword !== dmConfirmPassword) {
        setDmRegError("Merchant passwords do not match. Please verify both password fields.");
        setDmWizardPhase(2);
        setSubmittingDMReg(false);
        return;
      }

      if (!dmCertifyAccepted) {
        setDmRegError("Please verify and check the student merchant certification declaration.");
        setSubmittingDMReg(false);
        return;
      }

      const payload = {
        fullName: dmFullName.trim(),
        university: dmUniversity,
        studentEmail: cleanEmail,
        password: dmPassword,
        categoryToSell: dmCategory,
        idNumber: cleanStudentId,
        storeName: dmProposedStoreName.trim() || `${dmFullName.trim()}'s Campus Store`,
        parentUserEmail: currentUser?.email || user?.email || '',
        userId: currentUser?.id || user?.id || ''
      };

      const res = await apiFetch('/api/digital-market/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        setShowDMRegModal(false);
        queryClient.setQueryData(['digital-market', 'registration', user?.id], { application: res.application, store: null });
        setShowMerchantCard(true);
        triggerToast("Digital Student Market Application Submitted! 🎉");
        await loadDigitalMarketData();
      } else {
        setDmRegError(res?.error || "Failed to submit application.");
      }
    } catch (err: any) {
      setDmRegError(err.message || "Failed to submit application.");
    } finally {
      setSubmittingDMReg(false);
    }
  };

  const { settings: marketPrices } = usePlatformSettings();
  const handleStoreSetup = async (e: React.FormEvent) => { e.preventDefault(); setShowStoreSetupModal(false); navigate('/login'); triggerToast('Sign in with your seller account to complete secure market checkout.'); };
  const handleMandatoryStoreSetup = async (e: React.FormEvent) => { e.preventDefault(); setStoreOnboardingModalOpen(false); navigate('/login'); };

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
        ...(!usesSupabasePersistence ? {buyerName:currentUser?.name || user?.name || 'Student Buyer',buyerEmail:currentUser?.email || user?.email || '',buyerId:currentUser?.id || user?.id || ''} : {}),
        buyerPhone: buyerPhoneInput || currentUser?.phone || '',
        meetingLocation: orderMeetupLocation,
        meetingLatitude: orderMeetupLat,
        meetingLongitude: orderMeetupLng,
        serviceLocationOption
      };

      if(usesSupabasePersistence){const params=JSON.stringify(payload);if(orderRequest.current?.params!==params)orderRequest.current={params,id:crypto.randomUUID()};Object.assign(payload,{requestId:orderRequest.current.id});}
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

  if (false && currentUser?.role === 'user') {
    return (
      <div className="min-h-screen h-screen flex flex-col lg:flex-row bg-transparent text-slate-800 overflow-hidden font-sans relative">
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

         {/* Sidebar for Base User */}
         <aside className="hidden lg:flex w-72 my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl p-6 flex flex-col justify-between shrink-0 overflow-y-auto z-20">
           <div className="space-y-6">
             <div className="flex items-center space-x-3 px-2">
               <PineLogo size={36} />
               <div>
                 <h1 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-blue-900 to-cyan-800 bg-clip-text text-transparent">
                   PineVela Center
                 </h1>
                 <p className="text-[10px] font-medium text-blue-600/70 uppercase tracking-widest">Onboarding & Setup</p>
               </div>
             </div>

             <div className="p-3 bg-white/70 border border-blue-200/60 rounded-2xl flex items-center justify-between shadow-xs">
               <div className="flex items-center gap-3 overflow-hidden">
                 {renderAvatarGraphic(currentUser?.avatar, "w-10 h-10 text-xs")}
                 <div className="overflow-hidden">
                   <div className="text-xs font-bold text-slate-900 truncate">{currentUser?.name || 'PineVela User'}</div>
                   <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-md">Generic Identity</span>
                 </div>
               </div>
             </div>
           </div>

           <button
             onClick={() => setShowSignoutConfirmModal(true)}
             className="w-full flex items-center justify-center space-x-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-4 py-2.5 rounded-2xl font-semibold text-xs transition-all shadow-xs cursor-pointer"
           >
             <LogOut className="w-4 h-4" />
             <span>Sign Out</span>
           </button>
         </aside>

         {/* Onboarding Dashboard Area */}
         <main className="flex-1 p-6 pb-28 lg:p-10 lg:pb-10 space-y-8 overflow-y-auto h-full relative z-10 flex flex-col justify-start">
           
           {/* Top greeting bar */}
           <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-sky-100">
             <div>
               <h2 className="text-2xl font-black text-slate-900 tracking-tight">Welcome to PineVela, {currentUser?.name}!</h2>
               <p className="text-xs text-slate-500 font-semibold mt-1">
                 You are currently signed in with a unified generic user profile. Activate your PineVela capabilities below:
               </p>
             </div>
             
             {/* Mobile Sign out button */}
             <button
               onClick={() => setShowSignoutConfirmModal(true)}
               className="lg:hidden w-fit flex items-center space-x-2 bg-rose-50 text-rose-600 border border-rose-200 px-4 py-2 rounded-xl font-semibold text-xs transition-all cursor-pointer"
             >
               <LogOut className="w-4 h-4" />
               <span>Sign Out</span>
             </button>
           </div>

           {/* Capabilities Selection Grid */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
             
             {/* 1. Student / Resident capability card */}
             <div className="bg-white hover:bg-blue-50/20 border border-sky-150 rounded-3xl p-6 shadow-md hover:shadow-xl transition-all duration-200 flex flex-col justify-between">
               <div className="space-y-4">
                 <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center shadow-sm">
                   <Key className="w-6 h-6" />
                 </div>
                 <div className="space-y-1">
                   <div className="flex items-center gap-2">
                     <h3 className="font-black text-slate-900 text-base">Resident & Student</h3>
                     <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[9px] font-black uppercase tracking-wider rounded-md">Activate</span>
                   </div>
                   <p className="text-xs text-slate-500 leading-relaxed font-medium">
                     Onboard into your designated student room using a digital room key code issued by your hostel manager.
                   </p>
                 </div>
               </div>
               
               <button
                 type="button"
                 onClick={() => {
                   setClaimRoomKeyInput('');
                   setVerifiedKeyInfo(null);
                   setClaimError(null);
                   setShowClaimModal(true);
                 }}
                 className="mt-6 w-full py-2.5 px-4 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
               >
                 <span>Activate Room Key</span>
                 <ArrowRight className="w-3.5 h-3.5" />
               </button>
             </div>

             {/* 2. Staff / Artisan capability card */}
             <div className="hidden bg-white hover:bg-amber-50/20 border border-amber-150 rounded-3xl p-6 shadow-md hover:shadow-xl transition-all duration-200 flex flex-col justify-between">
               <div className="space-y-4">
                 <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center shadow-sm">
                   <Wrench className="w-6 h-6" />
                 </div>
                 <div className="space-y-1">
                   <div className="flex items-center gap-2">
                     <h3 className="font-black text-slate-900 text-base">Staff & Artisan</h3>
                     <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider rounded-md">Register</span>
                   </div>
                   <p className="text-xs text-slate-500 leading-relaxed font-medium">
                     Register your professional service skills, set up working credentials, and apply for verified jobs around residences.
                   </p>
                 </div>
               </div>

               <button
                 type="button"
                 onClick={() => {
                   sessionStorage.setItem('navigated_to_staff_register', 'true');
                   navigate('/staff/register');
                 }}
                 className="mt-6 w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
               >
                 <span>Register as Staff</span>
                 <ArrowRight className="w-3.5 h-3.5" />
               </button>
             </div>

             {/* 3. Hostel / Residence Manager capability card */}
             <div className="bg-white hover:bg-emerald-50/20 border border-emerald-150 rounded-3xl p-6 shadow-md hover:shadow-xl transition-all duration-200 flex flex-col justify-between">
               <div className="space-y-4">
                 <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center shadow-sm">
                   <Home className="w-6 h-6" />
                 </div>
                 <div className="space-y-1">
                   <div className="flex items-center gap-2">
                     <h3 className="font-black text-slate-900 text-base">Hostel Manager</h3>
                     <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-wider rounded-md">Manager Setup</span>
                   </div>
                   <p className="text-xs text-slate-500 leading-relaxed font-medium">
                     Register KNUST-accredited hostel properties in Kumasi, manage active student room keys, track occupancy, and respond to maintenance reports.
                   </p>
                 </div>
               </div>

               <button
                 type="button"
                 onClick={() => {
                   navigate('/register-manager');
                 }}
                 className="mt-6 w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
               >
                 <span>Register Property</span>
                 <ArrowRight className="w-3.5 h-3.5" />
               </button>
             </div>

           </div>

           {/* Guidance Note */}
           <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-3xl max-w-5xl flex items-start gap-4">
             <div className="p-2.5 bg-blue-100 text-blue-900 rounded-xl shrink-0">
             </div>
             <div className="space-y-1">
               <h4 className="text-sm font-black text-slate-800">Need help onboarding?</h4>
               <p className="text-xs text-slate-650 leading-relaxed font-medium">
                 PineVela uses a Unified User Account. Your single email credentials protect your entire identity. If you are a student, your hostel manager has already generated a Digital Room Key for you. Activating your Room Key will automatically configure your Student Residence Desk.
               </p>
             </div>
           </div>

         </main>

         {/* MODALS */}
         {showClaimModal && usesSupabasePersistence && <SupabaseResidentActivation name={user?.name} phone={user?.phone} residenceId={claimHostelId} onClose={() => setShowClaimModal(false)} onActivated={() => { void queryClient.invalidateQueries({ queryKey:['userData'] }); }} />}
         {showClaimModal && !usesSupabasePersistence && (
           <DashboardOverlay aria-label="Activate Digital Room Key" onClose={() => setShowClaimModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
             <div className="onboarding-fields bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-blue-200 space-y-5">
               <div className="flex items-start justify-between gap-3 pb-3 border-b border-blue-100">
                 <div className="flex items-start gap-3">
                   <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
                     <Key className="w-5 h-5" />
                   </div>
                   <div>
                     <h3 className="text-lg font-black text-slate-900">Activate Digital Room Key</h3>
                     <p className="text-xs text-slate-500 font-medium">Provided exclusively by your manager</p>
                   </div>
                 </div>
                 <button aria-label="Close dialog"
                   type="button"
                   onClick={() => setShowClaimModal(false)}
                   className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
                 >
                   <X className="w-5 h-5" />
                 </button>
               </div>

               <OnboardingProgress steps={ROOM_ACTIVATION_STEPS} step={claimStep} label="Room key activation" />

               <div className="space-y-3">
                 <div className="space-y-1">
                   <label className="text-xs font-black text-slate-800 block">Enter Key (Format: MAZE-A-123456)</label>
                   <div className="flex gap-2">
                     <input aria-label="Enter Key (Format: MAZE-A-123456)"
                       type="text"
                       value={claimRoomKeyInput}
                       onChange={(e) => setClaimRoomKeyInput(e.target.value.toUpperCase())}
                       placeholder="e.g. EMERALD-A-849201"
                       className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs font-bold uppercase text-slate-900 focus:outline-none focus:border-blue-600"
                     />
                     <button
                       type="button"
                       onClick={handleVerifyClaimKey}
                       disabled={verifyingKey || !claimRoomKeyInput.trim()}
                       className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
                     >
                       {verifyingKey ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify'}
                     </button>
                   </div>
                 </div>

                 {claimError && (
                   <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-bold flex items-center gap-2">
                     <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                     <span>{claimError}</span>
                   </div>
                 )}

                 {verifiedKeyInfo && (
                   <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-xs text-emerald-950 animate-in fade-in slide-in-from-bottom-2 duration-150">
                     <div className="font-black flex items-center gap-1.5 text-emerald-850">
                       <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                       <span>Verified Room Match!</span>
                     </div>
                     <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
                       <div>Hostel: <strong>{verifiedKeyInfo.hostelName}</strong></div>
                       <div>Block: <strong>{verifiedKeyInfo.blockName}</strong></div>
                       <div>Room: <strong>{verifiedKeyInfo.roomNumber}</strong></div>
                       <div>Status: <strong>{verifiedKeyInfo.status}</strong></div>
                     </div>

                     <button
                       type="button"
                       onClick={handleClaimRoomKey}
                       disabled={submittingClaim}
                       className="w-full mt-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                     >
                       {submittingClaim ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                       <span>Confirm & Activate Room Access</span>
                     </button>
                   </div>
                 )}
               </div>
             </div>
           </DashboardOverlay>
         )}

         {/* SIGN OUT CONFIRMATION MODAL */}
         {showSignoutConfirmModal && (
           <DashboardOverlay aria-label="Sign Out Confirmation" onClose={() => setShowSignoutConfirmModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-5 border border-slate-100 shadow-2xl">
               <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center shadow-xs mx-auto">
                 <PineLogo size={36} hideText={true} />
               </div>
               <div className="space-y-1.5">
                 <h3 className="text-lg font-black text-slate-900 tracking-tight">Sign Out Confirmation</h3>
                 <p className="text-xs text-slate-500 leading-relaxed">
                   Are you sure you want to sign out of your PineVela account?
                 </p>
               </div>
               <div className="grid grid-cols-2 gap-3 pt-2">
                 <button
                   type="button"
                   onClick={() => setShowSignoutConfirmModal(false)}
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
                   className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                 >
                   Sign Out
                 </button>
               </div>
             </div>
           </DashboardOverlay>
         )}
      </div>
    );
  }

  return (
    <div className="min-h-screen h-screen flex flex-col lg:flex-row bg-transparent text-slate-800 overflow-hidden font-sans relative">
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

      {/* MOBILE HEADER (lg:hidden) */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-xl border-b border-sky-200/50 sticky top-0 z-40 shadow-xs">
        <div role="button" tabIndex={0} aria-label="Go to home" onKeyDown={activateOnKeyboard} className="flex items-center gap-2 cursor-pointer" onClick={() => { setActiveTab('home'); navigate('/student/dashboard'); }}>
          <PineLogo size={24} />
          <div>
            <h1 className="text-xs font-black tracking-tight text-blue-950 leading-tight">PineVela Portal</h1>
            <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{user?.hostelName || 'PineVela Resident'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('options')}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            title="Account Options & Profile"
          >
            {renderAvatarGraphic(currentUser?.avatar, "w-7 h-7 text-[10px]")}
          </button>
          <button 
            onClick={() => setShowSignoutConfirmModal(true)} 
            className="flex items-center gap-1.5 px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* MOBILE BOTTOM NAV (lg:hidden) */}
      <MobileNavigation label="User navigation" activeTab={activeTab} onSelect={handleNavClick} items={navItems.map(tab => ({ ...tab, badge: tabUnreadCount(tab.id), label: tab.id === 'home' ? 'Home' : tab.id === 'digital-market' ? 'Purchases' : tab.id === 'login-room' ? 'Room' : tab.id === 'notifications' ? 'Alerts' : 'Options' }))} />

      {/* Compact desktop equivalent of the mobile navigation. It stays above the scrolling content. */}
      {isSidebarHidden && (
        <nav className="hidden lg:block fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(860px,calc(100vw-3rem))] bg-white/72 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg">
          <div className="flex items-center gap-1 px-2 py-1.5">
            {/* Profile avatar button — left end */}
            <button
              onClick={() => setActiveTab('options')}
              title="Profile & Settings"
              className="shrink-0 flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl transition-all cursor-pointer hover:bg-white/70"
            >
              {renderAvatarGraphic(currentUser?.avatar, 'w-6 h-6 text-[9px] ring-2 ring-white shadow-sm')}
              <span className="text-[9px] font-bold text-slate-500">Profile</span>
            </button>
            <div className="w-px h-6 bg-slate-200/70 shrink-0" />
            {navItems.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleNavClick(tab.id)}
                  title={tab.label}
                  className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all cursor-pointer ${isActive ? 'text-blue-700 bg-blue-100/65' : 'text-slate-500 hover:text-slate-800 hover:bg-white/70'}`}
                >
                  <span className="relative inline-flex"><Icon className="w-4 h-4" /><TopNavBadge color="blue" count={tabUnreadCount(tab.id)} /></span>
                  <span className="max-w-full truncate text-[9px] font-bold">{tab.id === 'digital-market' ? 'Purchases' : tab.id === 'notifications' ? 'Alerts' : tab.id === 'options' ? 'Options' : tab.label.split(' ')[0]}</span>
                </button>
              );
            })}
            <button
              onClick={() => setShowSignoutConfirmModal(true)}
              title="Sign Out"
              className="shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-[9px] font-bold">Sign Out</span>
            </button>
            <button onClick={() => setIsSidebarHidden(false)} title="Show sidebar" className="shrink-0 p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer">
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        </nav>
      )}

      {/* Desktop sidebar */}
      {!isSidebarHidden && <aside className="hidden lg:flex w-72 p-6 my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl flex flex-col justify-between shrink-0 overflow-y-auto z-10 relative">

        <div className="space-y-6">
          {/* Logo & Header */}
          <div className="flex items-center justify-between px-2">
            <div role="button" tabIndex={0} aria-label="Go to home" onKeyDown={activateOnKeyboard} className="flex items-center space-x-3 cursor-pointer" onClick={() => { setActiveTab('home'); navigate('/student/dashboard'); }}>
              <PineLogo size={36} />
              <div>
                <h1 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-blue-900 to-cyan-800 bg-clip-text text-transparent">PineVela Resident</h1>
                <p className="text-[10px] font-medium text-blue-600/70 uppercase tracking-widest">User Account</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarHidden(true)} title="Hide sidebar" className="p-2 text-slate-500 hover:text-blue-700 hover:bg-white/70 rounded-xl transition-colors cursor-pointer"><PanelLeftClose className="w-4 h-4" /></button>
          </div>

          {/* Student Profile Pill */}
          <div className="p-3 bg-white/70 border border-blue-200/60 rounded-2xl flex items-center justify-between shadow-xs overflow-hidden">
            <div className="flex items-center gap-3 overflow-hidden">
              {renderAvatarGraphic(currentUser?.avatar, "w-10 h-10 text-xs shrink-0")}
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-slate-900 truncate">{currentUser?.name || 'PineVela User'}</div>
                <div className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 inline shrink-0" />
                  <span className="truncate">Verified Account</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0"><button onClick={() => setActiveTab('options')} title="Account Options" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100/50 rounded-lg transition-colors cursor-pointer"><Settings className="w-3.5 h-3.5" /></button></div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleNavClick(tab.id)}
                  title={tab.label}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl transition-all duration-150 group cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-500'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className={`p-2 rounded-xl transition-colors shrink-0 relative ${
                      isActive ? 'bg-white/20 text-white' : 'bg-blue-200/70 text-blue-700 group-hover:bg-blue-300/80'
                    }`}>
                      <Icon className="w-4 h-4" />
                      <TopNavBadge inset color="blue" count={tabUnreadCount(tab.id)} />
                    </div>
                    <div className="text-left overflow-hidden">
                      <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5 truncate">{tab.label}</div>
                      <div className={`text-[10px] font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                        {tab.sub}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sign Out Footer */}
        <div className="space-y-2 pt-4 border-t border-sky-200/80 mt-4">
          <button
            onClick={() => setShowSignoutConfirmModal(true)}
            title="Sign Out"
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-2xl font-semibold text-xs transition-all shadow-xs cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>}


      {/* MAIN CONTENT AREA WITH PERSISTENT PINEVELA GIANT WATERMARK */}
      <main ref={mainScrollRef} className={`user-dashboard-content hide-scrollbar flex-1 p-6 pb-28 lg:px-10 lg:pb-10 space-y-8 overflow-y-auto h-full relative z-10 ${isSidebarHidden ? 'lg:pt-24 lg:w-[calc(100vw-22rem)] lg:max-w-[calc(100vw-22rem)] lg:mx-auto' : 'lg:pt-10'}`}>

        {/* TAB 0: HOME TAB (Residents View, Staff View & Gateways) */}
        {activeTab === 'home' && (
          <div className="space-y-8 animate-fadeIn relative z-10">
            {/* REAL-TIME HOME SEARCH & FILTER COMPONENT */}
            <div className="bg-white/45 backdrop-blur-xl p-4 rounded-2xl border border-white/70 shadow-[0_10px_30px_rgba(37,99,235,0.10)]">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Search input field */}
                <div className="md:col-span-8 relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-slate-400" />
                  </span>
                  <input aria-label="Search hostels, marketplace items, or managers..."
                    type="text"
                    value={homeSearchQuery}
                    onChange={(e) => setHomeSearchQuery(e.target.value)}
                    placeholder="Search hostels, marketplace items, or managers..."
                    className="w-full pl-10 pr-10 py-2.5 bg-white/45 backdrop-blur-md border border-white/75 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white/80 transition-all shadow-xs"
                  />
                  {homeSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setHomeSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Clear search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Filter Selector tabs */}
                <div className="md:col-span-4 flex bg-white/35 backdrop-blur-md p-1 rounded-xl border border-white/70">
                  <button
                    type="button"
                    onClick={() => setHomeFilterType('market')}
                    className={`flex-1 py-2 text-center text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                      homeFilterType === 'market'
                        ? 'bg-white/80 text-slate-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                    }`}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeFilterType('hostels')}
                    className={`flex-1 py-2 text-center text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                      homeFilterType === 'hostels'
                        ? 'bg-white/80 text-slate-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                    }`}
                  >
                    Residences
                  </button>
                </div>
              </div>
            </div>

            {/* Pinevela Digital Marketplace Section */}
            {homeFilterType === 'market' && (
              <div id="home-market-section" className="bg-transparent border-0 rounded-3xl p-0 shadow-none space-y-6 animate-fadeIn">
                  {/* Header Title and Subtitle - scrolls up naturally */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
                    <div>
                    <h3 className="text-lg font-black text-slate-900 flex flex-wrap items-center gap-2">
                      <ShoppingBag className="w-5 h-5 text-blue-700" />
                      Digital Student Market
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide">PineVela Verified P2P</span>
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      Buy, sell, and trade textbooks, electronics, appliances & room gear with verified students.
                    </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setShowNearbyServices(true)} className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700"><MapPin size={16} />Services near you</button>
                      <RegistrationStatusButton kind="merchant" status={merchantStatus} loading={merchantRegistration.isPending || checkingMerchant}
                        error={merchantRegistration.isError} onClick={() => void openMerchantRegistration()} />
                    </div>
                  </div>

                  <MarketplaceFilters catalogSearch={catalogSearch} setCatalogSearch={setCatalogSearch}
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
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 pb-2">
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
                <div id="home-hostels-section" className="bg-transparent border-0 rounded-3xl p-0 shadow-none space-y-6 animate-fadeIn">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
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
                      <p className="text-xs text-slate-500 font-medium">Try refining your search text or clear the filter.</p>
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
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-700" />
                    Notifications & Bulletins
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
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
                  <div key={`${notif.id}-${index}`} className={`p-4 ${notif.read ? 'bg-slate-50/70' : 'bg-white'} border ${notif.read ? 'border-slate-200/80' : 'border-blue-200/80 shadow-sm'} rounded-2xl flex items-start gap-3.5`}>
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
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold shadow-xs">
                  <Key className="w-6 h-6 text-blue-700" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    Resident Room Management
                    <span className="text-xs font-black px-2.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 rounded-full">
                      {userRooms.length} / 1 Active Room
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    View your active digital room key and manage your room account (restricted to 1 room per user account).
                  </p>
                </div>
              </div>

              <div>
                {userRooms.length < 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowClaimModal(true);
                      setClaimRoomKeyInput('');
                      setVerifiedKeyInfo(null);
                      setClaimError(null);
                      setClaimStep(1);
                    }}
                    className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-850 hover:to-indigo-850 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>Activate Digital Room Key</span>
                  </button>
                ) : (
                  <div className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
                    <span>Max Capacity (1 Room Per Account) Reached</span>
                  </div>
                )}
              </div>
            </div>

            {/* ROOM CARDS LIST */}
            {userRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {userRooms.map((roomItem: any, idx: number) => {
                  const rKey = roomItem.roomKey || roomItem.id;
                  const hostelName = roomItem.hostelName || registeredAccounts.residentAccount?.hostelName || currentUser?.hostelName || 'PineVela Residence';
                  const blockName = roomItem.blockName || currentUser?.blockName || 'Block A';
                  const roomNum = roomItem.roomNumber || currentUser?.roomNumber || '101';
                  const resName = roomItem.assignedStudentName || registeredAccounts.residentAccount?.name || currentUser?.name || 'Resident';
                  const resId = roomItem.assignedStudentId || registeredAccounts.residentAccount?.studentId || currentUser?.studentId || 'N/A';
                  const prog = roomItem.assignedProgram || registeredAccounts.residentAccount?.programOfStudy || currentUser?.programOfStudy || 'General Studies';
                  const managerName = roomItem.managerName || 'Hostel Operations Manager';
                  const managerPhone = roomItem.managerPhone || '+233 24 000 0000';

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
                                {rKey}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(rKey);
                                  triggerToast(`Copied Room Key ${rKey}`, 'success');
                                }}
                                className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                                title="Copy Key"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                            <div>
                              <span className="text-slate-400 block font-medium text-[10px]">Resident Name</span>
                              <span className="font-bold text-slate-800">{resName}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium text-[10px]">Phone Number</span>
                              <span className="font-bold text-slate-800">{roomItem.assignedStudentPhone || roomItem.phone || currentUser?.phone || 'Not specified'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium text-[10px]">Resident Email</span>
                              <span className="font-bold text-slate-800 truncate block">{roomItem.assignedStudentEmail || roomItem.email || currentUser?.email || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium text-[10px]">Hostel Manager</span>
                              <span className="font-bold text-slate-800 truncate block">{managerName} ({managerPhone})</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CARD ACTIONS */}
                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingRoomTarget(roomItem);
                            setDelRoomEmailInput(roomItem.assignedStudentEmail || roomItem.email || registeredAccounts.residentAccount?.email || currentUser?.email || '');
                            setDelRoomPasswordInput('');
                            setDelRoomError(null);
                          }}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Delete Room</span>
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
                  <p className="text-xs text-slate-650 leading-relaxed font-semibold">
                    If your hostel manager issued you a Digital Room Key, click below to verify your room and complete your resident account setup.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowClaimModal(true);
                    setClaimRoomKeyInput('');
                    setVerifiedKeyInfo(null);
                    setClaimError(null);
                    setClaimStep(1);
                  }}
                  className="px-8 py-3.5 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-850 hover:to-indigo-850 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-900/20 transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span>Verify Room Key & Start Onboarding</span>
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
              <div><h2 className="text-xl font-black text-slate-900">Purchases & Tracking</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">View your purchases, follow order updates, and track pickup or delivery.</p>
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

                  {/* Order History Cards List */}
                  {marketReadError && <p role="status" className="mb-3 text-sm text-red-700">{marketReadError}</p>}
                  {digitalMarketOrders.length > 0 ? (
                    <div className="space-y-6">
                      {digitalMarketOrders.map(order => {
                        const isBuyer = user?.role === 'user' && (currentUser?.id || user?.id) === order.buyerId;
                        return (
                          <div key={order.id} className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
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
                              {!['Completed & Paid', 'Cancelled', 'Location Rejected', 'Rejected by Seller'].includes(order.status) ? (
                                <div className="w-full sm:w-auto bg-white border border-slate-200 rounded-2xl p-3.5 text-center shadow-xs">
                                  {isBuyer ? (
                                    <div>
                                      <div className="text-[10px] font-extrabold uppercase text-slate-400">Escrow Handshake PIN</div>
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

                            {/* Chronological Progress Stepper Timeline */}
                            <div className="pt-3 border-t border-slate-200/60 space-y-2">
                              <h5 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Chronological Order Timeline</h5>
                              <div className="space-y-2 relative pl-4 border-l-2 border-blue-200">
                                {(order.timeline || []).map((step, idx) => (
                                  <div key={idx} className="relative text-xs">
                                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white" />
                                    <div className="font-bold text-slate-900">{step.title}</div>
                                    <div className="text-[10px] text-slate-500">{new Date(step.timestamp).toLocaleString()}</div>
                                    {step.notes && <div className="text-[11px] text-slate-650 mt-0.5 font-medium">{step.notes}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
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



        {showMerchantCard && <AccountStatusDialog title="Merchant Registration" onClose={() => setShowMerchantCard(false)}>
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
          <MarketplaceInbox initialPeerEmail={activeChatEmail} initialStore={usesSupabasePersistence?activeChatStore:undefined} />
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
                  {usesSupabasePersistence ? 'Enter your verified student email and password. If this email also opens your resident account, use the seller portal PIN when prompted.' : 'Enter your registered student email and digital store password. Primary resident account credentials cannot access the digital market platform.'}
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
                        <span className="text-blue-200">PineVela</span>
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
            <div className="bg-white/90 border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-slate-800" />
                    User Options & Account Preferences
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
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
                  if (updateUser) {
                    updateUser({
                      avatar: avatarUrl,
                      photo: avatarUrl,
                      photoUrl: avatarUrl,
                      avatarUrl: avatarUrl,
                      profilePicture: avatarUrl
                    });
                  }
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
                        <span>Reset Resident Password</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteAccountModal('resident', registeredAccounts.residentAccount?.email || currentUser?.email || '')}
                        className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Unlink & Delete Resident Account</span>
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
                    <div className="flex items-center justify-between border-b border-rose-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-rose-500 text-white shadow-md shadow-rose-500/20">
                          <Heart className="w-4 h-4" fill="#ffffff" />
                        </div>
                        <div>
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
                        <Heart className="w-6 h-6 text-slate-300 mx-auto animate-pulse" />
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
                                <Heart className="w-3 h-3" fill="#f43f5e" strokeWidth={0} />
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
      {showWelcomePopup && (
        <DashboardOverlay aria-label="Welcome to PineVela" onClose={() => setShowWelcomePopup(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-blue-100 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/30">
              </div>
              <button aria-label="Close dialog"
                type="button"
                onClick={() => setShowWelcomePopup(false)}
                className="w-10 h-10 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Welcome to the PineVela Community!
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                We're excited to have you here. PineVela is your unified platform to discover available student accommodations, report and track maintenance issues seamlessly, and connect with other residents. 
              </p>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                You can also use this same account to list your own properties as a Hostel Manager or offer your professional services as an Artisan or Staff member.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowWelcomePopup(false)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md transition-all cursor-pointer"
              >
                Got It, Let's Go!
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: LINK / CLAIM DIGITAL ROOM KEY */}
      {/* ========================================================================= */}
      {showClaimModal && usesSupabasePersistence && <SupabaseResidentActivation name={user?.name} phone={user?.phone} residenceId={claimHostelId} onClose={() => setShowClaimModal(false)} onActivated={() => { void queryClient.invalidateQueries({ queryKey:['userData'] }); }} />}
      {showClaimModal && !usesSupabasePersistence && (
        <DashboardOverlay aria-label="Resident Room Registration" onClose={() => setShowClaimModal(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="onboarding-fields bg-white/95 backdrop-blur-2xl rounded-3xl max-w-lg w-full p-5 sm:p-7 shadow-2xl border border-blue-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Resident Room Registration</span>
                    <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 tracking-wider">PineVela Key</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold leading-tight">
                    {claimStep === 1 && (availableHostels.find(hostel => hostel.id === claimHostelId)?.name ? `Enter the digital room key for ${availableHostels.find(hostel => hostel.id === claimHostelId).name}` : 'Enter your digital room key provided by your hostel manager')}
                    {claimStep === 2 && 'Enter your resident account details and password'}
                    {claimStep === 3 && 'Room verified! Your resident account is ready'}
                  </p>
                </div>
              </div>
              {claimStep !== 3 && (
                <button aria-label="Close dialog"
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <OnboardingProgress steps={ROOM_ACTIVATION_STEPS} step={claimStep} label="Room activation" />

            {/* STEP 1: Simple Digital Room Key Verification */}
            {claimStep === 1 && (
              <div className="space-y-4 pt-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 block">
                      Digital Room Key <span className="text-rose-600">*</span>
                    </label>
                    <span className="text-[10px] text-blue-750 font-bold">
                      Issued by Hostel Manager
                    </span>
                  </div>

                  <div className="relative">
                    <Key className="w-4 h-4 text-blue-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input aria-label="Digital Room Key"
                      type="text"
                      autoFocus
                      value={claimRoomKeyInput}
                      onChange={(e) => {
                        setClaimRoomKeyInput(e.target.value.toUpperCase());
                        setClaimError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleVerifyClaimKey();
                      }}
                      placeholder="e.g. MAZE-A-749201"
                      className="w-full pl-10 pr-24 py-3 bg-white border border-slate-200 rounded-2xl font-mono text-sm font-black uppercase text-slate-900 tracking-wider focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-400/20 shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerifyClaimKey()}
                      disabled={verifyingKey || !claimRoomKeyInput.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {verifyingKey ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck size={13} />
                      )}
                      <span>Verify Key</span>
                    </button>
                  </div>
                </div>

                {claimError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 font-bold flex items-center gap-2 animate-fade-in">
                    <ShieldAlert size={15} className="text-rose-600 shrink-0" />
                    <span>{claimError}</span>
                  </div>
                )}

                {/* Verified Room Card & Progression Button */}
                {verifiedKeyInfo && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl space-y-1.5 text-xs text-emerald-950 shadow-xs">
                      <div className="flex items-center justify-between font-black text-emerald-900">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 size={15} className="text-emerald-600" />
                          <span>Room Key Validated: {verifiedKeyInfo.roomKey}</span>
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-200/85 text-emerald-900 font-extrabold rounded-full text-[9px]">
                          Available
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-1 font-bold text-[10px] bg-white/75 p-2 rounded-xl border border-emerald-200/50">
                        <div>
                          <span className="text-slate-400 block text-[9px] font-semibold">Hostel</span>
                          <span className="text-slate-900 truncate block font-bold">{verifiedKeyInfo.hostelName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] font-semibold">Block</span>
                          <span className="text-slate-900 truncate block font-bold">{verifiedKeyInfo.blockName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] font-semibold">Room No.</span>
                          <span className="text-slate-900 truncate block font-bold">{verifiedKeyInfo.roomNumber}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setClaimStep(2)}
                        className="w-full py-3 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-800 hover:to-indigo-800 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Continue to Account Details</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Resident Credentials (Username, Phone, Email, Password only) */}
            {claimStep === 2 && verifiedKeyInfo && (
              <div className="space-y-4 pt-1">
                {/* Room Info Badge */}
                <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-center justify-between text-xs text-blue-950">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-bold">{verifiedKeyInfo.hostelName} ({verifiedKeyInfo.blockName}, Room {verifiedKeyInfo.roomNumber})</span>
                  </div>
                  <span className="font-mono text-[10px] font-bold bg-blue-200/80 px-2 py-0.5 rounded-md text-blue-900">
                    {verifiedKeyInfo.roomKey}
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Username / Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-800 block">
                      Username / Full Name <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input aria-label="Username / Full Name"
                        type="text"
                        required
                        value={claimStudentName}
                        onChange={(e) => setClaimStudentName(e.target.value)}
                        placeholder="e.g. Kwesi Mensah"
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* Phone Number */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-800 block">
                      Phone Number <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input aria-label="Phone Number"
                        type="tel"
                        required
                        value={claimStudentPhone}
                        onChange={(e) => setClaimStudentPhone(e.target.value)}
                        placeholder="e.g. +233 24 123 4567"
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* KNUST Student Email Requirement */}
                  <div className="space-y-2 bg-blue-50/60 border border-blue-200/80 p-3.5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-blue-700" />
                        <span>KNUST Student Email</span>
                        <span className="text-rose-600">*</span>
                      </label>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full border border-blue-200">
                        Required Format
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-snug">
                      Your primary user account email cannot be used. Only an official KNUST student email is permitted (e.g. <strong>username@st.knust.edu.gh</strong> or <strong>username@knust.edu.gh</strong>). This email serves as your dedicated credential for logging into your digital room.
                    </p>

                    <div className="relative pt-1">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input aria-label="KNUST Student Email"
                        type="email"
                        required
                        value={claimEmail}
                        onChange={(e) => setClaimEmail(e.target.value)}
                        placeholder="e.g. kwame.mensah@st.knust.edu.gh"
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* Password & Confirm Password */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-800 block">
                        Password <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input aria-label="Password"
                          type={showClaimPassword ? "text" : "password"}
                          required
                          value={claimPassword}
                          onChange={(e) => setClaimPassword(e.target.value)}
                          placeholder="Min 6 chars"
                          className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                        <button aria-label={showClaimPassword ? 'Hide password' : 'Show password'} aria-pressed={showClaimPassword}
                          type="button"
                          onClick={() => setShowClaimPassword(!showClaimPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showClaimPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <PasswordStrengthGauge password={claimPassword} />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-800 block">
                        Confirm Password <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input aria-label="Confirm Password"
                          type={showClaimConfirmPassword ? "text" : "password"}
                          required
                          value={claimConfirmPassword}
                          onChange={(e) => setClaimConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                        <button aria-label={showClaimConfirmPassword ? 'Hide password' : 'Show password'} aria-pressed={showClaimConfirmPassword}
                          type="button"
                          onClick={() => setShowClaimConfirmPassword(!showClaimConfirmPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showClaimConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <PasswordStrengthGauge password={claimConfirmPassword} />
                    </div>
                  </div>

                  <label className="flex items-start gap-2 pt-1 text-[11px] text-slate-600 cursor-pointer font-medium leading-normal">
                    <input
                      type="checkbox"
                      checked={claimAgreeTerms}
                      onChange={(e) => setClaimAgreeTerms(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span>
                      I agree to the <strong>Hostel Community Code of Conduct</strong> and PineVela Resident Terms.
                    </span>
                  </label>
                </div>

                {claimError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 font-bold flex items-center gap-2 animate-fade-in">
                    <ShieldAlert size={15} className="text-rose-600 shrink-0" />
                    <span>{claimError}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setClaimStep(1)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleClaimRoomKey}
                    disabled={submittingClaim || !claimStudentName.trim() || !claimStudentPhone.trim() || !claimPassword.trim() || claimPassword !== claimConfirmPassword || !claimAgreeTerms}
                    className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submittingClaim ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Registering & Activating...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={15} />
                        <span>Complete Registration & Enter Room</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Minimalistic Confirmation & Room Activated */}
            {claimStep === 3 && verifiedKeyInfo && (
              <div className="space-y-5 text-center py-4 animate-fade-in">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce">
                  <CheckCircle2 size={32} />
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">
                    Room Successfully Activated!
                  </h4>
                  <p className="text-xs text-slate-600 max-w-sm mx-auto font-medium">
                    Welcome to <strong>{verifiedKeyInfo.hostelName}</strong>. Your resident account credentials have been created and all details are synchronized.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2 text-xs">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Digital Room Key:</span>
                    <strong className="font-mono text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-200">{verifiedKeyInfo.roomKey}</strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Resident Name:</span>
                    <strong className="text-slate-800">{claimStudentName || currentUser?.name}</strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Login Email:</span>
                    <strong className="text-slate-800">{claimEmail || currentUser?.email}</strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Room Location:</span>
                    <strong className="text-slate-800">{verifiedKeyInfo.blockName} • Room {verifiedKeyInfo.roomNumber}</strong>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-left space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-black text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Room Credentials Activated</span>
                    </div>
                    <p className="text-[11px] text-emerald-800 font-medium">
                      Your digital room credentials have been created with your official KNUST student email (<strong>{claimEmail}</strong>). To enter your digital room dashboard, sign out and sign in using your KNUST student email and password.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowClaimModal(false);
                      setActiveTab('login-room');
                    }}
                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Close & View in Registered Rooms
                  </button>
                </div>
              </div>
            )}

          </div>
        </DashboardOverlay>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RESET REGISTERED ACCOUNT PASSWORD */}
      {/* ========================================================================= */}
      {showResetPasswordModal && (
        <DashboardOverlay aria-label="Reset Registered Account Password" onClose={() => setShowResetPasswordModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Reset Resident Password
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

            <form onSubmit={handleResetRegisteredAccountPassword} className="space-y-4">
              {resetTargetRole === 'resident' && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-800 block">Old / Current Resident Password *</label>
                  <input aria-label="Old / Current Resident Password"
                    type="password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Enter your current resident password"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                    required
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 block">New Password</label>
                <input aria-label="New Password"
                  type="password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Enter new password (at least 6 characters)"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                  required
                />
                <PasswordStrengthGauge password={newPasswordInput} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 block">Confirm New Password</label>
                <input aria-label="Confirm New Password"
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                  required
                />
                <PasswordStrengthGauge password={confirmPasswordInput} />
              </div>

              {resetPasswordError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{resetPasswordError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetPasswordModal(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {resettingPassword ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>Update Password</span>
                </button>
              </div>
            </form>
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
        <DashboardOverlay aria-label="Sign Out Confirmation" onClose={() => setShowSignoutConfirmModal(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
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
      {showAddRoomModal && (
        <DashboardOverlay aria-label="Register Additional Room" onClose={() => setShowAddRoomModal(false)} className="fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="onboarding-fields bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-100 text-blue-900 font-bold">
                  <Plus className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Register Additional Room</h3>
                  <p className="text-xs text-slate-500 font-medium">Add up to 5 rooms under your resident account.</p>
                </div>
              </div>
              <button aria-label="Close dialog"
                type="button"
                onClick={() => setShowAddRoomModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <OnboardingProgress steps={ROOM_ACTIVATION_STEPS} step={verifiedAddKeyInfo ? 2 : 1} label="Room registration" />

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!addRoomKeyInput.trim()) return;
                setSubmittingAddRoom(true);
                setAddRoomError(null);
                try {
                  const res = await apiFetch('/api/student/add-room', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomKey: addRoomKeyInput.trim() })
                  });
                  if (res && res.success) {
                    triggerToast(res.message || "Room added successfully!", 'success');
                    setUserRooms(res.rooms || []);
                    setShowAddRoomModal(false);
                    setAddRoomKeyInput('');
                    setVerifiedAddKeyInfo(null);
                  } else {
                    setAddRoomError(res?.error || "Failed to register room key.");
                  }
                } catch (err: any) {
                  setAddRoomError(err.message || "Error adding room key.");
                } finally {
                  setSubmittingAddRoom(false);
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-600 block">
                  Digital Room Key Code
                </label>
                <div className="flex items-center gap-2">
                  <input aria-label="Digital Room Key Code"
                    type="text"
                    value={addRoomKeyInput}
                    onChange={(e) => {
                      setAddRoomKeyInput(e.target.value.toUpperCase());
                      setAddRoomError(null);
                      setVerifiedAddKeyInfo(null);
                    }}
                    placeholder="e.g. MAZE-B-204123"
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 uppercase"
                  />
                  <button
                    type="button"
                    disabled={verifyingAddKey || !addRoomKeyInput.trim()}
                    onClick={async () => {
                      if (!addRoomKeyInput.trim() || addRoomKeyInput.trim().length < 5) {
                        setAddRoomError("Please enter a valid digital room key format.");
                        return;
                      }
                      setVerifyingAddKey(true);
                      setAddRoomError(null);
                      try {
                        const res = await apiFetch('/api/room-keys/verify', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ roomKey: addRoomKeyInput.trim() })
                        });
                        if (res && res.valid) {
                          setVerifiedAddKeyInfo(res);
                          setAddRoomError(null);
                          triggerToast(`Room Found: ${res.hostelName} (${res.blockName}, Room ${res.roomNumber})`, 'success');
                        } else {
                          setVerifiedAddKeyInfo(null);
                          setAddRoomError(res?.error || "Invalid room key or already used.");
                        }
                      } catch (err: any) {
                        setVerifiedAddKeyInfo(null);
                        setAddRoomError(err.message || "Failed to verify key.");
                      } finally {
                        setVerifyingAddKey(false);
                      }
                    }}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {verifyingAddKey ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Verify</span>
                  </button>
                </div>
              </div>

              {addRoomError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{addRoomError}</span>
                </div>
              )}

              {verifiedAddKeyInfo && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-emerald-900 font-black">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Digital Room Key Verified!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-700 font-medium">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Hostel</span>
                      <span className="font-bold text-slate-900">{verifiedAddKeyInfo.hostelName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Room & Block</span>
                      <span className="font-bold text-slate-900">{verifiedAddKeyInfo.blockName}, Room {verifiedAddKeyInfo.roomNumber}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddRoomModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAddRoom || !addRoomKeyInput.trim()}
                  className="px-6 py-2.5 bg-blue-900 hover:bg-blue-850 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingAddRoom ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Claim & Register Room</span>
                </button>
              </div>
            </form>
          </div>
        </DashboardOverlay>
      )}

      {/* DELETE / UNLINK ROOM CONFIRMATION MODAL */}
      {deletingRoomTarget && (
        <DashboardOverlay aria-label="Delete Resident Room" onClose={() => { setDeletingRoomTarget(null); setDelRoomError(null); setDelRoomPasswordInput(''); }} className="fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5 animate-scaleUp">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 font-bold">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Delete Resident Room</h3>
                <p className="text-xs text-slate-500 font-medium">Confirm account details to release digital room key.</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600 font-medium">
              <p>
                Deleting <strong className="text-slate-900">{deletingRoomTarget.hostelName || 'Hostel Room'} ({deletingRoomTarget.blockName || 'Block'}, Room {deletingRoomTarget.roomNumber || 'Room'})</strong> with key <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 font-bold">{deletingRoomTarget.roomKey}</code>.
              </p>

              {delRoomError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{delRoomError}</span>
                </div>
              )}

              <div className="space-y-3 pt-1">
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-700 block mb-1">
                    Resident Account Email
                  </label>
                  <input aria-label="Resident Account Email"
                    type="email"
                    value={delRoomEmailInput}
                    onChange={(e) => {
                      setDelRoomEmailInput(e.target.value);
                      setDelRoomError(null);
                    }}
                    placeholder="e.g. resident@gmail.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase text-slate-700 block mb-1">
                    Resident Account Password
                  </label>
                  <input aria-label="Resident Account Password"
                    type="password"
                    value={delRoomPasswordInput}
                    onChange={(e) => {
                      setDelRoomPasswordInput(e.target.value);
                      setDelRoomError(null);
                    }}
                    placeholder="Enter password for this resident account"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                    Enter the secure password used when creating this resident account.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setDeletingRoomTarget(null);
                  setDelRoomError(null);
                  setDelRoomPasswordInput('');
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingDeleteRoom}
                onClick={async () => {
                  if (!deletingRoomTarget) return;
                  if (!delRoomEmailInput.trim()) {
                    setDelRoomError("Please enter the resident account email.");
                    return;
                  }
                  if (!delRoomPasswordInput.trim()) {
                    setDelRoomError("Please enter the resident account password to confirm deletion.");
                    return;
                  }
                  setSubmittingDeleteRoom(true);
                  setDelRoomError(null);
                  try {
                    const res = await apiFetch('/api/student/delete-room', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        roomKey: deletingRoomTarget.roomKey,
                        email: delRoomEmailInput.trim(),
                        password: delRoomPasswordInput.trim()
                      })
                    });
                    if (res && res.success) {
                      triggerToast(res.message || "Room deleted successfully!", 'success');
                      setUserRooms(res.rooms || []);
                      setDeletingRoomTarget(null);
                      setDelRoomPasswordInput('');
                    } else {
                      setDelRoomError(res?.error || "Failed to delete room. Please check your credentials.");
                    }
                  } catch (err: any) {
                    setDelRoomError(err.message || "Error unlinking room. Verify credentials.");
                  } finally {
                    setSubmittingDeleteRoom(false);
                  }
                }}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingDeleteRoom ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Verify & Delete Room</span>
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* PINEVELA FULL-SCREEN STUDENT MERCHANT ONBOARDING WIZARD (WHITE FROSTY THEME & ROOT Z-INDEX) */}
      {showDMRegModal && usesSupabasePersistence && <SupabaseSellerRegistration key={user?.id} name={user?.name} phone={user?.phone} categories={DIGITAL_MARKET_CATEGORIES} onClose={() => setShowDMRegModal(false)} onSubmitted={() => {void loadDigitalMarketData();void queryClient.invalidateQueries({queryKey:['userData']});triggerToast('Seller application submitted for review.');}} />}
      {showDMRegModal && !usesSupabasePersistence && (
        <DashboardOverlay aria-label="Digital Market Registration" onClose={() => { setShowDMRegModal(false); setDmWizardPhase(1); }} layer={99999} className="fixed inset-0 h-full w-full bg-slate-50/95 backdrop-blur-md flex flex-col items-center justify-start p-3 sm:p-6 overflow-hidden font-sans text-slate-800 animate-fadeIn">
          
          {/* Ambient background blur shapes */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl opacity-30 -z-10 pointer-events-none fixed" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-100/60 rounded-full blur-3xl opacity-30 -z-10 pointer-events-none fixed" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] md:w-[120%] h-[380px] md:h-[480px] bg-gradient-to-b from-blue-50/70 via-slate-50/60 to-blue-100/30 border-b border-blue-200/30 rounded-b-[50%] -z-10 shadow-sm pointer-events-none fixed" />

          {/* STATIC TOP HEADER BAR - DOES NOT SCROLL AWAY WITH FORM */}
          <div className="w-full max-w-4xl flex items-center justify-between my-2 shrink-0 relative bg-white/95 backdrop-blur-md px-6 py-3.5 rounded-2xl border border-slate-200/90 shadow-md z-30">
            <div className="flex items-center gap-3">
              <PineLogo size={32} hideText={false} />
              <span className="hidden sm:inline-block h-5 w-px bg-slate-200" />
              <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200/80">
                Digital Market Gateway
              </span>
            </div>

            <button 
              type="button"
              onClick={() => {
                setShowDMRegModal(false);
                setDmWizardPhase(1);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition-all cursor-pointer border border-slate-200"
              title="Close and return to dashboard"
            >
              <X size={18} />
            </button>
          </div>

          {/* SCROLLABLE FORM BODY CONTAINER */}
          <div className="w-full max-w-4xl flex-1 overflow-y-auto pb-12 pr-0.5">
            <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden relative z-10 space-y-0 my-2 sm:my-4">
              
              {/* Accent Top Bar */}
              <div className="h-1.5 bg-gradient-to-r from-blue-900 via-indigo-800 to-blue-700 w-full" />

            <div className="p-6 sm:p-8"><OnboardingProgress steps={MARKET_APPLICATION_STEPS} step={dmWizardPhase} label="Marketplace application" /></div>

            {/* Form Body Container */}
            <div className="onboarding-fields p-6 sm:p-10 space-y-6 text-slate-800">
              
              {dmRegError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                  <span>{dmRegError}</span>
                </div>
              )}

              {/* PHASE 1: STUDENT IDENTITY & ACCREDITATION */}
              {dmWizardPhase === 1 && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-3">
                    <User className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-blue-950 block font-black text-xs mb-0.5">Phase 1 of 3: Academic Identity & Accreditation</strong>
                      Please provide your legal student identity and select your accredited Ghanaian institution.
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Full Legal Name <span className="text-rose-500">*</span>
                    </label>
                    <input aria-label="Full Legal Name"
                      type="text"
                      required
                      placeholder="e.g. Samuel Mensah"
                      value={dmFullName}
                      onChange={e => setDmFullName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800 transition-all"
                    />
                    <p className="text-[11px] text-slate-500 font-medium">Use the name recorded by your university.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Accredited Ghanaian University <span className="text-rose-500">*</span>
                    </label>
                    <select aria-label="Accredited Ghanaian University"
                      value={dmUniversity}
                      onChange={e => setDmUniversity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800 transition-all"
                    >
                      <option value="Kwame Nkrumah University of Science and Technology (KNUST)">KNUST - Kwame Nkrumah Univ of Science & Tech</option>
                      <option value="University of Ghana (UG - Legon)">UG - University of Ghana (Legon)</option>
                      <option value="University of Cape Coast (UCC)">UCC - University of Cape Coast</option>
                      <option value="University of Professional Studies, Accra (UPSA)">UPSA - Univ of Professional Studies Accra</option>
                      <option value="University for Development Studies (UDS)">UDS - Univ for Development Studies</option>
                      <option value="University of Mines and Technology (UMaT)">UMaT - Univ of Mines & Tech</option>
                      <option value="University of Health and Allied Sciences (UHAS)">UHAS - Univ of Health & Allied Sciences</option>
                      <option value="Ashesi University">Ashesi University</option>
                      <option value="Ghana Communication Technology University (GCTU)">GCTU - Ghana Communication Tech Univ</option>
                      <option value="Accra Technical University (ATU)">ATU - Accra Technical University</option>
                      <option value="Kumasi Technical University (KsTU)">KsTU - Kumasi Technical University</option>
                      <option value="University of Energy and Natural Resources (UENR)">UENR - Univ of Energy & Natural Resources</option>
                      <option value="University of Education, Winneba (UEW)">UEW - Univ of Education Winneba</option>
                      <option value="AAMUSTED">AAMUSTED - Akenten Appiah-Menka Univ</option>
                    </select>
                  </div>

                  {/* Student identification input */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                        Student ID or School-issued ID <span className="text-rose-500">*</span>
                      </label>
                      {dmIdNumber && (
                        /^[A-Z0-9][A-Z0-9\-\/]{3,31}$/i.test(dmIdNumber) ? (
                          <span className="text-[10px] font-black text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-blue-300">
                            <Check className="w-3 h-3" /> Valid ID format
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-300">
                            {dmIdNumber.length}/32 chars
                          </span>
                        )
                      )}
                    </div>

                    <input aria-label="Student ID or School-issued ID"
                      type="text"
                      required
                      maxLength={32}
                      placeholder="e.g. KNUST/2024/00123"
                      value={dmIdNumber}
                      onChange={e => setDmIdNumber(e.target.value.toUpperCase())}
                      className={`w-full bg-white border rounded-2xl px-4 py-3 text-xs sm:text-sm font-bold font-mono tracking-wider transition-all ${
                        dmIdNumber && /^[A-Z0-9][A-Z0-9\-\/]{3,31}$/i.test(dmIdNumber)
                          ? 'border-blue-600 text-blue-950 focus:outline-none'
                          : 'border-slate-200 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-800'
                      }`}
                    />
                    <p className="text-[11px] text-slate-500 font-medium">
                      Use your active university Student ID or another school-issued ID.
                    </p>
                  </div>
                </div>
              )}

              {/* PHASE 2: MERCHANT SECURITY & CREDENTIALS */}
              {dmWizardPhase === 2 && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-3">
                    <Lock className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-blue-950 block font-black text-xs mb-0.5">Phase 2 of 3: Merchant Security & Credentials</strong>
                      Set up your student merchant portal authentication credentials.
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                        Student Email Address <span className="text-rose-500">*</span>
                      </label>
                      {dmStudentEmail && (
                        isCommercialEmail(dmStudentEmail) ? (
                          <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-300">
                            Commercial Email Not Permitted
                          </span>
                        ) : isValidStudentDomain(dmStudentEmail) ? (
                          <span className="text-[10px] font-black text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-blue-300">
                            <Check className="w-3 h-3" /> Valid Domain
                          </span>
                        ) : null
                      )}
                    </div>
                    <input aria-label="Student Email Address"
                      type="email"
                      required
                      placeholder="Enter your student email address"
                      value={dmStudentEmail}
                      onChange={e => setDmStudentEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800 transition-all font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                        Student Merchant Password <span className="text-rose-500">*</span>
                      </label>
                      <button aria-label={showDmPassword ? 'Hide password' : 'Show password'} aria-pressed={showDmPassword}
                        type="button"
                        onClick={() => setShowDmPassword(!showDmPassword)}
                        className="text-xs font-bold text-blue-800 hover:text-blue-950 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {showDmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showDmPassword ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>
                    <input aria-label="Student Merchant Password"
                      type={showDmPassword ? "text" : "password"}
                      required
                      placeholder="Create a secure 6+ character password"
                      value={dmPassword}
                      onChange={e => setDmPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800 transition-all"
                    />
                    <PasswordStrengthGauge password={dmPassword} />
                    <p className="text-[11px] text-slate-500 font-medium">Used to access your student seller store and inventory dashboard.</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                        Confirm Merchant Password <span className="text-rose-500">*</span>
                      </label>
                      {dmConfirmPassword && (
                        dmPassword === dmConfirmPassword ? (
                          <span className="text-[10px] font-black text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-blue-300">
                            <Check className="w-3 h-3" /> Passwords Match
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-300">
                            Passwords Mismatch
                          </span>
                        )
                      )}
                    </div>
                    <input aria-label="Confirm Merchant Password"
                      type={showDmPassword ? "text" : "password"}
                      required
                      placeholder="Re-enter your merchant password"
                      value={dmConfirmPassword}
                      onChange={e => setDmConfirmPassword(e.target.value)}
                      className={`w-full bg-slate-50 border rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 font-semibold focus:outline-none transition-all ${
                        dmConfirmPassword && dmPassword !== dmConfirmPassword ? 'border-rose-400 focus:ring-2 focus:ring-rose-500' : 'border-slate-200 focus:ring-2 focus:ring-blue-800'
                      }`}
                    />
                    <PasswordStrengthGauge password={dmConfirmPassword} />
                  </div>
                </div>
              )}

              {/* PHASE 3: STORE SPECIALIZATION & ACCREDITATION REVIEW */}
              {dmWizardPhase === 3 && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-3">
                    <ShoppingBag className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-blue-950 block font-black text-xs mb-0.5">Phase 3 of 3: Store Category & Verification Review</strong>
                      Choose your primary product line and review the verified merchant activation terms.
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Primary Selling Category <span className="text-rose-500">*</span>
                    </label>
                    <select aria-label="Primary Selling Category"
                      value={dmCategory}
                      onChange={e => setDmCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-800 transition-all"
                    >
                      {DIGITAL_MARKET_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Proposed Campus Store Name <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input aria-label="Proposed Campus Store Name (Optional)"
                      type="text"
                      placeholder={`e.g. ${dmFullName ? dmFullName.trim() + "'s Campus Market" : "Campus Tech Depot"}`}
                      value={dmProposedStoreName}
                      onChange={e => setDmProposedStoreName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-800 transition-all"
                    />
                  </div>

                  {/* Fee & Verified P2P Schedule Card */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-blue-200 space-y-2.5">
                    <div className="flex justify-between items-center text-xs font-black text-blue-900">
                      <span>Registration Fee: <strong>{marketPrices?.registrationFee ?? "…"} GHS</strong> + <strong>{marketPrices?.semesterFee ?? "…"} GHS</strong> every two months + selected monthly plan</span>
                      <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 rounded-full font-black text-[10px]">
                        Verified P2P
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      🛡️ <strong>Verified P2P Activation:</strong> Verified P2P merchant access is only accepted and unlocked after you have completed setting up your digital market following approval by the manager/admin. Payment is verified by the server after Paystack checkout.
                    </p>
                  </div>

                  {/* Student Code of Conduct & Identity Certification */}
                  <label className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3 cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={dmCertifyAccepted}
                      onChange={e => setDmCertifyAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-800 focus:ring-blue-800 cursor-pointer"
                    />
                    <span className="text-xs text-slate-700 font-medium leading-relaxed">
                      I certify that I am an enrolled student at the selected university and that all details and identification provided are genuine. I agree to abide by PineVela Student Market community guidelines.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Wizard Navigation Footer */}
            <div className="p-6 sm:px-10 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
              {dmWizardPhase === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowDMRegModal(false);
                    setDmWizardPhase(1);
                  }}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDmRegError(null);
                    setDmWizardPhase((dmWizardPhase - 1) as any);
                  }}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              )}

              {dmWizardPhase === 1 && (
                <button
                  type="button"
                  onClick={handleNextDmPhase1}
                  className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Next: Merchant Security</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {dmWizardPhase === 2 && (
                <button
                  type="button"
                  onClick={handleNextDmPhase2}
                  className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Next: Store Review</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {dmWizardPhase === 3 && (
                <button
                  type="button"
                  onClick={() => handleRegisterDigitalMarket()}
                  disabled={submittingDMReg}
                  className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submittingDMReg ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Submitting Application...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Submit Application</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </DashboardOverlay>
    )}

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
