import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SUPPORT_FAQ_CATEGORIES,
  SUPPORT_FAQ_ITEMS,
  filterSupportFaq,
} from '../src/content/supportFaq.ts';

test('mantém as categorias e dúvidas essenciais da central de ajuda', () => {
  const categories = new Set(SUPPORT_FAQ_CATEGORIES.map((category) => category.id));
  for (const expected of ['access', 'registration', 'events', 'profile', 'notifications', 'privacy']) {
    assert.equal(categories.has(expected as never), true);
  }

  assert.equal(SUPPORT_FAQ_ITEMS.length >= 7, true);
  assert.equal(SUPPORT_FAQ_ITEMS.every((item) => item.steps.length >= 3), true);
  assert.equal(SUPPORT_FAQ_ITEMS.every((item) => item.visualSteps.length === 3), true);
});

test('busca sem diferenciar acentos ou maiúsculas', () => {
  const results = filterSupportFaq(SUPPORT_FAQ_ITEMS, 'INSCRICAO', 'all');
  assert.equal(results.some((item) => item.id === 'event-inscription'), true);
});

test('combina busca e categoria e permite limpar os filtros', () => {
  const notifications = filterSupportFaq(SUPPORT_FAQ_ITEMS, 'permissao', 'notifications');
  assert.deepEqual(notifications.map((item) => item.id), ['enable-notifications']);

  const all = filterSupportFaq(SUPPORT_FAQ_ITEMS, '', 'all');
  assert.equal(all.length, SUPPORT_FAQ_ITEMS.length);
});

test('não encontra conteúdo fora da categoria selecionada', () => {
  assert.deepEqual(filterSupportFaq(SUPPORT_FAQ_ITEMS, 'senha', 'events'), []);
});
