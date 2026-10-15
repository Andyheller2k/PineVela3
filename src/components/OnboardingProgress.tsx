import React from 'react';
import { Check, User, Mail, KeyRound, ShieldCheck, Building2, MapPin, Store, FileCheck, Briefcase, BadgeCheck, CreditCard, type LucideIcon } from 'lucide-react';

export interface OnboardingStep { title: string; icon: LucideIcon; description?: string; sub?: string; desc?: string }
export const SIGNUP_STEPS: OnboardingStep[] = [
  { title: 'Your account', icon: User, description: 'Your name, email and secure password' },
  { title: 'Verify email', icon: Mail, description: 'Confirm your email to activate your account' }
];
export const MANAGER_ACCOUNT_STEPS: OnboardingStep[] = [
  { title: 'Manager credentials', icon: Briefcase, description: 'Identity, contact and management credentials' },
  { title: 'Application submitted', icon: FileCheck, description: 'Track verification and administrator approval' }
];
export const ROOM_ACTIVATION_STEPS: OnboardingStep[] = [
  { title: 'Verify room key', icon: KeyRound, description: 'Verify the allocation provided by your manager' },
  { title: 'Resident account', icon: User, description: 'Your resident details and secure password' },
  { title: 'Room activated', icon: BadgeCheck, description: 'Your verified resident account is ready' }
];
export const STORE_SETUP_STEPS: OnboardingStep[] = [
  { title: 'Store identity', icon: Store, description: 'Your store name, category and photographs' },
  { title: 'Location & delivery', icon: MapPin, description: 'Campus location and delivery arrangements' },
  { title: 'Activation & review', icon: CreditCard, description: 'Review your details and complete store activation' }
];
export const MARKET_APPLICATION_STEPS: OnboardingStep[] = [
  { title: 'Student identity', icon: User, description: 'Your identity and accredited institution' },
  { title: 'Merchant security', icon: ShieldCheck, description: 'Your merchant credentials and password' },
  { title: 'Store & review', icon: FileCheck, description: 'Product category and application terms' }
];
export const STAFF_ACCOUNT_STEPS: OnboardingStep[] = [
  { title: 'Staff identity', icon: User, description: 'Staff name and contact details' },
  { title: 'Residence & role', icon: Building2, description: 'Assigned residence, work role and shift' },
  { title: 'Account credentials', icon: ShieldCheck, description: 'Set the staff member’s unique login password' }
];
export const ADMIN_ENROLLMENT_STEPS: OnboardingStep[] = [
  { title: 'Private invitation', icon: Mail, description: 'Enrollment is tied to your administrator invitation' },
  { title: 'Secure credentials', icon: ShieldCheck, description: 'Choose and confirm your own login password' },
  { title: 'Administrator ready', icon: BadgeCheck, description: 'Save your private approval key securely' }
];
export const ADMIN_INVITATION_STEPS: OnboardingStep[] = [
  { title: 'Founder identity', icon: User, description: 'The invited founder’s name and separate administrator email' },
  { title: 'Private authorization', icon: KeyRound, description: 'Authorize the invitation with your own approval key' },
  { title: 'Invitation ready', icon: Mail, description: 'Copy the private link and share it with its named recipient' }
];
export const OFFICER_ACCOUNT_STEPS: OnboardingStep[] = [
  { title: 'Officer identity', icon: User, description: 'The verification officer’s name and contact details' },
  { title: 'Inspection zone', icon: MapPin, description: 'The officer’s assigned inspection area' },
  { title: 'Verified access', icon: ShieldCheck, description: 'Accept the invitation using the verified official email' }
];

/** Shared resident-wizard styling. Only completed/current steps may be revisited. */
export default function OnboardingProgress({ steps, step, label = 'Onboarding', onStepChange }: {
  steps: readonly OnboardingStep[]; step: number; label?: string; onStepChange?: (step: number) => void;
}) {
  const current = Math.min(steps.length, Math.max(1, step));
  const active = steps[current - 1];
  if (!active) return null;
  const progress = steps.length === 1 ? 100 : Math.round(10 + (current - 1) / (steps.length - 1) * 90);
  return <section aria-label={`${label} progress`} className="min-w-0 rounded-2xl border border-blue-100/70 bg-blue-50/50 p-4 sm:p-6">
    <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="min-w-0"><p className="text-xs font-black uppercase tracking-wider text-blue-700">Phase {current} of {steps.length}</p><h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{active.title}</h2><p className="text-xs font-medium text-slate-500 sm:text-sm">{active.description || active.sub || active.desc}</p></div>
      <ol className="flex shrink-0 flex-wrap items-center gap-2" aria-label={`${label} steps`}>{steps.map((item, index) => {
        const number = index + 1, completed = current > number, Icon = completed ? Check : item.icon;
        const appearance = completed ? 'bg-emerald-500 text-white shadow-sm' : current === number ? 'bg-blue-900 text-white ring-2 ring-blue-400 ring-offset-2' : 'bg-slate-200 text-slate-400';
        return <li key={item.title} aria-current={current === number ? 'step' : undefined}>{onStepChange ? <button type="button" disabled={number > current} onClick={() => onStepChange(number)} title={item.title} aria-label={`${number}. ${item.title}${completed ? ' completed' : ''}`} className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed ${appearance}`}><Icon size={16} aria-hidden="true" /></button> : <span title={item.title} aria-label={`${number}. ${item.title}${completed ? ' completed' : ''}`} className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${appearance}`}><Icon size={16} aria-hidden="true" /></span>}</li>;
      })}</ol>
    </div>
    <div role="progressbar" aria-label={`${label} completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`Phase ${current} of ${steps.length}: ${active.title}`} className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-900 transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
  </section>;
}
