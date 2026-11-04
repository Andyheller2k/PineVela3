/** Build-time preview boundary. This is not a session or an authorization signal. */
declare const __PINEVELA_NATIVE_PREVIEW__: boolean;
declare const __PINEVELA_NATIVE_APP__: boolean;
export const NATIVE_APP = typeof __PINEVELA_NATIVE_APP__ !== 'undefined'
  && __PINEVELA_NATIVE_APP__ === true;
export const NATIVE_PREVIEW = typeof __PINEVELA_NATIVE_PREVIEW__ !== 'undefined'
  && __PINEVELA_NATIVE_PREVIEW__ === true;

export const NATIVE_PREVIEW_MESSAGE = 'Android preview: account access will be connected in the next step.';

export function nativePreviewUnavailable(): never {
  throw new Error(NATIVE_PREVIEW_MESSAGE);
}
