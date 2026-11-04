import { internationalPhone, type CountryCode } from './internationalPhone';
import { STORE_DELIVERY_METHODS } from './storeDelivery';

export type StoreDraft = { storeName:string; username:string; description:string; location:string; phone:string; phoneCountry:CountryCode; deliveryMode:string };
export type StoreFieldErrors = Partial<Record<keyof StoreDraft,string>>;
export function validateStoreStep(draft:StoreDraft, step:1|2):StoreFieldErrors {
  const errors:StoreFieldErrors = {};
  if (step===1) {
    if (!draft.storeName.trim() || draft.storeName.trim().length>200) errors.storeName='Enter a store name of 1–200 characters.';
    if (!draft.username.trim() || draft.username.trim().length>120) errors.username='Enter a store username of 1–120 characters.';
    if (draft.description.length>4000) errors.description='Keep the store description within 4,000 characters.';
  } else {
    if (!draft.location.trim() || draft.location.trim().length>600) errors.location='Enter or select a campus location of 1–600 characters.';
    if (!(STORE_DELIVERY_METHODS as readonly string[]).includes(draft.deliveryMode)) errors.deliveryMode='Choose a supported delivery or handover method.';
    try { internationalPhone(draft.phone,draft.phoneCountry); }
    catch(error) { errors.phone=error instanceof Error?error.message:'Enter a valid phone number for the selected country.'; }
  }
  return errors;
}
