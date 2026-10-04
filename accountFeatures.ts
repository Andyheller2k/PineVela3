export const ACCOUNT_FEATURES = {
  subaccounts: 'Creating sub-accounts', rooms: 'Activating rooms', orders: 'Placing orders',
  publishing: 'Publishing listings', messaging: 'Buyer–seller messaging', maintenance: 'Submitting maintenance reports'
} as const;
export type AccountFeature = keyof typeof ACCOUNT_FEATURES;
