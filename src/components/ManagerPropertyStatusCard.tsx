import { Building2, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';

export type ManagerPropertyStatus = {
  name?: string;
  registrationStatus?: string;
  approvalStatus?: string;
  registrationRequired?: boolean;
  registrationReviewNotes?: string;
  registrationSubmittedAt?: string | null;
  isApproved?: boolean;
};

export function managerPropertyReviewState(property: ManagerPropertyStatus | null) {
  if (!property) return { kind: 'setup' as const, label: 'Registration needed', detail: 'Complete manager verification to begin registering your residence.' };
  const raw = String(property.registrationStatus || property.approvalStatus || 'not_submitted').toLowerCase();
  if (raw === 'approved')
    return { kind: 'approved' as const, label: 'Approved', detail: property.isApproved === true
      ? 'Your residence is approved. Its management tools are available.'
      : 'Your residence is approved. Refresh its status if management tools are still updating.' };
  if (raw === 'rejected')
    return { kind: 'rejected' as const, label: 'Rejected', detail: 'The administrator rejected this registration. Read the review notes below.' };
  if (raw === 'more_info_required')
    return { kind: 'corrections' as const, label: 'Pending', detail: 'The administrator requested corrections before the review can continue.' };
  if (raw === 'not_submitted' || (property.registrationRequired && !property.registrationSubmittedAt))
    return { kind: 'setup' as const, label: 'Registration needed', detail: 'Complete your residence details and submit them for review.' };
  return { kind: 'pending' as const, label: 'Pending', detail: 'Your residence registration is awaiting an administrator decision.' };
}

export function managerPropertyLockMessage(property: ManagerPropertyStatus | null) {
  const state = managerPropertyReviewState(property);
  if (state.kind === 'setup') return {
    title: property ? 'Complete residence registration' : 'Residence setup is not ready',
    detail: property
      ? 'Your operational tabs are locked because residence registration has not been submitted. Complete the property details, then an administrator can review them.'
      : 'Your operational tabs stay locked until manager verification and residence registration are complete.',
    action: property ? 'Continue registration' : 'View registration status'
  };
  if (state.kind === 'corrections') return {
    title: 'Residence corrections requested',
    detail: 'Your operational tabs remain locked while the requested corrections are outstanding. Update and resubmit the registration for review.',
    action: 'Review corrections'
  };
  if (state.kind === 'rejected') return {
    title: 'Residence registration rejected',
    detail: 'Your operational tabs remain locked because the administrator rejected the registration. Review the decision and notes in Property Status.',
    action: 'View decision'
  };
  if (state.kind === 'pending') return {
    title: 'Residence registration under review',
    detail: 'Your registration has been submitted. Operational tabs will unlock after administrator approval.',
    action: 'View status'
  };
  return {
    title: 'Residence access is updating',
    detail: 'Your registration is approved. Refresh Property Status if operational tabs have not unlocked yet.',
    action: 'View status'
  };
}

type Props = {
  property: ManagerPropertyStatus | null;
  onRegister: () => void;
  onRefresh: () => void;
  onOpenDashboard: () => void;
};

export default function ManagerPropertyStatusCard({ property, onRegister, onRefresh, onOpenDashboard }: Props) {
  const state = managerPropertyReviewState(property);
  const Icon = state.kind === 'approved' ? CheckCircle2 : state.kind === 'rejected' ? XCircle : state.kind === 'setup' ? Building2 : Clock;
  const badge = state.kind === 'approved'
    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
    : state.kind === 'rejected'
      ? 'border-rose-400/50 bg-rose-500/15 text-rose-700 dark:text-rose-200'
      : 'border-amber-400/50 bg-amber-500/15 text-amber-800 dark:text-amber-200';
  const submitted = property?.registrationSubmittedAt ? new Date(property.registrationSubmittedAt) : null;
  return <section aria-label="Residence registration status" aria-live="polite"
    className="relative z-10 mx-auto max-w-3xl rounded-3xl border p-5 shadow-lg backdrop-blur-xl sm:p-8"
    style={{ background: 'var(--pv-glass)', borderColor: 'var(--pv-edge)', color: 'var(--pv-text)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="pv-onboarding-action flex size-12 shrink-0 items-center justify-center rounded-2xl"><Building2 size={24} /></span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--pv-muted)' }}>Register your property</p>
          <h2 className="truncate text-xl font-black sm:text-2xl" style={{ color: 'var(--pv-heading)' }}>{property?.name || 'Residence registration'}</h2>
        </div>
      </div>
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-extrabold ${badge}`}><Icon size={17} />{state.label}</span>
    </div>
    <p className="mt-5 text-sm leading-relaxed">{state.detail}</p>
    {submitted && !Number.isNaN(submitted.getTime()) && <p className="mt-2 text-xs" style={{ color: 'var(--pv-muted)' }}>Submitted {submitted.toLocaleDateString()}</p>}
    {property?.registrationReviewNotes && ['rejected', 'corrections'].includes(state.kind) &&
      <div className="mt-5 rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--pv-edge)', background: 'var(--pv-secondary)' }}>
        <p className="font-bold">Administrator review notes</p><p className="mt-1 whitespace-pre-wrap">{property.registrationReviewNotes}</p>
      </div>}
    <div className="mt-6 flex flex-wrap gap-3">
      {(state.kind === 'setup' || state.kind === 'corrections') && property &&
        <button type="button" onClick={onRegister} className="pv-onboarding-action min-h-11 rounded-xl px-5 py-2.5 text-sm font-bold">
          {state.kind === 'corrections' ? 'Update registration' : 'Continue registration'}
        </button>}
      {state.kind === 'approved' && property?.isApproved === true &&
        <button type="button" onClick={onOpenDashboard} className="pv-onboarding-action min-h-11 rounded-xl px-5 py-2.5 text-sm font-bold">Open dashboard</button>}
      <button type="button" onClick={onRefresh} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold"
        style={{ borderColor: 'var(--pv-edge)', color: 'var(--pv-link)', background: 'var(--pv-secondary)' }}><RefreshCw size={16} />Refresh status</button>
    </div>
  </section>;
}
