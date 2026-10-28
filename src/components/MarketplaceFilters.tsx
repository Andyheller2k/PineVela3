import { Search, X, SlidersHorizontal, MapPin } from 'lucide-react';
import MarketSortSelect, { type MarketSort } from './MarketSortSelect';
import MarketPricePanel from './MarketPricePanel';
import { Fragment, useId, type Dispatch, type SetStateAction } from 'react';
import DashboardOverlay from './DashboardOverlay';

export type { MarketSort } from './MarketSortSelect';
interface Props {
  catalogSearch: string; setCatalogSearch: Dispatch<SetStateAction<string>>;
  catalogCategory: string; setCatalogCategory: Dispatch<SetStateAction<string>>;
  minPriceFilter: number; setMinPriceFilter: Dispatch<SetStateAction<number>>;
  maxPriceFilter: number; setMaxPriceFilter: Dispatch<SetStateAction<number>>;
  priceSortOption: MarketSort; setPriceSortOption: Dispatch<SetStateAction<MarketSort>>;
  showPriceFilterPanel: boolean; setShowPriceFilterPanel: Dispatch<SetStateAction<boolean>>;
  itemCount: number; stickyTop?: string | number; compactCatalog?: boolean;
  onNearbyServices?: () => void;
}

export default function MarketplaceFilters({ catalogSearch, setCatalogSearch, catalogCategory, setCatalogCategory,
  minPriceFilter, setMinPriceFilter, maxPriceFilter, setMaxPriceFilter, priceSortOption, setPriceSortOption,
  showPriceFilterPanel, setShowPriceFilterPanel, itemCount, stickyTop = 0, compactCatalog = false, onNearbyServices }: Props) {
  const pricePanelId = useId();
  const isPriceFiltered = minPriceFilter > 0 || maxPriceFilter < 5000;
  const hasActiveFilters = isPriceFiltered || (compactCatalog && priceSortOption !== 'featured');
  return <>
  {/* STICKY SEARCH & FILTER CONTROL BAR - Stays locked at top while scrolling cards */}
  <div data-compact-catalog={compactCatalog || undefined} style={{ top: stickyTop }} className="marketplace-filter-bar sticky z-30 py-2.5 px-3.5 bg-white/45 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.12)] transition-all flex flex-wrap items-center justify-between gap-2.5">
    {/* Search Bar inside Marketplace */}
    <div className="market-search-field relative w-full sm:w-64 group">
      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        aria-label="Search marketplace items"
        placeholder={compactCatalog ? 'Search items…' : 'Search marketplace items...'}
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
        data-filtered={hasActiveFilters}
        aria-controls={showPriceFilterPanel ? pricePanelId : undefined}
        onClick={() => setShowPriceFilterPanel(!showPriceFilterPanel)}
        className={`market-price-toggle px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
          showPriceFilterPanel || hasActiveFilters
            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
            : 'bg-white/55 text-slate-700 border-white/80 hover:bg-white/85'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>{compactCatalog ? 'Filters' : 'Price Filter'}</span>
        {hasActiveFilters && (
          <span className="sr-only">{compactCatalog ? 'Price or sort selection applied' : 'Price range applied'}</span>
        )}
      </button>

      <MarketSortSelect value={priceSortOption} onChange={setPriceSortOption} />

      <span className="market-item-count px-3 py-1 bg-blue-100/70 text-blue-900 border border-blue-200/70 font-black text-xs rounded-full shrink-0">
        {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
      </span>
    </div>
  </div>

  {showPriceFilterPanel && (compactCatalog ?
    <DashboardOverlay aria-label="Marketplace filters" onClose={() => setShowPriceFilterPanel(false)} className="user-price-overlay user-market-filters-overlay"
      onClick={event => { if (event.target === event.currentTarget) setShowPriceFilterPanel(false); }}>
      <section id={pricePanelId} className="user-price-sheet user-market-filter-sheet" aria-labelledby={`${pricePanelId}-title`}>
        <header className="market-filter-heading"><h2 id={`${pricePanelId}-title`}>Filters &amp; sort</h2>
          <button type="button" aria-label="Close marketplace filters" onClick={() => setShowPriceFilterPanel(false)}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="market-sort-setting"><p>Sort by</p><MarketSortSelect value={priceSortOption} onChange={setPriceSortOption} /></div>
        <MarketPricePanel id={`${pricePanelId}-price`} min={minPriceFilter} max={maxPriceFilter} showClose={false}
          onMinChange={setMinPriceFilter} onMaxChange={setMaxPriceFilter} onClose={() => setShowPriceFilterPanel(false)} />
        <footer className="market-filter-footer"><p role="status" aria-live="polite">{itemCount} matching {itemCount === 1 ? 'item' : 'items'}</p>
          <button type="button" className="pv-primary-action" onClick={() => setShowPriceFilterPanel(false)}>Show results</button>
        </footer>
      </section>
    </DashboardOverlay> :
    <MarketPricePanel id={pricePanelId} min={minPriceFilter} max={maxPriceFilter}
      onMinChange={setMinPriceFilter} onMaxChange={setMaxPriceFilter} onClose={() => setShowPriceFilterPanel(false)} />)}

  {/* Category Pills inside Marketplace */}
  <div role="group" aria-label="Marketplace categories" className="market-categories flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
    {['All', 'Services','Electronics', 'Textbooks', 'Appliances', 'Fashion', 'Furniture'].map(cat => (
      <Fragment key={cat}><button
        type="button"
        aria-pressed={catalogCategory === cat}
        onClick={() => setCatalogCategory(cat)}
        className="px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap cursor-pointer"
      >
        {cat}
      </button>{compactCatalog && cat === 'Services' && catalogCategory === 'Services' && onNearbyServices &&
        <button type="button" className="market-nearby-shortcut" aria-label="Find services near you" aria-haspopup="dialog" onClick={onNearbyServices}>
          <MapPin size={14} aria-hidden="true" /><span>Nearby</span>
        </button>}</Fragment>
    ))}
  </div>

  </>;
}
