const CACHE_VERSION = 'v1';
const PREFIX = `forjados_offline_${CACHE_VERSION}_`;

type CachedEnvelope<T> = {
  savedAt: string;
  value: T;
};

function key(scope: string, userId?: string | null) {
  return `${PREFIX}${scope}_${userId || 'public'}`;
}

export function saveOfflineData<T>(scope: string, value: T, userId?: string | null) {
  try {
    const envelope: CachedEnvelope<T> = { savedAt: new Date().toISOString(), value };
    localStorage.setItem(key(scope, userId), JSON.stringify(envelope));
  } catch (error) {
    console.warn(`Cache offline indisponível (${scope}):`, error);
  }
}

export function readOfflineData<T>(scope: string, userId?: string | null): T | null {
  try {
    const raw = localStorage.getItem(key(scope, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEnvelope<T>;
    return parsed?.value ?? null;
  } catch (error) {
    console.warn(`Cache offline inválido (${scope}):`, error);
    return null;
  }
}

export function isOfflineError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return !navigator.onLine || /failed to fetch|network|tempo limite|fetch/i.test(message);
}
