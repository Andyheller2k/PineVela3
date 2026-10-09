import { effectiveMarketPlan } from './marketPlans.js';
export const MARKET_DEFAULT_COVERS = [
  { name: 'Campus Blue', url: '/store-covers/campus-blue.svg' },
  { name: 'Golden Pine', url: '/store-covers/golden-pine.svg' },
  { name: 'Forest Glass', url: '/store-covers/forest-glass.svg' },
  { name: 'Midnight Campus', url: '/store-covers/midnight-campus.svg' },
] as const;
export const MARKET_DEFAULT_LOGO = '/store-covers/pinevela-logo.svg';
export function isDefaultMarketCover(value: unknown) { return MARKET_DEFAULT_COVERS.some(cover => cover.url === value); }
export function marketStoreBranding(seller: any, production = false) {
  const plan = effectiveMarketPlan(seller, Date.now(), production), customBranding = plan === 'star' || plan === 'pro';
  const cover = seller?.coverPicture || seller?.bannerUrl;
  const profilePicture = customBranding ? seller?.profilePicture || seller?.logoUrl || MARKET_DEFAULT_LOGO : MARKET_DEFAULT_LOGO;
  const coverPicture = customBranding && cover || isDefaultMarketCover(cover) && cover || MARKET_DEFAULT_COVERS[0].url;
  return { customBranding, profilePicture, coverPicture, logoUrl: profilePicture, bannerUrl: coverPicture };
}
