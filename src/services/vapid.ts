const VAPID_KEY_PATTERN = /[A-Za-z0-9_-]{80,120}={0,2}/g;
const VAPID_PUBLIC_KEY_BYTES = 65;

function decodeBase64Url(value: string) {
  const unpadded = value.replace(/=+$/g, '');
  const padding = '='.repeat((4 - (unpadded.length % 4)) % 4);
  const base64 = `${unpadded}${padding}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = globalThis.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

/**
 * VAPID public keys are unpadded Base64 URL-safe P-256 public keys.
 * The normalizer deliberately extracts only a valid 65-byte key so an
 * accidental quote, whitespace or copied console suffix cannot break push.
 */
export function normalizeVapidPublicKey(rawValue?: string | null) {
  if (!rawValue?.trim()) return null;

  const candidates = rawValue.match(VAPID_KEY_PATTERN) || [];

  for (const candidate of candidates) {
    const normalized = candidate.replace(/=+$/g, '');

    try {
      const bytes = decodeBase64Url(normalized);
      if (
        bytes.length === VAPID_PUBLIC_KEY_BYTES &&
        bytes[0] === 0x04
      ) {
        return normalized;
      }
    } catch {
      // Keep looking for a valid key in the configured value.
    }
  }

  return null;
}

export function vapidPublicKeyToUint8Array(rawValue: string) {
  const normalized = normalizeVapidPublicKey(rawValue);
  if (!normalized) {
    throw new Error('A chave pública de notificações está em formato inválido.');
  }

  return decodeBase64Url(normalized);
}
