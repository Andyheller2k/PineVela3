import type { CompanionId, CompanionPreferences } from '../companionModel.js';

const refusals: Record<CompanionId, string> = {
  nova: 'That mission is outside my orbit. I’m your PineVela friend and guide: I can help with the app, chat, play a short word game or share a little trivia.',
  mabel: 'Let’s keep our little corner for PineVela, friendly conversation, quick trivia and a game or two. I can help you find your way around the app.',
  axel: 'I’m here for PineVela, friendly chats, quick trivia and short games. Coding, essays and creating or editing files aren’t part of my role. What can I help you find in the app?',
  ziggy: 'That’s a job for a different toolkit! I’m your PineVela sidekick for app questions, friendly chats, quick trivia and little games. Shall we try one of those?',
};
export function companionScopeReply(question: string, companion: CompanionId): string | undefined {
  const work = /\b(?:debug|refactor|compile|programming|code\s+review)\b|\b(?:write|generate|build|create|fix|review|implement|explain|optimi[sz]e)\b[\s\S]{0,100}\b(?:code|script|algorithm|python|javascript|typescript|react|sql|html|css|website|software|api|regex)\b|```/i;
  const writing = /\b(?:write|draft|generate|complete|compose|prepare|produce)\b[\s\S]{0,80}\b(?:essay|assignment|dissertation|thesis|research\s+paper|report|cover\s+letter|resume|novel|ebook)\b|\b\d{3,}\s*(?:words?|pages?)\b/i;
  const creation = /\b(?:edit|modify|create|generate|render|produce|make|design|rewrite|translate)\s+(?:(?:this|that|the|a|an|my|me\s+an?|me\s+this)\s+)?(?:file|pdf|document|slides?|presentation|video|movie|image|photo|logo|animation|music|audio|website|spreadsheet|essay)\b/i;
  // Reporting an app issue and activation/verification codes remain supported.
  const appReport = /\b(?:report|complaint|support)\b/i.test(question) && /\b(?:pinevela|order|seller|store|room|staff|profile|marketplace)\b/i.test(question);
  if (work.test(question) || (!appReport && writing.test(question)) || creation.test(question)) return refusals[companion];
  return undefined;
}
/** A server cap applies even if a provider ignores the requested reply length. */
export function companionAnswer(text: string, preferences: CompanionPreferences): string {
  if (/```|\b(?:function\s+\w+\s*\(|(?:const|let)\s+\w+\s*=|import\s+.+\s+from\s+['"])/.test(text)) return refusals[preferences.companion];
  const maximum = preferences.responseStyle === 'brief' ? 70 : preferences.responseStyle === 'detailed' ? 200 : 130;
  const words = text.trim().split(/\s+/);
  if (words.length <= maximum) return text.trim();
  const clipped = words.slice(0, maximum).join(' ');
  const end = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '));
  return end > clipped.length / 2 ? clipped.slice(0, end + 1) : clipped.replace(/[,;:]$/, '') + '…';
}
