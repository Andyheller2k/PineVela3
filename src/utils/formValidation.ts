/**
 * PineVela Centralized Form Validation & Formatting Utilities
 * Strictly enforces email, phone number, physical address,
 * and identification document formats (Ghana Card, Voter ID, NHIS, Student ID, Passport, Driver's License).
 * 
 * When numeric-only IDs are selected, alphabets are blocked immediately.
 * Users cannot proceed unless all entries conform to required standards.
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedValue?: string;
}

export interface IdTypeConfig {
  id: string;
  name: string;
  placeholder: string;
  helperText: string;
  numericOnly: boolean;
  maxLength: number;
  formatMask?: string;
  formatInput: (val: string) => string;
  validate: (val: string) => ValidationResult;
}

export const DISALLOWED_MANAGER_DOMAINS = [
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
  'mail.com',
  'yandex.com'
];

/**
 * Validates that an email is a valid official work/organization email for Manager registration.
 */
export function validateManagerWorkEmail(email: string, fieldName = 'Manager work email'): ValidationResult {
  const baseRes = validateEmail(email, fieldName);
  if (!baseRes.isValid) {
    return baseRes;
  }
  const clean = baseRes.sanitizedValue!;
  const domain = clean.split('@')[1] || '';
  if (DISALLOWED_MANAGER_DOMAINS.includes(domain)) {
    return {
      isValid: false,
      error: `Manager registration requires an official work or organization email (e.g. manager@yourproperty.com, housing@institution.edu). Consumer email providers (@${domain}) are not permitted.`
    };
  }
  return { isValid: true, sanitizedValue: clean };
}

/**
 * Validates that manager email is distinct from personal user/resident email.
 */
export function validateManagerNotUserEmail(managerEmail: string, userEmail?: string): ValidationResult {
  if (!userEmail) return { isValid: true };
  const cleanManager = (managerEmail || '').toLowerCase().trim();
  const cleanUser = (userEmail || '').toLowerCase().trim();
  if (cleanManager && cleanUser && cleanManager === cleanUser) {
    return {
      isValid: false,
      error: `Manager registration requires a dedicated work or organization email address. You cannot use your personal resident user email (${cleanUser}).`
    };
  }
  return { isValid: true };
}

/**
 * 1. Email Format Validator
 * Enforces standard RFC email formats: localpart@domain.tld
 */
export function validateEmail(email: string, fieldName = 'Email address'): ValidationResult {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) {
    return { isValid: false, error: `${fieldName} is required.` };
  }
  // Standard robust email regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return {
      isValid: false,
      error: `Invalid ${fieldName.toLowerCase()} format. Must be like name@domain.com (e.g. kwame@gmail.com)`
    };
  }
  return { isValid: true, sanitizedValue: trimmed };
}

/**
 * 2. Phone Number Cleaner & Validator
 * Strips invalid characters (no letters allowed in phone inputs).
 */
export function cleanPhoneNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const startsWithPlus = trimmed.startsWith('+');
  // Keep only digits, spaces, and hyphens (and leading plus)
  const digitsAndAllowed = trimmed.replace(/[^0-9\s-]/g, '');
  if (startsWithPlus) {
    return `+${digitsAndAllowed.replace(/^\+*/, '')}`;
  }
  return digitsAndAllowed;
}

export function validatePhone(phone: string, fieldName = 'Phone number'): ValidationResult {
  const cleaned = cleanPhoneNumber(phone).trim();
  if (!cleaned) {
    return { isValid: false, error: `${fieldName} is required.` };
  }

  // Count pure digits
  const pureDigits = cleaned.replace(/\D/g, '');

  if (cleaned.startsWith('+')) {
    if (pureDigits.length < 10 || pureDigits.length > 15) {
      return {
        isValid: false,
        error: `${fieldName} with country code must contain between 10 and 15 digits (e.g. +233 24 123 4567).`
      };
    }
  } else {
    if (pureDigits.length !== 10) {
      return {
        isValid: false,
        error: `${fieldName} must be exactly 10 digits (e.g. 024 123 4567). Entered ${pureDigits.length} digits.`
      };
    }
    if (!cleaned.startsWith('0')) {
      return {
        isValid: false,
        error: `${fieldName} must start with '0' (e.g. 024XXXXXXX) or include international code '+233'.`
      };
    }
  }

  return { isValid: true, sanitizedValue: cleaned };
}

/**
 * 3. Physical Street Address Validator
 * Enforces structured Ghanaian street address format:
 * e.g. "24 Independence Avenue, Ridge, Accra" or "15 Kofi Annan Street, Airport Residential Area, Accra"
 * Format: [House/Plot Number] [Street Name] [Street Type: Street/Avenue/Road/Drive/Way/Close/Lane/Boulevard/Highway], [Area/Neighborhood/Suburb], [City/Town]
 */
export function validateStreetAddress(address: string, fieldName = 'Street address'): ValidationResult {
  const trimmed = (address || '').trim();
  if (!trimmed) {
    return { isValid: false, error: `${fieldName} is required.` };
  }
  if (trimmed.length < 4) {
    return {
      isValid: false,
      error: `${fieldName} must specify street, plot, or campus zone details (e.g. "Plot 24, Ayeduase, Kumasi").`
    };
  }
  return { isValid: true, sanitizedValue: trimmed };
}

export function validateAddress(address: string, fieldName = 'Physical address'): ValidationResult {
  return validateStreetAddress(address, fieldName);
}

export function validateHostelStreetAddress(street: string): ValidationResult {
  const trimmed = (street || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Street address line is required.' };
  }
  if (trimmed.length < 6) {
    return { isValid: false, error: 'Street address line must be at least 6 characters long (e.g. "14 University Avenue").' };
  }
  // Check for building number, plot number, block, or digit
  const hasNumberOrPlot = /\d+/.test(trimmed) || /plot|block|suite|gate|no/i.test(trimmed);
  if (!hasNumberOrPlot) {
    return {
      isValid: false,
      error: 'Street address must include a building, plot, or street number (e.g. "14 University Avenue" or "Plot 24 Ring Road").'
    };
  }
  // Check for street suffix or road designation
  const hasStreetSuffix = /(street|avenue|ave|st|road|rd|drive|dr|way|close|cl|lane|ln|boulevard|blvd|crescent|cres|highway|hw|bypass|junction)/i.test(trimmed);
  if (!hasStreetSuffix) {
    return {
      isValid: false,
      error: 'Street address must specify a valid road or street type (e.g. Avenue, Street, Road, Drive, Way, Bypass, Close, Crescent).'
    };
  }
  return { isValid: true, sanitizedValue: trimmed };
}


/**
 * 5. Identification Document Configurations
 * Distinct rules, input cleaners, masks, and validation for each ID type.
 */
export const ID_CONFIGS: Record<string, IdTypeConfig> = {
  'ghana_card': {
    id: 'ghana_card',
    name: 'Ghana Card (National ID)',
    placeholder: 'GHA-123456789-1',
    helperText: 'Format: GHA-XXXXXXXXX-X (GHA followed by 9 digits and 1 check digit)',
    numericOnly: false,
    maxLength: 15,
    formatMask: 'GHA-000000000-0',
    formatInput: (val: string) => {
      let clean = val.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (clean.length > 15) clean = clean.slice(0, 15);
      return clean;
    },
    validate: (val: string): ValidationResult => {
      const trimmed = (val || '').trim().toUpperCase();
      if (!trimmed) return { isValid: false, error: 'Ghana Card PIN is required.' };
      const regex = /^GHA-[0-9]{9}-[0-9]$/;
      if (!regex.test(trimmed)) {
        return {
          isValid: false,
          error: 'Invalid Ghana Card PIN. Must strictly match GHA-XXXXXXXXX-X (e.g. GHA-729103982-1).'
        };
      }
      return { isValid: true, sanitizedValue: trimmed };
    }
  },

  'voter_id': {
    id: 'voter_id',
    name: 'Voter ID Card',
    placeholder: 'e.g. 1048291048 (10 digits)',
    helperText: 'Numbers only — strictly 10 numeric digits (no alphabets allowed)',
    numericOnly: true,
    maxLength: 10,
    formatInput: (val: string) => {
      // Strictly numbers: strip all non-digits
      return val.replace(/[^0-9]/g, '').slice(0, 10);
    },
    validate: (val: string): ValidationResult => {
      const clean = (val || '').trim();
      if (!clean) return { isValid: false, error: 'Voter ID number is required.' };
      if (/[^0-9]/.test(clean)) {
        return { isValid: false, error: 'Voter ID must contain NUMBERS ONLY. Alphabets are strictly not allowed.' };
      }
      if (clean.length !== 10) {
        return { isValid: false, error: `Voter ID must be exactly 10 digits (currently ${clean.length} digits).` };
      }
      return { isValid: true, sanitizedValue: clean };
    }
  },

  'nhis_card': {
    id: 'nhis_card',
    name: 'NHIS Card (Health Insurance)',
    placeholder: 'e.g. 29384019 (8 digits)',
    helperText: 'Numbers only — strictly 8 numeric digits (no alphabets allowed)',
    numericOnly: true,
    maxLength: 8,
    formatInput: (val: string) => {
      return val.replace(/[^0-9]/g, '').slice(0, 8);
    },
    validate: (val: string): ValidationResult => {
      const clean = (val || '').trim();
      if (!clean) return { isValid: false, error: 'NHIS card number is required.' };
      if (/[^0-9]/.test(clean)) {
        return { isValid: false, error: 'NHIS Card must contain NUMBERS ONLY. Alphabets are strictly not allowed.' };
      }
      if (clean.length !== 8) {
        return { isValid: false, error: `NHIS Card must be exactly 8 digits (currently ${clean.length} digits).` };
      }
      return { isValid: true, sanitizedValue: clean };
    }
  },

  'student_id': {
    id: 'student_id',
    name: 'University Student ID',
    placeholder: 'e.g. 10928374 (6-10 digits)',
    helperText: 'Numbers only — 6 to 10 numeric digits (no alphabets allowed)',
    numericOnly: true,
    maxLength: 10,
    formatInput: (val: string) => {
      return val.replace(/[^0-9]/g, '').slice(0, 10);
    },
    validate: (val: string): ValidationResult => {
      const clean = (val || '').trim();
      if (!clean) return { isValid: false, error: 'Student ID number is required.' };
      if (/[^0-9]/.test(clean)) {
        return { isValid: false, error: 'Student ID must contain NUMBERS ONLY. Alphabets are strictly not allowed.' };
      }
      if (clean.length < 6 || clean.length > 10) {
        return { isValid: false, error: 'Student ID number must be between 6 and 10 digits long.' };
      }
      return { isValid: true, sanitizedValue: clean };
    }
  },

  'passport': {
    id: 'passport',
    name: 'International Passport',
    placeholder: 'e.g. G1234567 (1 letter + 7-8 digits)',
    helperText: 'Format: 1 uppercase letter followed by 7-8 numeric digits (e.g. G1234567)',
    numericOnly: false,
    maxLength: 9,
    formatInput: (val: string) => {
      let clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (clean.length > 9) clean = clean.slice(0, 9);
      return clean;
    },
    validate: (val: string): ValidationResult => {
      const trimmed = (val || '').trim().toUpperCase();
      if (!trimmed) return { isValid: false, error: 'Passport number is required.' };
      const regex = /^[A-Z][0-9]{7,8}$/;
      if (!regex.test(trimmed)) {
        return {
          isValid: false,
          error: 'Invalid Passport format. Must start with 1 letter followed by 7 to 8 digits (e.g. G1234567).'
        };
      }
      return { isValid: true, sanitizedValue: trimmed };
    }
  },

  'driver_license': {
    id: 'driver_license',
    name: "Driver's License",
    placeholder: 'e.g. DL-10928374 or 8-14 characters',
    helperText: 'Format: 8-14 alphanumeric characters (e.g. DL-10928374)',
    numericOnly: false,
    maxLength: 14,
    formatInput: (val: string) => {
      return val.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14);
    },
    validate: (val: string): ValidationResult => {
      const trimmed = (val || '').trim().toUpperCase();
      if (!trimmed) return { isValid: false, error: "Driver's License number is required." };
      if (trimmed.length < 8 || trimmed.length > 14) {
        return { isValid: false, error: "Driver's License must be between 8 and 14 characters long." };
      }
      return { isValid: true, sanitizedValue: trimmed };
    }
  }
};

/**
 * Resolves standard ID config regardless of label variation in UI
 */
export function resolveIdConfig(selectedType: string): IdTypeConfig {
  const norm = (selectedType || '').toLowerCase();
  if (norm.includes('ghana') || norm.includes('nia') || norm.includes('national id')) {
    return ID_CONFIGS['ghana_card'];
  }
  if (norm.includes('voter')) {
    return ID_CONFIGS['voter_id'];
  }
  if (norm.includes('nhis') || norm.includes('health')) {
    return ID_CONFIGS['nhis_card'];
  }
  if (norm.includes('student') || norm.includes('university') || norm.includes('tertiary')) {
    return ID_CONFIGS['student_id'];
  }
  if (norm.includes('passport')) {
    return ID_CONFIGS['passport'];
  }
  if (norm.includes('driver') || norm.includes('license') || norm.includes('licence')) {
    return ID_CONFIGS['driver_license'];
  }
  return ID_CONFIGS['ghana_card'];
}
