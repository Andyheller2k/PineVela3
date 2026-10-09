import { publicLoginPath } from '../lib/publicContinuation';
import {marketListingAvailable} from '../../marketListingAvailability';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingBag, Store, X, LockKeyhole, MapPin, Phone, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { filterMarketCatalog, isMarketService } from '../lib/marketCatalog';
import MarketItemCard, { getServiceActionLabel, type MarketProductItem } from './MarketItemCard';
import MarketplaceFilters, { type MarketSort } from './MarketplaceFilters';
import MarketImageGallery from './MarketImageGallery';
import DashboardOverlay from './DashboardOverlay';
import NearbyServicesMap from './NearbyServicesMap';
import PublicCatalogRail from './PublicCatalogRail';

type PublicListing = MarketProductItem & { sellerPhone?: string; sellerName?: string };

export default function PublicMarketCatalog({ preview = false, searchQuery, catalogOverride, hideHeading = false, onInspect }: { preview?: boolean; searchQuery?: string; catalogOverride?: MarketProductItem[]; hideHeading?: boolean; onInspect?: (product: MarketProductItem) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: remoteCatalog = [], isPending, isError, refetch } = useQuery<PublicListing[]>({
    queryKey: ['public-pinemarket'],
    enabled: catalogOverride === undefined,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/digital-market/products', { signal });
      if (!response.ok) throw new Error('Unable to load PineMarket');
      const products = await response.json();
      if (!Array.isArray(products)) throw new Error('Unable to load PineMarket');
      return products;
    },
    refetchInterval: 30000,
  });
  const catalog: PublicListing[] = catalogOverride || remoteCatalog;
  const [catalogSearch, setCatalogSearch] = useState('');
  useEffect(() => { if (searchQuery !== undefined) setCatalogSearch(searchQuery); }, [searchQuery]);
  const [catalogCategory, setCatalogCategory] = useState('All');
  const [minPriceFilter, setMinPriceFilter] = useState(0);
  const [maxPriceFilter, setMaxPriceFilter] = useState(5000);
  const [priceSortOption, setPriceSortOption] = useState<MarketSort>('featured');
  const [showPriceFilterPanel, setShowPriceFilterPanel] = useState(false);
  const [selected, setSelected] = useState<PublicListing | null>(null);
  const [showNearby, setShowNearby] = useState(false), [directions, setDirections] = useState('');
  const [selectedPriceIndex, setSelectedPriceIndex] = useState(0);
  const [authPrompt, setAuthPrompt] = useState<'order' | 'favourite' | null>(null);
  const [visibleCount, setVisibleCount] = useState(32);
  const [wishlist, setWishlist] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`pv_wishlist_${user?.id || 'guest'}`) || '[]');
      setWishlist(user?.role === 'user' && Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []);
    } catch { setWishlist([]); }
  }, [user?.id, user?.role]);
  const filtered = useMemo(() => filterMarketCatalog(catalog, catalogSearch, catalogCategory,
    minPriceFilter, maxPriceFilter, priceSortOption), [catalog, catalogSearch, catalogCategory, minPriceFilter, maxPriceFilter, priceSortOption]);
  const shown = preview ? filtered : filtered.slice(0, visibleCount);
  const inspect = (product: MarketProductItem) => { if (onInspect) { onInspect(product); return; } setSelected(product); setSelectedPriceIndex(0); };
  const closeInspection = () => { setSelected(null); setShowNearby(false); setDirections(''); };
  const requestOrder = () => {
    setShowNearby(false);
    if (user?.role === 'user' && selected) {
      navigate(`/user/dashboard?marketItem=${encodeURIComponent(selected.id)}&marketPrice=${selectedPriceIndex}`);
      return;
    }
    setAuthPrompt('order');
  };
  const requestFavourite = (id: string) => {
    if (user?.role === 'user') {
      const next = wishlist.includes(id) ? wishlist.filter(item => item !== id) : [...wishlist, id];
      setWishlist(next);
      try { localStorage.setItem(`pv_wishlist_${user.id}`, JSON.stringify(next)); } catch { /* Keep this visit usable when browser storage is unavailable. */ }
      return;
    }
    setAuthPrompt('favourite');
  };
  const service = selected ? isMarketService(selected) : false;
  const priceCategory = selected?.priceCategories?.[selectedPriceIndex];
  const schedule = selected?.isOpen247 ? 'Available 24/7' : [selected?.workingDays,
    [selected?.openingTime, selected?.closingTime].filter(Boolean).join(' – ')].filter(Boolean).join(' · ');
  const phone = selected?.callLine || selected?.sellerPhone;
  const cards = shown.map(product => <MarketItemCard key={product.id} product={product} transparent={preview} isFavorite={wishlist.includes(product.id)}
    onToggleFavorite={requestFavourite} onInspect={inspect} />);

  return <div className="space-y-6" data-public-market={preview ? 'preview' : 'catalog'}>
    {!hideHeading && <div className="public-catalog-heading flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
      <div>
        <h2 className={`${preview ? 'text-3xl' : 'text-lg'} font-black text-slate-900 flex items-center gap-2`}><ShoppingBag className="w-5 h-5 text-blue-700" />PineMarket</h2>
        <p className="text-xs text-slate-500 font-semibold mt-1">Discover items and services from campus sellers.</p>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setDirections(''); setShowNearby(true); }} className="px-4 py-2.5 border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl flex items-center gap-2"><MapPin size={16} />Services near you</button>{preview && <button type="button" onClick={() => navigate('/pinemarket')} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl flex items-center gap-2">Explore Market <ArrowRight size={16} /></button>}</div>
    </div>}
    {showNearby && <NearbyServicesMap products={catalog} onClose={() => { setShowNearby(false); setDirections(''); }} onInspect={(product, url) => { inspect(product); setDirections(url); }} />}
    {!preview && <MarketplaceFilters catalogSearch={catalogSearch} setCatalogSearch={setCatalogSearch}
      catalogCategory={catalogCategory} setCatalogCategory={setCatalogCategory}
      minPriceFilter={minPriceFilter} setMinPriceFilter={setMinPriceFilter}
      maxPriceFilter={maxPriceFilter} setMaxPriceFilter={setMaxPriceFilter}
      priceSortOption={priceSortOption} setPriceSortOption={setPriceSortOption}
      showPriceFilterPanel={showPriceFilterPanel} setShowPriceFilterPanel={setShowPriceFilterPanel}
      itemCount={filtered.length} />}
    {catalogOverride === undefined && isPending ? <p role="status" className="p-8 text-center text-sm font-semibold text-slate-500">Loading PineMarket…</p>
      : catalogOverride === undefined && isError ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800"><p>PineMarket could not load. Please try again.</p><button type="button" onClick={() => refetch()} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-white font-bold">Try again</button></div>
      : !shown.length ? <div className={`p-8 text-center space-y-2 ${preview ? "bg-transparent" : "bg-slate-50/60 rounded-2xl border border-dashed border-slate-200"}`}><Store className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold text-slate-700">{catalog.length ? 'No items match your criteria' : 'No listings available yet'}</p><p className="text-xs text-slate-500">{catalog.length ? 'Try another category or refine your search.' : 'Check back for items and services from campus sellers.'}</p></div>
      : preview ? <PublicCatalogRail label="PineMarket">{cards}</PublicCatalogRail>
      : <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 pb-2">{cards}</div>}
    {!preview && visibleCount < filtered.length && <div className="flex justify-center"><button type="button" onClick={() => setVisibleCount(count => count + 32)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl border border-slate-200">Load More Items ({shown.length} of {filtered.length})</button></div>}
    {selected && <DashboardOverlay aria-label={`Inspect ${selected.title}`} onClose={closeInspection} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4">
      <section className="bg-white rounded-3xl max-w-[calc(100vw-1rem)] sm:max-w-lg w-full max-h-[88dvh] sm:max-h-[92vh] overflow-y-auto p-3 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><h3 className="text-base font-black text-slate-900 break-words">{selected.title}</h3><button type="button" aria-label="Close inspection" onClick={closeInspection} className="p-2 text-slate-500"><X size={20} /></button></div>
        <MarketImageGallery title={selected.title} imageUrl={priceCategory?.imageUrl || selected.imageUrl}
          additionalImages={service ? [selected.imageUrl, ...(selected.priceCategories || []).map(category => category.imageUrl || '')] : selected.additionalImages} />
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xl font-black text-emerald-600">GHS {priceCategory?.price ?? selected.price}<span className="ml-2 text-[10px] text-slate-500">{priceCategory?.name || (service ? '(starting rate)' : '')}</span></p>{selected.sellerUniversity && <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg">{selected.sellerUniversity}</span>}</div>
        {!!selected.priceCategories?.length && <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2"><p className="text-xs font-black text-slate-900">Choose Price Category:</p><div className="grid grid-cols-2 gap-2">{selected.priceCategories.map((category, index) => <button type="button" key={category.id || index} aria-pressed={selectedPriceIndex === index} onClick={() => setSelectedPriceIndex(index)} className={`p-2.5 rounded-xl border text-left text-xs font-bold ${selectedPriceIndex === index ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>{category.imageUrl && <img src={category.imageUrl} alt={category.name} className="h-12 w-12 rounded-lg object-cover mb-2" />}<span>{category.name}</span><span className="block mt-1">GHS {category.price}</span></button>)}</div></div>}
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{selected.description}</p>
        {service && (schedule || selected.location || selected.meetingLocation || phone) && <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 text-xs font-semibold text-slate-700">
          {schedule && <p>Hours: {schedule}</p>}{(selected.location || selected.meetingLocation) && <p className="flex items-center gap-2"><MapPin size={14} />{selected.location || selected.meetingLocation}</p>}{phone && <a href={`tel:${phone}`} className="flex items-center gap-2 text-emerald-700"><Phone size={14} />Call Provider: {phone}</a>}
        </div>}
        {service && directions && <a href={directions} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="block text-xs font-bold text-blue-700">Open Google Maps directions</a>}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Store className="text-blue-600 w-5 h-5" /><span className="text-xs font-black text-slate-900">{selected.storeName}</span></div><span className="flex items-center gap-1 text-xs font-bold text-amber-700"><Star className="w-4 h-4 fill-amber-400" />{selected.ratingCount ? `${Number(selected.storeRating).toFixed(1)} (${selected.ratingCount})` : 'Unrated'}</span></div>{selected.sellerName && <p className="text-xs text-slate-500">{selected.sellerName}</p>}</div>
        <p className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-900">{service ? 'Confirm service details and meet the provider on campus. Never make unverified advance payments.' : 'Meet the merchant at a safe campus location to inspect this item before paying.'}</p>
        {!hideHeading && selected.storeId && <button type="button" onClick={() => navigate(`/pinemarket/stores/${encodeURIComponent(selected.storeId!)}`)} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black text-blue-800">View Store</button>}
        <button type="button" disabled={!marketListingAvailable(selected)} onClick={requestOrder} className="w-full px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md">{!marketListingAvailable(selected) ? service ? 'Unavailable' : 'Sold out' : service ? getServiceActionLabel(selected) : 'Request to Buy'}</button>
      </section>
    </DashboardOverlay>}
    {authPrompt && <DashboardOverlay layer={200} aria-label="Sign in to PineMarket" onClose={() => setAuthPrompt(null)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xl flex items-center justify-center p-4">
      <section className="relative w-full max-w-sm rounded-3xl bg-white border border-blue-200 p-7 shadow-2xl text-center space-y-5">
        <button type="button" aria-label="Close sign-in prompt" onClick={() => setAuthPrompt(null)} className="absolute right-3 top-3 p-2 text-slate-500"><X size={18} /></button>
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center"><LockKeyhole size={26} /></div>
        <h3 className="text-xl font-black text-slate-900">{authPrompt === 'order' ? 'Log in or sign up to complete your order' : 'Log in or sign up to save favourites'}</h3>
        <p className="text-sm text-slate-500">Continue with your PineVela account.</p>
        <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => navigate(publicLoginPath(authPrompt === 'order' && selected ? `/user/dashboard?marketItem=${encodeURIComponent(selected.id)}&marketPrice=${selectedPriceIndex}` : undefined, 'login'))} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Log In</button><button type="button" onClick={() => navigate(publicLoginPath(authPrompt === 'order' && selected ? `/user/dashboard?marketItem=${encodeURIComponent(selected.id)}&marketPrice=${selectedPriceIndex}` : undefined, 'register'))} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">Sign Up</button></div>
      </section>
    </DashboardOverlay>}
  </div>;
}
