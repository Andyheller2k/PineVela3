import { useQuery } from '@tanstack/react-query';
import { LockKeyhole,MessageSquare,X } from 'lucide-react';
import { useEffect,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { publicLoginPath } from '../lib/publicContinuation';
import DashboardOverlay from './DashboardOverlay';
import type { MarketProductItem } from './MarketItemCard';
import MarketplaceInbox from './MarketplaceInbox';
import PublicMarketCatalog from './PublicMarketCatalog';
import StoreProfileSummary,{ type StoreProfile } from './StoreProfileSummary';
import ThemeToggle from './ThemeToggle';


type Storefront = { store: StoreProfile; products: MarketProductItem[] };
export default function MarketStorefront({ storeId, onInspect, initialMessage = false }: { storeId: string; onInspect?: (product: MarketProductItem) => void; initialMessage?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showMessages, setShowMessages] = useState(initialMessage);
  const [authPrompt, setAuthPrompt] = useState(false);
  const { data, isPending, isError, refetch } = useQuery<Storefront>({
    queryKey: ['public-market-store', storeId],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/digital-market/stores/${encodeURIComponent(storeId)}`, { signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Store could not load.');
      return body;
    },
    refetchInterval: 15000,
  });
  useEffect(() => { setShowMessages(initialMessage); setAuthPrompt(false); }, [storeId, initialMessage]);
  if (isPending) return <p role="status" className="p-8 text-center text-slate-500">Loading store…</p>;
  if (isError || !data) return <section role="alert" className="p-8 text-center space-y-3 text-slate-700"><p>This store is currently unavailable.</p><button type="button" onClick={() => refetch()} className="rounded-xl bg-blue-600 px-4 py-2 text-white">Try again</button></section>;
  const store = data.store;
  const next = `/user/dashboard?${new URLSearchParams({ marketStore: store.id, storeAction: 'message' })}`;
  return <div data-market-storefront={store.id} className="space-y-6">
    <div className="flex items-center justify-end gap-3">
      <button type="button" aria-label="Message store" onClick={() => user?.role === 'user' ? setShowMessages(true) : setAuthPrompt(true)} className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white/65 px-4 py-2.5 text-xs font-bold text-blue-800 backdrop-blur-xl"><MessageSquare size={18} />Message Store</button>
      <ThemeToggle className="company-theme-toggle" />
    </div>
    <StoreProfileSummary store={store} />
    <h2 className="text-lg font-black text-slate-900">Items &amp; Services</h2>
    <PublicMarketCatalog catalogOverride={data.products} hideHeading onInspect={onInspect} />
    {showMessages && user?.role === 'user' && ((Boolean(store.id))) && <DashboardOverlay layer={200} aria-label={`Message ${store.storeName}`} onClose={() => setShowMessages(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6">
      <section className="w-full max-w-4xl max-h-[92dvh] overflow-y-auto rounded-3xl bg-white/80 backdrop-blur-2xl border border-blue-200 p-3 sm:p-5 space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="font-black text-slate-900">Message {store.storeName}</h2><button type="button" aria-label="Close store messages" onClick={() => setShowMessages(false)} className="p-2 text-slate-600"><X size={20} /></button></div><MarketplaceInbox initialStore={{ id: store.id, email: store.studentEmail, name: store.storeName }} /></section>
    </DashboardOverlay>}
    {authPrompt && <DashboardOverlay layer={200} aria-label="Sign in to message store" onClose={() => setAuthPrompt(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xl flex items-center justify-center p-4">
      <section className="relative w-full max-w-sm rounded-3xl bg-white p-7 text-center space-y-5 border border-blue-200"><button type="button" aria-label="Close sign-in prompt" onClick={() => setAuthPrompt(false)} className="absolute right-3 top-3 p-2 text-slate-500"><X size={18} /></button><LockKeyhole className="mx-auto text-blue-600" size={28} /><h3 className="text-xl font-black text-slate-900">Log in or sign up to message this store</h3><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => navigate(publicLoginPath(next, 'login'))} className="rounded-xl bg-blue-600 py-3 text-white font-bold">Log In</button><button type="button" onClick={() => navigate(publicLoginPath(next, 'register'))} className="rounded-xl border border-blue-300 bg-blue-50 py-3 text-blue-800 font-bold">Sign Up</button></div></section>
    </DashboardOverlay>}
  </div>;
}
