import crypto from 'crypto';

/**
 * PineVela Verification & KYC Provider Service
 * Enforces secure, provider-based identity and authority verification.
 * 
 * Rules:
 * - 300 Synthetic/test Ghana Card identifiers only (NO real Ghana Card numbers)
 * - Raw identifiers are NEVER logged or stored
 * - Only SHA-256 hashed identifiers are stored in database records
 * - Provider-based interface allows swapping the mock provider for authorized NIA/KYC APIs
 */

export interface VerifyIdParams {
  country: string;
  documentType: string;
  idNumber: string;
  fullName: string;
  dateOfBirth?: string;
  expiryDate?: string;
}

export interface VerifyIdResult {
  status: 'verified' | 'invalid' | 'already_verified' | 'suspended';
  hashedId: string;
  maskedId: string;
  provider: string;
  message: string;
  verifiedAt: string;
  details?: {
    matchScore?: number;
    issuer?: string;
    holderName?: string;
    country?: string;
    documentType?: string;
  };
}

export interface VerificationProvider {
  name: string;
  verifyIdentity(params: VerifyIdParams): Promise<VerifyIdResult>;
}

/**
 * Helper to compute SHA-256 hash
 */
export function hashIdentifier(idNumber: string): string {
  const normalized = idNumber.trim().toUpperCase().replace(/\s+/g, '');
  return crypto.createHash('sha256').update(`pinevela_salt_v2_${normalized}`).digest('hex');
}

/**
 * Helper to mask an ID for UI display without exposing raw details
 * e.g. GHA-100000001-1 -> GHA-*****001-1
 */
export function maskIdentifier(idNumber: string): string {
  const clean = idNumber.trim().toUpperCase();
  if (clean.startsWith('GHA-') && clean.length >= 14) {
    const prefix = clean.substring(0, 4); // "GHA-"
    const end = clean.substring(clean.length - 5); // "001-1"
    return `${prefix}*****${end}`;
  }
  if (clean.length > 6) {
    return `${clean.substring(0, 2)}****${clean.substring(clean.length - 2)}`;
  }
  return '******';
}

// Generate the 300 synthetic Ghana Card test registry
// Format: GHA-100000001-1 to GHA-100000300-8
interface SyntheticRecord {
  idNumber: string;
  hashedId: string;
  status: 'verified' | 'invalid' | 'already_verified' | 'suspended';
  fullName: string;
  dob: string;
  expiryDate: string;
  issuer: string;
  message: string;
}

const SYNTHETIC_GHANA_CARDS: SyntheticRecord[] = [];

// Seed the 300 test cards
(function initializeSyntheticRegistry() {
  const firstNames = ['Kwame', 'Kofi', 'Ama', 'Yaw', 'Abena', 'Kojo', 'Akosua', 'Kwesi', 'Afia', 'Esi', 'Sarah', 'Anthony', 'Michael', 'Grace', 'Emmanuel', 'David', 'Samuel', 'Dorothy', 'Priscilla', 'Bernard'];
  const lastNames = ['Mensah', 'Osei', 'Appiah', 'Asante', 'Boateng', 'Agyemang', 'Owusu', 'Frimpong', 'Darko', 'Antwi', 'Quaye', 'Tetteh', 'Addison', 'Baah', 'Acheampong', 'Kwarteng', 'Baffour', 'Boadu'];

  for (let i = 1; i <= 300; i++) {
    const numPadded = String(100000000 + i);
    const checksum = (i * 7) % 10;
    const testId = `GHA-${numPadded}-${checksum}`;
    const hashed = hashIdentifier(testId);

    const fName = firstNames[(i - 1) % firstNames.length];
    const lName = lastNames[(i * 3) % lastNames.length];
    const fullName = `${fName} ${lName}`;

    const birthYear = 1970 + (i % 30);
    const birthMonth = String(1 + (i % 12)).padStart(2, '0');
    const birthDay = String(1 + (i % 28)).padStart(2, '0');
    const dob = `${birthYear}-${birthMonth}-${birthDay}`;

    const expYear = 2030 + (i % 6);
    const expiryDate = `${expYear}-${birthMonth}-${birthDay}`;

    let status: 'verified' | 'invalid' | 'already_verified' | 'suspended' = 'verified';
    let message = 'National identity record successfully matched and verified.';

    if (i >= 296) {
      status = 'invalid';
      message = 'Document format or checksum record marked invalid by identity registry.';
    } else if (i >= 291) {
      status = 'already_verified';
      message = 'Document already registered and linked to an existing verified manager.';
    } else if (i >= 281) {
      status = 'suspended';
      message = 'Document flagged as suspended or revoked by the National Identification Authority.';
    }

    SYNTHETIC_GHANA_CARDS.push({
      idNumber: testId,
      hashedId: hashed,
      status,
      fullName,
      dob,
      expiryDate,
      issuer: 'National Identification Authority (Ghana) - Test Sandbox',
      message
    });
  }
})();

/**
 * Mock Provider implementing the 300 synthetic test cards
 */
export class MockNiaVerificationProvider implements VerificationProvider {
  public name = 'National Identification Authority (NIA Ghana) - Synthetic Test Engine';

  async verifyIdentity(params: VerifyIdParams): Promise<VerifyIdResult> {
    const { country, documentType, idNumber, fullName } = params;
    const cleanId = (idNumber || '').trim().toUpperCase();
    const hashedId = hashIdentifier(cleanId);
    const maskedId = maskIdentifier(cleanId);
    const now = new Date().toISOString();

    // 1. Format validation
    if (documentType === 'Ghana Card' || country.toLowerCase() === 'ghana') {
      const ghanaCardRegex = /^GHA-[0-9]{9}-[0-9]$/;
      if (!ghanaCardRegex.test(cleanId)) {
        return {
          status: 'invalid',
          hashedId,
          maskedId,
          provider: this.name,
          message: 'Invalid Ghana Card format. Expected format: GHA-XXXXXXXXX-X (e.g., GHA-100000001-1).',
          verifiedAt: now,
          details: { matchScore: 0, country, documentType }
        };
      }
    } else if (!cleanId || cleanId.length < 5) {
      return {
        status: 'invalid',
        hashedId,
        maskedId,
        provider: this.name,
        message: 'Invalid document identifier length or character composition.',
        verifiedAt: now,
        details: { matchScore: 0, country, documentType }
      };
    }

    // 2. Check against the 300 synthetic test records
    const record = SYNTHETIC_GHANA_CARDS.find(r => r.hashedId === hashedId || r.idNumber === cleanId);

    if (record) {
      return {
        status: record.status,
        hashedId: record.hashedId,
        maskedId,
        provider: this.name,
        message: record.message,
        verifiedAt: now,
        details: {
          matchScore: record.status === 'verified' ? 98 : 30,
          issuer: record.issuer,
          holderName: record.fullName,
          country,
          documentType
        }
      };
    }

    // If Ghana card was supplied but not in the 300 synthetic records, treat as invalid format/unregistered in sandbox
    if (documentType === 'Ghana Card') {
      return {
        status: 'invalid',
        hashedId,
        maskedId,
        provider: this.name,
        message: 'Identifier not recognized in the 300 test Ghana Card registry. Please use a valid test card (e.g. GHA-100000001-1).',
        verifiedAt: now,
        details: { matchScore: 10, country, documentType }
      };
    }

    // For Passport / International documents in the prototype:
    return {
      status: 'verified',
      hashedId,
      maskedId,
      provider: 'International Passport / Identity Gateway (Sandbox)',
      message: 'Passport details validated against electronic travel registry test service.',
      verifiedAt: now,
      details: {
        matchScore: 95,
        issuer: `${country} Passport Authority`,
        holderName: fullName,
        country,
        documentType
      }
    };
  }
}

// Export singleton provider
export const defaultVerificationProvider = new MockNiaVerificationProvider();

/**
 * Returns the complete list of 300 synthetic test cards with full name, dates, status
 */
export function getAllSyntheticTestCards(): {
  idNumber: string;
  fullName: string;
  dob: string;
  expiryDate: string;
  status: string;
  description: string;
}[] {
  return SYNTHETIC_GHANA_CARDS.map((c, i) => ({
    idNumber: c.idNumber,
    fullName: c.fullName,
    dob: c.dob,
    expiryDate: c.expiryDate,
    status: c.status,
    description: `#${i + 1}: ${c.idNumber} — ${c.fullName} (${c.status === 'verified' ? 'Valid' : c.status})`
  }));
}

/**
 * Returns a random synthetic test card from the registry (defaulting to verified)
 */
export function getRandomSyntheticCard(onlyVerified = false): {
  idNumber: string;
  fullName: string;
  dob: string;
  expiryDate: string;
  status: string;
  description: string;
} {
  const pool = onlyVerified
    ? SYNTHETIC_GHANA_CARDS.filter(c => c.status === 'verified')
    : SYNTHETIC_GHANA_CARDS;
  const chosen = pool[Math.floor(Math.random() * pool.length)] || SYNTHETIC_GHANA_CARDS[0];
  return {
    idNumber: chosen.idNumber,
    fullName: chosen.fullName,
    dob: chosen.dob,
    expiryDate: chosen.expiryDate,
    status: chosen.status,
    description: `${chosen.idNumber} — ${chosen.fullName}`
  };
}
