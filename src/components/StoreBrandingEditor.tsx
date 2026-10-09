import { MARKET_DEFAULT_COVERS, MARKET_DEFAULT_LOGO, isDefaultMarketCover } from '../../marketBranding';
import MarketPhotoUpload from './MarketPhotoUpload';
export default function StoreBrandingEditor({ customBranding, logo, cover, onLogo, onCover, onBusy }: { customBranding: boolean; logo: string; cover: string; onLogo: (value: string) => void; onCover: (value: string) => void; onBusy: (busy: boolean) => void }) {
  const selected = isDefaultMarketCover(cover) ? cover : customBranding ? cover : MARKET_DEFAULT_COVERS[0].url;
  return <section aria-label="Store branding" className="space-y-3">
    <div><h4 className="text-sm font-bold text-slate-900">Store logo &amp; cover</h4><p className="mt-1 text-xs text-slate-600">{customBranding ? 'Choose a PineVela cover or upload your own cover and logo.' : 'Pine Default includes the PineVela logo and four covers. Custom logo and cover uploads unlock with an active Pine Star or Pine Pro plan.'}</p></div>
    {!customBranding && <div className="flex items-center gap-2 text-xs text-slate-600"><img src={MARKET_DEFAULT_LOGO} alt="Standard PineVela store logo" className="h-10 w-10 rounded-xl" />Standard PineVela logo</div>}
    <div role="group" aria-label="PineVela cover collection" className="grid grid-cols-2 sm:grid-cols-4 gap-2">{MARKET_DEFAULT_COVERS.map(option => <button key={option.url} type="button" aria-label={`Use ${option.name} cover`} aria-pressed={selected === option.url} onClick={() => onCover(option.url)} className={`overflow-hidden rounded-xl border-2 text-left ${selected === option.url ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}><img src={option.url} alt={option.name} className="aspect-[8/3] w-full object-cover" /><span className="block bg-white/75 px-2 py-1.5 text-[10px] font-bold text-slate-800">{option.name}</span></button>)}</div>
    {customBranding && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><MarketPhotoUpload value={logo} onChange={onLogo} label="Upload Store Logo" onBusyChange={onBusy} /><MarketPhotoUpload value={cover} onChange={onCover} label="Upload Store Cover" onBusyChange={onBusy} /></div>}
  </section>;
}
