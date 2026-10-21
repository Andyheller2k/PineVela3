import OrderTimeline from './OrderTimeline';
import OrderNotifications from './OrderNotifications';
import OrderCancelButton from './OrderCancelButton';
import {readOrderHistoryPage,mergeOrderHistory,type OrderHistoryPage} from '../lib/orderHistory';
import { useId } from 'react';
import MarketSortSelect from './MarketSortSelect';
import MarketPricePanel from './MarketPricePanel';
import SupportNotificationLink from './SupportNotificationLink';
import HelpLink from './HelpLink';
import AppearanceSettings from './AppearanceSettings';
import { activateOnKeyboard } from '../lib/keyboardActivation';

import {
ArrowRight,
BadgeCheck,
Bell,
CheckCheck,
CheckCircle2,
ChevronDown,
Clock,
Compass,
CreditCard,
Crop,
DollarSign,
Edit3,
Image as ImageIcon,
Inbox,
LogOut,
MapPin,
MessageSquare,
Package,
Phone,
Plus,
RefreshCw,
Search,
ShieldCheck,
ShoppingBag,
SlidersHorizontal,
Star,
Store,
Tag,
Trash2,
TrendingUp,
Users,
Wrench,
X,
XCircle
} from 'lucide-react';
import React,{ memo,useCallback,useEffect,useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { internationalPhone,phoneDraft,type CountryCode } from '../../internationalPhone';
import { isMarketService } from '../../marketListingAvailability';
import type { MarketPlan } from '../../marketPlans';
import { effectiveMarketPlan,PLAN_LIMITS } from '../../marketPlans';
import { servicePoint } from '../../serviceLocation';
import { STORE_DELIVERY_METHODS,storeDeliveryMode } from '../../storeDelivery';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { AccountRefreshGate } from '../lib/accountRefresh';
import { routePopupFeedback } from '../lib/feedback';
import { optimizeImageDisplayUrl } from '../lib/imageOptimizer';
import { marketNoticeKind } from '../lib/marketNotifications';
import { openPaymentCheckout } from '../lib/payments';
import { currentSessionGeneration, sessionFetch as fetch } from '../lib/session';
import { readDashboardSnapshot, saveDashboardSnapshot } from '../lib/dashboardSnapshot';
import CampusMeetupMapPicker from './LazyCampusMeetupMapPicker';
import DashboardOverlay from './DashboardOverlay';
import InternationalPhoneInput from './InternationalPhoneInput';
import ItemImageCropModal from './ItemImageCropModal';
import ListingPlanBadge from './ListingPlanBadge';
import MarketPhotoUpload from './MarketPhotoUpload';
import MarketplaceInbox from './MarketplaceInbox';
import MobileNavigation from './MobileNavigation';
import PineLogo, { PineWordmark } from './PineLogo';
import '../marketCards.css';
import PortalPinSettings from './PortalPinSettings';
import RouteSkeleton from './RouteSkeleton';
import StoreBrandingEditor from './StoreBrandingEditor';
import StoreProfileSummary from './StoreProfileSummary';
import TopNavBadge from './TopNavBadge';

export const DIGITAL_MARKET_CATEGORIES = [
  "Services",
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

interface MarketProduct {
  rating?: number;
  reviewCount?: number;
  id: string;
  storeId: string;
  storeName: string;
  sellerId: string;
  sellerEmail: string;
  sellerUniversity: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  stockQuantity: number | null;
  imageUrl: string;
  additionalImages?: string[];
  condition?: string;
  meetingLocation?: string;
  isAvailable: boolean;
  isService?: boolean;
  serviceLocationMode?: 'flexible' | 'fixed' | 'hybrid';
  serviceCategory?: string;
  priceCategories?: Array<{ id?: string; name: string; price: number; description?: string; imageUrl?: string }>;
  callLine?: string;
  location?: string;
  lat?: number;
  lng?: number;
  workingDays?: string;
  openingTime?: string;
  closingTime?: string;
  isOpen247?: boolean;
  createdAt: string;
  updatedAt: string;
  timeline?: import('../types').DigitalMarketOrderTimeline[];
  timelineCursor?:string|null;
  timelineHasMore?:boolean;
}

interface MarketOrder {
  id: string;
  productId: string;
  productTitle: string;
  productPrice: number;
  priceCategory?: string;
  productImage?: string;
  quantity: number;
  totalAmount: number;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  buyerPhone?: string;
  sellerId: string;
  sellerEmail: string;
  storeId: string;
  storeName: string;
  university: string;
  meetingLocation: string;
  meetingLatitude?: number;
  meetingLongitude?: number;
  sellerConfirmed?: boolean;
  sellerAgreedLocation?: boolean;
  sellerAgreedAt?: string;
  status: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
}

interface SellerInventoryCardProps {
  product: MarketProduct;
  plan: MarketPlan;
  onUpdateStock: (product: MarketProduct, delta: number) => void;
  onDeleteProduct: (product: MarketProduct) => void;
}

const SellerInventoryCard: React.FC<SellerInventoryCardProps> = memo(
  ({ product, plan, onUpdateStock, onDeleteProduct }) => {
    const isService = isMarketService(product);

    return (
      <div
        data-market-plan={plan} data-listing-id={product.id} data-market-kind={isService ? 'service' : 'item'}
        className={`market-plan-card ${isService ? '' : 'market-product-card market-inventory-card'} bg-slate-100/55 border border-slate-300/60 rounded-3xl overflow-hidden shadow-none hover:bg-slate-100/80 hover:border-blue-300 transition-all duration-150 flex flex-col justify-between`}
      >
        <div>
          <div className="market-card-thumbnail relative h-48 bg-slate-900/5 overflow-hidden flex items-center justify-center p-1 border-b border-slate-100">
            <img
              src={optimizeImageDisplayUrl(product.imageUrl, 150, 20)}
              alt={product.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
            <ListingPlanBadge plan={plan} />
            {isService ? (
              <div className="absolute top-3 left-3 px-2.5 py-1 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white text-[9px] font-black rounded-lg uppercase flex items-center gap-1 shadow-xs">
                <PineWordmark />
                <span>(Service)</span>
              </div>
            ) : (
              <div className="market-card-category absolute top-1.5 left-1.5 max-w-[90px] truncate px-1.5 py-0.5 bg-slate-900/80 backdrop-blur-md text-white text-[8px] font-black rounded-md uppercase">
                {product.category}
              </div>
            )}
            <div className={`market-card-price absolute ${isService ? 'top-3 right-3 px-2.5 py-1 text-xs rounded-lg' : 'top-1.5 right-1.5 px-1.5 py-0.5 text-[9px] rounded-md'} bg-blue-600 text-white font-black shadow-xs`}>
              GH₵ {product.price}
            </div>
          </div>

          <div className="market-card-copy p-5 space-y-2">
            <h3 className="text-xs font-black text-slate-950 line-clamp-1">{product.title}</h3>
            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{product.description || 'No description provided.'}</p>
          </div>
        </div>

        <div className="market-card-footer p-5 pt-3 border-t border-slate-200/60 space-y-3 bg-transparent">
          {!isService ? (
            /* REAL TIME STOCK ADJUSTER - ONLY FOR PHYSICAL PRODUCTS */
            <div className="market-inventory-stock flex items-center justify-between">
              <div className="text-xs font-bold text-slate-500">
                Stock
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateStock(product, -1)}
                  disabled={Number(product.stockQuantity) <= 1}
                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-sm flex items-center justify-center cursor-pointer disabled:opacity-40"
                  title="Decrease Stock Quantity"
                >
                  -
                </button>
                <span aria-label={`${product.stockQuantity} units in stock`} className={`w-6 text-center text-xs font-black ${Number(product.stockQuantity) > 0 ? 'text-slate-950' : 'text-rose-600'}`}>{product.stockQuantity}</span>
                <button
                  type="button"
                  onClick={() => onUpdateStock(product, 1)}
                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-sm flex items-center justify-center cursor-pointer"
                  title="Increase Stock Quantity"
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            /* SERVICE STATUS BADGE FOR SELLERS */
            <div className="flex items-center justify-between py-1">
             
              <div className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                Open for Bookings
              </div>
            </div>
          )}

          <div className="market-inventory-actions flex items-center justify-between gap-2 pt-2 border-t border-slate-200/50">
            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
              !isService
                ? (Number(product.stockQuantity) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')
                : 'bg-blue-100 text-blue-800'
            }`}>
              {!isService ? (Number(product.stockQuantity) > 0 ? 'Active in Market' : 'Out of Stock') : 'Service Listed'}
            </span>

            <button
              type="button"
              onClick={() => onDeleteProduct(product)}
              className="px-2.5 py-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.product.id === next.product.id &&
      prev.product.title === next.product.title &&
      prev.product.price === next.product.price &&
      prev.product.imageUrl === next.product.imageUrl &&
      prev.product.stockQuantity === next.product.stockQuantity &&
      prev.product.isAvailable === next.product.isAvailable &&
      prev.product.description === next.product.description &&
      prev.product.category === next.product.category
    );
  }
);

SellerInventoryCard.displayName = 'SellerInventoryCard';

type SellerDashboardSnapshot = {
  store: any;
  application: any;
  products: MarketProduct[];
  orders: MarketOrder[];
};

export default function PageDigitalMarket() {
  const navigate = useNavigate();
  const { user, logout, apiFetch } = useAuth();
  const cachedDashboard = readDashboardSnapshot<SellerDashboardSnapshot>('seller', user?.id);
  const currentAccount=useRef(user?.id),accountEpoch=useRef(0),accountGeneration=useRef(0),mounted=useRef(true);
  if(currentAccount.current!==user?.id){currentAccount.current=user?.id;accountEpoch.current++;accountGeneration.current++;}
  const [loadedAccount,setLoadedAccount]=useState<string | undefined>(cachedDashboard ? user?.id : undefined);
  const accountIsCurrent=(id:string | undefined,generation?:number)=>mounted.current && currentAccount.current===id && (generation===undefined || generation===accountGeneration.current);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const initialLoadCompletedRef = useRef<boolean>(!!cachedDashboard);
  const profileDraftInitialized = useRef(false);
  const dashboardReads = useRef(new AccountRefreshGate());

  useEffect(() => {
    document.documentElement.classList.add('marketplace-scrollbar-hidden');
    return () => document.documentElement.classList.remove('marketplace-scrollbar-hidden');
  }, []);

  // Role Protection Guard: Only merchant and student roles can access digital market platform
  useEffect(() => {
    if (user) {
      if ((!['merchant','staff','manager','admin'].includes(user.role))) {
        navigate(user.role === 'student' ? '/resident/dashboard' : '/user/dashboard', {replace:true});return;
      }
      if (user.role === 'staff') {
        navigate('/staff/dashboard', { replace: true });
      } else if (user.role === 'manager') {
        navigate('/manager/dashboard', { replace: true });
      } else if (user.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      }
    }
  }, [user, navigate]);

  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'services' | 'sales' | 'notifications' | 'profile' | 'upgrade' | 'messages'>('dashboard');
  const [storeData, setStoreData] = useState<any>(cachedDashboard?.store || null);
  const [applicationData, setApplicationData] = useState<any>(cachedDashboard?.application || null);
  const [products, setProducts] = useState<MarketProduct[]>(cachedDashboard?.products || []);
  const [orderCursor,setOrderCursor]=useState<string|null|undefined>(undefined),[olderOrdersLoading,setOlderOrdersLoading]=useState(false);
  const [orderSummary,setOrderSummary]=useState<OrderHistoryPage<MarketOrder>['summary']|null>(null),[orderCustomers,setOrderCustomers]=useState<any[]>([]);
  const [orders, setOrders] = useState<MarketOrder[]>(cachedDashboard?.orders || []);
  const { notifications, markAsRead } = useNotifications();
  const sellerNotifications = notifications.filter(n => marketNoticeKind(n) !== null);
  const sellerMessageUnreadCount = sellerNotifications.filter(n => !n.read && marketNoticeKind(n) === 'chat').length;
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'orders' | 'system'>('all');
  const [loading, setLoading] = useState<boolean>(!cachedDashboard);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState('');

  // Search, Price Filter & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [minPriceFilter, setMinPriceFilter] = useState<number>(0);

  // Broad flexible category matcher helper
  const matchesCategory = (productCategory: string = '', selectedCat: string = '') => {
    if (!selectedCat || selectedCat === 'All') return true;
    const pCat = (productCategory || '').toLowerCase().trim();
    const sCat = selectedCat.toLowerCase().trim();

    if (!pCat) return true;
    if (pCat === sCat || pCat.includes(sCat) || sCat.includes(pCat)) return true;

    const sWords = sCat.split(/[\s,&/]+/).filter(w => w.length > 2 && w !== 'and' && w !== 'the' && w !== 'for');
    for (const word of sWords) {
      if (pCat.includes(word)) return true;
    }

    const techKeywords = ['electronic', 'gadget', 'laptop', 'phone', 'computing', 'gear', 'accessory', 'accessories', 'tech', 'audio', 'instrument', 'device', 'charger', 'headphone', 'macbook', 'iphone', 'android', 'powerbank'];
    const isTechSelected = techKeywords.some(k => sCat.includes(k));
    const isTechProd = techKeywords.some(k => pCat.includes(k));
    if (isTechSelected && isTechProd) return true;

    const bookKeywords = ['textbook', 'book', 'study', 'handout', 'material', 'stationery', 'print', 'binding', 'paper', 'note'];
    const isBookSelected = bookKeywords.some(k => sCat.includes(k));
    const isBookProd = bookKeywords.some(k => pCat.includes(k));
    if (isBookSelected && isBookProd) return true;

    const applianceKeywords = ['appliance', 'hostel', 'cookware', 'kitchen', 'utensil', 'fridge', 'iron', 'provision', 'microwave', 'kettle', 'blender'];
    const isApplianceSelected = applianceKeywords.some(k => sCat.includes(k));
    const isApplianceProd = applianceKeywords.some(k => pCat.includes(k));
    if (isApplianceSelected && isApplianceProd) return true;

    const fashionKeywords = ['fashion', 'footwear', 'thrift', 'boutique', 'apparel', 'clothing', 'beauty', 'skincare', 'haircare', 'grooming', 'shoe', 'shirt', 'dress'];
    const isFashionSelected = fashionKeywords.some(k => sCat.includes(k));
    const isFashionProd = fashionKeywords.some(k => pCat.includes(k));
    if (isFashionSelected && isFashionProd) return true;

    const furnitureKeywords = ['furniture', 'bedding', 'mattress', 'curtain', 'decor', 'desk', 'chair', 'table', 'pillow'];
    const isFurnitureSelected = furnitureKeywords.some(k => sCat.includes(k));
    const isFurnitureProd = furnitureKeywords.some(k => pCat.includes(k));
    if (isFurnitureSelected && isFurnitureProd) return true;

    const serviceKeywords = ['service', 'tutoring', 'repair', 'graphic', 'printing', 'laundry', 'cleaning'];
    const isServiceSelected = serviceKeywords.some(k => sCat.includes(k));
    const isServiceProd = serviceKeywords.some(k => pCat.includes(k));
    if (isServiceSelected && isServiceProd) return true;

    return false;
  };
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(5000);
  const inventoryPricePanelId = useId();
  const [priceSortOption, setPriceSortOption] = useState<'featured' | 'price-asc' | 'price-desc' | 'newest'>('featured');
  const [showPriceFilterPanel, setShowPriceFilterPanel] = useState<boolean>(false);
  const [marketVisibleCount, setMarketVisibleCount] = useState<number>(24);

  useEffect(() => {
    setMarketVisibleCount(24);
  }, [selectedCategory, searchQuery, minPriceFilter, maxPriceFilter, priceSortOption]);

  // New Product Modal Form
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [prodTitle, setProdTitle] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCategory, setProdCategory] = useState('Electronics');
  const [prodCondition, setProdCondition] = useState('Like New');
  const [prodStock, setProdStock] = useState('1');
  const [prodLocation, setProdLocation] = useState((''));
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodAdditionalImages, setProdAdditionalImages] = useState<string[]>([]);
  const [mediaUploads, setMediaUploads] = useState(0);
  const mediaBusyChange = (busy: boolean) => setMediaUploads(n => Math.max(0, n + (busy ? 1 : -1)));
  const [prodDesc, setProdDesc] = useState('');

  // Item Image Crop Modal State
  const [cropRawImage, setCropRawImage] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [cropTarget, setCropTarget] = useState<'product' | 'service'>('product');

  // Services Tab & Modal State
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [servTitle, setServTitle] = useState('');
  const [servSubCategory, setServSubCategory] = useState('Phone & Device Repairs');
  const [servDesc, setServDesc] = useState('');
  const [servPrice, setServPrice] = useState('');
  const [servPriceCategories, setServPriceCategories] = useState<Array<{ id: string; name: string; price: number | string; imageUrl?: string }>>([]);
  const [servLocation, setServLocation] = useState((''));
  const [servLocationMode, setServLocationMode] = useState<'flexible' | 'fixed' | 'hybrid'>('flexible');
  const [servCallLine, setServCallLine] = useState('');
  const [servImageUrl, setServImageUrl] = useState('');
  const [servIsAvailable, setServIsAvailable] = useState(true);
  const [servWorkingDays, setServWorkingDays] = useState('Mon - Sat');
  const [servOpeningTime, setServOpeningTime] = useState('08:00 AM');
  const [servClosingTime, setServClosingTime] = useState('06:00 PM');
  const [servIsOpen247, setServIsOpen247] = useState(false);
  const [servLat, setServLat] = useState(6.6745);
  const [servLng, setServLng] = useState(-1.5716);
  const [servLocationPinned, setServLocationPinned] = useState(false);
  const [isMapLocationPickerOpen, setIsMapLocationPickerOpen] = useState(false);
  const [viewingServiceMap, setViewingServiceMap] = useState<any | null>(null);
  const [viewingServiceReviews, setViewingServiceReviews] = useState<any | null>(null);
  const [serviceReviewsList, setServiceReviewsList] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const serviceReviewEpoch=useRef(0);
  useEffect(()=>{serviceReviewEpoch.current++;setViewingServiceReviews(null);setServiceReviewsList([]);setLoadingReviews(false);},[user?.id]);
  const [isSubmittingService, setIsSubmittingService] = useState(false);
  const [servicesSearchQuery, setServicesSearchQuery] = useState('');
  const [servicesCategoryFilter, setServicesCategoryFilter] = useState('All');

  const presetServiceCovers = [
    { label: 'Phone Repairs', category: 'Phone & Device Repairs', url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80' },
    { label: 'Food Services', category: 'Food Services & Catering', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop&q=80' },
    { label: 'Barbering', category: 'Barbering & Grooming', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80' },
    { label: 'Hair Styling', category: 'Hair Styling & Braiding', url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&auto=format&fit=crop&q=80' },
    { label: 'Peer Tutoring', category: 'Academic Tutoring & Proofreading', url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80' },
    { label: 'Laundry Service', category: 'Laundry & Cleaning', url: 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=800&auto=format&fit=crop&q=80' },
    { label: 'Graphic Design', category: 'Graphic Design & Printing', url: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800&auto=format&fit=crop&q=80' },
  ];

  // PIN Verification State
  const [verifyingOrder, setVerifyingOrder] = useState<MarketOrder | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [viewingOrderMap, setViewingOrderMap] = useState<MarketOrder | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [decliningOrder, setDecliningOrder] = useState<MarketOrder | null>(null);

  // Profile Edit States
  const [editStoreName, setEditStoreName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhoneCountry, setEditPhoneCountry] = useState<CountryCode>('GH');
  const [profileMediaUploads, setProfileMediaUploads] = useState(0);
  const onProfileMediaBusy = (busy: boolean) => setProfileMediaUploads(count => Math.max(0, count + (busy ? 1 : -1)));
  const [editDeliveryForm, setEditDeliveryForm] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCoverPicture, setEditCoverPicture] = useState('');
  const [editProfilePicture, setEditProfilePicture] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const initializeStoreDraft = (store: any) => {
    if (profileDraftInitialized.current) return;
    setEditStoreName(store.storeName || '');
    setEditLocation(store.location || '');
    setEditDeliveryForm(storeDeliveryMode(store));
    const phone = phoneDraft(store.phone, store.phoneCountry);
    setEditPhone(phone.contactPhone); setEditPhoneCountry(phone.contactPhoneCountry);
    setEditCategory(store.category || '');
    setEditCoverPicture(store.coverPicture || store.bannerUrl || '');
    setEditProfilePicture(store.profilePicture || store.logoUrl || '');
    setEditUsername(store.username || '');
    setEditDescription(store.description || '');
    profileDraftInitialized.current = true;
  };

  // Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const triggerToast = (text: string, type: 'success' | 'error' = 'success') => {
    if (routePopupFeedback(text, type)) return;
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const studentEmail = user?.studentEmail || user?.email || '';
  const storeName = storeData?.storeName || applicationData?.storeName || `${user?.fullName || 'Student'}'s Store`;
  const university = storeData?.university || applicationData?.university || 'Accredited Ghanaian University';
  const { settings: paymentSettings } = usePlatformSettings();
  const subscriptionPlan = effectiveMarketPlan(storeData);
  const planPrice = (plan: 'default' | 'star' | 'pro') => paymentSettings ? `GH₵${paymentSettings.subscriptionPrices[plan].toFixed(2)} / month` : 'Loading price…';
  const [paymentError, setPaymentError] = useState('');
  const [selectedMobilePlan, setSelectedMobilePlan] = useState<"default" | "star" | "pro" | null>(null);
  const [isPlanActivationLoading, setIsPlanActivationLoading] = useState(false);
  const displayedMobilePlan = selectedMobilePlan || subscriptionPlan;
  const subscriptionLimits = PLAN_LIMITS[subscriptionPlan];
  const checkoutRequest=useRef<{params:string;id:string}|null>(null);
  const checkoutPayment = async (purpose: 'activation' | 'subscription' | 'semester', plan: 'default' | 'star' | 'pro' = subscriptionPlan) => {
    if(isPlanActivationLoading)return;
    const accountId=user?.id,generation=accountGeneration.current;
    const payload={purpose,plan};
    {const params=JSON.stringify([accountId,purpose,plan]);if(checkoutRequest.current?.params!==params)checkoutRequest.current={params,id:crypto.randomUUID()};Object.assign(payload,{requestId:checkoutRequest.current.id});}
    setPaymentError(''); setIsPlanActivationLoading(true);
    try { const result = await apiFetch('/api/payments/paystack/initialize', { method: 'POST', body: JSON.stringify(payload) });
      if(!accountIsCurrent(accountId,generation))return;
      if (openPaymentCheckout(result,accountId)) return;
      if (!result?.paid || result.accessGranted===false) throw new Error(result.message || 'Verified payment is required.');
      checkoutRequest.current=null;
      if (result.store) setStoreData(result.store); triggerToast('Subscription updated.', 'success');
    } catch (err: any) { if(accountIsCurrent(accountId,generation))setPaymentError(err.message || 'Unable to open checkout.'); }
    finally { if(accountIsCurrent(accountId,generation))setIsPlanActivationLoading(false); }
  };
  const selectSubscription = (plan: 'default' | 'star' | 'pro') => checkoutPayment('subscription', plan);
  const activateMobilePlan = () => selectSubscription(displayedMobilePlan);
  useEffect(()=>{checkoutRequest.current=null;setIsPlanActivationLoading(false);setPaymentError('');},[user?.id]);

  const loadDataRead = async (isBackground = false, cancellation?: AbortSignal) => {
    const accountId=user?.id,epoch=accountEpoch.current;
    const sessionGeneration=currentSessionGeneration();
    const current=()=>mounted.current && currentAccount.current===accountId && accountEpoch.current===epoch && !cancellation?.aborted;
    const nativeOptions = ({
      signal: cancellation ? AbortSignal.any([cancellation, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      headers: { 'X-PineVela-Profile-Context': accountId! },
    });
    let completed = false;
    try {
      if (!isBackground && !initialLoadCompletedRef.current) {
        setLoading(true);
      }
      if (!isBackground) {
        setRefreshing(true);
      }
      const email = user?.studentEmail || user?.email || '';
      const userId = user?.id || '';

      // 1. Fetch store status & application
      // A failed status read says nothing about whether the seller completed
      // setup. Keep their current route and offer retry instead of onboarding.
      const statusRes = (await apiFetch('/api/digital-market/status', nativeOptions));
      if(!current())return;
      if (((!statusRes || Array.isArray(statusRes) || !('store' in statusRes) || !('application' in statusRes))))
        throw new Error('Could not load your verified seller account. Please retry.');
      if ((!statusRes.store))
        throw new Error('Your approved store is unavailable. Retry, or return to your primary account to check registration status.');
      
      if (statusRes?.application) {
        setApplicationData((prev: any) => JSON.stringify(prev) === JSON.stringify(statusRes.application) ? prev : statusRes.application);

      }

      if (!statusRes?.store || !statusRes.store.setupCompleted) {
        navigate('/digital-market/onboard', { replace: true });
        return;
      } else {
        setStoreData((prev: any) => JSON.stringify(prev) === JSON.stringify(statusRes.store) ? prev : statusRes.store);
        initializeStoreDraft(statusRes.store);
      }

      // 2. Fetch products
      const [allProducts, orderData] = await Promise.all([
        apiFetch('/api/digital-market/inventory', nativeOptions),
        apiFetch('/api/digital-market/my-orders?paged=1', nativeOptions),
      ]);
      if(!current())return;
      if(!Array.isArray(allProducts))throw new Error('Could not read your inventory. Please retry.');
      const currentStoreId = statusRes?.store?.id || (user as any)?.merchantStoreId;
      const currentEmail = (user?.studentEmail || user?.email || '').toLowerCase();

      // Filter products belonging to this merchant store
      const myProducts = (allProducts);
      setProducts(prev => JSON.stringify(prev) === JSON.stringify(myProducts) ? prev : myProducts);

      // 3. Fetch orders
      const page=readOrderHistoryPage<MarketOrder>(orderData),ordersRes=page.orders;
      setOrderSummary(page.summary);setOrderCustomers(page.customers);setOrderCursor(previous=>previous===undefined?page.nextCursor:previous);
      setOrders(prev=>mergeOrderHistory(prev,ordersRes));
      saveDashboardSnapshot('seller',accountId,sessionGeneration,{store:statusRes.store,application:statusRes.application,products:allProducts,orders:ordersRes} satisfies SellerDashboardSnapshot);
      completed = true;
      setLoadError('');
    } catch (err: any) {
      if (current() && true) setLoadError(err.message || 'Your seller account could not refresh. Please retry.');
      console.error("Error loading digital market data:", err);
    } finally {
      if(current()){
        if ((completed)) initialLoadCompletedRef.current = true;
        setLoadedAccount(accountId);setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const loadData = (isBackground = false) => (dashboardReads.current.run(user?.id || '', accountEpoch.current, cancellation => loadDataRead(isBackground, cancellation)));

  const loadOlderOrders=async()=>{
    if(!orderCursor||olderOrdersLoading)return;const accountId=user?.id,epoch=accountEpoch.current;setOlderOrdersLoading(true);
    try{const page=readOrderHistoryPage<MarketOrder>(await apiFetch('/api/digital-market/my-orders?paged=1&before='+encodeURIComponent(orderCursor),{headers:{'X-PineVela-Profile-Context':accountId||''}}));
      if(accountId!==currentAccount.current||accountEpoch.current!==epoch)return;
      setOrders(previous=>mergeOrderHistory(previous,page.orders));setOrderCursor(page.nextCursor);setOrderSummary(page.summary);setOrderCustomers(page.customers);setLoadError('');
    }catch(e:any){if(accountId===currentAccount.current&&accountEpoch.current===epoch)setLoadError(e.message);}
    finally{if(accountId===currentAccount.current&&accountEpoch.current===epoch)setOlderOrdersLoading(false);}
  };
  const handleMarkNotificationRead = markAsRead;
  const handleMarkAllNotificationsRead = async () => {
    await Promise.all(sellerNotifications.filter(n => !n.read).map(n => markAsRead(n.id)));
    triggerToast('All seller notifications marked as read', 'success');
  };

  useEffect(() => {
    const saved=readDashboardSnapshot<SellerDashboardSnapshot>('seller',user?.id);
    initialLoadCompletedRef.current=!!saved;setLoadedAccount(saved ? user?.id : undefined);setLoading(!saved);setLoadError('');
    setStoreData(saved?.store || null);setApplicationData(saved?.application || null);setProducts(saved?.products || []);setOrders(saved?.orders || []);setActiveTab('dashboard');
    profileDraftInitialized.current=false;if(saved)initializeStoreDraft(saved.store);
    setOrderCursor(undefined);setOlderOrdersLoading(false);setOrderSummary(null);setOrderCustomers([]);
    setShowAddModal(false);setShowServiceModal(false);setProfileMediaUploads(0);setMediaUploads(0);
    setIsSubmittingProduct(false);setIsSubmittingService(false);setIsUpdatingProfile(false);
    setCropRawImage(null);setIsCropModalOpen(false);setVerifyingOrder(null);setDecliningOrder(null);setPinInput('');setPinSubmitting(false);setConfirmingOrderId(null);
    setProdImageUrl('');setProdAdditionalImages([]);setServImageUrl('');setServPriceCategories([]);
    setProdTitle('');setProdDesc('');setProdPrice('');setServTitle('');setServDesc('');setServPrice('');setEditingServiceId(null);
    loadData(!!saved);
    const refreshVisible = () => { if (!document.hidden) void loadData(true); };
    const interval = setInterval(refreshVisible, 10000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refreshVisible); dashboardReads.current.cancel(); };
  }, [user?.id, user?.email, user?.studentEmail]);

  // Handle Add Product (MANDATORY Description and Image)
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mediaUploads) { triggerToast('Wait for your photographs to finish uploading.', 'error'); return; }
    
    if (!prodTitle.trim()) {
      triggerToast("Please provide a product title.", "error");
      return;
    }
    if (!prodPrice.trim() || parseFloat(prodPrice) <= 0) {
      triggerToast("Please provide a valid price.", "error");
      return;
    }
    const stock = Number(prodStock);
    if (!prodStock.trim() || !Number.isSafeInteger(stock) || stock < 1) {
      triggerToast('Stock quantity must be a whole number of at least 1.', 'error');
      return;
    }
    if (!prodImageUrl.trim()) {
      triggerToast("It is mandatory to put up an item picture for campus listing.", "error");
      return;
    }
    if (!prodDesc.trim()) {
      triggerToast("It is mandatory to provide a detailed product description.", "error");
      return;
    }

    setIsSubmittingProduct(true);
    const accountId=user?.id;accountEpoch.current++;
    try {
      const email = user?.studentEmail || user?.email || '';
      const storeId = storeData?.id || ((undefined));

      const res = await apiFetch('/api/digital-market/products', {
        method: 'POST',
        body: JSON.stringify({
          ...(({isService:false})),
          title: prodTitle.trim(),
          description: prodDesc.trim(),
          price: parseFloat(prodPrice),
          category: prodCategory,
          stockQuantity: stock,
          imageUrl: prodImageUrl.trim(),
          additionalImages: prodAdditionalImages,
          condition: prodCondition,
          meetingLocation: prodLocation
        })
      });
      if(!accountIsCurrent(accountId))return;
      accountEpoch.current++;
      if (res?.success || res?.product) {
        triggerToast(`"${prodTitle}" successfully published to the Global Market!`, "success");
        if (res.product) {
          setProducts(prev => [res.product, ...prev.filter(p => p.id !== res.product.id)]);
        }
        setShowAddModal(false);
        // Reset filters so newly published product renders immediately
        setSelectedCategory('All');
        setSearchQuery('');
        setMinPriceFilter(0);
        setMaxPriceFilter(5000);
        setActiveTab('inventory');
        // Reset form
        setProdTitle('');
        setProdPrice('');
        setProdDesc('');
        setProdStock('1');
        setProdImageUrl('');
        setProdAdditionalImages([]);
        await loadData();
      } else {
        triggerToast(res?.error || "Failed to publish product.", "error");
      }
    } catch (err: any) {
      if(accountIsCurrent(accountId))triggerToast(err?.message || "Failed to publish product.", "error");
    } finally {
      if(accountIsCurrent(accountId))setIsSubmittingProduct(false);
    }
  };

  // Adjust stock inline (+ / -)
  const handleUpdateStock = useCallback(async (product: MarketProduct, delta: number) => {
    const accountId=user?.id;accountEpoch.current++;
    if (typeof product.stockQuantity !== 'number') return;
    const newStock = product.stockQuantity + delta;
    if (!Number.isSafeInteger(newStock) || newStock < 1) return;
    try {
      await apiFetch(`/api/digital-market/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          stockQuantity: newStock,
          isAvailable: newStock > 0
        })
      });
      if(!accountIsCurrent(accountId))return;
      accountEpoch.current++;
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stockQuantity: newStock, isAvailable: newStock > 0 } : p));
      triggerToast(`Successfully adjusted stock for "${product.title}" to ${newStock} units.`, "success");
    } catch (err) {
      if(accountIsCurrent(accountId))triggerToast("Failed to adjust stock level.", "error");
    }
  }, [apiFetch,user?.id]);

  // Delete product from store
  const handleDeleteProduct = useCallback(async (product: MarketProduct) => {
    if (!window.confirm(`Are you absolutely sure you want to remove "${product.title}" from the global campus catalog?`)) return;
    const accountId=user?.id;accountEpoch.current++;
    try {
      await apiFetch(`/api/digital-market/products/${product.id}`, {
        method: 'DELETE'
      });
      if(!accountIsCurrent(accountId))return;
      accountEpoch.current++;
      setProducts(prev => prev.filter(p => p.id !== product.id));
      triggerToast(`Removed "${product.title}" from global marketplace.`, "success");
    } catch (err) {
      if(accountIsCurrent(accountId))triggerToast("Failed to remove product.", "error");
    }
  }, [apiFetch,user?.id]);

  // Verify PIN for buyer handover
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingOrder || !pinInput.trim()) return;

    setPinSubmitting(true);
    const accountId=user?.id,generation=accountGeneration.current;accountEpoch.current++;
    try {
      const res = await apiFetch(`/api/digital-market/orders/${verifyingOrder.id}/update-status`, {
        method: 'POST',
        body: JSON.stringify({
          newStatus: 'Completed & Paid',
          inputPin: pinInput.trim()
        })
      });

      if(!accountIsCurrent(accountId,generation))return;accountEpoch.current++;
      if (res?.success || res?.order) {
        triggerToast(`Campus verification handshake successful for order #${verifyingOrder.id}!`, "success");
        setVerifyingOrder(null);
        setPinInput('');
        await loadData();
      } else {
        triggerToast(res?.error || "Incorrect 6-Digit Pickup PIN.", "error");
      }
    } catch (err: any) {
      if(accountIsCurrent(accountId,generation))triggerToast(err?.message || "PIN verification handshake failed.", "error");
    } finally {
      if(accountIsCurrent(accountId,generation))setPinSubmitting(false);
    }
  };

  // Agree to Proposed Campus Meetup Location
  const handleAgreeLocation = async (orderId: string) => {
    setConfirmingOrderId(orderId);
    const accountId=user?.id,generation=accountGeneration.current;accountEpoch.current++;
    try {
      const res = await apiFetch(`/api/digital-market/orders/${orderId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'agree-location' })
      });
      if(!accountIsCurrent(accountId,generation))return;accountEpoch.current++;
      if (res && res.success) {
        triggerToast("Meetup location agreed! Purchase confirmed for handover.", "success");
        await loadData();
      } else {
        triggerToast(res?.error || "Failed to confirm meetup location.", "error");
      }
    } catch (err: any) {
      if(accountIsCurrent(accountId,generation))triggerToast(err.message || "Failed to confirm meetup location.", "error");
    } finally {
      if(accountIsCurrent(accountId,generation))setConfirmingOrderId(null);
    }
  };

  // Decline Proposed Campus Meetup Location
  const handleDeclineLocation = async (orderId: string) => {
    if (confirmingOrderId) return;
    setConfirmingOrderId(orderId);
    const accountId=user?.id,generation=accountGeneration.current;accountEpoch.current++;
    try {
      const res = await apiFetch(`/api/digital-market/orders/${orderId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject-location' })
      });
      if(!accountIsCurrent(accountId,generation))return;accountEpoch.current++;
      if (res && res.success) {
        setOrders(previous => previous.map(order => order.id === orderId ? res.order : order));
        setDecliningOrder(null);
        triggerToast("Proposed meetup spot declined.", "success");
        await loadData();
      } else {
        triggerToast(res?.error || "Failed to decline location.", "error");
      }
    } catch (err: any) {
      if(accountIsCurrent(accountId,generation))triggerToast(err.message || "Failed to decline location.", "error");
    } finally {
      if(accountIsCurrent(accountId,generation))setConfirmingOrderId(null);
    }
  };

  // Edit Store Profile Details
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStoreName.trim() || !editUsername.trim()) {
      triggerToast("Store Name and Username cannot be empty.", "error");
      return;
    }

    setIsUpdatingProfile(true);
    const accountId=user?.id;accountEpoch.current++;
    try {
      const email = user?.studentEmail || user?.email || '';
      const res = await apiFetch('/api/digital-market/store', {
        method: 'PUT',
        body: JSON.stringify({
          ...(({})),
          storeName: editStoreName.trim(),
          location: editLocation,
          deliveryMode: editDeliveryForm,
          phone: internationalPhone(editPhone, editPhoneCountry).number, phoneCountry: editPhoneCountry,
          category: editCategory,
          coverPicture: editCoverPicture,
          profilePicture: editProfilePicture,
          username: editUsername.trim(),
          description: editDescription.trim()
        })
      });
      if(!accountIsCurrent(accountId))return;
      accountEpoch.current++;
      if (res?.success && res?.store) {
        triggerToast("Merchant store profile updated successfully!", "success");
        setStoreData(res.store);
        await loadData();
      } else {
        triggerToast(res?.error || "Failed to update profile.", "error");
      }
    } catch (err: any) {
      if(accountIsCurrent(accountId))triggerToast(err?.message || "Failed to update profile details.", "error");
    } finally {
      if(accountIsCurrent(accountId))setIsUpdatingProfile(false);
    }
  };

  // Services segmentation and filtering
  const servicesList = products.filter(isMarketService);

  const physicalProductsList = products.filter(p => !isMarketService(p));

  const filteredServices = servicesList
    .filter(s => {
      if (servicesCategoryFilter !== 'All') {
        const matchCat = (s as any).serviceCategory === servicesCategoryFilter ||
          s.category === servicesCategoryFilter ||
          s.title.toLowerCase().includes(servicesCategoryFilter.toLowerCase());
        if (!matchCat) return false;
      }
      if (servicesSearchQuery.trim()) {
        const q = servicesSearchQuery.toLowerCase().trim();
        return (
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          Boolean((s as any).location && (s as any).location.toLowerCase().includes(q)) ||
          Boolean((s as any).callLine && (s as any).callLine.toLowerCase().includes(q)) ||
          Boolean((s as any).serviceCategory && (s as any).serviceCategory.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => (b.id || '').localeCompare(a.id || ''));

  const handleOpenAddService = () => {
    setEditingServiceId(null);
    setServTitle('');
    setServSubCategory('Phone & Device Repairs');
    setServDesc('');
    setServPrice('');
    setServPriceCategories([]);
    setServLocation(storeData?.location || (('')));
    setServLocationMode('flexible');
    setServCallLine(storeData?.phone || (user as any)?.phone || '');
    setServImageUrl('');
    setServIsAvailable(true);
    setServWorkingDays('Mon - Sat');
    setServOpeningTime('08:00 AM');
    setServClosingTime('06:00 PM');
    setServIsOpen247(false);
    setServLat(6.6745);
    setServLng(-1.5716);
    setServLocationPinned(false);
    setShowServiceModal(true);
  };

  const handleOpenEditService = (service: MarketProduct) => {
    setEditingServiceId(service.id);
    setServTitle(service.title || '');
    setServSubCategory((service as any).serviceCategory || 'Phone & Device Repairs');
    setServDesc(service.description || '');
    setServPrice(String(service.price || ''));
    setServPriceCategories(
      Array.isArray((service as any).priceCategories)
        ? (service as any).priceCategories.map((c: any) => ({
            id: c.id || `pcat-${Math.random().toString(36).substr(2, 6)}`,
            name: c.name || '',
            price: c.price !== undefined ? c.price : '',
            imageUrl: c.imageUrl || ''
          }))
        : []
    );
    setServLocation((service as any).location || service.meetingLocation || storeData?.location || '');
    setServLocationMode((service as any).serviceLocationMode || 'flexible');
    setServCallLine((service as any).callLine || storeData?.phone || (user as any)?.phone || '');
    setServImageUrl(service.imageUrl || '');
    setServIsAvailable(service.isAvailable !== false);
    setServWorkingDays((service as any).workingDays || 'Mon - Sat');
    setServOpeningTime((service as any).openingTime || '08:00 AM');
    setServClosingTime((service as any).closingTime || '06:00 PM');
    setServIsOpen247(Boolean((service as any).isOpen247));
    const existingPin = servicePoint((service as any).lat, (service as any).lng);
    setServLat(existingPin?.lat ?? 6.6745);
    setServLng(existingPin?.lng ?? -1.5716);
    setServLocationPinned(Boolean(existingPin));
    setShowServiceModal(true);
  };

  const handleOpenServiceReviews = async (service: MarketProduct) => {
    const accountId=user?.id,generation=accountGeneration.current,epoch=++serviceReviewEpoch.current;
    const current=()=>accountIsCurrent(accountId,generation) && epoch===serviceReviewEpoch.current;
    setViewingServiceReviews(service);
    setServiceReviewsList([]);
    setLoadingReviews(true);
    try {
      const res = await fetch(`/api/digital-market/ratings?serviceId=${encodeURIComponent(service.id)}`);
      const data = await res.json();
      if(!current())return;
      if(!res.ok)throw new Error(data.error || 'Could not load service reviews.');
      setServiceReviewsList(data.ratings || []);
    } catch (e) {
      if(current())triggerToast(e instanceof Error?e.message:'Could not load service reviews.','error');
    } finally {
      if(current())setLoadingReviews(false);
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mediaUploads) { triggerToast('Wait for your photographs to finish uploading.', 'error'); return; }
    if (!servTitle.trim()) {
      triggerToast("Please provide a service title.", "error");
      return;
    }
    if (!servPrice.trim() || parseFloat(servPrice) <= 0) {
      triggerToast("Please provide a valid starting rate or price.", "error");
      return;
    }
    if (!servDesc.trim()) {
      triggerToast("Please provide a detailed description of what you offer.", "error");
      return;
    }
    if ((servLocationMode === 'fixed' || servLocationMode === 'hybrid') && !servLocation.trim()) {
      triggerToast("Please specify or select your campus location on the map.", "error");
      return;
    }
    if ((servLocationMode === 'fixed' || servLocationMode === 'hybrid') && !servLocationPinned) {
      triggerToast("Fixed and Hybrid services require a location pin selected on the map.", "error");
      return;
    }
    if (!servCallLine.trim()) {
      triggerToast("A direct call line or WhatsApp number is mandatory for services.", "error");
      return;
    }
    if (!servImageUrl.trim()) {
      triggerToast("Please upload a cover photograph for your service.", "error");
      return;
    }

    setIsSubmittingService(true);
    const accountId=user?.id;accountEpoch.current++;
    try {
      const email = user?.studentEmail || user?.email || '';
      const storeId = storeData?.id || ((undefined));

      if (servPriceCategories.length > 4 || servPriceCategories.some(c => !c.name.trim() || c.price === '' || !Number.isFinite(Number(c.price)) || Number(c.price) < 0)) {
        triggerToast('Add a name and valid price for every option (maximum four).', 'error'); return;
      }
      const validPriceCategories = servPriceCategories.map(c => ({
        ...((/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(c.id)) ? {id:c.id} : {}), name: c.name.trim(), price: Number(c.price), ...(c.imageUrl ? { imageUrl: c.imageUrl } : {})
      }));

      const payload = {
        ...(({})),
        title: servTitle.trim(),
        description: servDesc.trim(),
        price: parseFloat(servPrice),
        category: 'Services',
        serviceCategory: servSubCategory,
        priceCategories: validPriceCategories,
        isService: true,
        serviceLocationMode: servLocationMode,
        imageUrl: servImageUrl.trim(),
        meetingLocation: servLocation.trim(),
        location: servLocation.trim(),
        callLine: servCallLine.trim(),
        workingDays: servWorkingDays,
        openingTime: servOpeningTime,
        closingTime: servClosingTime,
        isOpen247: servIsOpen247,
        lat: (servLocationMode==='flexible') ? null : servLat,
        lng: (servLocationMode==='flexible') ? null : servLng,
        isAvailable: servIsAvailable
      };

      let res: any;
      if (editingServiceId) {
        res = await apiFetch(`/api/digital-market/products/${editingServiceId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch('/api/digital-market/products', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if(!accountIsCurrent(accountId))return;
      accountEpoch.current++;
      if (res?.success || res?.product) {
        triggerToast(
          editingServiceId 
            ? `Service "${servTitle}" updated successfully!` 
            : `Service "${servTitle}" successfully published under Services!`, 
          "success"
        );
        setShowServiceModal(false);
        setActiveTab('services');
        await loadData();
      } else {
        triggerToast(res?.error || "Failed to save service.", "error");
      }
    } catch (err: any) {
      if(accountIsCurrent(accountId))triggerToast(err?.message || "Failed to save service.", "error");
    } finally {
      if(accountIsCurrent(accountId))setIsSubmittingService(false);
    }
  };

  const handleToggleServiceStatus = async (service: MarketProduct) => {
    const newStatus = !service.isAvailable;
    const accountId=user?.id;accountEpoch.current++;
    try {
      await apiFetch(`/api/digital-market/products/${service.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isAvailable: newStatus })
      });
      if(!accountIsCurrent(accountId))return;
      accountEpoch.current++;
      setProducts(prev => prev.map(p => p.id === service.id ? { ...p, isAvailable: newStatus } : p));
      triggerToast(`Service "${service.title}" is now ${newStatus ? 'Active & Open for Bookings' : 'Paused'}.`, "success");
    } catch (err: any) {
      if(accountIsCurrent(accountId))triggerToast(err?.message || "Failed to update service status.", "error");
    }
  };

  const handleDeleteService = async (serviceId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to remove the service "${title}" from the Digital Market?`)) return;
    const accountId=user?.id;accountEpoch.current++;
    try {
      await apiFetch(`/api/digital-market/products/${serviceId}`, {
        method: 'DELETE'
      });
      if(!accountIsCurrent(accountId))return;
      accountEpoch.current++;
      setProducts(prev => prev.filter(p => p.id !== serviceId));
      triggerToast(`Service "${title}" removed successfully.`, "success");
    } catch (err: any) {
      if(accountIsCurrent(accountId))triggerToast(err?.message || "Failed to remove service.", "error");
    }
  };

  // Filter and sort products for view
  const isPriceFiltered = minPriceFilter > 0 || maxPriceFilter < 5000;
  const filteredProducts = products
    .filter(p => {
      if (selectedCategory !== 'All' && !matchesCategory(p.category, selectedCategory)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
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
      return 0;
    });

  // Stats calculation
  const physicalProductsOnly = products.filter(p => !isMarketService(p));
  const totalStockUnits = physicalProductsOnly.reduce((acc, p) => acc + (p.stockQuantity || 0), 0);
  const pendingOrders = orders.filter(o => ['Awaiting Seller Confirmation','Pending Meetup'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'Completed & Paid');
  const totalRevenue = orderSummary?.revenue ?? completedOrders.reduce((acc, o) => acc + (o.totalAmount || (o.productPrice * o.quantity) || 0), 0);
  const pendingCount=orderSummary?.pending??pendingOrders.length,completedCount=orderSummary?.completed??completedOrders.length;

  const unreadNotifCount = sellerNotifications.filter((n: any) => !n.read).length;

  const filteredNotifications = sellerNotifications.filter((n: any) => {
    if (notifFilter === 'unread') return !n.read;
    if (notifFilter === 'orders') {
      const titleLower = (n.title || '').toLowerCase();
      const msgLower = (n.message || '').toLowerCase();
      return titleLower.includes('buy') || titleLower.includes('order') || titleLower.includes('purchase') || titleLower.includes('pickup') || titleLower.includes('pin') || msgLower.includes('order') || msgLower.includes('buy');
    }
    if (notifFilter === 'system') {
      const titleLower = (n.title || '').toLowerCase();
      const msgLower = (n.message || '').toLowerCase();
      return !(titleLower.includes('buy') || titleLower.includes('order') || titleLower.includes('purchase') || titleLower.includes('pickup') || titleLower.includes('pin') || msgLower.includes('order') || msgLower.includes('buy'));
    }
    return true;
  });

  // Extract unique customer buyers
  const uniqueCustomers = orderCustomers;

  // Loading Screen
  if (loading || loadedAccount!==user?.id) return <RouteSkeleton />;

  if ((loadError) && !storeData) return <main className="flex min-h-screen items-center justify-center p-6"><section role="alert" className="w-full max-w-lg space-y-4 rounded-3xl border border-blue-200 bg-white p-6 text-slate-900 dark:border-cyan-900 dark:bg-slate-900 dark:text-slate-100"><h1 className="text-xl font-bold">Your seller account could not load</h1><p className="text-sm">{loadError}</p><button type="button" onClick={() => void loadData(false)} className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">Retry seller account</button><button type="button" onClick={() => navigate('/login')} className="ml-3 min-h-11 rounded-xl border border-blue-200 px-4 py-3 text-sm">Return to sign in</button></section></main>;

  if (!storeData && applicationData?.status === 'approved') return <div className="p-8 text-center"><button onClick={() => navigate('/digital-market/onboard')} className="rounded-xl bg-blue-600 p-4 text-white">Complete store details and secure checkout</button></div>;

  // REDESIGNED MERCHANT MANAGEMENT WORKBENCH (GLOSSY LIGHT-BLUE VIBE)
  return (
    <div className="page-canvas min-h-screen text-slate-800 pb-24 relative">

      {/* Toast */}
      {toastMessage && (
        <div role={toastMessage.type === 'error' ? 'alert' : 'status'} className={`ux-dashboard-toast fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2.5 transition-all animate-bounce ${
          toastMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* TOPBAR SECURE HEADER WITH FROSTY LIGHT-BLUE GLASS BACKGROUND — FIXED TO TOP */}
      <header data-portal-navigation="header" className="fixed top-0 left-0 right-0 z-40 bg-sky-100/90 backdrop-blur-xl border-b border-blue-200 text-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-black shadow-md border border-blue-400/30 overflow-hidden shrink-0">
              {storeData?.profilePicture || editProfilePicture ? (
                <img src={storeData?.profilePicture || editProfilePicture} alt={storeData?.storeName || storeName} className="w-full h-full object-cover" />
              ) : (
                <Store className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-black tracking-tight text-slate-900 leading-tight">{storeData?.storeName || storeName}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] font-black uppercase shrink-0">
                  <BadgeCheck className="w-2.5 h-2.5 text-emerald-600" />
                  <span>Verified</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Prominent Action Button in Header */}
            {activeTab === 'services' ? (
              <button
                type="button"
                onClick={handleOpenAddService}
                className="hidden sm:flex px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black rounded-xl shadow-md hover:shadow-lg transition-all items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Service</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="hidden sm:flex px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl shadow-md hover:shadow-lg transition-all items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Publish Item</span>
              </button>
            )}

            {/* Real-time Seller Notification Badge */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('notifications');
                  triggerToast('Opening seller notifications...');
                }}
                className="p-2 sm:p-2.5 rounded-xl bg-blue-100/40 hover:bg-blue-200/60 border border-blue-200/50 text-blue-700 transition-all cursor-pointer flex items-center justify-center relative shadow-xs"
                title={`${unreadNotifCount} unread seller notifications`}
              >
                <Bell className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                {(unreadNotifCount > 0 || pendingCount > 0) && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white font-extrabold text-[9px] flex items-center justify-center border-2 border-white shadow-sm animate-pulse">
                    {unreadNotifCount > 0 ? unreadNotifCount : pendingCount}
                  </span>
                )}
              </button>

              {/* Hover Tooltip card with frosty design */}
              <div className="absolute right-0 top-11 scale-0 group-hover:scale-100 transition-all duration-150 origin-top-right z-50 bg-white/95 backdrop-blur-md border border-blue-200 rounded-xl p-2.5 shadow-lg w-52 text-left pointer-events-none">
                <p className="text-[10px] font-black text-slate-800">
                  {unreadNotifCount > 0 
                    ? `🔔 ${unreadNotifCount} Unread Notifications!`
                    : pendingCount > 0
                    ? `🛒 ${pendingCount} Active Handovers!`
                    : "✅ Zero pending notifications"}
                </p>
                <p className="text-[9px] text-slate-500 font-bold mt-0.5">
                  Click to view buy requests & seller activity notifications.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition-all cursor-pointer"
              title="Sign out from secure digital store workbench"
            >
              <LogOut className="w-4 h-4 text-rose-600" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* TOPBAR NAVIGATION TABS (HIDDEN ON MOBILE, USE MOBILE BOTTOM NAV INSTEAD) */}
        <div className="border-t border-blue-200/50 bg-sky-100/30 hidden sm:block">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1 py-2">
              <button
                type="button"
                data-page-tabs aria-current={activeTab === 'dashboard' ? 'page' : undefined} onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Dashboard / POS</span>
              </button>

              <button
                type="button"
                data-page-tabs aria-current={activeTab === 'inventory' ? 'page' : undefined} onClick={() => setActiveTab('inventory')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'inventory'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Inventory ({physicalProductsList.length})</span>
              </button>

              <button
                type="button"
                data-page-tabs aria-current={activeTab === 'services' ? 'page' : undefined} onClick={() => setActiveTab('services')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'services'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <span>Services ({servicesList.length})</span>
              </button>

              <button
                type="button"
                data-page-tabs aria-current={activeTab === 'sales' ? 'page' : undefined} onClick={() => setActiveTab('sales')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'sales'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Successful Sales ({completedCount})</span>
              </button>

              <button
                type="button"
                data-page-tabs aria-current={activeTab === 'notifications' ? 'page' : undefined} onClick={() => setActiveTab('notifications')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'notifications'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>Notifications</span>
                {unreadNotifCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white font-extrabold text-[10px] flex items-center justify-center animate-pulse">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              <button type="button" data-page-tabs aria-current={activeTab === 'messages' ? 'page' : undefined} onClick={() => setActiveTab('messages')} className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer ${activeTab === 'messages' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-blue-50'}`}><span className="relative inline-flex"><MessageSquare className="w-4 h-4" /><TopNavBadge count={sellerMessageUnreadCount} /></span><span>Messages</span></button>
              <button type="button" title="Upgrade your seller plan" aria-label="Upgrade your seller plan" data-page-tabs aria-current={activeTab === 'upgrade' ? 'page' : undefined} onClick={() => setActiveTab("upgrade")} className={`px-3 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${activeTab === "upgrade" ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md" : "text-amber-700 hover:bg-amber-50"}`}><CreditCard className="w-4 h-4" /><span>Subscription</span></button>
              <HelpLink compact className="!px-2" />
            <button type="button" data-page-tabs aria-current={activeTab === 'profile' ? 'page' : undefined} onClick={() => setActiveTab("profile")} className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${activeTab === "profile" ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}><ShieldCheck className="w-4 h-4" /><span>Store Profile</span></button>
            </nav>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER — OFFSET FOR FIXED HEADER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[96px] sm:pt-[154px] space-y-8">
        {(loadError) && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"><p>{loadError}</p><button type="button" disabled={refreshing} onClick={() => void loadData(false)} className="mt-2 min-h-11 font-semibold underline disabled:opacity-50">Retry seller account</button></div>}
        
        {/* TAB 1: DASHBOARD / MINI POS HOME */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Frosty, Transparent and Premium Greeting banner */}
            <div className="pv-feature-card relative overflow-hidden bg-white/40 backdrop-blur-xl text-slate-800 rounded-3xl p-6 sm:p-8 shadow-[0_8px_32px_0_rgba(59,130,246,0.12)] border border-blue-400/25">
              <div className="absolute top-0 right-0 w-80 h-80 bg-blue-400/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">Welcome back, @{storeData?.username || 'student_merchant'}</h2>
                  <p className="text-xs sm:text-sm text-slate-600 font-bold mt-1.5 leading-relaxed max-w-2xl">
                    Track student listings, keep real-time campus stock logs, and accept client delivery authentication handshakes.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => loadData(false)}
                  disabled={refreshing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>Sync Status</span>
                </button>
              </div>
            </div>

            {/* HIGH-CONTRAST METRICS ROWS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-100/45 border border-slate-300/50 backdrop-blur-sm rounded-2xl p-5 shadow-none">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400">Total Products</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{products.length}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Active catalog listings</div>
              </div>

              <div className="bg-slate-100/45 border border-slate-300/50 backdrop-blur-sm rounded-2xl p-5 shadow-none">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400">Total Stock</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{totalStockUnits}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Physical items on hand</div>
              </div>

              <div className="bg-slate-100/45 border border-slate-300/50 backdrop-blur-sm rounded-2xl p-5 shadow-none">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400">Paid Sales</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-700 mt-2">{completedCount}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Completed peer handovers</div>
              </div>

              <div className="bg-slate-100/45 border border-slate-300/50 backdrop-blur-sm rounded-2xl p-5 shadow-none">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400">Total Revenue</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">GH₵ {totalRevenue.toLocaleString()}</div>
                <div className="text-[10px] text-emerald-600 mt-0.5">PIN-verified handovers · paid directly to seller</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* POS ACTIVE HANDOVERS */}
              <div id="active-handover-orders" className="lg:col-span-2 space-y-4">
                <div className="bg-white/70 border border-blue-100/50 backdrop-blur-md rounded-3xl p-6 shadow-xs">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-black text-slate-950 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span>Awaiting Campus Verification & PIN Handshake</span>
                      </h3>
                      <p className="text-[11px] text-slate-400">When student buyers order, verify their transaction with their six-digit pickup token.</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[10px] font-black">
                      {pendingCount} Pending
                    </span>
                  </div>

                  {pendingOrders.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {pendingOrders.map(order => {
                        const needsAgreement = order.status === 'Awaiting Seller Confirmation' || !order.sellerConfirmed;
                        return (
                          <div key={order.id} id={`market-order-${order.id}`} className="py-4 space-y-3 scroll-mt-44">
                            <OrderNotifications orderId={order.id}/>
                            <details><summary className="cursor-pointer text-xs font-bold text-blue-800">View order timeline</summary><OrderTimeline order={order}/></details>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md uppercase">ID: {order.id.slice(-6)}</span>
                                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                                    needsAgreement ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {order.status}
                                  </span>
                                </div>
                                <div className="text-xs font-black text-slate-900">{order.productTitle}</div>
                                <div className="text-[11px] text-slate-500">
                                  Buyer: <strong className="text-slate-700">{order.buyerName}</strong> • GHS {order.totalAmount || (order.productPrice * order.quantity)}
                                </div>
                                <div className="text-[11px] text-blue-800 font-bold flex flex-wrap items-center gap-1.5 pt-0.5">
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Meetup: {order.meetingLocation}</span>
                                  </span>
                                  {order.meetingLatitude != null && order.meetingLongitude != null && (
                                    <button
                                      type="button"
                                      onClick={() => setViewingOrderMap(order)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-md text-[10px] font-extrabold cursor-pointer transition-colors"
                                    >
                                      <Compass className="w-3 h-3 text-blue-700" />
                                      <span>Map Pin ({order.meetingLatitude.toFixed(3)}, {order.meetingLongitude?.toFixed(3)})</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <OrderCancelButton order={order} onCancelled={next=>{setOrders(previous=>previous.map(row=>row.id===next.id?next:row));void loadData(true);}}/>
                                {needsAgreement ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={confirmingOrderId === order.id}
                                      onClick={() => handleAgreeLocation(order.id)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-[10px] rounded-lg transition-all shadow-xs cursor-pointer flex items-center gap-1"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>{confirmingOrderId === order.id ? 'Confirming...' : 'Agree & Confirm'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={confirmingOrderId === order.id}
                                      onClick={() => setDecliningOrder(order)}
                                      className="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 disabled:opacity-50 text-rose-800 font-bold text-[10px] rounded-lg transition-all cursor-pointer"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVerifyingOrder(order);
                                      setPinInput('');
                                    }}
                                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] rounded-lg transition-all shadow-xs cursor-pointer"
                                  >
                                    Verify PIN
                                  </button>
                                )}
                              </div>
                            </div>

                            {needsAgreement && (
                              <div className="p-2.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-[11px] text-amber-900 font-medium flex items-center justify-between gap-2">
                                <span>Buyer requested handover at this spot. Please review coordinates and confirm agreement.</span>
                                {order.meetingLatitude != null && order.meetingLongitude != null && (
                                  <button
                                    type="button"
                                    onClick={() => setViewingOrderMap(order)}
                                    className="text-[10px] text-amber-800 underline font-black hover:text-amber-950 cursor-pointer shrink-0"
                                  >
                                    Inspect on Map
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-slate-400 space-y-2">
                      <Clock className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-xs font-bold text-slate-600">{pendingCount?'Load older orders to view earlier pending handovers.':'No pending pickups right now.'}</p>
                      <p className="text-[10px] text-slate-400">When students order items, verify them here.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RECENT CUSTOMER LOGS */}
              <div className="space-y-4">
                <div className="bg-white/70 border border-blue-100/50 backdrop-blur-md rounded-3xl p-6 shadow-xs">
                  <div className="pb-4 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-950 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>Verified Student Buyers</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">Student customers who placed orders.</p>
                  </div>

                  {uniqueCustomers.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {uniqueCustomers.slice(0, 5).map((cust, idx) => (
                        <div key={idx} className="py-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-black text-slate-900">{cust.name}</div>
                            <div className="text-[9px] text-slate-400 font-mono">{cust.email}</div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-slate-700 block">GH₵ {cust.totalSpent.toLocaleString()}</span>
                            <span className="text-[9px] text-slate-400">{cust.orderCount} orders placed</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-slate-400 space-y-1">
                      <Users className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-xs font-bold text-slate-500">No buyer logs recorded yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INVENTORY STOCK ADJUSTER */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            {/* Search, price filter, sorting, category tags */}
            <div className="bg-slate-100/45 border border-slate-300/50 backdrop-blur-sm rounded-3xl p-5 shadow-none space-y-4">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                <div className="relative w-full lg:w-72" id="inv-search-container">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input aria-label="Search store inventory..."
                    type="text"
                    placeholder="Search store inventory..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white/35 border border-slate-300/60 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white/60"
                  />
                  {searchQuery && (
                    <button aria-label="Clear search"
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end">
                  {/* Price Filter Panel Toggle */}
                  <button
                    type="button"
                    aria-expanded={showPriceFilterPanel}
                    aria-controls={showPriceFilterPanel ? inventoryPricePanelId : undefined}
                    data-filtered={isPriceFiltered}
                    onClick={() => setShowPriceFilterPanel(!showPriceFilterPanel)}
                    className={`market-price-toggle px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                      showPriceFilterPanel || isPriceFiltered
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Price Range Filter</span>
                    {isPriceFiltered && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    )}
                  </button>

                  <MarketSortSelect inventory value={priceSortOption} onChange={setPriceSortOption} />

                  <span className="px-3.5 py-2 bg-blue-100 text-blue-900 font-black text-xs rounded-xl shrink-0">
                    {filteredProducts.length} {filteredProducts.length === 1 ? 'Item' : 'Items'}
                  </span>
                </div>
              </div>

              {showPriceFilterPanel && <MarketPricePanel id={inventoryPricePanelId} min={minPriceFilter} max={maxPriceFilter}
                onMinChange={setMinPriceFilter} onMaxChange={setMaxPriceFilter} onClose={() => setShowPriceFilterPanel(false)} />}

              {/* Product Category Select Menu */}
              <div className="pt-2 border-t border-slate-100" id="inv-tags">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-slate-800 block">Product Category</span>
                      <span className="text-[10px] text-slate-400 font-medium">Filter inventory items by registered category</span>
                    </div>
                  </div>

                  <div className="relative w-full sm:w-80">
                    <select
                      id="inventory-category-select"
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all cursor-pointer shadow-2xs appearance-none"
                    >
                      <option value="All">All Categories (Entire Inventory)</option>
                      {DIGITAL_MARKET_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Inventory table & Stock Editor */}
            {refreshing && products.length === 0 ? (
              <div className="market-inventory-grid animate-pulse pb-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} data-market-kind="item" className="market-plan-card market-product-card bg-white/60 border border-slate-200/50 rounded-3xl overflow-hidden shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="market-card-thumbnail bg-slate-200/50 relative overflow-hidden flex items-center justify-center">
                        <ShoppingBag className="w-10 h-10 text-slate-300/60" />
                      </div>
                      <div className="p-3.5 space-y-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-4.5 h-4.5 rounded bg-slate-200/70" />
                          <div className="h-2.5 bg-slate-200/70 rounded w-16" />
                        </div>
                        <div className="h-3.5 bg-slate-200/70 rounded w-3/4" />
                        <div className="space-y-1">
                          <div className="h-2 bg-slate-200/60 rounded w-full" />
                          <div className="h-2 bg-slate-200/60 rounded w-5/6" />
                        </div>
                      </div>
                    </div>
                    <div className="p-3.5 pt-0 border-t border-slate-100/60 flex items-center justify-between gap-2">
                      <div className="h-2 bg-slate-200/60 rounded w-12" />
                      <div className="h-7 bg-slate-200/80 rounded-lg w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="space-y-6">
                <div className="market-inventory-grid">
                  {filteredProducts.slice(0, marketVisibleCount).map(product => (
                    <SellerInventoryCard
                      key={product.id}
                      product={product}
                      plan={subscriptionPlan}
                      onUpdateStock={handleUpdateStock}
                      onDeleteProduct={handleDeleteProduct}
                    />
                  ))}
                </div>

                {marketVisibleCount < filteredProducts.length && (
                  <div className="flex justify-center pt-4 pb-2">
                    <button
                      type="button"
                      onClick={() => setMarketVisibleCount(prev => prev + 32)}
                      className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl border border-slate-200 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Load More Items</span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        (Showing {Math.min(marketVisibleCount, filteredProducts.length)} of {filteredProducts.length})
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/80 border border-blue-100/50 rounded-3xl p-12 text-center space-y-4">
                <Package className="w-12 h-12 text-slate-300 mx-auto" />
                <div>
                  <h3 className="text-base font-bold text-slate-800">No Inventory Found</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {searchQuery ? "No products match your search query." : "You haven't listed any items in your store yet. Click 'Publish Item' above to start selling!"}
                  </p>
                </div>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Publish First Product</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB: CAMPUS SERVICES & SKILLED WORK */}
        {activeTab === 'services' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Services Header Banner with White Glassy Backdrop */}
            <div className="relative overflow-hidden bg-white/80 backdrop-blur-xl border border-slate-200/80 text-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-2xl">
                  
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                    <span>Services & Skilled Campus Work</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                    Offer your student services across PineVela (Phone repairs, food services, barbering, hair styling, tutoring, and more). Every service card displays your verified location, starting price, and direct call line for easy student bookings.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddService}
                  className="px-5 py-3 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 cursor-pointer shrink-0 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Offer New Service</span>
                </button>
              </div>
            </div>

            {/* Services Grid */}
            {filteredServices.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredServices.map(service => (
                  <div
                    key={service.id}
                    data-market-plan={subscriptionPlan} data-listing-id={service.id}
                    className="market-plan-card bg-slate-100/55 border border-slate-300/60 rounded-3xl overflow-hidden shadow-none hover:bg-slate-100/80 hover:border-blue-300 transition-all duration-150 flex flex-col justify-between group"
                  >
                    <div>
                      {/* Photo container with written PineVela (Service) text */}
                      <div role="button" tabIndex={0} aria-label={`View ${service.title || "service"} location`} onKeyDown={activateOnKeyboard}
                        onClick={() => setViewingServiceMap(service)}
                        className="relative h-48 bg-slate-100 overflow-hidden flex items-center justify-center p-1 border-b border-slate-100 select-none cursor-pointer"
                        title="Click to view service location on interactive map"
                      >
                        <img
                          src={optimizeImageDisplayUrl(service.imageUrl, 400, 50)}
                          alt={service.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />

                        <ListingPlanBadge plan={subscriptionPlan} />
                        {/* Written PineVela like text written as (Service) */}
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white text-[9.5px] font-black rounded-md shadow-xs flex items-center gap-1 border border-blue-400/30 tracking-wide pointer-events-none">
                          <PineWordmark />
                          <span className="text-white font-black">(Service)</span>
                        </div>

                        {/* Starting Price Badge */}
                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-black rounded-md shadow-xs pointer-events-none">
                          GHS {service.price}
                        </div>

                        {/* Availability Pill & Map Tap Cue */}
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                          <div className={`px-2 py-0.5 rounded-md text-[9px] font-black shadow-xs ${
                            service.isAvailable !== false ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200'
                          }`}>
                            {service.isAvailable !== false ? '● Active & Open' : '○ Paused'}
                          </div>

                          <span className="px-2 py-0.5 bg-slate-900/80 backdrop-blur-md text-white text-[9px] font-black rounded-md shadow-xs flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5 text-amber-300" />
                            <span>View Map Pin</span>
                          </span>
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-blue-700">
                          <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md border border-blue-100 truncate max-w-[150px]">
                            {(service as any).serviceCategory || 'Campus Service'}
                          </span>

                          {/* Interactive Rating Badge */}
                          <button
                            type="button"
                            onClick={() => handleOpenServiceReviews(service)}
                            className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md font-black transition-colors cursor-pointer"
                            title="View student reviews and ratings"
                          >
                            <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                            <span>{service.reviewCount ? Number(service.rating).toFixed(1) : 'Unrated'}</span>
                            <span className="text-slate-500 font-semibold text-[9px]">({(service as any).reviewCount || 0})</span>
                          </button>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 line-clamp-1">{service.title}</h4>
                        
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium">
                          {service.description || 'No description provided.'}
                        </p>

                        <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                          {/* Opening Hours & Working Days */}
                          <div className="flex items-center gap-1.5 text-slate-700 font-bold bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate text-[11px]">
                              {(service as any).isOpen247
                                ? 'Available 24/7'
                                : `${(service as any).workingDays || 'Mon - Sat'} · ${(service as any).openingTime || '08:00 AM'} - ${(service as any).closingTime || '06:00 PM'}`}
                            </span>
                          </div>

                          {/* Location Tap Action */}
                          <button
                            type="button"
                            onClick={() => setViewingServiceMap(service)}
                            className="w-full flex items-center justify-between gap-1.5 text-slate-700 hover:text-blue-700 font-semibold text-left p-1.5 rounded-lg hover:bg-blue-50/50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="truncate text-xs">
                                {(service as any).location || service.meetingLocation || 'Campus-wide / Delivery'}
                              </span>
                            </div>
                            <span className="text-[10px] text-blue-600 font-black underline shrink-0">Map</span>
                          </button>

                          {/* Call Line */}
                          <div className="flex items-center justify-between gap-1 text-emerald-800 font-bold px-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-mono text-xs truncate">
                                {(service as any).callLine || storeData?.phone || 'Call Line Provided'}
                              </span>
                            </div>
                            {(service as any).callLine && (
                              <a
                                href={`tel:${(service as any).callLine}`}
                                className="text-[10px] text-emerald-700 underline font-black hover:text-emerald-900"
                              >
                                Call Line
                              </a>
                            )}
                          </div>

                          {/* Price Categories Badges */}
                          {Array.isArray((service as any).priceCategories) && (service as any).priceCategories.length > 0 && (
                            <div className="pt-1.5 border-t border-slate-100">
                              <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                                Price Categories ({service.priceCategories!.length})
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {(service as any).priceCategories.map((pc: any, idx: number) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-950 border border-blue-200/80 rounded-md text-[9.5px] font-bold shadow-2xs"
                                  >
                                    <span>{pc.name}</span>
                                    <span className="font-extrabold text-blue-700">GH₵ {pc.price}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditService(service)}
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Edit3 className="w-3 h-3 text-slate-500" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleServiceStatus(service)}
                          className={`px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                            service.isAvailable !== false
                              ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                          title={service.isAvailable !== false ? "Temporarily pause service" : "Re-activate service"}
                        >
                          {service.isAvailable !== false ? 'Pause' : 'Activate'}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteService(service.id, service.title)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Delete service"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/80 border border-blue-100/50 rounded-3xl p-12 text-center space-y-4">
               
                <div className="max-w-md mx-auto space-y-1.5">
                  <h3 className="text-base font-black text-slate-900">No Services Listed Yet</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Start monetizing your skills on campus! Offer phone & laptop repairs, student food services, barbering, hair styling, laundry, or academic tutoring to fellow hostel residents.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddService}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-black rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Offer Your First Service</span>
                </button>
              </div>
            )}
          </div>
        )}

        {(activeTab==='dashboard'||activeTab==='sales')&&orderCursor&&<button type="button" disabled={olderOrdersLoading} onClick={()=>void loadOlderOrders()} className="mb-4 rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-50">{olderOrdersLoading?'Loading older orders…':'Load older orders'}</button>}
        {/* TAB 3: SUCCESSFUL SALES LOG */}
        {activeTab === 'sales' && (
          <div className="space-y-6">
            <div className="bg-white/70 border border-blue-100/50 backdrop-blur-md rounded-3xl p-6 shadow-xs">
              <div className="pb-4 border-b border-slate-100">
                <h3 className="text-base font-black text-slate-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Completed Sales History</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Verified campus student peer handovers with buyers' name, items bought, total amount, and time of sale.</p>
              </div>

              {completedOrders.length > 0 ? (
                <div className="space-y-4 pt-4">
                  {completedOrders.map(order => (
                    <div
                      key={order.id}
                      className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded-md uppercase">Order ID: {order.id.slice(-6)}</span>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black rounded-full uppercase">PIN-verified handover</span>
                        </div>
                        <h4 className="text-xs font-black text-slate-950">{order.productTitle}</h4><details><summary className="cursor-pointer text-xs font-bold text-blue-800">View order timeline</summary><OrderTimeline order={order}/></details>
                        <div className="text-xs text-slate-600">
                          Buyer Name: <strong className="text-slate-900">{order.buyerName}</strong> • Phone: <strong className="text-slate-800">{order.buyerPhone || 'N/A'}</strong>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Institutional Email: <span className="font-mono text-slate-500">{order.buyerEmail}</span>
                        </div>
                        <div className="text-[10px] text-blue-600 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Delivery: {order.meetingLocation || 'KNUST Campus'}</span>
                        </div>
                      </div>

                      <div className="text-left sm:text-right space-y-1">
                        <div className="text-sm font-black text-emerald-700">GH₵ {(order.totalAmount || (order.productPrice * order.quantity)).toLocaleString()}</div>
                        <div className="text-[10px] text-slate-400 flex items-center sm:justify-end gap-1 font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{new Date(order.createdAt).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">{completedCount?'Load older orders to view earlier completed sales.':'No completed sales logged yet.'}</p>
                  <p className="text-[10px] text-slate-400">When handovers are authenticated with OTP PINs, completed logs appear here.</p>
                </div>
              )}
            </div>
            {orders.some(order=>['Expired','Cancelled','Location Rejected'].includes(order.status))&&<section className="space-y-3 rounded-3xl border border-blue-100 bg-white/70 p-6"><h3 className="font-black text-blue-950">Closed requests</h3>{orders.filter(order=>['Expired','Cancelled','Location Rejected'].includes(order.status)).map(order=><div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 p-3 text-sm"><span>{order.productTitle}</span><span className="font-bold">{order.status}</span></div>)}</section>}
          </div>
        )}

        {/* TAB: SELLER NOTIFICATIONS VIEW */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div className="bg-white/80 border border-blue-100 backdrop-blur-md rounded-3xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-600" />
                    <span>Seller Notifications & Alerts</span>
                    {unreadNotifCount > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 text-xs font-black">
                        {unreadNotifCount} unread
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Real-time buy requests, customer handover PIN confirmations, store accreditation status, and platform updates.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => loadData()}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>Refresh Feed</span>
                  </button>

                  {unreadNotifCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllNotificationsRead}
                      className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4 text-blue-600" />
                      <span>Mark All Read</span>
                    </button>
                  )}
                </div>
              </div>

              {/* FILTER TABS */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { id: 'all', label: `All Alerts (${sellerNotifications.length})` },
                  { id: 'unread', label: `Unread (${unreadNotifCount})` },
                  { id: 'orders', label: 'Buy Requests & Handovers' },
                  { id: 'system', label: 'Store & Platform' }
                ].map(filterTab => (
                  <button
                    key={filterTab.id}
                    type="button"
                    onClick={() => setNotifFilter(filterTab.id as any)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                      notifFilter === filterTab.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
                    }`}
                  >
                    {filterTab.label}
                  </button>
                ))}
              </div>

              {/* NOTIFICATION CARDS */}
              {filteredNotifications.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {filteredNotifications.map((notif: any) => {
                    const isMarketChat = notif.marketChat || /^📩 New message from /.test(notif.title || '');
                    const isBuyRequest = !isMarketChat && ( (notif.title || '').toLowerCase().includes('buy') || (notif.title || '').toLowerCase().includes('order') || (notif.message || '').toLowerCase().includes('purchase'));
                    return (
                      <div
                        key={notif.id}
                        data-notification-id={notif.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          !notif.read
                            ? 'bg-blue-50/60 border-blue-200 shadow-2xs'
                            : 'bg-slate-50/50 border-slate-200/80 text-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-3.5">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isBuyRequest
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : !notif.read
                              ? 'bg-blue-100 text-blue-700 border-blue-200'
                              : 'bg-slate-200/70 text-slate-600 border-slate-300'
                          }`}>
                            {isBuyRequest ? (
                              <ShoppingBag className="w-5 h-5" />
                            ) : (
                              <Bell className="w-5 h-5" />
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-black text-slate-900">{notif.title}</h4>
                              {!notif.read && (
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                              )}
                              <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                                {notif.date || 'Recent'}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-2xl">
                              {notif.message}
                            </p>
                      <SupportNotificationLink notification={notif} />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {isMarketChat && <button type="button" onClick={() => { if (!notif.read) handleMarkNotificationRead(notif.id); setActiveTab('messages'); }} className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /><span>Open Messages</span></button>}
                          {isBuyRequest && (() => {
                            const notifTitle = (notif.title || '').toLowerCase();
                            const notifMsg = (notif.message || '').toLowerCase();
                            const notifCombined = `${notifTitle} ${notifMsg}`;

                            const matchedOrder = notif.orderId ? orders.find(o => o.id === notif.orderId) : orders.find(o =>
                              (notif.orderId && o.id === notif.orderId) ||
                              (notif.productId && o.productId === notif.productId) ||
                              (o.productTitle && notifCombined.includes(o.productTitle.toLowerCase())) ||
                              (o.buyerName && notifCombined.includes(o.buyerName.toLowerCase()))
                            );

                            const isOrderCompleted = matchedOrder && (
                              matchedOrder.status === 'Completed & Paid' || 
                              matchedOrder.status === 'Completed' || 
                              matchedOrder.status === 'completed'
                            );

                            if (matchedOrder && ['Location Rejected', 'Rejected by Seller'].includes(matchedOrder.status)) {
                              return <span role="status" className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-black flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" aria-hidden="true" />Declined</span>;
                            }

                            if (isOrderCompleted) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!notif.read) handleMarkNotificationRead(notif.id);
                                    setActiveTab('sales');
                                    setTimeout(() => {
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }, 100);
                                  }}
                                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                                  title="Sale completed successfully - View Sales History"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Success ✓</span>
                                </button>
                              );
                            }

                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!notif.read) handleMarkNotificationRead(notif.id);
                                  const targetOrder = matchedOrder;

                                  setActiveTab('dashboard');
                                  setVerifyingOrder(null);
                                  setTimeout(() => {
                                    const el = document.getElementById(targetOrder ? `market-order-${targetOrder.id}` : 'active-handover-orders');
                                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                                    else window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }, 100);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <span>View Order</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            );
                          })()}

                          {!notif.read ? (
                            <button
                              type="button"
                              onClick={() => handleMarkNotificationRead(notif.id)}
                              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                              title="Mark as read"
                            >
                              Mark Read
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 px-2.5 py-1 bg-slate-100 rounded-xl flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Read
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-16 text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-blue-500">
                    <Inbox className="w-8 h-8 text-blue-400" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-800">No Notifications Found</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {notifFilter === 'unread'
                        ? "You have zero unread notifications. Great job keeping up with buyer updates!"
                        : "When buyers place order requests or submit handover OTP codes, notifications will appear right here."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'messages' && <MarketplaceInbox />}

        {activeTab === "upgrade" && (
          <section className="space-y-6 animate-fadeIn">
            <div className="relative overflow-hidden rounded-3xl border border-blue-300/40 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-6 sm:p-9 text-white shadow-[0_20px_60px_rgba(30,64,175,0.25)]">
              <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-cyan-300/30 bg-cyan-300/10 animate-pulse" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100"><Star className="h-3.5 w-3.5 fill-current" /> PineVela seller plans</div><h2 className="text-2xl font-black tracking-tight sm:text-3xl">Make your store stand out.</h2></div>
                <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur"><div className="text-[10px] font-black uppercase tracking-wider text-blue-200">Current plan</div><div className="mt-1 flex items-center gap-2 text-lg font-black"><BadgeCheck className="h-5 w-5 text-cyan-300" />Pine {subscriptionPlan === "star" ? "Star" : subscriptionPlan === "pro" ? "Pro" : "Default"}</div></div>
              </div>
            </div>
            <div className="sm:hidden space-y-4">
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-white/55 p-1.5 backdrop-blur-md">
                <button type="button" onClick={() => setSelectedMobilePlan("default")} className={`rounded-xl px-2 py-2 text-[10px] font-black transition-all ${displayedMobilePlan === "default" ? "bg-blue-600 text-white shadow-md" : "text-slate-500"}`}>Pine Default</button>
                <button type="button" onClick={() => setSelectedMobilePlan("star")} className={`rounded-xl px-2 py-2 text-[10px] font-black transition-all ${displayedMobilePlan === "star" ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md" : "text-slate-500"}`}>Pine Star</button>
                <button type="button" onClick={() => setSelectedMobilePlan("pro")} className={`rounded-xl px-2 py-2 text-[10px] font-black transition-all ${displayedMobilePlan === "pro" ? "bg-indigo-950 text-cyan-200 shadow-md" : "text-slate-500"}`}>Pine Pro</button>
              </div>
              <div key={displayedMobilePlan} className={`relative min-h-[365px] overflow-hidden rounded-3xl border p-6 shadow-xl animate-fadeIn ${displayedMobilePlan === "pro" ? "border-cyan-300/70 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white" : displayedMobilePlan === "star" ? "border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-slate-900" : "border-blue-200 bg-gradient-to-br from-white via-blue-50 to-slate-50 text-slate-900"}`}>
                <div className={`absolute inset-x-0 top-0 h-1 ${displayedMobilePlan === "pro" ? "bg-gradient-to-r from-indigo-500 via-cyan-300 to-indigo-500 animate-pulse" : displayedMobilePlan === "star" ? "bg-gradient-to-r from-amber-300 via-yellow-500 to-orange-400 animate-pulse" : "bg-gradient-to-r from-blue-300 via-blue-600 to-indigo-400"}`} />
                <div className="relative flex h-full flex-col"><div className="flex items-start justify-between"><div className={`rounded-2xl p-3 ${displayedMobilePlan === "pro" ? "bg-cyan-300/15 text-cyan-200" : displayedMobilePlan === "star" ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white" : "bg-blue-100 text-blue-700"}`}>{displayedMobilePlan === "pro" ? <TrendingUp className="h-7 w-7" /> : displayedMobilePlan === "star" ? <Star className="h-7 w-7 fill-current" /> : <Store className="h-7 w-7" />}</div><BadgeCheck className={`h-6 w-6 ${displayedMobilePlan === "pro" ? "text-cyan-300" : displayedMobilePlan === "star" ? "text-amber-600" : "text-blue-600"}`} /></div><div className="mt-6"><div className={`text-[10px] font-black uppercase tracking-[0.16em] ${displayedMobilePlan === "pro" ? "text-cyan-200" : displayedMobilePlan === "star" ? "text-amber-700" : "text-blue-700"}`}>Selected seller subscription</div><h3 className="mt-1 text-3xl font-black">Pine {displayedMobilePlan === "star" ? "Star" : displayedMobilePlan === "pro" ? "Pro" : "Default"}</h3><p className={`mt-2 text-sm font-medium ${displayedMobilePlan === "pro" ? "text-indigo-100" : "text-slate-600"}`}>{displayedMobilePlan === "pro" ? "More publishing capacity for established stores." : displayedMobilePlan === "star" ? "A brighter presence for growing stores." : "Everything needed to begin selling."}</p></div><div className={`my-6 h-px ${displayedMobilePlan === "pro" ? "bg-white/15" : "bg-slate-200"}`} /><div className="grid grid-cols-3 gap-2 text-center"><div className={`rounded-2xl p-3 ${displayedMobilePlan === "pro" ? "bg-white/10" : "bg-white/70"}`}><div className="text-lg font-black">{displayedMobilePlan === "pro" ? "200" : displayedMobilePlan === "star" ? "100" : "20"}</div><div className="text-[9px] font-bold opacity-70">items</div></div><div className={`rounded-2xl p-3 ${displayedMobilePlan === "pro" ? "bg-white/10" : "bg-white/70"}`}><div className="text-lg font-black">{displayedMobilePlan === "pro" ? "10" : displayedMobilePlan === "star" ? "5" : "1"}</div><div className="text-[9px] font-bold opacity-70">services</div></div><div className={`rounded-2xl p-3 ${displayedMobilePlan === "pro" ? "bg-white/10" : "bg-white/70"}`}><div className="text-lg font-black">{displayedMobilePlan === "pro" ? "900" : displayedMobilePlan === "star" ? "600" : "200"}</div><div className="text-[9px] font-bold opacity-70">inventory</div></div></div><div className={`mt-6 rounded-2xl p-3 text-xs font-semibold leading-relaxed ${displayedMobilePlan === "pro" ? "bg-cyan-300/10 text-cyan-100" : displayedMobilePlan === "star" ? "bg-amber-100 text-amber-950" : "bg-blue-100 text-blue-950"}`}>{displayedMobilePlan === "pro" ? "Publish up to 200 items and 10 services, with 900 inventory units. Glowing PineVela badge, golden card frames, custom store logo and cover uploads, and priority in featured searches." : displayedMobilePlan === "star" ? "Publish up to 100 items and five services, with 600 inventory units. Golden glowing PineVela badges on your item and service cards, plus custom store logo and cover uploads." : "Publish up to 20 items and one service at a time, with 200 total inventory units. Standard PineVela logo and four built-in cover designs."}</div><div className={`mt-auto pt-5 text-lg font-black ${displayedMobilePlan === "pro" ? "text-cyan-200" : displayedMobilePlan === "star" ? "text-amber-700" : "text-blue-700"}`}>{planPrice(displayedMobilePlan)}</div></div>
                <button type="button" onClick={activateMobilePlan} disabled={isPlanActivationLoading || !paymentSettings} className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black transition-all disabled:cursor-default ${displayedMobilePlan === subscriptionPlan ? "bg-emerald-500 text-white" : displayedMobilePlan === "pro" ? "bg-cyan-300 text-slate-950" : displayedMobilePlan === "star" ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950" : "bg-blue-600 text-white"}`}>{isPlanActivationLoading ? <><RefreshCw className="h-4 w-4 animate-spin" />Activating...</> : displayedMobilePlan === subscriptionPlan ? <><CheckCircle2 className="h-4 w-4" />Renew plan</> : <>Upgrade to Pine {displayedMobilePlan === "star" ? "Star" : displayedMobilePlan === "pro" ? "Pro" : "Default"}<ArrowRight className="h-4 w-4" /></>}</button>
              </div>
            </div>
            <div className="space-y-3 rounded-2xl border border-blue-200 bg-white/80 p-5 text-sm text-slate-900">
              {paymentError && <p role="alert" className="text-red-700">{paymentError}</p>}
              <p>Registration: GHS {paymentSettings?.registrationFee ?? '…'} once. Semester fee: GHS {paymentSettings?.semesterFee ?? '…'} every two months. Plans renew monthly through checkout; no automatic debit.</p>
              <p>Plan paid until: {storeData?.subscriptionExpiresAt ? new Date(storeData.subscriptionExpiresAt).toLocaleDateString() : 'No verified paid period'}. Two-month fee paid until: {storeData?.semesterExpiresAt ? new Date(storeData.semesterExpiresAt).toLocaleDateString() : 'Payment required'}.</p>
              {storeData?.paymentMode === 'test' && <p className="font-semibold text-amber-700">Paystack test payment — development access only.</p>}
              <button disabled={isPlanActivationLoading || !paymentSettings} onClick={() => checkoutPayment(storeData?.registrationFeePaid ? 'semester' : 'activation')} className="rounded-xl bg-blue-600 px-4 py-3 text-white disabled:opacity-50">{storeData?.registrationFeePaid ? 'Renew two-month fee' : 'Complete verified registration'}</button>
              {(<button onClick={() => navigate('/payments/return')} className="ml-3 text-blue-700">View unfinished payments</button>)}
            </div>
            <div className="hidden grid-cols-1 gap-5 sm:grid lg:grid-cols-3">
              <button type="button" disabled={isPlanActivationLoading || !paymentSettings} onClick={() => selectSubscription("default")} className={`group relative overflow-hidden rounded-3xl border bg-white/70 p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl ${subscriptionPlan === "default" ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"}`}><div className="flex items-start justify-between"><div className="rounded-2xl bg-blue-100 p-3 text-blue-700"><Store className="h-6 w-6" /></div>{subscriptionPlan === "default" && <BadgeCheck className="h-6 w-6 text-blue-600" />}</div><h3 className="mt-5 text-xl font-black text-slate-900">Pine Default</h3><p className="mt-1 text-sm text-slate-500">Everything needed to begin selling.</p><div className="my-5 h-px bg-slate-200" /><div className="space-y-3 text-sm font-semibold text-slate-700"><div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-blue-600" />Publish 20 items at a time</div><div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-blue-600" />1 active service</div><div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-blue-600" />200 total inventory units</div><div className="flex gap-2"><ImageIcon className="h-4 w-4 text-blue-600" />Four PineVela covers and standard logo</div></div><div className="mt-6 text-sm font-black text-blue-700">{planPrice("default")} <ArrowRight className="ml-1 inline h-4 w-4" /></div></button>
              <button type="button" disabled={isPlanActivationLoading || !paymentSettings} onClick={() => selectSubscription("star")} className={`group relative overflow-hidden rounded-3xl border bg-gradient-to-b from-amber-50 via-white to-orange-50 p-6 text-left shadow-md transition-all hover:-translate-y-1 hover:shadow-2xl ${subscriptionPlan === "star" ? "border-amber-400 ring-2 ring-amber-200" : "border-amber-200"}`}><div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-yellow-500 to-orange-400 animate-pulse" /><div className="flex items-start justify-between"><div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-3 text-white shadow-lg"><Star className="h-6 w-6 fill-current" /></div>{subscriptionPlan === "star" && <BadgeCheck className="h-6 w-6 text-amber-600" />}</div><h3 className="mt-5 text-xl font-black text-slate-900">Pine Star</h3><p className="mt-1 text-sm text-slate-600">A brighter presence for growing stores.</p><div className="mt-4 text-2xl font-black text-slate-900">{planPrice("star")}</div><div className="my-5 h-px bg-amber-200" /><div className="space-y-3 text-sm font-semibold text-slate-700"><div className="flex gap-2"><BadgeCheck className="h-4 w-4 text-amber-600" />100 items, 5 services, 600 inventory</div><div className="flex gap-2"><TrendingUp className="h-4 w-4 text-amber-600" />Glowing PineVela star badges on listing cards</div><div className="flex gap-2"><ImageIcon className="h-4 w-4 text-amber-600" />Custom store logo and cover uploads</div></div><div className="mt-6 text-sm font-black text-amber-700">Choose Pine Star <ArrowRight className="ml-1 inline h-4 w-4" /></div></button>
              <button type="button" disabled={isPlanActivationLoading || !paymentSettings} onClick={() => selectSubscription("pro")} className={`group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-left text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl ${subscriptionPlan === "pro" ? "border-cyan-300 ring-2 ring-cyan-300/70" : "border-indigo-500/60"}`}><div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-300/20 blur-2xl animate-pulse" /><div className="relative flex items-start justify-between"><div className="rounded-2xl border border-cyan-200/40 bg-cyan-300/15 p-3 text-cyan-200"><TrendingUp className="h-6 w-6" /></div>{subscriptionPlan === "pro" && <BadgeCheck className="h-6 w-6 text-cyan-300" />}</div><div className="relative"><h3 className="mt-5 text-xl font-black">Pine Pro</h3><p className="mt-1 text-sm text-indigo-200">More publishing capacity for established stores.</p><div className="mt-4 text-2xl font-black">{planPrice("pro")}</div><div className="my-5 h-px bg-white/15" /><div className="space-y-3 text-sm font-semibold text-indigo-50"><div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-300" />200 items, 10 services, 900 inventory</div><div className="flex gap-2"><Star className="h-4 w-4 text-cyan-300" />Golden frames on item and service cards</div><div className="flex gap-2"><ImageIcon className="h-4 w-4 text-cyan-300" />Priority search placement and custom store branding</div></div><div className="mt-6 text-sm font-black text-cyan-200">Choose Pine Pro <ArrowRight className="ml-1 inline h-4 w-4" /></div></div></button>
            </div>
          </section>
        )}

        {/* TAB 4: STORE PROFILE EDIT */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
          <AppearanceSettings />
          <PortalPinSettings />
          {storeData && <StoreProfileSummary store={storeData} />}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* ACCREDITATION DOSSIER (LEFT CARD) */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white/70 border border-blue-100/50 backdrop-blur-md rounded-3xl p-6 shadow-xs space-y-6 text-center">
                <div className="w-16 h-16 rounded-full bg-blue-100/80 flex items-center justify-center mx-auto border border-blue-200">
                  <ShieldCheck className="w-8 h-8 text-blue-600 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-950">Official Merchant Accreditation</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Peer-to-peer campus business license verified by PineVela administration.</p>
                </div>

                <div className="border-t border-slate-100 pt-4 text-left space-y-3.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">ACC CODE:</span>
                    <span className="font-mono font-black text-slate-800">PINE-AC-{(storeData?.id || '00').slice(-6).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">FEE PAID:</span>
                    <span className="font-black text-emerald-600">GH₵ 50.00 (MoMo)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">INSTITUTION:</span>
                    <span className="font-black text-slate-800 text-right">{storeData?.university || 'Ghanaian Accredited University'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold">VERIFIED EMAIL:</span>
                    <span className="font-mono text-slate-600">{studentEmail}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold">STORE RATING:</span>
                    <span className="font-black text-amber-600 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      <span>{(storeData as any)?.ratingCount ? Number((storeData as any).storeRating).toFixed(1) : 'Unrated'}</span>
                      <span className="text-[9px] text-slate-400 font-normal">({(storeData as any)?.ratingCount || 0} reviews)</span>
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-50 text-[10px] text-blue-900 leading-relaxed text-left">
                  <strong>P2P Commerce Code:</strong> All merchants must verify transactions physically inside KNUST/Accra college enclaves. Never handover goods without customer's six-digit pickup PIN.
                </div>
              </div>
            </div>

            {/* EDIT FORM (RIGHT CARD) */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white/70 border border-blue-100/50 backdrop-blur-md rounded-3xl p-6 shadow-xs">
                <div className="pb-4 border-b border-slate-100 mb-6">
                  <h3 className="text-sm font-black text-slate-950 flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4 text-blue-600" />
                    <span>Edit Storefront Profile Details</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Update your market branding, locations, and profile settings in real-time.</p>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <StoreBrandingEditor customBranding={subscriptionPlan !== 'default'} logo={editProfilePicture} cover={editCoverPicture} onLogo={setEditProfilePicture} onCover={setEditCoverPicture} onBusy={onProfileMediaBusy} />
                  <InternationalPhoneInput label="Store Primary Contact Number" value={editPhone} country={editPhoneCountry} onChange={(value, country) => { setEditPhone(value); setEditPhoneCountry(country); }} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div id="prof-group-name">
                      <label className="block text-xs font-black text-slate-800 mb-1">Store / Market Name</label>
                      <input aria-label="Store / Market Name"
                        type="text"
                        required
                        value={editStoreName}
                        onChange={(e) => setEditStoreName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                      />
                    </div>

                    <div id="prof-group-username">
                      <label className="block text-xs font-black text-slate-800 mb-1">Merchant Username</label>
                      <input aria-label="Merchant Username"
                        type="text"
                        required
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div id="prof-group-location">
                      <label className="block text-xs font-black text-slate-800 mb-1">Campus Location</label>
                      <input aria-label="Campus Location"
                        type="text"
                        required
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                      />
                    </div>

                    <div id="prof-group-category">
                      <label className="block text-xs font-black text-slate-800 mb-1">Primary Category</label>
                      <input aria-label="Primary Category"
                        type="text"
                        required
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div id="prof-group-delivery">
                    <label className="block text-xs font-black text-slate-800 mb-1">Delivery / Handover Mode</label>
                    <select aria-label="Delivery / Handover Mode" required value={editDeliveryForm} onChange={e => setEditDeliveryForm(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600">
                      <option value="" disabled>Choose a delivery method</option>
                      {editDeliveryForm && !(STORE_DELIVERY_METHODS as readonly string[]).includes(editDeliveryForm) && <option value={editDeliveryForm}>{editDeliveryForm} (saved method)</option>}
                      {STORE_DELIVERY_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
                    </select>
                  </div>

                  <div id="prof-group-desc">
                    <label className="block text-xs font-black text-slate-800 mb-1">Store Description / About</label>
                    <textarea aria-label="Store Description / About"
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                      placeholder="Add an about statement for your store..."
                    />
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      type="submit"
                      disabled={isUpdatingProfile || profileMediaUploads > 0}
                      className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-505 text-white text-xs font-black shadow-lg shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isUpdatingProfile ? "Saving Details..." : "Save Store Changes"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          </div>
        )}
      </main>

      {/* MODAL 1: PUBLISH PRODUCT (MANDATORY DESCRIPTION AND IMAGE) */}
      {showAddModal && (
        <DashboardOverlay aria-label="Publish Item to Global Market" onClose={() => setShowAddModal(false)} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
          <div data-popup-card className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col p-6 sm:p-8 shadow-2xl border border-slate-100 animate-scaleIn">
            
            {/* Header: Fixed & static */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Publish Item to Global Market</h3>
                  <p className="text-[11px] text-slate-400">List products where active PineVela campus buyers can view and purchase instantly.</p>
                </div>
              </div>

              <button aria-label="Close dialog"
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Body Container */}
            <form onSubmit={handleCreateProduct} className="flex-1 overflow-y-auto pr-1 py-4 space-y-4 scrollbar-thin">
              <div id="add-group-title">
                <label className="block text-xs font-black text-slate-800 mb-1">Product / Item Title *</label>
                <input aria-label="Product / Item Title"
                  type="text"
                  required
                  placeholder="e.g. Apple MacBook Pro 14' M2 (16GB/512GB)"
                  value={prodTitle}
                  onChange={(e) => setProdTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div id="add-group-price">
                  <label className="block text-xs font-black text-slate-800 mb-1">Price in GHS (GH₵) *</label>
                  <input aria-label="Price in GHS (GH₵)"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="e.g. 4500"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div id="add-group-category">
                  <label className="block text-xs font-black text-slate-800 mb-1">Product Category *</label>
                  <div className="relative">
                    <select aria-label="Product Category"
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value)}
                      className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer appearance-none"
                    >
                      {DIGITAL_MARKET_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div id="add-group-condition">
                  <label className="block text-xs font-black text-slate-800 mb-1">Item Condition</label>
                  <select aria-label="Item Condition"
                    value={prodCondition}
                    onChange={(e) => setProdCondition(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    <option value="Brand New">Brand New (Sealed)</option>
                    <option value="Like New">Like New (Mint)</option>
                    <option value="Fairly Used">Fairly Used (Functional)</option>
                    <option value="Refurbished">Refurbished</option>
                  </select>
                </div>

                <div id="add-group-stock">
                  <label className="block text-xs font-black text-slate-800 mb-1">Stock Quantity</label>
                  <input aria-label="Stock Quantity"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div id="add-group-location">
                <label className="block text-xs font-black text-slate-800 mb-1">Safe Campus Meetup Location</label>
                <input aria-label="Safe Campus Meetup Location"
                  type="text"
                  placeholder="e.g. KNUST Main Library Gate or Queens Hall Car Park"
                  value={prodLocation}
                  onChange={(e) => setProdLocation(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* MANDATORY IMAGE INPUT (FROM SELLERS DEVICE ONLY WITH CROPPER) */}
              <div id="add-group-image">
                <label className="block text-xs font-black text-slate-800 mb-1">Product Photo * (Mandatory - Upload & crop directly from your device to ensure listing fit)</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-2xl hover:border-blue-500 transition-all bg-slate-50 relative">
                  <div className="space-y-1 text-center w-full">
                    {prodImageUrl ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative inline-block">
                          <img src={prodImageUrl} alt="Selected Product Preview" className="mx-auto h-36 w-36 object-contain rounded-2xl shadow-md border-2 border-blue-200 bg-slate-100 p-1" referrerPolicy="no-referrer" />
                          <button
                            type="button"
                            onClick={() => setProdImageUrl('')}
                            className="absolute -top-2 -right-2 p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 shadow-sm cursor-pointer"
                            title="Remove photo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setCropTarget('product');
                              setCropRawImage(prodImageUrl);
                              setIsCropModalOpen(true);
                            }}
                            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Crop className="w-3.5 h-3.5 text-blue-600" />
                            <span>Adjust & Crop Photo</span>
                          </button>

                          <label htmlFor="file-upload-replace" className="cursor-pointer px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-xs">
                            <span>Change</span>
                            <input aria-label="Replace item photograph"
                              id="file-upload-replace"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { triggerToast('Choose a JPEG, PNG or WebP photo up to 20MB.', 'error'); return; }
                                  const uploadAccount=user?.id;
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    if (reader.result && accountIsCurrent(uploadAccount)) {
                                      setCropTarget('product');
                                      setCropRawImage(reader.result as string);
                                      setIsCropModalOpen(true);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                  e.target.value = '';
                                }
                              }}
                              className="sr-only"
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <>
                        <ImageIcon className="mx-auto h-10 w-10 text-slate-400" />
                        <div className="flex flex-col items-center justify-center text-xs text-slate-600 mt-2">
                          <label htmlFor="file-upload" className="relative cursor-pointer bg-white px-3.5 py-2 border border-blue-200 rounded-xl font-extrabold text-blue-600 hover:text-blue-500 hover:border-blue-400 transition-all shadow-xs focus-within:outline-none flex items-center gap-2">
                            <Crop className="w-4 h-4 text-blue-600" />
                            <span>Select Photo & Crop for Card</span>
                            <input aria-label="Upload item photograph"
                              id="file-upload"
                              name="file-upload"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              required
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { triggerToast('Choose a JPEG, PNG or WebP photo up to 20MB.', 'error'); return; }
                                  const uploadAccount=user?.id;
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    if (reader.result && accountIsCurrent(uploadAccount)) {
                                      setCropTarget('product');
                                      setCropRawImage(reader.result as string);
                                      setIsCropModalOpen(true);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                  e.target.value = '';
                                }
                              }}
                              className="sr-only"
                            />
                          </label>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">PNG, JPG, JPEG, WEBP files only</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
                <p className="text-xs font-black text-blue-950">Extra item photographs · {prodAdditionalImages.length}/3</p>
                <p className="text-xs text-slate-500">Show other angles or details. JPEG, PNG or WebP, up to 20MB each.</p>
                <div className="flex flex-wrap gap-3">{prodAdditionalImages.map((url, i) => <MarketPhotoUpload key={url} value={url} label={`Change extra photo ${i + 1}`} onBusyChange={mediaBusyChange} disabled={isSubmittingProduct} onChange={next => setProdAdditionalImages(prev => next ? prev.map((v, j) => j === i ? next : v) : prev.filter((_, j) => j !== i))} />)}
                {prodAdditionalImages.length < 3 && <MarketPhotoUpload label="Add extra item photo" onBusyChange={mediaBusyChange} disabled={isSubmittingProduct || mediaUploads > 0} onChange={url => setProdAdditionalImages(prev => prev.length < 3 ? [...prev, url] : prev)} />}</div>
              </div>
              {/* MANDATORY DESCRIPTION TEXTAREA */}
              <div id="add-group-desc">
                <label className="block text-xs font-black text-slate-800 mb-1">Product Description * (Mandatory)</label>
                <textarea aria-label="Product Description * (Mandatory)"
                  rows={3}
                  required
                  placeholder="Provide specifications, age of item, warranty details, and conditions..."
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Footer: Fixed inside form element bottom */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProduct || mediaUploads > 0}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingProduct ? "Publishing..." : "Publish to Campus Market"}
                </button>
              </div>
            </form>
          </div>
        </DashboardOverlay>
      )}

      {/* MODAL: OFFER / EDIT CAMPUS SERVICE */}
      {showServiceModal && (
        <DashboardOverlay aria-label="Publish service" onClose={() => setShowServiceModal(false)} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
          <div data-popup-card className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col p-6 sm:p-8 shadow-2xl border border-slate-100 animate-scaleIn">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
              
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {editingServiceId ? 'Edit Campus Service' : 'Offer a Service on Digital Market'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    List Phone repairs, food services, barbering, tutoring, etc., with full description, location, and call line.
                  </p>
                </div>
              </div>

              <button aria-label="Close dialog"
                type="button"
                onClick={() => setShowServiceModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveService} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
              {/* Service Title */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800">
                  Service Title <span className="text-red-500">*</span>
                </label>
                <input aria-label="Service Title"
                  type="text"
                  required
                  placeholder="e.g. iPhone & Laptop Screen Repairs, Campus Barbering & Fades, Homemade Jollof Delivery"
                  value={servTitle}
                  onChange={(e) => setServTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              {/* Service Subcategory & Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-800">
                    Service Subcategory <span className="text-red-500">*</span>
                  </label>
                  <select aria-label="Service Subcategory"
                    value={servSubCategory}
                    onChange={(e) => setServSubCategory(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white cursor-pointer"
                  >
                    <option value="Phone & Device Repairs">Phone & Device Repairs</option>
                    <option value="Food Services & Catering">Food Services & Catering</option>
                    <option value="Barbering & Grooming">Barbering & Grooming</option>
                    <option value="Hair Styling & Braiding">Hair Styling & Braiding</option>
                    <option value="Tech Support & Software">Tech Support & Software</option>
                    <option value="Academic Tutoring & Proofreading">Academic Tutoring & Proofreading</option>
                    <option value="Laundry & Cleaning">Laundry & Cleaning</option>
                    <option value="Graphic Design & Printing">Graphic Design & Printing</option>
                    <option value="Photography & Video">Photography & Video</option>
                    <option value="Other Good Services">Other Good Services</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-800">
                    Starting Price / Fee (GHS) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">GHS</span>
                    <input aria-label="Starting Price / Fee (GHS)"
                      type="number"
                      step="0.5"
                      min="1"
                      required
                      placeholder="e.g. 50"
                      value={servPrice}
                      onChange={(e) => setServPrice(e.target.value)}
                      className="w-full pl-12 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Price Categories (Optional) */}
              <div className="p-4 bg-slate-50/90 border border-slate-200/90 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                      <Tag className="w-3.5 h-3.5 text-blue-600" />
                      <span>Price Categories / Options</span>
                      <span className="text-[9.5px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
                        Optional
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">
                      Add price categories so buyers can select specific options (e.g. Category Name: <strong>Indomie Assorted</strong>, Price: <strong>50 Cedis</strong>).
                    </p>
                  </div>

                  <button
                    type="button" disabled={servPriceCategories.length >= 4 || isSubmittingService}
                    onClick={() => {
                      if (servPriceCategories.length >= 4) return;
                      setServPriceCategories(prev => [
                        ...prev,
                        { id: `pcat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, name: '', price: '' }
                      ]);
                    }}
                    className="self-start sm:self-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
<span>{servPriceCategories.length >= 4 ? '4 price options maximum' : 'Add Price'}</span>
                  </button>
                </div>

                {servPriceCategories.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {servPriceCategories.map((cat, idx) => (
                      <div
                        key={cat.id || idx}
                        className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs animate-fadeIn"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-700 block">
                            Category Name <span className="text-red-500">*</span>
                          </label>
                          <input aria-label="Category Name"
                            type="text"
                            placeholder="e.g. Indomie Assorted, Jollof with Chicken"
                            value={cat.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setServPriceCategories(prev => prev.map((c, i) => i === idx ? { ...c, name: val } : c));
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                          />
                        </div>

                        <div className="w-32 sm:w-36 space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-700 block">
                            Price (Cedis) <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">GH₵</span>
                            <input aria-label="Price (Cedis)"
                              type="number"
                              min="0"
                              step="0.5"
                              placeholder="50"
                              value={cat.price}
                              onChange={(e) => {
                                const val = e.target.value;
                                setServPriceCategories(prev => prev.map((c, i) => i === idx ? { ...c, price: val } : c));
                              }}
                              className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                            />
                          </div>
                        </div>

                        <MarketPhotoUpload value={cat.imageUrl} label={`Photo for price option ${idx + 1} (optional)`} onBusyChange={mediaBusyChange} disabled={isSubmittingService} onChange={url => setServPriceCategories(prev => prev.map(c => c.id === cat.id ? { ...c, imageUrl: url } : c))} />
                        <div className="pt-4 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setServPriceCategories(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove this price category"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 bg-white/80 p-3 rounded-xl border border-dashed border-slate-200 text-center">
                    No price categories added yet. Tap <strong>"+ Add Price"</strong> to specify category names and prices in Cedis (e.g. <em>Indomie Assorted = 50 Cedis</em>).
                  </div>
                )}
              </div>

              {/* Mandatory service fulfilment location policy */}
              <fieldset className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5">
                <legend className="px-1 text-xs font-black text-slate-800">Service location policy <span className="text-red-500">*</span></legend>
                <p className="text-[10px] font-medium text-slate-600">Choose how students book this service. This setting is required and is shown during booking.</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { value: 'flexible', title: 'Flexible', text: 'Buyer chooses a meetup or delivery location.' },
                    { value: 'fixed', title: 'Fixed', text: 'Buyer can only view and use your pinned location.' },
                    { value: 'hybrid', title: 'Hybrid', text: 'Buyer chooses your base or requests delivery.' }
                  ].map(option => (
                    <label key={option.value} className={`cursor-pointer rounded-xl border p-2.5 transition-all ${servLocationMode === option.value ? 'border-blue-600 bg-white ring-2 ring-blue-200' : 'border-blue-100 bg-white/60 hover:border-blue-300'}`}>
                      <input type="radio" name="service-location-mode" value={option.value} checked={servLocationMode === option.value} onChange={() => setServLocationMode(option.value as 'flexible' | 'fixed' | 'hybrid')} className="sr-only" />
                      <span className="block text-[11px] font-black text-slate-900">{option.title}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-slate-600">{option.text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {servLocationMode === 'flexible' ? (
                <div className="rounded-2xl border border-dashed border-blue-200 bg-sky-50/70 p-3 text-xs text-blue-950">
                  <strong>Flexible location:</strong> no seller map pin is required. Each buyer must choose their preferred meetup or delivery location when placing a booking.
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>Campus Location / Service Base</span> <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsMapLocationPickerOpen(true)}
                      className="text-[10px] text-blue-700 font-extrabold hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Compass className="w-3 h-3 text-blue-600" />
                      <span>Select on Map</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input aria-label="Campus Location / Service Base"
                      type="text"
                      required
                      placeholder="Search or pick on map e.g. Unity Hall Block B, Room 14"
                      value={servLocation}
                      onChange={(e) => setServLocation(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setIsMapLocationPickerOpen(true)}
                      className="px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-black shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                      title="Open Interactive Map Location Selector"
                    >
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden sm:inline">Map</span>
                    </button>
                  </div>
                  <p className={`text-[10px] font-bold ${servLocationPinned ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {servLocationPinned ? '✓ Map pin attached to this service location.' : 'Select on Map is required for this location policy.'}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Direct Call Line / WhatsApp</span> <span className="text-red-500">*</span>
                  </label>
                  <input aria-label="Direct Call Line / WhatsApp"
                    type="text"
                    required
                    placeholder="e.g. 024 123 4567"
                    value={servCallLine}
                    onChange={(e) => setServCallLine(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                  />
                </div>
              </div>
              )}

              {/* Working Days & Opening/Closing Hours */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Working Days & Opening Hours</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                    <input aria-label="Open 24 hours, every day"
                      type="checkbox"
                      checked={servIsOpen247}
                      onChange={(e) => setServIsOpen247(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Available 24/7</span>
                  </label>
                </div>

                {!servIsOpen247 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600">Working Days</label>
                      <select aria-label="Working Days"
                        value={servWorkingDays}
                        onChange={(e) => setServWorkingDays(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                      >
                        <option value="Mon - Sat">Mon - Sat</option>
                        <option value="Mon - Fri">Mon - Fri</option>
                        <option value="Everyday (7 Days)">Everyday (7 Days)</option>
                        <option value="Weekends Only">Weekends Only</option>
                        <option value="By Appointment">By Appointment</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600">Starting Hour</label>
                      <input aria-label="Starting Hour"
                        type="text"
                        placeholder="e.g. 08:00 AM"
                        value={servOpeningTime}
                        onChange={(e) => setServOpeningTime(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600">Closing Hour</label>
                      <input aria-label="Closing Hour"
                        type="text"
                        placeholder="e.g. 06:00 PM"
                        value={servClosingTime}
                        onChange={(e) => setServClosingTime(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Detailed Description */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800">
                  Detailed Description of What You Offer <span className="text-red-500">*</span>
                </label>
                <textarea aria-label="Detailed Description of What You Offer"
                  rows={3}
                  required
                  placeholder="Provide detailed description of what you offer (e.g. for phone repairs: models supported, authentic screen replacement, battery testing, 30-day warranty; for food: ingredients, meal portion, packaging, hot delivery; for barbering: haircuts, beard trims, tools sanitized)."
                  value={servDesc}
                  onChange={(e) => setServDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white resize-none"
                />
              </div>

              {/* Mandatory Cover Photo Upload & Crop */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800">
                    Service Cover Photograph <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-bold">Upload & Crop to fit</span>
                </div>

                {/* Image Preview / Upload Box */}
                <div className="relative border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-4 flex flex-col items-center justify-center bg-slate-50/70 transition-all">
                  {servImageUrl ? (
                    <div className="relative w-full flex flex-col items-center">
                      <div className="relative w-full h-40 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center shadow-xs">
                        <img src={servImageUrl} alt="Service cover" className="w-full h-full object-cover" />
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white text-[9.5px] font-black rounded-md shadow-xs flex items-center gap-1 border border-blue-400/30">
                          <PineWordmark />
                          <span className="text-white font-black">(Service)</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setCropTarget('service');
                            setCropRawImage(servImageUrl);
                            setIsCropModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Crop className="w-3.5 h-3.5 text-blue-600" />
                          <span>Crop & Fit Cover Photo</span>
                        </button>

                        <label htmlFor="serv-file-replace" className="cursor-pointer px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-black transition-all shadow-2xs">
                          <span>Upload Different Photo</span>
                          <input aria-label="Replace service photograph"
                            id="serv-file-replace"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { triggerToast('Choose a JPEG, PNG or WebP photo up to 20MB.', 'error'); return; }
                                const uploadAccount=user?.id;
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  if (reader.result && accountIsCurrent(uploadAccount)) {
                                    setCropTarget('service');
                                    setCropRawImage(reader.result as string);
                                    setIsCropModalOpen(true);
                                  }
                                };
                                reader.readAsDataURL(file);
                                e.target.value = '';
                              }
                            }}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                        <ImageIcon className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-black text-slate-800">Upload Your Service Cover Photograph</p>
                        <p className="text-[10px] text-slate-500 font-medium">Sellers should upload an authentic photo of their work and crop it to fit.</p>
                      </div>
                      <label htmlFor="serv-file-upload" className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black cursor-pointer shadow-md transition-all">
                        <Crop className="w-3.5 h-3.5 text-blue-200" />
                        <span>Select Photo & Crop</span>
                        <input aria-label="Upload service photograph"
                          id="serv-file-upload"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { triggerToast('Choose a JPEG, PNG or WebP photo up to 20MB.', 'error'); return; }
                              const uploadAccount=user?.id;
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                if (reader.result && accountIsCurrent(uploadAccount)) {
                                  setCropTarget('service');
                                  setCropRawImage(reader.result as string);
                                  setIsCropModalOpen(true);
                                }
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }
                          }}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Availability Toggle */}
              <label className="flex items-center justify-between gap-3 cursor-pointer p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <div className="text-xs font-black text-slate-800">Currently Open & Accepting Bookings</div>
                  <div className="text-[10px] text-slate-500">When enabled, students can see your service and call or book.</div>
                </div>
                <input aria-label="Service available for bookings"
                  type="checkbox"
                  checked={servIsAvailable}
                  onChange={(e) => setServIsAvailable(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </label>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowServiceModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingService || mediaUploads > 0}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingService && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingServiceId ? 'Save Service Changes' : 'Publish Service to Digital Market'}</span>
                </button>
              </div>
            </form>
          </div>
        </DashboardOverlay>
      )}

      {/* MODAL 2: OTP VERIFICATION POPUP */}
      {decliningOrder && (
        <DashboardOverlay aria-label="Decline meetup confirmation" onClose={confirmingOrderId ? null : () => setDecliningOrder(null)} className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="relative w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl space-y-5">
            <button type="button" aria-label="Close decline confirmation" disabled={!!confirmingOrderId} onClick={() => setDecliningOrder(null)} className="absolute right-3 top-3 p-2 text-slate-500 disabled:opacity-50"><X size={20} /></button>
            <h2 className="pr-8 text-lg font-black text-slate-900">Decline this meetup?</h2>
            <p className="text-sm text-slate-600">Decline the proposed meetup at {decliningOrder.meetingLocation} for “{decliningOrder.productTitle}”? The buyer will be notified and this order will be marked declined.</p>
            <div className="flex justify-end gap-3">
              <button type="button" disabled={!!confirmingOrderId} onClick={() => setDecliningOrder(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">Keep order</button>
              <button type="button" disabled={!!confirmingOrderId} onClick={() => handleDeclineLocation(decliningOrder.id)} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{confirmingOrderId ? 'Declining…' : 'Confirm decline'}</button>
            </div>
          </section>
        </DashboardOverlay>
      )}

      {verifyingOrder && (
        <DashboardOverlay aria-label="Verify Customer Pickup PIN" onClose={() => setVerifyingOrder(null)} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div data-popup-card className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Verify Customer Pickup PIN</h3>
                  <p className="text-[11px] text-slate-400">Transaction ID: #{verifyingOrder.id.slice(-8)}</p>
                </div>
              </div>

              <button aria-label="Close dialog"
                type="button"
                onClick={() => setVerifyingOrder(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Product:</span>
                <span className="font-bold text-slate-950">{verifyingOrder.productTitle}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-bold text-slate-950">{verifyingOrder.buyerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Amount Due:</span>
                <span className="font-black text-emerald-700 text-sm">GH₵ {verifyingOrder.totalAmount || (verifyingOrder.productPrice * verifyingOrder.quantity)}</span>
              </div>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-4">
              <div id="pin-group-input">
                <label className="block text-xs font-black text-slate-800 mb-2 text-center">
                  Enter buyer's 6-Digit Pickup PIN to finalize delivery:
                </label>
                <input aria-label="Enter buyer's 6-Digit Pickup PIN to finalize delivery:"
                  type="text"
                  maxLength={6}
                  required
                  placeholder="• • • • • •"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full py-3 bg-blue-50 border-2 border-blue-400 rounded-2xl text-center text-3xl font-black font-mono tracking-widest text-blue-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setVerifyingOrder(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pinSubmitting || pinInput.length !== 6}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-505 text-white text-xs font-black shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {pinSubmitting ? "Verifying..." : "Verify & Complete"}
                </button>
              </div>
            </form>
          </div>
        </DashboardOverlay>
      )}

      {/* VIEW ORDER PINNED MEETUP SPOT MODAL */}
      {viewingOrderMap && (
        <DashboardOverlay aria-label="Order meetup location" onClose={() => setViewingOrderMap(null)} className="fixed inset-0 z-[200] bg-slate-950/75 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div data-popup-card className="max-w-[calc(100vw-1rem)] sm:max-w-2xl w-full">
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

      {/* GLOBAL FLOATING PLUS BUTTON (MOBILE ONLY) */}
      <button
        type="button"
        onClick={() => {
          if (activeTab === 'services') {
            handleOpenAddService();
          } else {
            setShowAddModal(true);
          }
        }}
        data-seller-add className="sm:hidden fixed bottom-20 left-6 z-40 w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full shadow-[0_8px_32px_rgba(59,130,246,0.35)] flex items-center justify-center transition-all transform active:scale-95 cursor-pointer border border-blue-400/30"
        title={activeTab === 'services' ? "Offer New Service" : "Publish New Item"}
      >
        <Plus className="w-7 h-7 text-white" />
      </button>

      {/* MOBILE BOTTOM NAVIGATION BAR — FIXED FROSTY LIGHT-BLUE GLASS LOOK */}
      <MobileNavigation label="Seller navigation" visibility="sm:hidden" activeTab={activeTab} onSelect={id => { setActiveTab(id as any); window.scrollTo({ top: 0, behavior: 'smooth' }); }} primaryIds={['dashboard','inventory','services','sales']} items={[
        { id: 'dashboard', label: 'Home', icon: TrendingUp },
        { id: 'inventory', label: 'Stock', icon: Package },
        { id: 'services', label: 'Services', icon: Wrench },
        { id: 'sales', label: 'Sales', icon: Clock },
        { id: 'notifications', label: 'Alerts', icon: Bell, badge: unreadNotifCount, group: 'Activity' },
        { id: 'messages', label: 'Messages', icon: MessageSquare, badge: sellerMessageUnreadCount, group: 'Activity' },
        { id: 'upgrade', label: 'Upgrade', icon: CreditCard, group: 'Account' },
        { id: 'profile', label: 'Store Profile', icon: Store, group: 'Account' }
      ]} />

      {/* SELECT SERVICE LOCATION ON MAP MODAL */}
      {isMapLocationPickerOpen && (
        <DashboardOverlay aria-label="Choose service location" onClose={() => setIsMapLocationPickerOpen(false)} className="fixed inset-0 z-[200] bg-slate-950/75 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div data-popup-card className="max-w-[calc(100vw-1rem)] sm:max-w-2xl w-full">
            <CampusMeetupMapPicker
              latitude={servLat}
              longitude={servLng}
              initialLocationName={servLocation}
              readOnly={false}
              preferredUniversity={storeData?.university || 'KNUST'}
              onLocationSelect={({ locationName, latitude, longitude }) => {
                setServLocation(locationName);
                setServLat(latitude);
                setServLng(longitude);
                setServLocationPinned(true);
                setIsMapLocationPickerOpen(false);
                triggerToast(`Location pin set to "${locationName}"`, "success");
              }}
              onClose={() => setIsMapLocationPickerOpen(false)}
            />
          </div>
        </DashboardOverlay>
      )}

      {/* VIEW EXACT SERVICE LOCATION PIN MODAL */}
      {viewingServiceMap && (
        <DashboardOverlay aria-label="Service location" onClose={() => setViewingServiceMap(null)} className="fixed inset-0 z-[200] bg-slate-950/75 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div data-popup-card className="max-w-[calc(100vw-1rem)] sm:max-w-2xl w-full">
            <CampusMeetupMapPicker
              latitude={viewingServiceMap.lat || viewingServiceMap.latitude || 6.6745}
              longitude={viewingServiceMap.lng || viewingServiceMap.longitude || -1.5716}
              initialLocationName={viewingServiceMap.location || viewingServiceMap.meetingLocation || 'Campus Service Base'}
              readOnly={true}
              preferredUniversity={viewingServiceMap.sellerUniversity}
              onClose={() => setViewingServiceMap(null)}
            />
          </div>
        </DashboardOverlay>
      )}

      {/* SERVICE RATINGS & STUDENT REVIEWS MODAL */}
      {viewingServiceReviews && (
        <DashboardOverlay aria-label="Service reviews" onClose={() => setViewingServiceReviews(null)} className="fixed inset-0 z-[200] bg-slate-950/75 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn">
          <div data-popup-card className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col p-6 shadow-2xl border border-slate-100 animate-scaleUp">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-bold">
                  <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 line-clamp-1">
                    {viewingServiceReviews.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <span className="font-extrabold text-amber-900">
                      {viewingServiceReviews.reviewCount ? `${Number(viewingServiceReviews.rating).toFixed(1)} ★` : 'Unrated'}
                    </span>
                    <span>·</span>
                    <span>{serviceReviewsList.length} verified student reviews</span>
                  </div>
                </div>
              </div>

              <button aria-label="Close dialog"
                type="button"
                onClick={() => setViewingServiceReviews(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Verified Reviews List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
              <p className="text-xs text-slate-500">Reviews come from completed purchases. Buyers submit and edit reviews in Purchases &amp; Tracking.</p>

              {/* Reviews List */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Student Experiences ({serviceReviewsList.length})
                </h4>

                {loadingReviews ? (
                  <div className="py-8 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Loading student reviews...</span>
                  </div>
                ) : serviceReviewsList.length > 0 ? (
                  serviceReviewsList.map((rev) => (
                    <div key={rev.id} className="bg-white border border-slate-150 rounded-2xl p-3.5 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-900 text-xs font-black flex items-center justify-center">
                            {(rev.buyerName || rev.buyerEmail || 'S')[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-900">{rev.buyerName || rev.buyerEmail || 'Student Buyer'}</div>
                            <div className="text-[10px] text-slate-400">
                              {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString() : 'Verified Resident'}
                            </div>
                          </div>
                        </div>

                        {/* Stars */}
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3 h-3 ${
                                s <= (rev.rating || 5)
                                  ? 'fill-amber-400 text-amber-500'
                                  : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed font-medium pl-9">
                        {rev.review || 'No written comment.'}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-6 text-center text-xs text-slate-500 font-medium">
                    No reviews written yet for this campus service. Be the first student to share your experience above!
                  </div>
                )}
              </div>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* SECURE SIGNOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && (
        <DashboardOverlay aria-label="Sign out of market" onClose={() => setShowLogoutConfirm(false)} className="pv-signout-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
          {/* Backdrop */}
          <div 
            className="absolute inset-0"
            onClick={() => setShowLogoutConfirm(false)}
          />
          
          {/* Modal Container */}
          <div className="relative bg-white/95 backdrop-blur-xl border-2 border-blue-200 rounded-3xl p-6 max-w-sm w-full shadow-[0_20px_50px_rgba(59,130,246,0.15)] text-center space-y-5 animate-scaleUp">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-sky-100/80 flex items-center justify-center border border-blue-200 shadow-inner">
                <PineLogo size={40} hideText={true} />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900">Sign Out of Market?</h3>
              <p className="text-xs text-slate-600 font-bold leading-relaxed">
                You are about to close your secure Digital Market workbench session. Your listings and logs will remain active on campus.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                data-signout-action="cancel"
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl border border-slate-200 transition-all cursor-pointer"
              >
                Keep Open
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  if (!await logout()) return;
                  navigate('/login');
                }}
                data-signout-action="confirm"
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* ITEM IMAGE CROP MODAL */}
      {cropRawImage && (
        <ItemImageCropModal
          isOpen={isCropModalOpen}
          imageSrc={cropRawImage}
          productTitle={cropTarget === 'service' ? (servTitle || 'Campus Service') : (prodTitle || 'Sample Item')}
          productPrice={cropTarget === 'service' ? (servPrice || '0.00') : (prodPrice || '0.00')}
          productCategory={cropTarget === 'service' ? 'Services' : prodCategory}
          onCropSave={async (croppedBase64) => {
            const accountId=user?.id,target=cropTarget;
            if(!accountIsCurrent(accountId))return;
            setIsCropModalOpen(false);setCropRawImage(null);
            mediaBusyChange(true);
            try {
              const url=((await apiFetch('/api/storage/upload-market-image',{method:'POST',body:JSON.stringify({fileType:'image/jpeg',fileData:croppedBase64})})).imageUrl);
              if(!accountIsCurrent(accountId))return;
              if(target==='service')setServImageUrl(url);else setProdImageUrl(url);
            } catch(err:any) {
              if(accountIsCurrent(accountId))triggerToast(err?.message || 'Could not upload your cover photograph.','error');
            } finally {
              if((accountIsCurrent(accountId)))mediaBusyChange(false);
            }
          }}
          onClose={() => {
            if(!accountIsCurrent(user?.id))return;
            setIsCropModalOpen(false);
            setCropRawImage(null);
          }}
        />
      )}
    </div>
  );
}
