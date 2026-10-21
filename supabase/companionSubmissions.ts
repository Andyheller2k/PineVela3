import type { CompanionCard } from '../companionModel.js';

type Account = { status: string; enrollmentStatus?: string | null } | null;
type Registrations = {
  managerAccount: Account;
  residentAccount: Account;
  enrollments: { kind: string; status: string; account_id: string | null }[];
};
type MerchantAccount = { status: string; enrollment_status: string | null } | undefined;
type Submission = { kind: 'manager' | 'resident' | 'merchant'; type: string; status: string | null };

/** Select a live lookup for personal status questions, never for general onboarding advice. */
export function isCompanionSubmissionQuestion(text: string): boolean {
  const personal = /\b(?:my|mine|me|i|our)\b/i.test(text);
  const subject = /\b(?:submissions?|applications?|registrations?|enrollments?|accounts?|merchant|seller|manager|resident)\b/i.test(text);
  const status = /\b(?:status|approved|approval|pending|rejected|verified|verification|active|activated|submitted|registered|progress|decision|exists?|have|missing|no)\b/i.test(text);
  const lookup = /\b(?:check|show|view|track|look\s*up)\b/i.test(text);
  return personal && subject && (status || lookup)
    || lookup && /\b(?:submissions?|applications?|registrations?|enrollments?)\b/i.test(text)
    || /\b(?:merchant|seller|manager|resident)\b/i.test(text) && /\b(?:account|application|registration)\b/i.test(text) && /\b(?:no|missing|not found)\b/i.test(text)
    || personal && /\b(?:am\s+i|i\s+am|i['’]m|have\s+i)\b/i.test(text) && /\b(?:approved|verified|registered|submitted)\b/i.test(text);
}

/** Older model-written status text is presented using its original verified cards. */
export function companionRecordedStatusAnswer(answer: string, cards: CompanionCard[]): string {
  const statuses = cards.filter(c => c.kind === 'status');
  const lines = statuses.map(c => `${c.title}: ${c.detail}.`);
  return lines.length && !lines.every(line => answer.includes(line)) ? lines.join('\n') : answer;
}

/** Sentences and cards share the same session-scoped records. The model cannot rename an approval. */
export function companionSubmissionResult(
  registrations: Registrations,
  seller: { application: { status: string } | null },
  merchantAccount: MerchantAccount,
) {
  const human = (status: string) => status.replaceAll('_', ' ');
  const pendingEmail = (kind: string) => registrations.enrollments.some(e => e.kind === kind && !e.account_id && e.status === 'pending_email');
  const accountStatus = (account: Account, kind: string) => account
    ? account.enrollmentStatus === 'pending_email' ? 'Email confirmation required' : human(account.status)
    : pendingEmail(kind) ? 'Email confirmation required' : null;
  const submissions: Submission[] = [
    { kind: 'manager', type: 'Manager registration', status: accountStatus(registrations.managerAccount, 'manager') },
    { kind: 'resident', type: 'Resident registration', status: accountStatus(registrations.residentAccount, 'resident') },
    { kind: 'merchant', type: seller.application ? 'Merchant application' : 'Merchant registration',
      status: seller.application ? human(seller.application.status)
        : merchantAccount?.enrollment_status === 'pending_email' || pendingEmail('seller') ? 'Email confirmation required'
        : merchantAccount ? merchantAccount.status === 'pending' ? 'Application not submitted' : `Account ${human(merchantAccount.status)}; no current application`
        : null },
  ];
  const cards: CompanionCard[] = submissions.filter(s => s.status !== null).map(s => ({
    kind: 'status', title: s.type, detail: s.status!, href: '/user/dashboard?tab=home',
  }));
  const answer = submissions.map(s => s.status !== null ? `${s.type}: ${s.status}.`
    : s.kind === 'merchant' ? 'No merchant account or application was found.'
    : `No ${s.kind} registration was found.`).join('\n');
  return { answer, cards, summary: { submissions: submissions.map(s => ({ ...s, found: s.status !== null })) } };
}
