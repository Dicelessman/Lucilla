import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDailyCheckinRewards,
  calculateBmi,
  calculateSosXp,
  calculateWeeklyMovementAndHydration,
  calculateWeeklyProteinCounts,
  detectAvoidItems,
  detectCommand,
  detectRedFlags,
  detectSlipUpPhrase,
  detectSosPhrase,
  evaluateSleepBiology,
  getLearningStage,
  validateMealAgainstPlan,
} from './bariclipRules.ts';
import { generateBardhoMarkdownReport } from './reportGenerator.ts';
import { createInitialSeedState, DEFAULT_BADGES } from './seedData.ts';

test('validateMealAgainstPlan flags same-day repetition of eggs, cheese, cold cuts, legumes, or tofu', () => {
  const existing = [
    {
      id: '1',
      date: '2026-11-10',
      time: '13:00',
      slot: 'pranzo' as const,
      description: 'Frittata con 2 uova e spinaci',
      proteinCategory: 'uova' as const,
      hasVegetables: true,
      preHungerScale: 8,
      postSatietyScale: 5,
      perceivedEnergy: 4,
      slowEatingUsed: true,
      slowMotionSecondsUsed: true,
      leftABite: false,
      symptomsReported: [],
    },
  ];

  const repeatResult = validateMealAgainstPlan(
    {
      date: '2026-11-10',
      time: '20:00',
      slot: 'cena',
      description: '2 uova sode con insalata',
      proteinCategory: 'uova',
      hasVegetables: true,
      preHungerScale: 8,
      postSatietyScale: 6,
      perceivedEnergy: 4,
      slowEatingUsed: true,
      slowMotionSecondsUsed: true,
      leftABite: false,
      symptomsReported: [],
    },
    existing
  );
  assert.ok(repeatResult.duplicateCategoryWarning, 'Expected duplicate eggs warning on same day');

  const okResult = validateMealAgainstPlan(
    {
      date: '2026-11-10',
      time: '20:00',
      slot: 'cena',
      description: 'Orata al forno 220g con zucchine',
      proteinCategory: 'pesce',
      hasVegetables: true,
      preHungerScale: 8,
      postSatietyScale: 5,
      perceivedEnergy: 5,
      slowEatingUsed: true,
      slowMotionSecondsUsed: true,
      leftABite: false,
      symptomsReported: [],
    },
    existing
  );
  assert.equal(okResult.duplicateCategoryWarning, null);
});

test('detectRedFlags catches Bariclip symptoms (vomito, rigurgito, bruciore, disfagia)', () => {
  const flags = detectRedFlags('Dopo cena ho avuto un po di rigurgito e bruciore');
  assert.deepEqual(flags.sort(), ['bruciore', 'rigurgito']);

  const emptyFlags = detectRedFlags('Cena leggera e lenta, tutto sereno');
  assert.deepEqual(emptyFlags, []);
});

test('detectAvoidItems and detectSlipUpPhrase and detectSosPhrase behave accurately', () => {
  assert.deepEqual(detectAvoidItems('Ho bevuto una birra con patatine fritte'), [
    'alcol',
    'cibi fritti o molto grassi',
  ]);
  assert.equal(detectSlipUpPhrase('Oggi ho rovinato tutto con quei biscotti'), true);
  assert.equal(detectSlipUpPhrase('Ho mangiato con calma'), false);
  assert.equal(detectSosPhrase('Sto per aprire il frigo e ho voglia di dolce'), true);
  assert.equal(detectCommand('/sos aiuto'), '/sos');
  assert.equal(detectCommand('/ruota'), '/ruota');
  assert.equal(detectCommand('/report_bardho'), '/report_bardho');
  assert.equal(detectCommand('ciao Lucilla'), null);
});

test('evaluateSleepBiology triggers Ghrelin/Leptin biological alert under 6 hours', () => {
  const alert = evaluateSleepBiology(5.0);
  assert.equal(alert.isShortSleep, true);
  assert.match(alert.physiologySummary, /\+28%/);
  assert.match(alert.physiologySummary, /-18%/);
  assert.match(alert.physiologySummary, /\+385 kcal/);

  const normal = evaluateSleepBiology(7.0);
  assert.equal(normal.isShortSleep, false);
});

test('getLearningStage and calculateSosXp progress properly across NLP 4 stages', () => {
  assert.equal(getLearningStage(50).stageNumber, 1);
  assert.equal(getLearningStage(200).stageNumber, 2);
  assert.equal(getLearningStage(500).stageNumber, 3);
  assert.equal(getLearningStage(900).stageNumber, 4);
  assert.equal(calculateSosXp(3, 10, true), 75);
});

test('calculateBmi and calculateWeeklyProteinCounts and report generation', () => {
  assert.equal(calculateBmi(126, 184), 37.2);
  const seed = createInitialSeedState();
  const counts = calculateWeeklyProteinCounts(seed.meals, new Date().toISOString().slice(0, 10));
  const pesce = counts.find((c) => c.category === 'pesce');
  assert.ok(pesce && pesce.current >= 1);

  const md = generateBardhoMarkdownReport(seed);
  assert.match(md, /Davide Rossi/);
  assert.match(md, /Dott\.ssa Elida Bardho/);
  assert.match(md, /Registro delle Prove/);
  assert.match(md, /Diario Visite Cliniche/);
});

test('applyDailyCheckinRewards awards hydration +10 XP once and unlocks stanza_natura at 150 weekly minutes', () => {
  const freshBadges = DEFAULT_BADGES.map((b) => ({
    ...b,
    unlockedAt: undefined,
  }));
  const existing = [
    {
      id: 'chk_2026-11-09',
      date: '2026-11-09',
      movementMinutes: 90,
    },
  ];

  // First save hitting 6+ glasses + away from meals AND 60 more min (90 + 60 = 150 weekly min)
  const first = applyDailyCheckinRewards(
    existing,
    {
      id: 'chk_2026-11-11',
      date: '2026-11-11',
      hydrationGlasses: 6,
      hydrationAwayFromMealsDone: true,
      movementMinutes: 60,
      sleepHours: 5.5,
      afternoonParachuteDone: true,
    },
    100,
    freshBadges,
    '2026-11-11'
  );

  // +10 hydration + 30 stanza_natura + 15 stanza_cura = +55 XP
  assert.equal(first.xpGained, 55);
  assert.equal(first.updatedCheckin.hydrationXpAwarded, true);
  assert.ok(first.nextBadges.find((b) => b.id === 'stanza_natura')?.unlockedAt);
  assert.ok(first.nextBadges.find((b) => b.id === 'stanza_cura')?.unlockedAt);

  // Repeating hydration increment to 7 glasses same day must NOT re-award +10 XP
  const second = applyDailyCheckinRewards(
    first.nextCheckins,
    { ...first.updatedCheckin, hydrationGlasses: 7 },
    first.nextXp,
    first.nextBadges,
    '2026-11-11'
  );
  assert.equal(second.xpGained, 0);

  const weekly = calculateWeeklyMovementAndHydration(second.nextCheckins, '2026-11-11');
  assert.equal(weekly.weeklyMovementMinutes, 150);
  assert.equal(weekly.todayHydrationGlasses, 7);
});
