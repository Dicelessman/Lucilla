import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fromFirestoreDocument,
  fromFirestoreValue,
  toFirestoreFields,
  toFirestoreValue,
} from './serverFirebase.ts';

test('toFirestoreValue encodes primitives, arrays, and nested maps cleanly', () => {
  assert.deepEqual(toFirestoreValue('Davide'), { stringValue: 'Davide' });
  assert.deepEqual(toFirestoreValue(225), { integerValue: '225' });
  assert.deepEqual(toFirestoreValue(123.8), { doubleValue: 123.8 });
  assert.deepEqual(toFirestoreValue(true), { booleanValue: true });
  assert.deepEqual(toFirestoreValue(null), { nullValue: null });

  const nested = toFirestoreValue({
    tags: ['slow', 'acqua'],
    meta: { count: 2, ratio: 0.5 },
  });
  assert.deepEqual(nested, {
    mapValue: {
      fields: {
        tags: {
          arrayValue: {
            values: [{ stringValue: 'slow' }, { stringValue: 'acqua' }],
          },
        },
        meta: {
          mapValue: {
            fields: {
              count: { integerValue: '2' },
              ratio: { doubleValue: 0.5 },
            },
          },
        },
      },
    },
  });
});

test('toFirestoreFields skips undefined properties and round-trips through fromFirestoreDocument', () => {
  const fields = toFirestoreFields({
    id: 'meal_1',
    weightKg: 123.8,
    xp: 240,
    slowEatingUsed: true,
    notes: undefined,
    symptomsReported: ['nessuno'],
    measures: { umbilical: 131 },
  });

  assert.equal('notes' in fields, false);

  const decoded = fromFirestoreDocument({ fields });
  assert.deepEqual(decoded, {
    id: 'meal_1',
    weightKg: 123.8,
    xp: 240,
    slowEatingUsed: true,
    symptomsReported: ['nessuno'],
    measures: { umbilical: 131 },
  });
});

test('fromFirestoreValue handles timestampValue and empty containers', () => {
  assert.equal(fromFirestoreValue({ timestampValue: '2026-11-13T10:00:00Z' }), '2026-11-13T10:00:00Z');
  assert.deepEqual(fromFirestoreValue({ arrayValue: {} }), []);
  assert.deepEqual(fromFirestoreValue({ mapValue: {} }), {});
});
