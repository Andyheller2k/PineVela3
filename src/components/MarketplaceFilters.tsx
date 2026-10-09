import { Search, X, SlidersHorizontal, ArrowUpDown, DollarSign, RotateCcw } from 'lucide-react';
import { useId, type Dispatch, type SetStateAction } from 'react';

export type MarketSort = 'featured' | 'price-asc' | 'price-desc' | 'newest';
interface Props {
  catalogSearch: string; setCatalogSearch: Dispatch<SetStateAction<string>>;
  catalogCategory: string; setCatalogCategory: Dispatch<SetStateAction<string>>;
  minPriceFilter: number; setMinPriceFilter: Dispatch<SetStateAction<number>>;
  maxPriceFilter: number; setMaxPriceFilter: Dispatch<SetStateAction<number>>;
  priceSortOption: MarketSort; setPriceSortOption: Dispatch<SetStateAction<MarketSort>>;
  showPriceFilterPanel: boolean; setShowPriceFilterPanel: Dispatch<SetStateAction<boolean>>;
  itemCount: number; stickyTop?: string | number;
}

export default function MarketplaceFilters({ catalogSearch, setCatalogSearch, catalogCategory, setCatalogCategory,
  minPriceFilter, setMinPriceFilter, maxPriceFilter, setMaxPriceFilter, priceSortOption, setPriceSortOption,
  showPriceFilterPanel, setShowPriceFilterPanel, itemCount, stickyTop = 0 }: Props) {
  const pricePanelId = useId();
  const isPriceFiltered = minPriceFilter > 0 || maxPriceFilter < 5000;
  return <>
  {/* STICKY SEARCH & FILTER CONTROL BAR - Stays locked at top while scrolling cards */}
  <div style={{ top: stickyTop }} className="marketplace-filter-bar sticky z-30 py-2.5 px-3.5 bg-white/45 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.12)] transition-all flex flex-wrap items-center justify-between gap-2.5">
    {/* Search Bar inside Marketplace */}
    <div className="relative w-full sm:w-64 group">
      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
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

    <div className="flex flex-wrap items-center gap-2">
      {/* Toggle Price Range Slider Button */}
      <button
        type="button"
        aria-expanded={showPriceFilterPanel || isPriceFiltered}
        aria-controls={showPriceFilterPanel || isPriceFiltered ? pricePanelId : undefined}
        onClick={() => setShowPriceFilterPanel(!showPriceFilterPanel)}
        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
          showPriceFilterPanel || isPriceFiltered
            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
            : 'bg-white/55 text-slate-700 border-white/80 hover:bg-white/85'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Price Filter</span>
        {isPriceFiltered && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        )}
      </button>

      {/* Price Sort Dropdown */}
      <div className="relative inline-flex items-center">
        <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
        <select
          aria-label="Sort marketplace"
          value={priceSortOption}
          onChange={(e) => setPriceSortOption(e.target.value as any)}
          className="pl-8 pr-3 py-1.5 bg-white/55 border border-white/80 text-slate-800 text-xs font-bold rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
        >
          <option value="featured">Sort: Featured</option>
          <option value="price-asc">Price: Low to High 📈</option>
          <option value="price-desc">Price: High to Low 📉</option>
          <option value="newest">Sort: Newest Items ⚡</option>
        </select>
      </div>

      <span className="px-3 py-1 bg-blue-100/70 text-blue-900 border border-blue-200/70 font-black text-xs rounded-full shrink-0">
        {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
      </span>
    </div>
  </div>

  {/* Expandable Price Range Slider Panel */}
  {(showPriceFilterPanel || isPriceFiltered) && (
    <div id={pricePanelId} role="group" aria-label="Price filters" className="p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 border border-blue-200/80 rounded-2xl space-y-3.5 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-700" />
          <span className="text-xs font-black text-slate-900">Price Range Slider Filter</span>
          <span className="text-[11px] font-bold text-blue-800 bg-white/80 px-2.5 py-0.5 rounded-md border border-blue-200 font-mono">
            GHS {minPriceFilter} – GHS {maxPriceFilter >= 5000 ? '5,000+' : maxPriceFilter}
          </span>
        </div>

        {isPriceFiltered && (
          <button
            type="button"
            onClick={() => {
              setMinPriceFilter(0);
              setMaxPriceFilter(5000);
            }}
            className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Price Filter</span>
          </button>
        )}
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Minimum Price Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">Minimum Price:</span>
            <span className="font-black text-blue-900 font-mono">GHS {minPriceFilter}</span>
          </div>
          <input
            type="range"
            aria-label="Minimum price"
            min="0"
            max={Math.min(maxPriceFilter, 5000)}
            step="10"
            value={minPriceFilter}
            onChange={(e) => setMinPriceFilter(Number(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
          />
        </div>

        {/* Maximum Price Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">Maximum Price:</span>
            <span className="font-black text-blue-900 font-mono">
              GHS {maxPriceFilter >= 5000 ? '5,000+' : maxPriceFilter}
            </span>
          </div>
          <input
            type="range"
            aria-label="Maximum price"
            min={minPriceFilter}
            max="5000"
            step="25"
            value={maxPriceFilter}
            onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
          />
        </div>
      </div>

      {/* Quick Preset Pills */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">Quick Presets:</span>
        {[
          { label: 'Under GHS 100', min: 0, max: 100 },
          { label: 'GHS 100 - 500', min: 100, max: 500 },
          { label: 'GHS 500 - 1,500', min: 500, max: 1500 },
          { label: 'GHS 1,500 - 5,000', min: 1500, max: 5000 },
          { label: 'All Prices', min: 0, max: 5000 }
        ].map((preset) => {
          const isActive = minPriceFilter === preset.min && maxPriceFilter === preset.max;
          return (
            <button
              key={preset.label}
              aria-pressed={isActive}
              type="button"
              onClick={() => {
                setMinPriceFilter(preset.min);
                setMaxPriceFilter(preset.max);
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white/80 text-slate-700 hover:bg-white border border-blue-100'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  )}

  {/* Category Pills inside Marketplace */}
  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
    {['All', 'Services','Electronics', 'Textbooks', 'Appliances', 'Fashion', 'Furniture'].map(cat => (
      <button
        key={cat}
        aria-pressed={catalogCategory === cat}
        onClick={() => setCatalogCategory(cat)}
        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
          catalogCategory === cat ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        {cat}
      </button>
    ))}
  </div>

  </>;
}
