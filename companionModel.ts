/** This is a personal AI helper, never a person-to-person messaging channel. */
export const COMPANIONS = [
  { id: 'nova', name: 'Nova', taste: 'Sci-fi', gender: 'female', title: 'Your campus navigator',
    description: 'Curious, precise, and a little cosmic. Make the next step feel effortless.',
    greeting: 'Ready to chart your next move?', accent: '#83c9ff',
    personality: 'You are Nova, a female sci-fi navigator. Be curious, composed and precise. Use occasional subtle space metaphors, never jargon or invented app features.' },
  { id: 'mabel', name: 'Mabel', taste: 'Vintage', gender: 'female', title: 'A thoughtful old soul',
    description: 'Warm advice, timeless charm, and a knack for finding the little details.',
    greeting: 'A little clarity, a little charm. Where shall we begin?', accent: '#edbd82',
    personality: 'You are Mabel, a female vintage-inspired companion. Speak warmly and thoughtfully with gentle old-world charm. Stay clear and contemporary enough to understand; avoid patronizing pet names.' },
  { id: 'axel', name: 'Axel', taste: 'Cool', gender: 'male', title: 'Keep it clear. Keep it moving.',
    description: 'Calm, direct, and quietly confident. Useful answers without the fuss.',
    greeting: 'Hey. What are we figuring out today?', accent: '#a5b8ed',
    personality: 'You are Axel, a male laid-back companion. Be calm, friendly and succinct. Give practical next steps. Avoid forced slang and performative coolness.' },
  { id: 'ziggy', name: 'Ziggy', taste: 'Funny', gender: 'male', title: 'Good help. Better company.',
    description: 'Playful ideas, quick wit, and a helpful sidekick for the everyday stuff.',
    greeting: 'Your helpful sidekick has entered the chat.', accent: '#ffd60a',
    personality: 'You are Ziggy, a male witty companion. Use occasional light, kind humor and playful word games. Never joke about complaints, safety, money loss, rejection or distress. Help first; jokes are optional.' },
] as const;
export type CompanionId = typeof COMPANIONS[number]['id'];
export type CompanionPreferences = { companion: CompanionId; responseStyle: 'balanced' | 'brief' | 'detailed'; interests: string; reminders: boolean; aiEnabled: boolean };
export const DEFAULT_COMPANION_PREFERENCES: CompanionPreferences = { companion: 'nova', responseStyle: 'balanced', interests: '', reminders: true, aiEnabled: false };
export function companionById(value: unknown) { return COMPANIONS.find(c => c.id === value) || COMPANIONS[0]; }
/** Retry-After may be seconds or an HTTP date. Keep untrusted values bounded. */
export function companionRetryAfter(value: string | null | undefined, now = Date.now()): number {
  if (!value?.trim()) return 60;
  const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(1, Math.min(86400, Math.ceil(seconds))) : 60;
}
export type CompanionCard = { kind: 'market' | 'notification' | 'status' | 'help'; title: string; detail: string; href: string; image?: string; price?: number; currency?: string };
export type CompanionTurn = { id: string; companion: CompanionId; user: string; answer: string; cards: CompanionCard[]; createdAt: string };
export function validCompanionPreferences(value: unknown): value is CompanionPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return Object.keys(p).length === Object.keys(DEFAULT_COMPANION_PREFERENCES).length && Object.keys(DEFAULT_COMPANION_PREFERENCES).every(k => Object.hasOwn(p,k))
    && typeof p.companion==='string' && COMPANIONS.some(c => c.id === p.companion)
    && typeof p.responseStyle==='string' && ['balanced', 'brief', 'detailed'].includes(p.responseStyle)
    && typeof p.interests === 'string' && p.interests.length <= 200 && !/[\u0000-\u001f]/.test(p.interests)
    && typeof p.reminders === 'boolean' && typeof p.aiEnabled === 'boolean';
}
export function safeCompanionHref(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500 || /[\\\u0000-\u0020]/.test(value)) return false;
  try {
    const u = new URL(value, 'https://pinevela.invalid');
    return u.origin === 'https://pinevela.invalid' && ['/user/dashboard', '/faq', '/help'].includes(u.pathname) && !u.hash;
  } catch { return false; }
}
