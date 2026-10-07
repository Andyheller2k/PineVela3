import { getCountries, getCountryCallingCode, parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js/max';

export { getCountryCallingCode };
export type { CountryCode };
const supported = new Set<string>(getCountries());
const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const phoneCountries = getCountries().map(code => ({ code, name: names.of(code) || code, callingCode: getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

export function supportedPhoneCountry(value: unknown): value is CountryCode {
  return typeof value === 'string' && supported.has(value);
}
export function internationalPhone(value: unknown, country: unknown): { number: string; nationalNumber: string; country: CountryCode } {
  if (!supportedPhoneCountry(country)) throw new Error('Choose a valid phone country.');
  if (typeof value !== 'string' || value.length > 40 || !/^\+?[0-9][0-9\s().-]*$/.test(value.trim())) throw new Error('Enter a phone number using digits only.');
  let parsed;
  try { parsed = parsePhoneNumberWithError(value.trim(), { defaultCountry: country, extract: false }); }
  catch { throw new Error('Enter a valid phone number for the selected country.'); }
  if (!parsed.isValid() || parsed.country !== country) throw new Error('The phone number must match the selected country and calling code.');
  return { number: parsed.number, nationalNumber: parsed.nationalNumber, country };
}

/** Preserve previously saved international contacts while introducing country selection. */
export function phoneDraft(value: unknown, country: unknown = 'GH'): { contactPhone: string; contactPhoneCountry: CountryCode } {
  const selected = supportedPhoneCountry(country) ? country : 'GH';
  if (typeof value !== 'string' || !value.trim()) return { contactPhone: '', contactPhoneCountry: selected };
  try {
    const phone = parsePhoneNumberWithError(value, { defaultCountry: selected, extract: false });
    if (phone.country && phone.isValid()) return { contactPhone: phone.nationalNumber, contactPhoneCountry: phone.country };
  } catch { /* Invalid old drafts remain subject to validation. */ }
  return { contactPhone: value, contactPhoneCountry: selected };
}
