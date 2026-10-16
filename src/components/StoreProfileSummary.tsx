import { Store, Star, Phone } from 'lucide-react';
import { storeDeliveryMode } from '../../storeDelivery';

export type StoreProfile = { id: string; storeName: string; university?: string; location?: string; category?: string; description?: string; phone?: string; studentEmail?: string; deliveryMode?: string; deliveryForm?: string; profilePicture?: string; logoUrl?: string; coverPicture?: string; bannerUrl?: string; storeRating?: number; ratingCount?: number };
export default function StoreProfileSummary({ store }: { store: StoreProfile }) {
  const cover = store.coverPicture || store.bannerUrl, logo = store.profilePicture || store.logoUrl;
  return <section aria-label="Store profile" className="store-profile-glass relative isolate overflow-hidden rounded-3xl border border-blue-200/60 bg-white/65 shadow-xl backdrop-blur-2xl">
    {cover && <img src={cover} alt={`${store.storeName} store cover`} className="h-44 sm:h-60 w-full object-cover" />}
    <div className="relative p-5 sm:p-7 space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-20 w-20 shrink-0 rounded-2xl border border-blue-200 bg-white/70 overflow-hidden flex items-center justify-center">{logo ? <img src={logo} alt={`${store.storeName} store logo`} className="h-full w-full object-cover" /> : <Store className="h-9 w-9 text-blue-700" />}</div>
        <div className="min-w-0 flex-1"><p className="text-xs font-bold text-blue-700">Store / Market Name</p><h1 className="mt-1 text-xl sm:text-3xl font-black text-slate-900 break-words">{store.storeName}</h1>
          <p aria-label="Store rating" className="mt-2 flex items-center gap-1.5 text-sm font-bold text-slate-700"><Star size={16} className="fill-amber-400 text-amber-500" />{store.ratingCount ? `${Number(store.storeRating).toFixed(1)} (${store.ratingCount} ${store.ratingCount === 1 ? 'review' : 'reviews'})` : 'Unrated'}</p>
        </div>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        {[['Campus Location', store.location || store.university], ['Primary Category', store.category], ['Delivery / Handover Mode', storeDeliveryMode(store)]].map(([label,value]) => <div key={label}><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900 break-words">{value || 'Not provided'}</dd></div>)}
        <div><dt className="text-xs font-bold text-slate-500">Primary Contact Number</dt><dd className="mt-1 font-semibold text-slate-900">{store.phone ? <a href={`tel:${store.phone}`} className="inline-flex items-center gap-1.5"><Phone size={14} />{store.phone}</a> : 'Not provided'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-500">Store Description / About</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-slate-800">{store.description || 'Not provided'}</dd></div>
      </dl>
    </div>
  </section>;
}
