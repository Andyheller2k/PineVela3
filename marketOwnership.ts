import { accountData, accountRole, normalizeEmail } from './accountSecurity.js';

/** Only persisted account/store relationships can identify a seller's primary account. */
export function ownsMarketStore(buyer: any, seller: any, store: any): boolean {
  if (!buyer?.id || !seller) return false;
  const email = normalizeEmail(buyer.email);
  if ([seller.userId, seller.parentUserId].filter(Boolean).includes(buyer.id)) return true;
  if (email && [seller.parentUserEmail, seller.studentEmail].filter(Boolean).map(normalizeEmail).includes(email)) return true;
  const merchants = (store.users || []).map(accountData).filter((u: any) => u && accountRole(u) === 'merchant' &&
    (u.merchantStoreId === seller.id || normalizeEmail(u.email) === normalizeEmail(seller.studentEmail)));
  const applications = (store.digitalMarketApplications || []).filter((a: any) =>
    a.storeId === seller.id || normalizeEmail(a.studentEmail) === normalizeEmail(seller.studentEmail));
  return [...merchants, ...applications].some((u: any) =>
    [u.parentUserId, u.userId].filter(Boolean).includes(buyer.id) ||
    Boolean(email && normalizeEmail(u.parentUserEmail) === email));
}
