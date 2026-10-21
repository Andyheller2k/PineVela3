import { Search, X, SlidersHorizontal } from 'lucide-react';
import MarketSortSelect, { type MarketSort } from './MarketSortSelect';
import MarketPricePanel from './MarketPricePanel';
import { useEffect, useId, useState, type Dispatch, type SetStateAction } from 'react';
import DashboardOverlay from './DashboardOverlay';

export type { MarketSort } from './MarketSortSelect';
interface Props {
  catalogSearch: string; setCatalogSearch: Dispatch<SetStateAction<string>>;
  catalogCategory: string; setCatalogCategory: Dispatch<SetStateAction<string>>;
  minPriceFilter: number; setMinPriceFilter: Dispatch<SetStateAction<number>>;
  maxPriceFilter: number; setMaxPriceFilter: Dispatch<SetStateAction<number>>;
  priceSortOption: MarketSort; setPriceSortOption: Dispatch<SetStateAction<MarketSort>>;
  showPriceFilterPanel: boolean; setShowPriceFilterPanel: Dispatch<SetStateAction<boolean>>;
  itemCount: number; stickyTop?: string | number; mobilePriceSheet?: boolean;
}

export default function MarketplaceFilters({ catalogSearch, setCatalogSearch, catalogCategory, setCatalogCategory,
  minPriceFilter, setMinPriceFilter, maxPriceFilter, setMaxPriceFilter, priceSortOption, setPriceSortOption,
  showPriceFilterPanel, setShowPriceFilterPanel, itemCount, stickyTop = 0, mobilePriceSheet = false }: Props) {
  const pricePanelId = useId();
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!mobilePriceSheet) return;
    const query = matchMedia('(max-width: 639px)');
    const sync = () => setCompact(query.matches);
    sync(); query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [mobilePriceSheet]);
  const isPriceFiltered = minPriceFilter > 0 || maxPriceFilter < 5000;
  return <>
  {/* STICKY SEARCH & FILTER CONTROL BAR - Stays locked at top while scrolling cards */}
  <div style={{ top: stickyTop }} className="marketplace-filter-bar sticky z-30 py-2.5 px-3.5 bg-white/45 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.12)] transition-all flex flex-wrap items-center justify-between gap-2.5">
    {/* Search Bar inside Marketplace */}
    <div className="relative w-full sm:w-64 group">
      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        aria-label="Search marketplace items"
        placeholder="Search marketplace items..."
        value={catalogSearch}
        onChange={e => setCatalogSearch(e.target.value)}
        className="w-full pl-8 pr-8 py-1.5 bg-white/65 border border-blue-300/70 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_0_18px_rgba(59,130,246,0.18)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-[0_0_0_2px_rgba(96,165,250,0.24),0_0_28px_rgba(59,130,246,0.42)] transition-all"
      />
      {catalogSearch && (
        <button aria-label="Clear search"
          type="button"
          onClick={() => setCatalogSearch('')}
          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          <X size={13} />
        </button>
      )}
    </div>

    <div className="marketplace-filter-controls flex flex-wrap items-center gap-2">
      {/* Toggle Price Range Slider Button */}
      <button
        type="button"
        aria-expanded={showPriceFilterPanel}
        data-filtered={isPriceFiltered}
        aria-controls={showPriceFilterPanel ? pricePanelId : undefined}
        onClick={() => setShowPriceFilterPanel(!showPriceFilterPanel)}
        className={`market-price-toggle px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
          showPriceFilterPanel || isPriceFiltered
            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
            : 'bg-white/55 text-slate-700 border-white/80 hover:bg-white/85'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Price Filter</span>
        {isPriceFiltered && (
          <span className="sr-only">Price range applied</span>
        )}
      </button>

      <MarketSortSelect value={priceSortOption} onChange={setPriceSortOption} />

      <span className="market-item-count px-3 py-1 bg-blue-100/70 text-blue-900 border border-blue-200/70 font-black text-xs rounded-full shrink-0">
        {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
      </span>
    </div>
  </div>

  {showPriceFilterPanel && (mobilePriceSheet && compact ?
    <DashboardOverlay aria-label="Filter by price" onClose={() => setShowPriceFilterPanel(false)} className="user-price-overlay"
      onClick={event => { if (event.target === event.currentTarget) setShowPriceFilterPanel(false); }}>
      <section className="user-price-sheet"><MarketPricePanel id={pricePanelId} min={minPriceFilter} max={maxPriceFilter}
        onMinChange={setMinPriceFilter} onMaxChange={setMaxPriceFilter} onClose={() => setShowPriceFilterPanel(false)} /></section>
    </DashboardOverlay> :
    <MarketPricePanel id={pricePanelId} min={minPriceFilter} max={maxPriceFilter}
      onMinChange={setMinPriceFilter} onMaxChange={setMaxPriceFilter} onClose={() => setShowPriceFilterPanel(false)} />)}

  {/* Category Pills inside Marketplace */}
  <div role="group" aria-label="Marketplace categories" className="market-categories flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
    {['All', 'Services','Electronics', 'Textbooks', 'Appliances', 'Fashion', 'Furniture'].map(cat => (
      <button
        key={cat}
        type="button"
        aria-pressed={catalogCategory === cat}
        onClick={() => setCatalogCategory(cat)}
        className="px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap cursor-pointer"
      >
        {cat}
      </button>
    ))}
  </div>

  </>;
}
