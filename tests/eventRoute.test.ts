import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventRoutePreview, DEFAULT_EVENT_ROUTE } from '../src/services/eventRoute.ts';

test('calcula os horários seguintes a partir da duração de cada etapa', () => {
  const preview = buildEventRoutePreview('2027-03-20T09:00:00-03:00', [
    { title: 'Campo', duration_minutes: 5 },
    { title: 'Procurado', duration_minutes: 10 },
    { title: 'Sepultamento', duration_minutes: 30 },
  ]);

  assert.equal(preview[0].starts_at, '2027-03-20T12:00:00.000Z');
  assert.equal(preview[0].ends_at, '2027-03-20T12:05:00.000Z');
  assert.equal(preview[2].ends_at, '2027-03-20T12:45:00.000Z');
});

test('o roteiro inicial contém todas as etapas enviadas pelo organizador', () => {
  assert.equal(DEFAULT_EVENT_ROUTE.length, 19);
  assert.equal(DEFAULT_EVENT_ROUTE[0].title, 'Campo');
  assert.equal(DEFAULT_EVENT_ROUTE.at(-1)?.title, 'Revelação Inimigo');
});

test('recusa etapa sem duração positiva', () => {
  assert.throws(
    () => buildEventRoutePreview('2027-03-20T09:00:00-03:00', [{ title: 'Selva', duration_minutes: 0 }]),
    /etapa 1/i
  );
});
