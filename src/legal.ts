export const TERMS_URL = 'https://www.mykudosfamily.com/terms';
export const PRIVACY_URL = 'https://www.mykudosfamily.com/privacy';

// Update these values whenever the public documents materially change. A
// matching database migration should whitelist each new acceptance version.
export const TERMS_VERSION = '2026-09-06';
export const PRIVACY_VERSION = '2026-09-06';

export type LegalAcceptance = {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
};

export function createCurrentLegalAcceptance(acceptedAt = new Date()): LegalAcceptance {
  return {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt: acceptedAt.toISOString(),
  };
}
