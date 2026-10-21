import crypto from 'node:crypto';
import { ApiError } from './db.js';

export const SAFETY_POLICY = 'pinevela-nsfw-v1';
export const SAFETY_MODEL = 'omni-moderation-latest';
export type SafetyPurpose = 'market_image' | 'avatar' | 'listing_text' | 'store_text';
export type SafetyVerdict = 'approved' | 'blocked' | 'review';
export const safetyDigest = (input: string | Buffer) => crypto.createHash('sha256').update(input).digest('hex');
function value(input: unknown, maximum: number, optional = false) {
  if (optional && input == null) return '';
  if (typeof input !== 'string' || input.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input))
    throw new ApiError(400, 'Enter valid marketplace text.');
  return input.trim();
}
/** Matches PostgreSQL array_to_json(text[]) exactly, including Unicode and newlines. */
export function listingSafetyText(input: any) {
  const options = input.priceCategories ?? [];
  if (!Array.isArray(options) || options.length > 4) throw new ApiError(400, 'Choose at most four price options.');
  return JSON.stringify([value(input.title, 200), value(input.description, 4000), value(input.category, 200),
    value(input.serviceCategory, 200, true), value(input.location ?? input.meetingLocation, 600, true),
    ...options.map((option: any) => value(option?.name, 120))]);
}
export function storeSafetyText(input: any) {
  return JSON.stringify([value(input.storeName, 200), value(input.username, 120), value(input.description, 4000, true),
    value(input.category, 200), value(input.location, 600)]);
}
/** Known/suspected child sexual material must not be sent to this general API.
 * This text guard is not a child-abuse image detector. */
export function childSafetyConcern(text: string) {
  return /(?:\b(?:child(?:ren)?|underage|minor|preteen|under[ -]?18)\b.{0,80}\b(?:porn(?:ography)?|nudes?|sexual|sex[ -]?video))|(?:\b(?:porn(?:ography)?|nudes?|sexual|sex[ -]?video)\b.{0,80}\b(?:child(?:ren)?|underage|minor|preteen|under[ -]?18)\b)/is.test(text);
}
export function safetyVerdict(result: any): { verdict: SafetyVerdict; sexualScore: number } {
  const score = result?.category_scores?.sexual;
  if (typeof result?.categories?.sexual !== 'boolean' || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)
    throw new ApiError(503, 'Content checking is temporarily unavailable. Please retry shortly.', 'moderation_unavailable');
  // Provider flags enforce the NSFW policy. Scores only select additional human
  // review; they are not a calibrated probability or grounds for an account ban.
  return { verdict: result.categories.sexual || result.categories['sexual/minors'] === true ? 'blocked' : score >= 0.2 ? 'review' : 'approved', sexualScore: score };
}
