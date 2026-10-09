import { internationalPhone, phoneDraft, supportedPhoneCountry } from './internationalPhone.js';
import { verifiedMarketRatings, ratingSummary } from './marketRatingSecurity.js';
import { effectiveMarketPlan, marketPlanBenefits, compareMarketPriority } from './marketPlans.js';

import { STORE_DELIVERY_METHODS, storeDeliveryMode } from './storeDelivery.js';
import { marketStoreBranding, isDefaultMarketCover, MARKET_DEFAULT_LOGO } from './marketBranding.js';
export class StoreProfileError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** Validate the entire patch before mutating the persisted seller record. */
export function storeProfileFields(body: any, actor: any, store: any, current: any, setup = false) {
  const result: any = {};
  for (const key of ['storeName', 'location', 'username', 'category', 'description']) {
    if (body[key] === undefined && !setup) continue;
    const value = body[key];
    if (typeof value !== 'string' || value.length > (key === 'description' ? 4000 : 500) || ['storeName', 'location', 'username', 'category'].includes(key) && !value.trim()) throw new StoreProfileError(`Enter a valid ${key}.`);
    result[key] = value.trim();
  }
  const requested = body.deliveryMode ?? body.deliveryForm;
  if (requested !== undefined || setup) {
    if (typeof requested !== 'string') throw new StoreProfileError('Choose a delivery / handover method.');
    const value = requested.trim() === 'Meetup' ? 'Campus Meetup' : requested.trim();
    if (!(STORE_DELIVERY_METHODS as readonly string[]).includes(value) && (!value || value !== storeDeliveryMode(current))) throw new StoreProfileError('Choose one of the available delivery / handover methods.');
    result.deliveryMode = value; result.deliveryForm = value; // Historical clients read deliveryForm.
  }
  if (body.phone !== undefined || body.phoneCountry !== undefined || setup) {
    const country = body.phoneCountry ?? current.phoneCountry ?? phoneDraft(current.phone).contactPhoneCountry;
    if (!supportedPhoneCountry(country)) throw new StoreProfileError('Choose a valid phone country.');
    try { result.phone = internationalPhone(body.phone ?? current.phone, country).number; result.phoneCountry = country; }
    catch (error) { throw new StoreProfileError((error as Error).message); }
  }
  for (const [key, alias] of [['profilePicture', 'logoUrl'], ['coverPicture', 'bannerUrl']]) {
    if (body[key] === undefined) continue;
    const value = body[key];
    const standard = key === 'profilePicture' ? value === MARKET_DEFAULT_LOGO : isDefaultMarketCover(value);
    if (value && !standard && !marketStoreBranding(current, process.env.NODE_ENV === 'production').customBranding) throw new StoreProfileError('Custom store logos and covers require an active Pine Star or Pine Pro subscription.', 403);
    if (typeof value !== 'string' || value && !standard && value !== current[key] && value !== current[alias] && !(store.marketMedia || []).some((media: any) => media.imageUrl === value && media.accountId === actor.id)) throw new StoreProfileError('Choose a photograph uploaded by your seller account.');
    result[key] = value; result[alias] = value;
  }
  return result;
}

/** Buyer-facing fields never include credentials, sessions, payments or parent identities. */
export function publicStoreProfile(seller: any, store: any) {
  const keys = ['id', 'storeName', 'university', 'location', 'category', 'description', 'phone', 'phoneCountry', 'username', 'studentEmail'];
  const ratings = ratingSummary(verifiedMarketRatings(store).filter(rating => rating.storeId === seller.id));
  return { ...Object.fromEntries(keys.filter(key => seller[key] !== undefined).map(key => [key, seller[key]])),
    deliveryMode: storeDeliveryMode(seller), ...marketStoreBranding(seller, process.env.NODE_ENV === 'production'),
    storeRating: ratings.averageRating, ratingCount: ratings.ratingCount };
}

export function storefrontProducts(seller: any, store: any) {
  const ratings = verifiedMarketRatings(store), summary = publicStoreProfile(seller, store);
  const plan = effectiveMarketPlan(seller, Date.now(), process.env.NODE_ENV === 'production');
  const keys = ['id', 'storeId', 'title', 'description', 'price', 'currency', 'category', 'imageUrl', 'additionalImages', 'stockQuantity', 'isAvailable', 'condition', 'isService', 'serviceCategory', 'serviceLocationMode', 'lat', 'lng', 'location', 'meetingLocation', 'callLine', 'workingDays', 'openingTime', 'closingTime', 'isOpen247', 'priceCategories'];
  return (store.digitalMarketProducts || []).filter((product: any) => product.storeId === seller.id && product.isAvailable !== false && Number(product.stockQuantity) >= 0).map((product: any) => {
    const item = ratingSummary(ratings.filter(rating => rating.productId === product.id));
    return { ...Object.fromEntries(keys.filter(key => product[key] !== undefined).map(key => [key, product[key]])), ...marketPlanBenefits(plan),
      storeName: seller.storeName, sellerEmail: seller.studentEmail, sellerName: seller.username || seller.storeName, sellerUniversity: seller.university,
      sellerPhone: seller.phone || '', storeLogoUrl: summary.profilePicture, storeRating: summary.storeRating, ratingCount: summary.ratingCount,
      rating: item.averageRating, reviewCount: item.ratingCount };
  }).sort(compareMarketPriority);
}
