import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicDreamInsight,
  buildDeterministicQuickMealIdeas,
  buildPnlAudioScriptText,
  filterMealsByPeriodAndQuery,
  generateWeeklyBriefing,
  generateWeeklyMealPlan,
  generateWeeklyRoutinesIcs,
} from './insightsAndPlanner.ts';
import { createInitialSeedState } from './seedData.ts';
import { MealEntry } from '../types/coach.ts';

describe('insightsAndPlanner', () => {
  it('generateWeeklyMealPlan respects Sunday primo exclusion and same-day protein non-repetition', () => {
    // 2026-11-09 is a Monday
    const monday = '2026-11-09';
    const meals: MealEntry[] = [
      {
        id: 'm_test_1',
        date: monday,
        time: '13:00',
        slot: 'pranzo',
        description: 'Frittata',
        proteinCategory: 'uova',
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

    const plan = generateWeeklyMealPlan(meals, monday);
    assert.ok(plan.remainingCount > 0);
    assert.ok(plan.shoppingList.length > 0);

    // Ensure uova is not suggested again since target is 1/week, and no primo is placed on Sunday (2026-11-15)
    const sundaySuggestions = plan.suggestions.filter((s) => s.date === '2026-11-15');
    for (const s of sundaySuggestions) {
      assert.notEqual(s.proteinCategory, 'primo');
    }

    // Ensure pasto_libero is only placed on Sunday cena if scheduled
    const pastoLibero = plan.suggestions.find((s) => s.proteinCategory === 'pasto_libero');
    if (pastoLibero) {
      assert.equal(pastoLibero.date, '2026-11-15');
      assert.equal(pastoLibero.slot, 'cena');
    }

    // Ensure no protected category repeats on the same date
    const byDate = new Map<string, string[]>();
    for (const s of plan.suggestions) {
      const list = byDate.get(s.date) ?? [];
      list.push(s.proteinCategory);
      byDate.set(s.date, list);
    }
    for (const cats of byDate.values()) {
      for (const p of ['uova', 'formaggio', 'affettato', 'legumi', 'tofu_seitan']) {
        assert.ok(cats.filter((c) => c === p).length <= 1);
      }
    }
  });

  it('generateWeeklyBriefing computes sleep-SOS correlation and tape measure deltas', () => {
    const state = createInitialSeedState();
    const briefing = generateWeeklyBriefing(state);

    assert.ok(briefing.insights.length >= 3);
    assert.ok(briefing.measuresDelta.weightDeltaKg !== null && briefing.measuresDelta.weightDeltaKg < 0);
    assert.ok(
      briefing.measuresDelta.umbilicalDeltaCm !== null && briefing.measuresDelta.umbilicalDeltaCm < 0
    );
    assert.ok(briefing.insights.some((i) => i.id === 'sleep_sos'));
    assert.ok(briefing.insights.some((i) => i.id === 'tape_delta'));
  });

  it('generateWeeklyRoutinesIcs generates valid RFC-5545 VCALENDAR with weekday mapping and visit', () => {
    const ics = generateWeeklyRoutinesIcs({
      referenceDateStr: '2026-11-13',
      weighInDayOfWeek: 'Lunedì',
      clinicianName: 'Dott.ssa Elida Bardho',
      clinicianPhone: '335/6898371',
      nextVisitDate: '2026-11-28',
    });

    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.includes('RRULE:FREQ=DAILY'));
    assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO'));
    assert.ok(ics.includes('Controllo Clinico'));
    assert.ok(ics.endsWith('END:VCALENDAR'));
  });

  it('buildPnlAudioScriptText adheres to NLP positive language without negations', () => {
    const res = buildPnlAudioScriptText(
      'dopo_nel_prima',
      'Voglio sentirmi leggero ed energico',
      'Davide'
    );
    assert.ok(res.title.includes('Dopo nel Prima'));
    assert.ok(res.scriptText.includes('Davide'));
    assert.ok(!/\bnon\b/i.test(res.scriptText));
  });

  it('filterMealsByPeriodAndQuery filters week/month/all + slot + text search and fallback meal ideas work', () => {
    const sample: MealEntry[] = [
      {
        id: 'm_recent',
        date: '2026-11-12',
        time: '13:00',
        slot: 'pranzo',
        description: 'Orata al forno con zucchine',
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
      {
        id: 'm_month',
        date: '2026-10-28',
        time: '20:00',
        slot: 'cena',
        description: 'Pollo piastra',
        proteinCategory: 'carne_bianca',
        hasVegetables: true,
        preHungerScale: 8,
        postSatietyScale: 6,
        perceivedEnergy: 4,
        slowEatingUsed: true,
        slowMotionSecondsUsed: false,
        leftABite: false,
        symptomsReported: [],
      },
      {
        id: 'm_old',
        date: '2026-09-10',
        time: '20:00',
        slot: 'cena',
        description: 'Vecchia cena',
        proteinCategory: 'uova',
        hasVegetables: true,
        preHungerScale: 7,
        postSatietyScale: 5,
        perceivedEnergy: 4,
        slowEatingUsed: false,
        slowMotionSecondsUsed: false,
        leftABite: false,
        symptomsReported: [],
      },
    ];

    assert.equal(filterMealsByPeriodAndQuery(sample, '2026-11-13', 'week', 'all', '').length, 1);
    assert.equal(filterMealsByPeriodAndQuery(sample, '2026-11-13', 'month', 'all', '').length, 2);
    assert.equal(filterMealsByPeriodAndQuery(sample, '2026-11-13', 'all', 'all', '').length, 3);
    assert.equal(
      filterMealsByPeriodAndQuery(sample, '2026-11-13', 'all', 'pranzo', 'orata').length,
      1
    );

    const ideas = buildDeterministicQuickMealIdeas(sample, '2026-11-13', 'zucchine');
    assert.ok(ideas.length >= 1 && ideas.length <= 3);
    const dreamInsight = buildDeterministicDreamInsight('Camminavo su un sentiero leggero', '109 kg');
    assert.ok(!/\bnon\b/i.test(dreamInsight));
  });
});
