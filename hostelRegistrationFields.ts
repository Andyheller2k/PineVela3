/** Retired property sections. Historical persistence is preserved, with no active editors. */
export const retiredHostelFields = new Set([
  'facilities', 'amenities', 'customFacilities', 'rules', 'customRules',
  'checkInTime', 'checkOutTime', 'minStay', 'maxStay', 'guestPolicy', 'visitorPolicy',
  'curfew', 'smokingPolicy', 'petPolicy', 'noisePolicy', 'cancellationPolicy'
]);
export function activeHostelFields<T extends Record<string, any>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !retiredHostelFields.has(key))) as Partial<T>;
}
