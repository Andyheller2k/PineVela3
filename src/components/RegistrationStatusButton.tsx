import { BadgeCheck, Clock, ShieldAlert, Store, UserRoundCog, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { registrationStatusLabels, type RegistrationStatus } from '../lib/registrationStatus';

export default function RegistrationStatusButton({ kind, status, loading, error, onClick }: {
  kind: 'merchant' | 'manager';
  status: RegistrationStatus;
  loading?: boolean;
  error?: boolean;
  onClick: () => void;
}) {
  const restricted = ['disabled', 'suspended', 'rejected', 'restricted'].includes(status);
  const approved = status === 'approved' || status === 'active';
  const Icon = loading ? RefreshCw : error ? AlertCircle : status === 'pending' ? Clock : approved ? BadgeCheck :
    status === 'rejected' ? XCircle : restricted ? ShieldAlert : status === 'more_info_required' ? AlertCircle : kind === 'merchant' ? Store : UserRoundCog;
  const label = loading ? 'Checking registration…' : error ? 'Retry status check' : status === 'unregistered' ?
    (kind === 'merchant' ? 'Become a Merchant' : 'Register Your Resident') : registrationStatusLabels[status];
  return <button type="button" data-registration-button={kind} data-registration-status={status}
    aria-label={`${kind === 'merchant' ? 'Merchant' : 'Manager'} registration: ${label}`} aria-haspopup="dialog"
    disabled={loading} onClick={onClick}
    className={`inline-flex shrink-0 items-center justify-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-70 ${
      restricted ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : approved ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' :
      status === 'pending' || status === 'more_info_required' ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-blue-200 bg-white/90 text-blue-800 hover:bg-blue-50'
    }`}>
    <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${loading || status === 'pending' ? 'animate-spin motion-reduce:animate-none' : ''}`} />
    <span>{label}</span>
  </button>;
}
