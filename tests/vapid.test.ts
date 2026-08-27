import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeVapidPublicKey,
  vapidPublicKeyToUint8Array,
} from '../src/services/vapid.ts';

const VALID_PUBLIC_KEY =
  'BDhj_O551j3a0UxulZpmYMXDOLofdm4dC9at8ElWUwDLbO8SK6MUPfFJMOEJ-VHfVWIfJMHxranvMTQHxR1foyM';

test('normaliza uma chave VAPID pública válida', () => {
  assert.equal(normalizeVapidPublicKey(VALID_PUBLIC_KEY), VALID_PUBLIC_KEY);
  assert.equal(vapidPublicKeyToUint8Array(VALID_PUBLIC_KEY).length, 65);
});

test('ignora texto copiado acidentalmente após a chave VAPID', () => {
  assert.equal(
    normalizeVapidPublicKey(`${VALID_PUBLIC_KEY} debugger eval code:22:47`),
    VALID_PUBLIC_KEY
  );
});

test('aceita aspas e espaços ao redor da chave VAPID', () => {
  assert.equal(normalizeVapidPublicKey(`  "${VALID_PUBLIC_KEY}"  `), VALID_PUBLIC_KEY);
});

test('rejeita placeholder e chaves malformadas', () => {
  assert.equal(normalizeVapidPublicKey('SUA_CHAVE_VAPID_PUBLICA'), null);
  assert.equal(normalizeVapidPublicKey('abc123'), null);
  assert.throws(
    () => vapidPublicKeyToUint8Array('abc123'),
    /formato inválido/
  );
});
