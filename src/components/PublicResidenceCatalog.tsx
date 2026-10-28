import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, LockKeyhole, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { filterResidences, type Residence } from '../lib/residenceCatalog';
import { publicLoginPath } from '../lib/publicContinuation';
import ResidenceCard from './ResidenceCard';
import ResidenceDetails from './ResidenceDetails';
import DashboardOverlay from './DashboardOverlay';
import PublicCatalogRail from './PublicCatalogRail';

export default function PublicResidenceCatalog({ preview = false, searchQuery = '' }: { preview?: boolean; searchQuery?: string }) {
  const Heading = preview ? 'h2' : 'h1';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: hostels = [], isPending, isError, refetch } = useQuery<Residence[]>({
    queryKey: ['hostels'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/hostels', { signal });
      if (!response.ok) throw new Error('Unable to load residences');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Unable to load residences');
      return data;
    },
    refetchInterval: 30000,
  });
  const [selected, setSelected] = useState<Residence | null>(null);
  const [activation, setActivation] = useState<Residence | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);
  const filtered = filterResidences(hostels, searchQuery);
  const shown = preview ? filtered : filtered.slice(0, visibleCount);
  const next = activation ? `/user/dashboard?${new URLSearchParams({ residence: activation.id, residenceAction: 'activate' })}` : undefined;
  const activate = (hostel: Residence) => {
    if (user?.role === 'user') navigate(`/user/dashboard?${new URLSearchParams({ residence: hostel.id, residenceAction: 'activate' })}`);
    else setActivation(hostel);
  };
  const cards = shown.map(hostel => <ResidenceCard key={hostel.id} hostel={hostel} onInspect={setSelected} onActivate={activate} />);
  return <div className="space-y-6" data-public-residence={preview ? 'preview' : 'catalog'}>
    <div className="public-catalog-heading flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
      <div><Heading className={`${preview ? 'text-3xl' : 'text-lg'} font-black text-slate-900 flex items-center gap-2`}><Building2 className="w-5 h-5 text-blue-700" />PineResidence</Heading><p className="text-xs text-slate-500 font-semibold mt-1">Explore verified residences and accommodations.</p></div>
      {preview && <button type="button" onClick={() => navigate(`/pineresidence${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`)} className="flex items-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 px-4 py-2.5 text-xs font-black text-white">Explore Residence <ArrowRight size={16} /></button>}
    </div>
    {isPending ? <p role="status" className="p-8 text-center text-sm font-semibold text-slate-500">Loading residences…</p>
      : isError ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800"><p>Residences could not load. Please try again.</p><button type="button" onClick={() => refetch()} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-white font-bold">Try again</button></div>
      : !shown.length ? <div className="p-8 text-center space-y-2"><Building2 className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold text-slate-700">{searchQuery ? 'No matching residences found' : 'No registered residences available yet'}</p></div>
      : preview ? <PublicCatalogRail label="PineResidence">{cards}</PublicCatalogRail>
      : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{cards}</div>}
    {!preview && shown.length < filtered.length && <button type="button" onClick={() => setVisibleCount(count => count + 24)} className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-2 text-xs font-bold">Load more residences ({shown.length} of {filtered.length})</button>}
    {selected && <ResidenceDetails key={selected.id} hostel={selected} onClose={() => setSelected(null)} onActivate={activate} />}
    {activation && <DashboardOverlay layer={200} aria-label="Sign in to PineResidence" onClose={() => setActivation(null)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xl flex items-center justify-center p-4">
      <section className="relative w-full max-w-sm rounded-3xl bg-white border border-blue-200 p-7 shadow-2xl text-center space-y-5">
        <button type="button" aria-label="Close sign-in prompt" onClick={() => setActivation(null)} className="absolute right-3 top-3 p-2 text-slate-500"><X size={18} /></button>
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center"><LockKeyhole size={26} /></div>
        <h3 className="text-xl font-black text-slate-900">Log in or sign up to activate your room</h3>
        <p className="text-sm text-slate-500">Continue with your PineVela account for {activation.name}.</p>
        <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => navigate(publicLoginPath(next, 'login'))} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Log In</button><button type="button" onClick={() => navigate(publicLoginPath(next, 'register'))} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">Sign Up</button></div>
      </section>
    </DashboardOverlay>}
  </div>;
}
