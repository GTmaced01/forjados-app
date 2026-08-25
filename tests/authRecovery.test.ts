import assert from 'node:assert/strict';
import test from 'node:test';
import { isPasswordRecoveryUrl, PASSWORD_RECOVERY_PATH } from '../src/services/authRecovery.ts';

function callbackLocation(pathname = '/', search = '', hash = '') {
  return { pathname, search, hash } as Location;
}

test('reconhece a rota dedicada de recuperação', () => {
  assert.equal(isPasswordRecoveryUrl(callbackLocation(PASSWORD_RECOVERY_PATH)), true);
  assert.equal(isPasswordRecoveryUrl(callbackLocation(`${PASSWORD_RECOVERY_PATH}/`)), true);
});

test('mantém compatibilidade com o link antigo por query string', () => {
  assert.equal(isPasswordRecoveryUrl(callbackLocation('/', '?password-recovery=1')), true);
});

test('reconhece o callback implícito do Supabase no hash', () => {
  assert.equal(
    isPasswordRecoveryUrl(callbackLocation('/', '', '#access_token=token&type=recovery')),
    true,
  );
});

test('não confunde login comum com recuperação de senha', () => {
  assert.equal(isPasswordRecoveryUrl(callbackLocation('/')), false);
  assert.equal(isPasswordRecoveryUrl(callbackLocation('/', '', '#type=signup')), false);
});
