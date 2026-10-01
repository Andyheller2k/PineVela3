import React, { memo } from 'react';
import { Heart, GraduationCap, Store, ChevronRight, Star, MapPin, Phone, Sparkles, Clock } from 'lucide-react';
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
  isService?: boolean;
  serviceCategory?: string;
  callLine?: string;
  location?: string;
  meetingLocation?: string;
  workingDays?: string;
  openingTime?: string;
  closingTime?: string;
  isOpen247?: boolean;
  priceCategories?: Array<{ id?: string; name: string; price: number; description?: string }>;
  rating?: number;
  reviewCount?: number;
}

/**
 * Contextual action label for services that sounds natural and professional
 * instead of awkward "book a service" or "inspect and buy".
 */
export const getServiceActionLabel = (item: {
  isService?: boolean;
  category?: string;
  serviceCategory?: string;
  title?: string;
}): string => {
  const combined = `${item.serviceCategory || ''} ${item.category || ''} ${item.title || ''}`.toLowerCase();
  if (combined.includes('food') || combined.includes('cater') || combined.includes('meal') || combined.includes('kitchen') || combined.includes('cook') || combined.includes('bake') || combined.includes('pastry')) {
    return 'Order';
  }
  if (combined.includes('gym') || combined.includes('fit') || combined.includes('workout') || combined.includes('subs') || combined.includes('sport')) {
    return 'Subscribe';
  }
  if (combined.includes('repair') || combined.includes('fix') || combined.includes('screen') || combined.includes('phone') || combined.includes('laptop') || combined.includes('tech') || combined.includes('device')) {
    return 'Book Repair';
  }
  if (combined.includes('barber') || combined.includes('hair') || combined.includes('braid') || combined.includes('groom') || combined.includes('fade') || combined.includes('salon') || combined.includes('wig')) {
    return 'Book';
  }
  return 'Book';
};

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

    const isService = Boolean(
      product.isService ||
      product.category === 'Services' ||
      product.category?.toLowerCase().includes('service')
    );

    const displayLocation = product.location || product.meetingLocation;

    return (
      <div 
        className="bg-white/90 border border-slate-200/80 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs hover:border-blue-400 hover:shadow-md transition-all duration-150 flex flex-col justify-between"
      >
        <div>
          {/* Product Thumbnail Container with Lazy Loading */}
          <div className={`relative h-28 sm:h-44 bg-slate-100 overflow-hidden flex items-center justify-center border-b border-slate-100 select-none ${isService ? "p-0 bg-slate-900" : "p-1"}`}> 
            <img 
              src={optimizeImageDisplayUrl(product.imageUrl, 180, 30)} 
              alt={product.title}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              referrerPolicy="no-referrer"
              className={`w-full h-full ${isService ? "object-cover" : "object-contain"} transition-opacity duration-200`} 
            />
            
            {/* Category / PineVela (Service) Tag */}
            {isService ? (
              <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-2 py-0.5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white text-[8px] sm:text-[9.5px] font-black rounded-md shadow-xs flex items-center gap-1 border border-blue-400/30 tracking-wide pointer-events-none">
                <span className="font-extrabold tracking-tight text-blue-200">PineVela</span>
                <span className="text-white font-black">(Service)</span>
              </div>
            ) : (
              <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-1.5 sm:px-2 py-0.5 bg-slate-900/85 text-white text-[8px] sm:text-[9px] font-bold rounded-md pointer-events-none truncate max-w-[100px] sm:max-w-[140px]">
                {product.category}
              </div>
            )}

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
            <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px] font-semibold text-blue-700">
              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                <GraduationCap className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="truncate">{product.sellerUniversity || 'Accredited University'}</span>
              </div>
              {isService && (
                <span className="text-[8px] sm:text-[9px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                  (Service)
                </span>
              )}
            </div>

            <h3 className="text-[11px] sm:text-xs font-bold text-slate-900 line-clamp-1">{product.title}</h3>
            
            <p className="hidden sm:block text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
              {product.description || 'No description provided.'}
            </p>

            {/* Service Location, Working Hours & Call Line preview if present */}
            {isService && (displayLocation || product.callLine || product.workingDays || product.isOpen247) && (
              <div className="pt-0.5 space-y-0.5">
                {(product.workingDays || product.isOpen247) && (
                  <div className="flex items-center gap-1 text-[8px] sm:text-[9px] text-slate-700 font-bold truncate">
                    <Clock className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                    <span className="truncate">
                      {product.isOpen247
                        ? 'Available 24/7'
                        : `${product.workingDays || 'Mon - Sat'} · ${product.openingTime || '08:00 AM'} - ${product.closingTime || '06:00 PM'}`}
                    </span>
                  </div>
                )}
                {displayLocation && (
                  <div className="flex items-center gap-1 text-[8px] sm:text-[9px] text-slate-500 font-semibold truncate">
                    <MapPin className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                    <span className="truncate">{displayLocation}</span>
                  </div>
                )}
                {product.callLine && (
                  <div className="flex items-center gap-1 text-[8px] sm:text-[9px] text-emerald-700 font-bold truncate">
                    <Phone className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                    <span className="truncate font-mono">{product.callLine}</span>
                  </div>
                )}
                {product.priceCategories && product.priceCategories.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-1">
                    {product.priceCategories.slice(0, 2).map((pc, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded text-[7.5px] sm:text-[8px] font-bold">
                        <span className="truncate max-w-[70px] sm:max-w-[85px]">{pc.name}</span>
                        <span className="font-extrabold text-blue-700">GH₵{pc.price}</span>
                      </span>
                    ))}
                    {product.priceCategories.length > 2 && (
                      <span className="text-[7.5px] sm:text-[8px] text-blue-600 font-extrabold self-center">
                        +{product.priceCategories.length - 2} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
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
            className={`px-2 py-0.5 sm:px-2.5 sm:py-1 ${
              isService 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-xs' 
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white text-[9px] sm:text-[10px] font-bold rounded-lg transition-all flex items-center gap-0.5 cursor-pointer shrink-0 active:scale-95`}
          >
            <span>{isService ? getServiceActionLabel(product) : 'Inspect'}</span>
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
      (prevProps.product as any).isService === (nextProps.product as any).isService &&
      (prevProps.product as any).serviceCategory === (nextProps.product as any).serviceCategory &&
      (prevProps.product as any).callLine === (nextProps.product as any).callLine &&
      (prevProps.product as any).location === (nextProps.product as any).location &&
      JSON.stringify((prevProps.product as any).priceCategories) === JSON.stringify((nextProps.product as any).priceCategories) &&
      prevProps.isFavorite === nextProps.isFavorite
    );
  }
);

MarketItemCard.displayName = 'MarketItemCard';

export default MarketItemCard;
