import { NATIVE_APP } from '../native/environment';

/** Invitation links must reach PineVela, never the app's local asset origin. */
export function publicAppBase(): string {
  return NATIVE_APP ? 'https://pinevela.app/' : window.location.origin + window.location.pathname;
}
