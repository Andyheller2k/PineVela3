import type { MarketProductItem } from '../components/MarketItemCard';
import { compareMarketPriority } from '../../marketPlans';
import {isMarketService as savedServiceKind} from '../../marketListingAvailability';

export const matchesMarketCategory = (productCategory: string = '', selectedCat: string = '') => {
  if (!selectedCat || selectedCat === 'All') return true;
  const pCat = (productCategory || '').toLowerCase().trim();
  const sCat = selectedCat.toLowerCase().trim();

  if (!pCat) return true;
  if (pCat === sCat || pCat.includes(sCat) || sCat.includes(pCat)) return true;

  const sWords = sCat.split(/[\s,&/]+/).filter(w => w.length > 2 && w !== 'and' && w !== 'the' && w !== 'for');
  for (const word of sWords) {
    if (pCat.includes(word)) return true;
  }

  const techKeywords = ['electronic', 'gadget', 'laptop', 'phone', 'computing', 'gear', 'accessory', 'accessories', 'tech', 'audio', 'instrument', 'device', 'charger', 'headphone', 'macbook', 'iphone', 'android', 'powerbank'];
  const isTechSelected = techKeywords.some(k => sCat.includes(k));
  const isTechProd = techKeywords.some(k => pCat.includes(k));
  if (isTechSelected && isTechProd) return true;

  const bookKeywords = ['textbook', 'book', 'study', 'handout', 'material', 'stationery', 'print', 'binding', 'paper', 'note'];
  const isBookSelected = bookKeywords.some(k => sCat.includes(k));
  const isBookProd = bookKeywords.some(k => pCat.includes(k));
  if (isBookSelected && isBookProd) return true;

  const applianceKeywords = ['appliance', 'hostel', 'cookware', 'kitchen', 'utensil', 'fridge', 'iron', 'provision', 'microwave', 'kettle', 'blender'];
  const isApplianceSelected = applianceKeywords.some(k => sCat.includes(k));
  const isApplianceProd = applianceKeywords.some(k => pCat.includes(k));
  if (isApplianceSelected && isApplianceProd) return true;

  const fashionKeywords = ['fashion', 'footwear', 'thrift', 'boutique', 'apparel', 'clothing', 'beauty', 'skincare', 'haircare', 'grooming', 'shoe', 'shirt', 'dress'];
  const isFashionSelected = fashionKeywords.some(k => sCat.includes(k));
  const isFashionProd = fashionKeywords.some(k => pCat.includes(k));
  if (isFashionSelected && isFashionProd) return true;

  const furnitureKeywords = ['furniture', 'bedding', 'mattress', 'curtain', 'decor', 'desk', 'chair', 'table', 'pillow'];
  const isFurnitureSelected = furnitureKeywords.some(k => sCat.includes(k));
  const isFurnitureProd = furnitureKeywords.some(k => pCat.includes(k));
  if (isFurnitureSelected && isFurnitureProd) return true;

  const serviceKeywords = ['service', 'tutoring', 'repair', 'graphic', 'printing', 'laundry', 'cleaning'];
  const isServiceSelected = serviceKeywords.some(k => sCat.includes(k));
  const isServiceProd = serviceKeywords.some(k => pCat.includes(k));
  if (isServiceSelected && isServiceProd) return true;

  return false;
};
export function isMarketService(product: MarketProductItem) {
  return savedServiceKind(product);
}
export function filterMarketCatalog(products: MarketProductItem[], query: string, category: string, min: number, max: number, sort: string) {
  const search = query.toLowerCase().trim();
  return products.filter(product => {
    if (category !== 'All' && (category === 'Services' ? !isMarketService(product) : isMarketService(product) || !matchesMarketCategory(product.category, category))) return false;
    if (search && ![product.title, product.description, product.storeName, product.category].some(value => value?.toLowerCase().includes(search))) return false;
    const price = Number(product.price) || 0;
    return price >= min && (max >= 5000 || price <= max);
  }).sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'newest') return (b.id || '').localeCompare(a.id || '');
    return compareMarketPriority(a, b);
  });
}
