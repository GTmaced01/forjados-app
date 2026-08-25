export const PASSWORD_RECOVERY_PATH = '/recuperar-senha';

type AuthCallbackLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

function getHashParams(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, ''));
}

export function isPasswordRecoveryUrl(location: AuthCallbackLocation) {
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const searchParams = new URLSearchParams(location.search);
  const hashParams = getHashParams(location.hash);

  return (
    pathname === PASSWORD_RECOVERY_PATH ||
    searchParams.get('password-recovery') === '1' ||
    searchParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery'
  );
}
