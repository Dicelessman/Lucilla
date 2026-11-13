import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSeedState } from './seedData.ts';
import { executeVoiceTool } from './voiceActions.ts';

test('executeVoiceTool log_meal records meal, awards XP, and detects red flags or duplicates', () => {
  const seed = createInitialSeedState();
  const res1 = executeVoiceTool(
    seed,
    'log_meal',
    {
      slot: 'pranzo',
      description: 'Frittata con 2 uova e spinaci',
      proteinCategory: 'uova',
      preHungerScale: 8,
      postSatietyScale: 5,
      slowEatingUsed: true,
    },
    '2026-11-13'
  );
  assert.equal(res1.toolResult.saved, true);
  assert.equal(res1.nextState.meals.length, seed.meals.length + 1);
  assert.equal(res1.nextState.xp, seed.xp + 15);

  const res2 = executeVoiceTool(
    res1.nextState,
    'log_meal',
    {
      slot: 'cena',
      description: '2 uova sode con zucchine e leggero rigurgito',
      proteinCategory: 'uova',
      symptomsReported: ['rigurgito'],
      preHungerScale: 8,
      postSatietyScale: 6,
      slowEatingUsed: true,
    },
    '2026-11-13'
  );
  assert.ok(res2.toolResult.duplicateCategoryWarning);
  assert.deepEqual(res2.toolResult.redFlagSymptoms, ['rigurgito']);
});

test('executeVoiceTool log_morning_checkin saves sleep & dream journal and returns <6h ghrelin alert', () => {
  const seed = createInitialSeedState();
  const res = executeVoiceTool(
    seed,
    'log_morning_checkin',
    {
      sleepHours: 5,
      sleepQuality: 2,
      dreamJournal: 'Sognavo di camminare su un sentiero alpino',
    },
    '2026-11-13'
  );
  assert.equal(res.toolResult.saved, true);
  const alert = res.toolResult.sleepAlert as { isShortSleep: boolean };
  assert.equal(alert.isShortSleep, true);
  const savedCheckin = res.nextState.checkins.find((c) => c.date === '2026-11-13');
  assert.equal(savedCheckin?.dreamJournal, 'Sognavo di camminare su un sentiero alpino');
});

test('executeVoiceTool log_sos_prova, update_wheel_area, and get_current_progress work accurately', () => {
  const seed = createInitialSeedState();
  const sosRes = executeVoiceTool(
    seed,
    'log_sos_prova',
    {
      situation: 'Fame nervosa alle 19',
      bodyZone: 'stomaco',
      emotionName: 'Stanchezza',
      intensityLevel: 4,
      hungerType: 'emotiva',
      realNeed: 'riposo',
      waitedMinutes: 10,
      outcome: 'onda_surfata',
    },
    '2026-11-13'
  );
  assert.equal(sosRes.nextState.sosLogs.length, seed.sosLogs.length + 1);
  assert.ok(sosRes.toolResult.clinicianContactIfNeeded);

  const wheelRes = executeVoiceTool(
    sosRes.nextState,
    'update_wheel_area',
    { areaId: 'salute_fisica', sa: 7, firstMicroStep: 'Camminata 30 min' },
    '2026-11-13'
  );
  assert.equal(wheelRes.uiCommand?.tab, 'pnl');

  const progRes = executeVoiceTool(wheelRes.nextState, 'get_current_progress', {}, '2026-11-13');
  assert.equal(progRes.toolResult.profileName, 'Davide Rossi');
});
