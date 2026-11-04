type Account = {
  role: string;
  customerService?: boolean;
  isDigitalMarketOnly?: boolean;
  targetRedirect?: string;
  merchantSetupCompleted?: boolean;
  merchantRegistrationFeePaid?: boolean;
};

/** Routing is presentation only; all pages still require server authorization. */
export function nativeSignedInDestination(user: Account, continuation?: string | null): string {
  if (user.role === 'user' && continuation) return continuation;
  if (user.role === 'user' && user.customerService) return '/customer-service';
  if (user.role === 'merchant' || user.isDigitalMarketOnly) {
    if (user.targetRedirect === '/digital-market' || user.targetRedirect === '/digital-market/onboard') return user.targetRedirect;
    return user.merchantSetupCompleted === false || !user.merchantRegistrationFeePaid ? '/digital-market/onboard' : '/digital-market';
  }
  if (['verification_team', 'officer', 'field_officer'].includes(user.role)) return '/field-officer';
  return ({ staff: '/staff/dashboard', manager: '/manager/dashboard', admin: '/admin/dashboard', student: '/resident/dashboard' } as Record<string, string>)[user.role] || '/user/dashboard';
}
