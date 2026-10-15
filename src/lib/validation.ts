// Validation utilities for PineVela

// List of standard public / consumer email domains disallowed for Manager accounts
export const DISALLOWED_MANAGER_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'fastmail.com',
  'tutanota.com'
];

/**
 * Validates that an email is a valid format and is a work/organization domain for managers.
 */
export function validateManagerWorkEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || !email.trim()) {
    return { isValid: false, error: 'Manager email address is required.' };
  }
  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return { isValid: false, error: 'Please enter a valid email address.' };
  }
  const parts = cleanEmail.split('@');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Invalid email address format.' };
  }
  const domain = parts[1];
  if (DISALLOWED_MANAGER_EMAIL_DOMAINS.includes(domain)) {
    return {
      isValid: false,
      error: `Manager registration requires an official work or organization email (e.g. manager@yourproperty.com, housing@institution.edu). Personal email providers (@${domain}) are not permitted.`
    };
  }
  return { isValid: true };
}


/**
 * Validates Street Address format.
 * Strictly follows: [Plot/No.] [Street Name] [Ave/St/Rd/Drive/Way], [Area/Suburb], [City]
 * (e.g. "24 Independence Avenue, Ridge, Accra" or "15 Kofi Annan Street, Airport Residential Area, Accra")
 */
export function validateStreetAddress(street: string): { isValid: boolean; error?: string } {
  if (!street || !street.trim()) {
    return { isValid: false, error: 'Street address is required.' };
  }
  const clean = street.trim();
  if (clean.length < 4) {
    return { isValid: false, error: 'Street address must specify street or plot details (e.g. "Plot 24, Ayeduase, Kumasi").' };
  }
  return { isValid: true };
}
