import React, { memo } from 'react';
import { Heart, GraduationCap, Store, ChevronRight, Star } from 'lucide-react';
import { optimizeImageDisplayUrl } from '../lib/imageOptimizer';

export interface MarketProductItem {
  id: string;
  storeId?: string;
  storeName: string;
  sellerId?: string;
  sellerEmail?: string;
  sellerUniversity?: string;
  title: string;
  description: string;
  price: number;
  currency?: string;
  category: string;
  imageUrl: string;
  storeLogoUrl?: string;
  stockQuantity?: number;
  status?: string;
  storeRating?: number;
  ratingCount?: number;
}

interface MarketItemCardProps {
  product: MarketProductItem;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onInspect: (product: MarketProductItem) => void;
}

/**
 * Pure, memoized Digital Marketplace item card.
 * Uses content-visibility: auto for high-speed native browser virtualization,
 * sub-150px thumbnail optimization, and lazy async decoding.
 */
export const MarketItemCard: React.FC<MarketItemCardProps> = memo(
  ({ product, isFavorite, onToggleFavorite, onInspect }) => {
    const handleFavoriteClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite(product.id);
    };

    const handleInspectClick = () => {
      onInspect(product);
    };

    return (
      <div 
        className="bg-white/90 border border-slate-200/80 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs hover:border-blue-400 hover:shadow-md transition-all duration-150 flex flex-col justify-between"
      >
        <div>
          {/* Product Thumbnail Container with Lazy Loading */}
          <div className="relative h-28 sm:h-44 bg-slate-100 overflow-hidden flex items-center justify-center p-1 border-b border-slate-100 select-none">
            <img 
              src={optimizeImageDisplayUrl(product.imageUrl, 180, 30)} 
              alt={product.title}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain transition-opacity duration-200" 
            />
            
            {/* Category Tag */}
            <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-1.5 sm:px-2 py-0.5 bg-slate-900/85 text-white text-[8px] sm:text-[9px] font-bold rounded-md pointer-events-none truncate max-w-[100px] sm:max-w-[140px]">
              {product.category}
            </div>

            {/* Price Badge */}
            <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1.5 sm:px-2 py-0.5 bg-emerald-600 text-white text-[9px] sm:text-[10px] font-black rounded-md shadow-xs pointer-events-none">
              GHS {product.price}
            </div>

            {/* Persistent Favorite Heart Button */}
            <button
              type="button"
              onClick={handleFavoriteClick}
              className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white flex items-center justify-center text-rose-500 hover:text-rose-600 border border-slate-100 shadow-sm active:scale-90 transition-transform cursor-pointer z-10"
              title={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
              aria-label="Wishlist toggle"
            >
              <Heart 
                className="w-3 h-3 sm:w-3.5 sm:h-3.5" 
                fill={isFavorite ? "#f43f5e" : "none"} 
                strokeWidth={isFavorite ? 0 : 2}
              />
            </button>
          </div>

          {/* Details Section */}
          <div className="p-2 sm:p-3.5 space-y-1 sm:space-y-1.5">
            <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] font-semibold text-blue-700">
              <GraduationCap className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="truncate">{product.sellerUniversity || 'Accredited University'}</span>
            </div>
            <h3 className="text-[11px] sm:text-xs font-bold text-slate-900 line-clamp-1">{product.title}</h3>
            <p className="hidden sm:block text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{product.description || 'No description provided.'}</p>
          </div>
        </div>

        {/* Store & Action Footer */}
        <div className="p-2 sm:p-3.5 pt-0 sm:pt-0 border-t border-slate-100 flex items-center justify-between gap-1 sm:gap-2 mt-1 sm:mt-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center overflow-hidden border border-blue-400/20 shrink-0 shadow-2xs">
              {product.storeLogoUrl ? (
                <img src={product.storeLogoUrl} alt={product.storeName} className="w-full h-full object-cover" />
              ) : (
                <Store className="w-3 h-3 text-white" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="text-[8.5px] sm:text-[9.5px] font-black text-slate-800 truncate max-w-[65px] sm:max-w-[85px]" title={product.storeName}>
                {product.storeName}
              </div>
              {/* Star Rating Display beside profile icon */}
              <div className="flex items-center gap-0.5 text-[8px] sm:text-[9px] font-black text-amber-500 leading-none">
                <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-400 text-amber-500 shrink-0" />
                <span>{product.storeRating !== undefined && product.storeRating !== null ? Number(product.storeRating).toFixed(1) : '5.0'}</span>
                {Boolean(product.ratingCount) && (
                  <span className="text-[7.5px] sm:text-[8px] text-slate-400 font-semibold">({product.ratingCount})</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInspectClick}
            className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] sm:text-[10px] font-bold rounded-lg transition-colors flex items-center gap-0.5 cursor-pointer shrink-0"
          >
            <span>Inspect</span>
            <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          </button>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.product.id === nextProps.product.id &&
      prevProps.product.price === nextProps.product.price &&
      prevProps.product.title === nextProps.product.title &&
      prevProps.product.imageUrl === nextProps.product.imageUrl &&
      prevProps.product.storeName === nextProps.product.storeName &&
      prevProps.product.storeRating === nextProps.product.storeRating &&
      prevProps.product.ratingCount === nextProps.product.ratingCount &&
      prevProps.isFavorite === nextProps.isFavorite
    );
  }
);

MarketItemCard.displayName = 'MarketItemCard';

export default MarketItemCard;
