export const SUPPORT_CATEGORIES = {
  marketplace: 'Student Market', residence: 'Rooms & resident verification', maintenance: 'Repairs & maintenance',
  account: 'Account & sign-in', payments: 'Payments & subscriptions', technical: 'Technical problem', other: 'Something else',
} as const;
export const SUPPORT_TYPES = { question: 'Ask a question', complaint: 'Make a complaint', report: 'Report a problem' } as const;
export const SUPPORT_STATUSES = { open: 'Open', in_progress: 'In progress', awaiting_user: 'Awaiting your reply', resolved: 'Resolved', closed: 'Closed' } as const;
export const SUPPORT_QUEUE_STATUSES = { ...SUPPORT_STATUSES, awaiting_user: 'Awaiting requester' } as const;
export function supportRequesterLabel(kind: string | null) {
  return ({ primary: 'PineVela user', resident: 'Resident', seller: 'Seller', manager: 'Manager', staff: 'Staff', admin: 'Administrator', officer: 'Field officer' } as Record<string, string>)[kind || ''] || 'Guest contact (unverified)';
}
export type SupportTicket = {
  id: string; reference: string; subject: string; category: keyof typeof SUPPORT_CATEGORIES; type: keyof typeof SUPPORT_TYPES;
  status: keyof typeof SUPPORT_STATUSES; priority: 'normal' | 'high'; requesterName: string; requesterEmail: string;
  requesterId: string | null; requesterKind: string | null; assignedTo: string | null; version: number;
  createdAt: string; updatedAt: string; source: string; messages?: SupportMessage[];
};
export type SupportMessage = { id: string; body: string; internal: boolean; authorName: string; authorRole: string; createdAt: string; emailStatus?: string | null };
