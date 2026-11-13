import { CoachState, MealEntry, ProteinCategory } from '../types/coach.ts';
import {
  calculateWeeklyProteinCounts,
  isSunday,
  NO_SAME_DAY_REPEAT_CATEGORIES,
} from './bariclipRules.ts';

export interface PlannedMealSuggestion {
  date: string;
  dayLabel: string;
  slot: 'pranzo' | 'cena';
  proteinCategory: ProteinCategory;
  title: string;
  portionGuide: string;
  idea: string;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  quantityNote: string;
  group: 'Proteine & Freschi' | 'Verdure & Condimenti' | 'Dispensa & Paracadute';
}

export interface WeeklyMealPlanResult {
  remainingCount: number;
  suggestions: PlannedMealSuggestion[];
  shoppingList: ShoppingListItem[];
}

const DAY_NAMES_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

const MEAL_IDEA_BANK: Record<
  ProteinCategory,
  { title: string; idea: string; shoppingName: string; shoppingGroup: ShoppingListItem['group'] }
> = {
  carne_bianca: {
    title: 'Carne bianca magra',
    idea: 'Petto di pollo o tacchino alla piastra con erbe aromatiche, verdure grigliate e 1 cucchiaio olio EVO',
    shoppingName: 'Petto di pollo o fesa di tacchino',
    shoppingGroup: 'Proteine & Freschi',
  },
  carne_rossa: {
    title: 'Carne rossa magra',
    idea: 'Tagliata di manzo magra con rucola, pomodorini o radicchio alla griglia e 1 cucchiaio olio EVO',
    shoppingName: 'Tagliata o filetto di manzo magro',
    shoppingGroup: 'Proteine & Freschi',
  },
  pesce: {
    title: 'Pesce fresco o surgelato',
    idea: 'Filetto di orata, branzino o merluzzo al forno/vapore con finocchi o zucchine al limone',
    shoppingName: 'Filetti di pesce (orata / merluzzo / branzino)',
    shoppingGroup: 'Proteine & Freschi',
  },
  tonno_salmone: {
    title: 'Tonno naturale / Salmone affumicato',
    idea: 'Insalatona mista con tonno al naturale (120g) oppure salmone affumicato (80g) con finocchi crudi',
    shoppingName: 'Tonno al naturale (120g) o salmone affumicato (80g)',
    shoppingGroup: 'Proteine & Freschi',
  },
  uova: {
    title: 'Uova',
    idea: 'Frittata morbida al forno con 2–3 uova e spinaci/asparagi + 1 cucchiaio olio EVO',
    shoppingName: 'Uova fresche',
    shoppingGroup: 'Proteine & Freschi',
  },
  formaggio: {
    title: 'Formaggio light / Ricotta',
    idea: 'Ricotta fresca o fiocchi/formaggio light (100g) con pomodori, origano e verdure croccanti',
    shoppingName: 'Ricotta fresca o formaggio light (100g)',
    shoppingGroup: 'Proteine & Freschi',
  },
  legumi: {
    title: 'Legumi cotti',
    idea: 'Zuppa tiepida di lenticchie o ceci (200g cotti) con bietole/cavolo nero e olio EVO a crudo',
    shoppingName: 'Lenticchie o ceci già cotti (200g)',
    shoppingGroup: 'Dispensa & Paracadute',
  },
  tofu_seitan: {
    title: 'Tofu / Tempeh / Seitan',
    idea: 'Tofu o tempeh scottato in padella con curcuma, zucchine a julienne e salsa di soia leggera',
    shoppingName: 'Tofu / Tempeh / Seitan (150g)',
    shoppingGroup: 'Proteine & Freschi',
  },
  affettato: {
    title: 'Affettato magro',
    idea: 'Bresaola o prosciutto crudo sgrassato con carciofini/insalata verde',
    shoppingName: 'Bresaola o fesa magra',
    shoppingGroup: 'Proteine & Freschi',
  },
  primo: {
    title: 'Primo piatto bilanciato (lontano da domenica sera)',
    idea: 'Pasta o riso integrale (80g crudo) con verdure di stagione, 1 cucchiaio olio EVO e 60g tonno o 100g legumi',
    shoppingName: 'Pasta o riso integrale (80g)',
    shoppingGroup: 'Dispensa & Paracadute',
  },
  pasto_libero: {
    title: 'Pasto libero domenicale sereno',
    idea: 'Prima piatto abbondante di verdure, poi mezza pizza o 1–2 fette di farinata gustate in Slow Eating',
    shoppingName: 'Verdure fresche di apertura pasto domenicale',
    shoppingGroup: 'Verdure & Condimenti',
  },
  nessuno: {
    title: 'Pasto leggero con verdure',
    idea: 'Verdure miste di stagione con olio EVO',
    shoppingName: 'Verdure di stagione',
    shoppingGroup: 'Verdure & Condimenti',
  },
};

function addDaysIso(dateStr: string, offset: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offset));
  return dt.toISOString().slice(0, 10);
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = DAY_NAMES_IT[dt.getUTCDay()] ?? '';
  return `${dayName} ${dateStr.slice(8)}/${dateStr.slice(5, 7)}`;
}

function getRemainingDaysOfWeek(referenceDateStr: string): string[] {
  const [y, m, d] = referenceDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const days: string[] = [];
  for (let i = 0; i <= daysUntilSunday; i++) {
    days.push(addDaysIso(referenceDateStr, i));
  }
  return days;
}

export function generateWeeklyMealPlan(
  meals: MealEntry[],
  referenceDateStr: string
): WeeklyMealPlanResult {
  const counts = calculateWeeklyProteinCounts(meals, referenceDateStr);
  const remainingSlots: Array<{
    category: ProteinCategory;
    portionGuide: string;
  }> = [];

  for (const item of counts) {
    const missing = Math.max(0, item.target - item.current);
    for (let i = 0; i < missing; i++) {
      remainingSlots.push({
        category: item.category,
        portionGuide: item.portionGuide,
      });
    }
  }

  const remainingDays = getRemainingDaysOfWeek(referenceDateStr);
  const candidateSlots: Array<{ date: string; slot: 'pranzo' | 'cena' }> = [];

  for (const d of remainingDays) {
    for (const s of ['pranzo', 'cena'] as const) {
      const alreadyLogged = meals.some((m) => m.date === d && m.slot === s);
      if (!alreadyLogged) {
        candidateSlots.push({ date: d, slot: s });
      }
    }
  }

  // Track same-day categories already logged + planned
  const dayCategoryMap = new Map<string, Set<ProteinCategory>>();
  for (const m of meals) {
    if (m.slot === 'pranzo' || m.slot === 'cena') {
      const set = dayCategoryMap.get(m.date) ?? new Set<ProteinCategory>();
      set.add(m.proteinCategory);
      dayCategoryMap.set(m.date, set);
    }
  }

  const suggestions: PlannedMealSuggestion[] = [];
  const usedSlotKeys = new Set<string>();

  // Assign special constraints first: pasto_libero on Sunday cena, primo away from Sunday
  const sortedRemaining = [...remainingSlots].sort((a, b) => {
    const weight = (c: ProteinCategory) =>
      c === 'pasto_libero' ? 0 : c === 'primo' ? 1 : NO_SAME_DAY_REPEAT_CATEGORIES.includes(c) ? 2 : 3;
    return weight(a.category) - weight(b.category);
  });

  for (const item of sortedRemaining) {
    const matchingSlot = candidateSlots.find((cs) => {
      const key = `${cs.date}_${cs.slot}`;
      if (usedSlotKeys.has(key)) return false;

      // Sunday rules
      if (item.category === 'pasto_libero') {
        return isSunday(cs.date) && cs.slot === 'cena';
      }
      if (item.category === 'primo' && isSunday(cs.date)) {
        return false;
      }
      if (isSunday(cs.date) && cs.slot === 'cena') {
        return false;
      }

      // No same-day repeat for protected protein sources
      if (NO_SAME_DAY_REPEAT_CATEGORIES.includes(item.category)) {
        const daySet = dayCategoryMap.get(cs.date);
        if (daySet?.has(item.category)) return false;
      }

      return true;
    });

    if (matchingSlot) {
      usedSlotKeys.add(`${matchingSlot.date}_${matchingSlot.slot}`);
      const set = dayCategoryMap.get(matchingSlot.date) ?? new Set<ProteinCategory>();
      set.add(item.category);
      dayCategoryMap.set(matchingSlot.date, set);

      const bank = MEAL_IDEA_BANK[item.category];
      suggestions.push({
        date: matchingSlot.date,
        dayLabel: formatDayLabel(matchingSlot.date),
        slot: matchingSlot.slot,
        proteinCategory: item.category,
        title: bank.title,
        portionGuide: item.portionGuide,
        idea: bank.idea,
      });
    }
  }

  suggestions.sort((a, b) => {
    const dCmp = a.date.localeCompare(b.date);
    if (dCmp !== 0) return dCmp;
    return a.slot === 'pranzo' && b.slot === 'cena' ? -1 : 1;
  });

  // Aggregate Shopping List from remaining targets
  const shoppingMap = new Map<
    string,
    { name: string; count: number; portionGuide: string; group: ShoppingListItem['group'] }
  >();
  for (const item of remainingSlots) {
    const bank = MEAL_IDEA_BANK[item.category];
    const existing = shoppingMap.get(item.category);
    if (existing) {
      existing.count += 1;
    } else {
      shoppingMap.set(item.category, {
        name: bank.shoppingName,
        count: 1,
        portionGuide: item.portionGuide,
        group: bank.shoppingGroup,
      });
    }
  }

  const shoppingList: ShoppingListItem[] = Array.from(shoppingMap.entries()).map(([cat, info]) => ({
    id: `shop_${cat}`,
    name: info.name,
    quantityNote: `${info.count}x (${info.portionGuide})`,
    group: info.group,
  }));

  if (shoppingList.length > 0) {
    shoppingList.push(
      {
        id: 'shop_veg',
        name: 'Verdure fresche di stagione (zucchine, finocchi, spinaci, rucola)',
        quantityNote: 'a volontà a pranzo e cena',
        group: 'Verdure & Condimenti',
      },
      {
        id: 'shop_evo',
        name: 'Olio extravergine d’oliva',
        quantityNote: '1 cucchiaio per pasto',
        group: 'Verdure & Condimenti',
      },
      {
        id: 'shop_parachute',
        name: 'Spuntino 17:30 (grana 30g, bresaola, Wasa integrali, matè/tisane)',
        quantityNote: 'scorta settimanale anti-onda 18–20',
        group: 'Dispensa & Paracadute',
      }
    );
  }

  return {
    remainingCount: remainingSlots.length,
    suggestions,
    shoppingList,
  };
}

export interface WeeklyBriefingInsight {
  id: string;
  title: string;
  metric: string;
  narrative: string;
  tone: 'positive' | 'attention' | 'neutral';
}

export interface WeeklyBriefingResult {
  headline: string;
  measuresDelta: {
    weightDeltaKg: number | null;
    umbilicalDeltaCm: number | null;
    hipsDeltaCm: number | null;
    chestDeltaCm: number | null;
  };
  insights: WeeklyBriefingInsight[];
}

export function generateWeeklyBriefing(state: CoachState): WeeklyBriefingResult {
  const insights: WeeklyBriefingInsight[] = [];

  // 1. Sleep < 6h vs SOS correlation (same day or next day)
  const checkinsWithSleep = state.checkins.filter((c) => typeof c.sleepHours === 'number');
  const shortSleepDates = new Set(
    checkinsWithSleep.filter((c) => (c.sleepHours ?? 7) < 6).map((c) => c.date)
  );
  const normalSleepDates = new Set(
    checkinsWithSleep.filter((c) => (c.sleepHours ?? 7) >= 6).map((c) => c.date)
  );

  if (checkinsWithSleep.length > 0) {
    const sosOnShort = state.sosLogs.filter((s) => shortSleepDates.has(s.date)).length;
    const sosOnNormal = state.sosLogs.filter((s) => normalSleepDates.has(s.date)).length;
    const avgShort =
      shortSleepDates.size > 0 ? Number((sosOnShort / shortSleepDates.size).toFixed(1)) : 0;
    const avgNormal =
      normalSleepDates.size > 0 ? Number((sosOnNormal / normalSleepDates.size).toFixed(1)) : 0;

    insights.push({
      id: 'sleep_sos',
      title: 'Correlazione Sonno & Onde Emotive',
      metric:
        shortSleepDates.size > 0
          ? `${avgShort} SOS/gg (<6h) vs ${avgNormal} SOS/gg (≥6h)`
          : `${avgNormal} SOS/gg con ≥6h di sonno`,
      narrative:
        shortSleepDates.size > 0 && avgShort > avgNormal
          ? 'Nei giorni sotto le 6 ore la grelina aumenta naturalmente: preparare già al mattino lo spuntino delle 17:30 protegge la tua fascia 18:00–20:00.'
          : 'Il tuo riposo sta sostenendo con equilibrio la lucidità prefrontale nelle scelte quotidiane.',
      tone: shortSleepDates.size > 0 && avgShort > avgNormal ? 'attention' : 'positive',
    });
  }

  // 2. Parachute 17:30 vs evening SOS (18:00+)
  const parachuteDoneDates = new Set(
    state.checkins.filter((c) => c.afternoonParachuteDone === true).map((c) => c.date)
  );
  const eveningSos = state.sosLogs.filter((s) => s.time >= '18:00');
  const eveningSosWithParachute = eveningSos.filter((s) => parachuteDoneDates.has(s.date)).length;
  const surfedEvening = eveningSos.filter(
    (s) => s.outcome === 'onda_surfata' || s.outcome === 'scelta_consapevole'
  ).length;

  if (parachuteDoneDates.size > 0 || state.sosLogs.length > 0) {
    insights.push({
      id: 'parachute_effect',
      title: 'Efficacia Paracadute 17:30 (Fascia 18:00–20:00)',
      metric: `${parachuteDoneDates.size} giorni protetti · ${surfedEvening}/${eveningSos.length || 0} onde serali surfate`,
      narrative:
        parachuteDoneDates.size > 0
          ? `Quando hai attivato il paracadute alle 17:30 (${parachuteDoneDates.size} volte), hai affrontato la sera con maggiore presenza (${eveningSosWithParachute} episodi serali registrati e trasformati in apprendimento).`
          : 'Attiva il paracadute delle 17:30 nel check-in per misurarne subito l’effetto protettivo sulla fascia serale.',
      tone: 'positive',
    });
  }

  // 3. Slow Eating & Post-meal Satiety 5-6 window
  if (state.meals.length > 0) {
    const optimalSatietyMeals = state.meals.filter(
      (m) => m.postSatietyScale >= 5 && m.postSatietyScale <= 6
    ).length;
    const rate = Math.round((optimalSatietyMeals / state.meals.length) * 100);
    const slowRate = Math.round(
      (state.meals.filter((m) => m.slowEatingUsed).length / state.meals.length) * 100
    );

    insights.push({
      id: 'slow_satiety',
      title: 'Precisione Sazietà 5–6 & Slow Eating',
      metric: `${rate}% in zona ideale 5–6 · ${slowRate}% Slow Eating`,
      narrative:
        rate >= 60
          ? 'Stai ascoltando con finezza i segnali post-Bariclip fermandoti leggero intorno al 5–6.'
          : 'Puoi sperimentare una micro-pausa a metà piatto posando la forchetta per avvicinarti ancora di più al target 5–6.',
      tone: rate >= 60 ? 'positive' : 'neutral',
    });
  }

  // 4. Tape measure delta
  const sortedMeas = [...state.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const first = sortedMeas[0];
  const last = sortedMeas[sortedMeas.length - 1];

  const diffNum = (a?: number, b?: number) =>
    typeof a === 'number' && typeof b === 'number' ? Number((b - a).toFixed(1)) : null;

  const weightDeltaKg = first && last ? diffNum(first.weightKg, last.weightKg) : null;
  const umbilicalDeltaCm = first && last ? diffNum(first.umbilicalCm, last.umbilicalCm) : null;
  const hipsDeltaCm = first && last ? diffNum(first.hipsCm, last.hipsCm) : null;
  const chestDeltaCm = first && last ? diffNum(first.chestCm, last.chestCm) : null;

  if (umbilicalDeltaCm !== null || hipsDeltaCm !== null) {
    const totalCmLost = Number(
      ((umbilicalDeltaCm ?? 0) + (hipsDeltaCm ?? 0) + (chestDeltaCm ?? 0)).toFixed(1)
    );
    insights.push({
      id: 'tape_delta',
      title: 'Metro da Sarta (Oltre la Bilancia)',
      metric: `Ombelico ${umbilicalDeltaCm !== null ? `${umbilicalDeltaCm > 0 ? '+' : ''}${umbilicalDeltaCm}` : '—'} cm · Somma ${totalCmLost > 0 ? '+' : ''}${totalCmLost} cm`,
      narrative:
        totalCmLost < 0
          ? `Le circonferenze raccontano un rimodellamento reale di ${Math.abs(totalCmLost)} cm complessivi dall’inizio del monitoraggio.`
          : 'Le misure del metro da sarta offrono un punto fermo sereno indipendente dalle fluttuazioni idriche quotidiane.',
      tone: totalCmLost < 0 ? 'positive' : 'neutral',
    });
  }

  const headline =
    insights.length > 0
      ? `Analisi automatica su ${state.meals.length} pasti, ${state.checkins.length} check-in e ${state.sosLogs.length} prove SOS.`
      : 'Registra i primi pasti, notti di sonno e pesate per attivare il briefing settimanale automatico.';

  return {
    headline,
    measuresDelta: {
      weightDeltaKg,
      umbilicalDeltaCm,
      hipsDeltaCm,
      chestDeltaCm,
    },
    insights,
  };
}

const WEEKDAY_TO_ICS_BYDAY: Record<string, string> = {
  Lunedì: 'MO',
  Martedì: 'TU',
  Mercoledì: 'WE',
  Giovedì: 'TH',
  Venerdì: 'FR',
  Sabato: 'SA',
  Domenica: 'SU',
};

function formatIcsDateCompact(dateStr: string, hour: number, minute: number): string {
  const clean = dateStr.replace(/-/g, '');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${clean}T${hh}${mm}00`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function generateWeeklyRoutinesIcs(options: {
  referenceDateStr: string;
  weighInDayOfWeek: string;
  clinicianName: string;
  clinicianPhone: string;
  nextVisitDate?: string;
}): string {
  const byDay = WEEKDAY_TO_ICS_BYDAY[options.weighInDayOfWeek] ?? 'MO';
  const dtStamp = formatIcsDateCompact(options.referenceDateStr, 8, 0);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lucilla Coach//Bariclip & PNL Routine//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // 1. Spuntino Paracadute 17:30
    'BEGIN:VEVENT',
    `UID:lucilla-parachute-1730@bariclip.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${formatIcsDateCompact(options.referenceDateStr, 17, 30)}`,
    `DTEND:${formatIcsDateCompact(options.referenceDateStr, 17, 45)}`,
    'RRULE:FREQ=DAILY',
    'SUMMARY:Lucilla · Spuntino Paracadute 17:30',
    escapeIcsText(
      'DESCRIPTION:Proteggi la fascia 18:00-20:00 con uno spuntino sereno: 30g grana, 40g bresaola, 1 uovo sodo, 1 Wasa + ricotta oppure 150g frutta + matè caldo.'
    ),
    'BEGIN:VALARM',
    'TRIGGER:-PT5M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Spuntino Paracadute tra 5 minuti',
    'END:VALARM',
    'END:VEVENT',
    // 2. Chiusura Serale & Diario Sogni 21:30
    'BEGIN:VEVENT',
    `UID:lucilla-evening-closure@bariclip.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${formatIcsDateCompact(options.referenceDateStr, 21, 30)}`,
    `DTEND:${formatIcsDateCompact(options.referenceDateStr, 21, 45)}`,
    'RRULE:FREQ=DAILY',
    'SUMMARY:Lucilla · Chiusura Cucina & Piccolo Successo',
    escapeIcsText(
      'DESCRIPTION:Annota un piccolo successo di oggi in Lucilla e scegli un rituale confortevole di chiusura cucina (tisana o brodo caldo).'
    ),
    'END:VEVENT',
    // 3. Pesata Settimanale & Metro da Sarta
    'BEGIN:VEVENT',
    `UID:lucilla-weekly-weighin@bariclip.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${formatIcsDateCompact(options.referenceDateStr, 7, 30)}`,
    `DTEND:${formatIcsDateCompact(options.referenceDateStr, 7, 45)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`,
    'SUMMARY:Lucilla · Pesata Settimanale & Metro da Sarta',
    escapeIcsText(
      'DESCRIPTION:Consigliera serena settimanale: registra peso e circonferenze (ombelico, fianchi, torace) in Strumenti PNL.'
    ),
    'END:VEVENT',
  ];

  if (options.nextVisitDate && /^\d{4}-\d{2}-\d{2}$/.test(options.nextVisitDate)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:lucilla-visit-${options.nextVisitDate}@bariclip.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${formatIcsDateCompact(options.nextVisitDate, 10, 0)}`,
      `DTEND:${formatIcsDateCompact(options.nextVisitDate, 10, 45)}`,
      `SUMMARY:${escapeIcsText(`Controllo Clinico — ${options.clinicianName}`)}`,
      escapeIcsText(
        `DESCRIPTION:Esporta Report /report_bardho in PDF/CSV da Lucilla prima della visita. Contatto: ${options.clinicianPhone}`
      ),
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Prepara il Report Bardho in Lucilla per la visita di domani',
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export type PnlAudioScriptId =
  | 'dopo_nel_prima'
  | 'come_se'
  | 'ancora_cinestesica'
  | 'chiusura_cucina';

export interface PnlAudioSessionMeta {
  id: PnlAudioScriptId;
  title: string;
  subtitle: string;
  durationLabel: string;
  focusTag: string;
}

export const PNL_AUDIO_SESSIONS: PnlAudioSessionMeta[] = [
  {
    id: 'dopo_nel_prima',
    title: 'Il Dopo nel Prima',
    subtitle: 'Visualizza la leggerezza e il benessere a 2 ore dal pasto o dalla serata.',
    durationLabel: '~2 min',
    focusTag: 'Scelta Lucida',
  },
  {
    id: 'come_se',
    title: 'Come Se — Magro Naturalmente',
    subtitle: 'Allena il passo, il respiro e la calma di chi vive già in equilibrio.',
    durationLabel: '~2 min',
    focusTag: 'Identità PNL',
  },
  {
    id: 'ancora_cinestesica',
    title: 'Ancora Cinestesica Pollice-Indice',
    subtitle: 'Condiziona la sensazione di padronanza e calma nel gesto discreto della mano.',
    durationLabel: '~2 min',
    focusTag: 'Ancoraggio',
  },
  {
    id: 'chiusura_cucina',
    title: 'Rilassamento Chiusura Cucina',
    subtitle: 'Lascia scivolare la giornata verso il riposo profondo e un sonno ≥ 6 ore.',
    durationLabel: '~2 min',
    focusTag: 'Sonno & Grelina',
  },
];

export function buildPnlAudioScriptText(
  scriptId: PnlAudioScriptId,
  positiveGoal: string,
  firstName = 'Davide'
): { title: string; scriptText: string } {
  switch (scriptId) {
    case 'dopo_nel_prima':
      return {
        title: 'Il Dopo nel Prima',
        scriptText: `Ciao ${firstName}, prenditi due minuti comodi e fai tre respiri lenti, profondi, lasciando scendere le spalle. Porta ora davanti ai tuoi occhi un'immagine luminosa di te stesso tra due ore: sei in cucina o in salotto, la serata scorre serena e ti senti leggero, lucido e soddisfatto della tua scelta. Nota i colori vividi di quel momento, la sensazione di stomaco leggero, l'energia pulita nel petto e la fierezza tranquilla di aver rispettato ciò che vuoi davvero: ${positiveGoal}. Ora porta quella stessa sensazione di benessere adesso, nel presente, e lascia che guidi con naturalezza il tuo prossimo piccolo gesto di cura.`,
      };
    case 'come_se':
      return {
        title: 'Come Se — Magro Naturalmente',
        scriptText: `${firstName}, chiudi per un istante gli occhi o fissa un punto morbido davanti a te. Immagina di camminare lungo un sentiero chiaro all'aria aperta come la versione di te già Magra Naturalmente in progress. Osserva come si muove questo te futuro: mastica con calma appoggiando la forchetta tra un boccone e l'altro, ascolta la sazietà confortevole a livello cinque o sei e sorride lasciando un piccolo boccone nel piatto quando è sazio. Chiediti con curiosità: quale piccola scelta semplice compie oggi questa parte saggia di me? Sceglila adesso con gioia e leggerezza.`,
      };
    case 'ancora_cinestesica':
      return {
        title: 'Ancora Cinestesica Pollice-Indice',
        scriptText: `Eccomi ${firstName}. Unisci dolcemente il pollice e l'indice della tua mano destra o sinistra con una pressione lieve e costante. Mentre mantieni questo contatto discreto, richiama alla memoria un momento preciso in cui ti sei sentito pienamente padrone di te, energico e sereno, magari durante una camminata o una bella giornata scout. Amplifica la sensazione di calore nel petto, la schiena dritta e il respiro ampio. Ogni volta che nei momenti intensi o alle sei di sera unirai pollice e indice, il tuo corpo ricorderà subito questa calma lucida e questa capacità di scegliere ciò che ti fa stare bene.`,
      };
    case 'chiusura_cucina':
      return {
        title: 'Rilassamento Chiusura Cucina',
        scriptText: `Buonasera ${firstName}. La giornata di oggi volge al termine e ogni momento vissuto oggi resta un'informazione preziosa per il tuo cammino. Immagina di abbassare lentamente la luce della cucina, con l'ordine e il profumo caldo della tua tisana o del matè. Il tuo stomaco riposa comodo e leggero. Rilassa la mascella, sciogli le mani e prepara il tuo corpo a un sonno profondo e ristoratore di almeno sei o sette ore, sapendo che domani mattina ti sveglierai lucido, riposato e pronto a scrivere un nuovo passo verso il tuo obiettivo.`,
      };
  }
}

export type MealPeriodFilter = 'week' | 'month' | 'all';

export function filterMealsByPeriodAndQuery(
  meals: MealEntry[],
  referenceDateStr: string,
  period: MealPeriodFilter,
  slotFilter: string,
  searchQuery: string
): MealEntry[] {
  const weekStart = addDaysIso(referenceDateStr, -6);
  const monthStart = addDaysIso(referenceDateStr, -29);
  const q = searchQuery.trim().toLowerCase();

  return [...meals]
    .filter((m) => {
      if (period === 'week' && (m.date < weekStart || m.date > referenceDateStr)) return false;
      if (period === 'month' && (m.date < monthStart || m.date > referenceDateStr)) return false;
      if (slotFilter !== 'all' && m.slot !== slotFilter) return false;
      if (q) {
        const hay = `${m.description} ${m.proteinCategory} ${m.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
}

export function buildDeterministicDreamInsight(dreamText: string, positiveGoal: string): string {
  const lower = dreamText.toLowerCase();
  if (lower.includes('zaino') || lower.includes('peso') || lower.includes('salita') || lower.includes('strada') || lower.includes('sentiero')) {
    return `Immagine preziosa: la tua mente inconscia sta già esplorando come alleggerire lo zaino e procedere con passo fluido verso "${positiveGoal.slice(0, 90)}". Quale peso pratico o impegno puoi posare oggi per regalarti 15 minuti di camminata serena?`;
  }
  if (lower.includes('cibo') || lower.includes('cucina') || lower.includes('tavola') || lower.includes('fame')) {
    return `Il sogno porta luce sul tuo nuovo rapporto con la cucina e la cura di te. Fino a ieri certe scene accendevano fretta; oggi stai già osservando come vuoi abitare la tavola con calma e presenza. Come vuoi preparare il tuo prossimo pasto in Slow Eating?`;
  }
  return `Questo sogno racconta una parte creativa di te già orientata alla chiarezza e al movimento in avanti. Quale sensazione positiva di questa immagine notturna puoi collegare oggi alla tua Ancora Cinestesica pollice-indice?`;
}

export function buildDeterministicQuickMealIdeas(
  meals: MealEntry[],
  referenceDateStr: string,
  pantryNote = ''
): import('../types/coach.ts').QuickMealIdea[] {
  const plan = generateWeeklyMealPlan(meals, referenceDateStr);
  const picked: import('../types/coach.ts').QuickMealIdea[] = [];
  const seen = new Set<ProteinCategory>();

  for (const s of plan.suggestions) {
    if (seen.has(s.proteinCategory) || s.proteinCategory === 'pasto_libero') continue;
    seen.add(s.proteinCategory);
    const cat = s.proteinCategory;
    const bank = MEAL_IDEA_BANK[cat];
    picked.push({
      title: `${bank.title} espressa${pantryNote.trim() ? ` (${pantryNote.trim().slice(0, 24)})` : ''}`,
      proteinCategory: cat,
      portionNote: s.portionGuide,
      prepMinutes: cat === 'primo' ? 12 : 8,
      ingredients: [
        `${bank.shoppingName} (${s.portionGuide})`,
        'Verdure fresche di stagione a volontà',
        '1 cucchiaio olio EVO + erbe aromatiche',
      ],
      steps: bank.idea,
      bariclipTip:
        'Attiva 30 secondi di Slow Motion prima del primo boccone e appoggia la forchetta tra un boccone e l’altro.',
    });
    if (picked.length >= 3) break;
  }

  if (picked.length === 0) {
    picked.push({
      title: 'Filetto di orata veloce al vapore con finocchi',
      proteinCategory: 'pesce',
      portionNote: '220g',
      prepMinutes: 10,
      ingredients: ['220g filetto di orata', 'Finocchi e zucchine', '1 cucchiaio olio EVO + limone'],
      steps: 'Cuoci il pesce al vapore o in padella coperta con limone per 8 minuti insieme a zucchine a rondelle.',
      bariclipTip: 'Bocconi piccoli e acqua lontano dai pasti per proteggere il Bariclip.',
    });
  }

  return picked;
}
