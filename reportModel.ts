export const REPORT_TARGETS = { profile: 'Profile', store: 'Store', listing: 'Item or service', message: 'Message' } as const;
export const REPORT_REASONS = {
  fake_item: 'Fake or misleading item', broken_item: 'Broken, damaged or unsuitable item',
  false_name: 'False name', false_identity: 'False identity or impersonation', false_location: 'False location',
  scam: 'Scam or suspected fraud', harassment: 'Harassment or abusive behaviour', unsafe: 'Unsafe or prohibited activity', other: 'Something else',
} as const;
export const REPORT_ACTIONS = {
  no_action: 'No action recommended', warning: 'Warning', ban: 'Timed account ban', restrict: 'Account restrictions',
  restore: 'Restore access', delete: 'Account deletion review', remove_listing: 'Remove an item or service',
} as const;
export const REPORT_STATUSES = { submitted: 'Submitted to customer service', recommended: 'Awaiting administrator review', escalated: 'Escalated to administrators', dismissed: 'Review closed' } as const;
export type ReportTargetType = keyof typeof REPORT_TARGETS;
export type ReportReason = keyof typeof REPORT_REASONS;
export type ReportAction = keyof typeof REPORT_ACTIONS;
export type EntityReport = {
  ticketId: string; targetType: ReportTargetType; targetId: string; targetName: string;
  targetContextId: string; targetKind: string; reason: ReportReason; details: string;
  status: keyof typeof REPORT_STATUSES; version: number; createdAt?: string;
  evidence?: { messageId: string; text: string; encrypted: boolean; createdAt: string; senderName: string } | null;
  recommendation?: { id: string; action: ReportAction; reason: string; by: string; createdAt: string } | null;
  decision?: { decision: 'dismiss' | 'escalate'; reason: string; by: string; createdAt: string; proposalId?: string | null } | null;
};
