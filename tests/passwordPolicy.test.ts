import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStrongPassword,
  getPasswordRequirements,
  PASSWORD_MIN_LENGTH,
} from '../src/services/passwordPolicy.ts';

test('aceita uma senha que cumpre todos os requisitos', () => {
  assert.doesNotThrow(() => assertStrongPassword('Graça#2026Forte'));
});

test('exige o comprimento mínimo definido', () => {
  const lengthRequirement = getPasswordRequirements('Aa#1').find(({ id }) => id === 'length');
  assert.equal(lengthRequirement?.met, false);
  assert.equal(PASSWORD_MIN_LENGTH, 10);
});

test('rejeita senha comum mesmo quando atende às categorias', () => {
  assert.throws(() => assertStrongPassword('Senha#1234'), /não ser uma senha comum/i);
});

test('exige letras maiúsculas, minúsculas, número e símbolo', () => {
  const requirements = getPasswordRequirements('abcdefghij');
  const unmetIds = requirements.filter(({ met }) => !met).map(({ id }) => id);
  assert.deepEqual(unmetIds, ['uppercase', 'number', 'symbol']);
});
