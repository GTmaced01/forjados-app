const SENSITIVE_LOCAL_KEYS = new Set([
  'forjados-active-tab',
  'forjados_treasury_receipts_cache',
]);

const SENSITIVE_PREFIXES = [
  'forjados_profile_cache_v1_',
  'forjados_treasury_',
  'forjados_offline_v1_',
];

function shouldRemove(key: string) {
  return (
    SENSITIVE_LOCAL_KEYS.has(key) ||
    SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export function clearSensitiveLocalData() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && shouldRemove(key)) localStorage.removeItem(key);
    }

    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith('forjados_') || key?.startsWith('forjados-')) {
        sessionStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('Não foi possível limpar todos os dados locais da sessão:', error);
  }
}
