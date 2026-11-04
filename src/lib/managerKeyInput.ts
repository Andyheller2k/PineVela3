/** New six-digit codes and previously saved 32-byte base64url keys coexist. */
export function normalizeManagerKeyInput(value: string): string {
  const key = value.trim();
  if (!/^(?:[0-9]{6}|[A-Za-z0-9_-]{43})$/.test(key))
    throw new Error('Invalid manager secret key or code. Enter your six-digit code or paste your existing saved key.');
  return key;
}
