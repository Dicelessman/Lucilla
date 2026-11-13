import {
  CoachState,
  LearningStageId,
  MealEntry,
  ProteinCategory,
} from '../types/coach.ts';

export interface WeeklyFrequencyTarget {
  category: ProteinCategory;
  label: string;
  portionGuide: string;
  targetPerWeek: number;
  noSameDayRepeat: boolean;
}

export const WEEKLY_PROTEIN_TARGETS: WeeklyFrequencyTarget[] = [
  {
    category: 'carne_bianca',
    label: 'Carne bianca',
    portionGuide: '180g',
    targetPerWeek: 3,
    noSameDayRepeat: false,
  },
  {
    category: 'carne_rossa',
    label: 'Carne rossa magra',
    portionGuide: '120g',
    targetPerWeek: 2,
    noSameDayRepeat: false,
  },
  {
    category: 'pesce',
    label: 'Pesce fresco/surgelato',
    portionGuide: '220g',
    targetPerWeek: 2,
    noSameDayRepeat: false,
  },
  {
    category: 'tonno_salmone',
    label: 'Tonno nat. 120g / Salmone aff. 80g',
    portionGuide: '120g / 80g',
    targetPerWeek: 1,
    noSameDayRepeat: false,
  },
  {
    category: 'uova',
    label: 'Uova',
    portionGuide: '2–3 uova',
    targetPerWeek: 1,
    noSameDayRepeat: true,
  },
  {
    category: 'formaggio',
    label: 'Formaggio light / Ricotta',
    portionGuide: '100g',
    targetPerWeek: 1,
    noSameDayRepeat: true,
  },
  {
    category: 'legumi',
    label: 'Legumi cotti',
    portionGuide: '200g',
    targetPerWeek: 1,
    noSameDayRepeat: true,
  },
  {
    category: 'tofu_seitan',
    label: 'Tofu / Tempeh / Seitan',
    portionGuide: '150g',
    targetPerWeek: 1,
    noSameDayRepeat: true,
  },
  {
    category: 'primo',
    label: 'Primo piatto (lontano da dom. sera)',
    portionGuide: '80g crudo + cond.',
    targetPerWeek: 1,
    noSameDayRepeat: false,
  },
  {
    category: 'pasto_libero',
    label: 'Pasto libero domenicale',
    portionGuide: '1/2 pizza + 1–2 farinata + verdure prima',
    targetPerWeek: 1,
    noSameDayRepeat: false,
  },
];

export const NO_SAME_DAY_REPEAT_CATEGORIES: ProteinCategory[] = [
  'uova',
  'formaggio',
  'affettato',
  'legumi',
  'tofu_seitan',
];

export interface MealValidationResult {
  duplicateCategoryWarning: string | null;
  avoidItemsDetected: string[];
  redFlagSymptoms: string[];
  sundayPrimoWarning: string | null;
  satietyFeedback: string;
}

const AVOID_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'alcol', regex: /\b(vino|birra|spritz|amaro|liquore|alcol|prosecco|cocktail|whisky|gin)\b/i },
  { label: 'bevande gassate', regex: /\b(coca|fanta|sprite|bibita gassata|gassata|gassate|acqua frizzante zuccherata|energy drink)\b/i },
  { label: 'cibi fritti o molto grassi', regex: /\b(fritto|fritti|patatine fritte|cotoletta fritta|frittura|kebab|maionese abbondante)\b/i },
  { label: 'zuccheri semplici', regex: /\b(cornetto|brioche|merendina|nutella|cioccolatino|caramelle|torta|pasticcino|biscotti zuccherati|gelato)\b/i },
];

const RED_FLAG_PATTERNS: Array<{ symptom: string; regex: RegExp }> = [
  { symptom: 'vomito', regex: /\b(vomito|vomitato|vomitando)\b/i },
  { symptom: 'rigurgito', regex: /\b(rigurgito|rigurgitato|risalita)\b/i },
  { symptom: 'bruciore', regex: /\b(bruciore|reflusso|acidit[aà])\b/i },
  { symptom: 'difficoltà a mandar giù', regex: /\b(disfagia|difficolt[aà] a mandar gi[uù]|blocco|incastrato|fatica a deglutire|nodo in gola mentre mangio)\b/i },
];

const SLIP_UP_REGEX = /\b(ho rovinato tutto|ho fallito|ho sgarrato|ho mangiato troppo|mi sono abbuffat[oa]|abbuffata|schifo|sono un disastro|ormai è andata)\b/i;

const SOS_PHRASE_REGEX = /\b(ho voglia di dolce|sono nervos[oa]|sto per aprire il frigo|fame nervosa|voglio mangiare qualcosa|ansia|frustrazione|stress|non ce la faccio)\b/i;

export function detectRedFlags(text: string, explicitSymptoms: string[] = []): string[] {
  const found = new Set<string>(explicitSymptoms.filter(Boolean));
  for (const item of RED_FLAG_PATTERNS) {
    if (item.regex.test(text)) {
      found.add(item.symptom);
    }
  }
  return Array.from(found);
}

export function detectAvoidItems(text: string): string[] {
  const found: string[] = [];
  for (const item of AVOID_PATTERNS) {
    if (item.regex.test(text)) {
      found.push(item.label);
    }
  }
  return found;
}

export function detectSlipUpPhrase(text: string): boolean {
  return SLIP_UP_REGEX.test(text);
}

export function detectSosPhrase(text: string): boolean {
  return SOS_PHRASE_REGEX.test(text);
}

export function detectCommand(text: string): '/sos' | '/ruota' | '/report_bardho' | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.startsWith('/sos')) return '/sos';
  if (trimmed.startsWith('/ruota')) return '/ruota';
  if (trimmed.startsWith('/report_bardho')) return '/report_bardho';
  return null;
}

export function isSunday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() === 0;
}

export function getStartOfWeekIso(referenceDateStr: string): string {
  const [y, m, d] = referenceDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun, 1=Mon
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

export function validateMealAgainstPlan(
  candidate: Omit<MealEntry, 'id'>,
  existingMeals: MealEntry[]
): MealValidationResult {
  const sameDayMainMeals = existingMeals.filter(
    (m) =>
      m.date === candidate.date &&
      (m.slot === 'pranzo' || m.slot === 'cena')
  );

  let duplicateCategoryWarning: string | null = null;
  if (
    (candidate.slot === 'pranzo' || candidate.slot === 'cena') &&
    NO_SAME_DAY_REPEAT_CATEGORIES.includes(candidate.proteinCategory)
  ) {
    const oppositeSlot = candidate.slot === 'pranzo' ? 'cena' : 'pranzo';
    const hasRepeat = sameDayMainMeals.some(
      (m) => m.slot === oppositeSlot && m.proteinCategory === candidate.proteinCategory
    );
    if (hasRepeat) {
      const labelMap: Record<string, string> = {
        uova: 'uova',
        formaggio: 'formaggi',
        affettato: 'affettati',
        legumi: 'legumi',
        tofu_seitan: 'tofu/seitan',
      };
      const catLabel = labelMap[candidate.proteinCategory] || candidate.proteinCategory;
      duplicateCategoryWarning = `Oggi avevi già scelto ${catLabel} nell'altro pasto principale: per il prossimo pasto puoi variare verso un'altra fonte proteica del piano.`;
    }
  }

  let sundayPrimoWarning: string | null = null;
  if (isSunday(candidate.date) && candidate.proteinCategory === 'primo') {
    sundayPrimoWarning =
      'La domenica il piano prevede il pasto libero alla sera e secondo + verdure a pranzo: il primo piatto è pensato per un giorno lontano dalla domenica sera.';
  }

  const avoidItemsDetected = detectAvoidItems(candidate.description);
  const redFlagSymptoms = detectRedFlags(
    `${candidate.description} ${candidate.notes ?? ''}`,
    candidate.symptomsReported
  );

  let satietyFeedback = 'Ottimo ascolto del corpo!';
  if (candidate.postSatietyScale <= 3) {
    satietyFeedback =
      'Ti sei fermato oltre il punto di pienezza confortevole: la prossima volta puoi sperimentare la pausa a metà piatto su scala 5–6.';
  } else if (candidate.postSatietyScale >= 5 && candidate.postSatietyScale <= 6) {
    satietyFeedback =
      'Zona ideale 5–6 raggiunta: leggero, nutrito e padrone del ritmo.';
  } else if (candidate.postSatietyScale >= 7) {
    satietyFeedback =
      'Ti senti ancora leggero (7+): osserva tra 20 minuti se la sazietà arriva con calma grazie allo Slow Eating.';
  }

  return {
    duplicateCategoryWarning,
    avoidItemsDetected,
    redFlagSymptoms,
    sundayPrimoWarning,
    satietyFeedback,
  };
}

export interface WeeklyProteinCount {
  category: ProteinCategory;
  label: string;
  portionGuide: string;
  current: number;
  target: number;
  status: 'ok' | 'remaining' | 'over';
}

export function calculateWeeklyProteinCounts(
  meals: MealEntry[],
  referenceDateStr: string
): WeeklyProteinCount[] {
  const weekStart = getStartOfWeekIso(referenceDateStr);
  const weekMeals = meals.filter((m) => m.date >= weekStart && m.date <= referenceDateStr);

  return WEEKLY_PROTEIN_TARGETS.map((t) => {
    const current = weekMeals.filter((m) => m.proteinCategory === t.category).length;
    const status =
      current === t.targetPerWeek ? 'ok' : current > t.targetPerWeek ? 'over' : 'remaining';
    return {
      category: t.category,
      label: t.label,
      portionGuide: t.portionGuide,
      current,
      target: t.targetPerWeek,
      status,
    };
  });
}

export interface SleepAlert {
  isShortSleep: boolean;
  hours: number;
  title: string;
  physiologySummary: string;
  gentleAction: string;
}

export function evaluateSleepBiology(sleepHours: number): SleepAlert {
  if (sleepHours < 6) {
    return {
      isShortSleep: true,
      hours: sleepHours,
      title: 'Allerta Fisiologica Sonno Breve (< 6 ore)',
      physiologySummary:
        'Dopo una notte sotto le 6 ore la grelina (ormone della fame) sale del +28%, la leptina (sazietà) scende del -18% e il corpo tende a chiedere circa +385 kcal verso dolci e carboidrati. È pura biologia, nessuna debolezza personale.',
      gentleAction:
        'Oggi proteggiti con dolcezza: colazione completa e spuntino paracadute alle 17:30 per arrivare sereno alle 18:00–20:00.',
    };
  }
  return {
    isShortSleep: false,
    hours: sleepHours,
    title: 'Sonno ristoratore registrato',
    physiologySummary:
      'Con 6 o più ore di sonno i segnali di grelina e leptina restano in equilibrio e la corteccia prefrontale gestisce con più agio le scelte.',
    gentleAction:
      'Mantieni il ritmo semplice di oggi: colazione presente, Slow Eating e movimento piacevole.',
  };
}

export interface LearningStageInfo {
  id: LearningStageId;
  stageNumber: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  minXp: number;
  nextStageXp: number | null;
  progressPercent: number;
}

const LEARNING_STAGES: Array<{
  id: LearningStageId;
  stageNumber: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  minXp: number;
  nextStageXp: number | null;
}> = [
  {
    id: 'incompetenza_inconscia',
    stageNumber: 1,
    title: '1. Incompetenza Inconscia',
    subtitle: 'Il pilota automatico decideva prima di te',
    minXp: 0,
    nextStageXp: 150,
  },
  {
    id: 'incompetenza_conscia',
    stageNumber: 2,
    title: '2. Incompetenza Conscia',
    subtitle: 'Osservi l’onda e riconosci i segnali in tempo reale',
    minXp: 150,
    nextStageXp: 400,
  },
  {
    id: 'competenza_conscia',
    stageNumber: 3,
    title: '3. Competenza Conscia',
    subtitle: 'Alleni Slow Eating, Domande Utili e scelte presenti',
    minXp: 400,
    nextStageXp: 800,
  },
  {
    id: 'competenza_inconscia',
    stageNumber: 4,
    title: '4. Competenza Inconscia (Magro Naturalmente)',
    subtitle: 'Il ritmo nuovo diventa la tua natura quotidiana',
    minXp: 800,
    nextStageXp: null,
  },
];

export function getLearningStage(xp: number): LearningStageInfo {
  let current = LEARNING_STAGES[0];
  for (const stage of LEARNING_STAGES) {
    if (xp >= stage.minXp) {
      current = stage;
    }
  }
  if (current.nextStageXp === null) {
    return { ...current, progressPercent: 100 };
  }
  const span = current.nextStageXp - current.minXp;
  const progress = Math.min(100, Math.max(0, Math.round(((xp - current.minXp) / span) * 100)));
  return { ...current, progressPercent: progress };
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  if (heightM <= 0) return 0;
  return Number((weightKg / (heightM * heightM)).toFixed(1));
}

export function calculateSosXp(intensityLevel: number, waitedMinutes: number, loggedWithHonesty: boolean): number {
  let xp = 20; // base for pausing & naming emotion
  xp += Math.min(30, waitedMinutes * 3);
  if (intensityLevel >= 3) xp += 15;
  if (loggedWithHonesty) xp += 10;
  return xp;
}

export function getMonthlyTrendSummary(state: CoachState) {
  const sortedMeasurements = [...state.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sortedMeasurements[sortedMeasurements.length - 1];
  const first = sortedMeasurements[0];
  const weightDelta = latest && first ? Number((latest.weightKg - first.weightKg).toFixed(1)) : 0;

  const totalMeals = state.meals.length;
  const slowEatingCount = state.meals.filter((m) => m.slowEatingUsed).length;
  const slowEatingRate = totalMeals > 0 ? Math.round((slowEatingCount / totalMeals) * 100) : 0;

  const avgPostSatiety =
    totalMeals > 0
      ? Number(
          (state.meals.reduce((acc, m) => acc + m.postSatietyScale, 0) / totalMeals).toFixed(1)
        )
      : 0;

  const checkinsWithSleep = state.checkins.filter((c) => typeof c.sleepHours === 'number');
  const avgSleep =
    checkinsWithSleep.length > 0
      ? Number(
          (
            checkinsWithSleep.reduce((acc, c) => acc + (c.sleepHours ?? 0), 0) /
            checkinsWithSleep.length
          ).toFixed(1)
        )
      : 0;

  const surfedWaves = state.sosLogs.filter(
    (s) => s.outcome === 'onda_surfata' || s.outcome === 'scelta_consapevole'
  ).length;

  return {
    latestWeight: latest?.weightKg ?? state.profile.baselineWeightKg,
    weightDelta,
    slowEatingRate,
    avgPostSatiety,
    avgSleep,
    surfedWaves,
    totalSos: state.sosLogs.length,
  };
}

export interface WeeklyMovementHydrationSummary {
  weeklyMovementMinutes: number;
  movementTargetMinutes: number;
  todayHydrationGlasses: number;
  hydrationTargetGlasses: number;
  todayHydrationAwayFromMealsDone: boolean;
}

export function calculateWeeklyMovementAndHydration(
  checkins: import('../types/coach.ts').DailyCheckin[],
  referenceDateStr: string
): WeeklyMovementHydrationSummary {
  const weekStart = getStartOfWeekIso(referenceDateStr);
  const weekCheckins = checkins.filter(
    (c) => c.date >= weekStart && c.date <= referenceDateStr
  );
  const weeklyMovementMinutes = weekCheckins.reduce(
    (sum, c) => sum + (typeof c.movementMinutes === 'number' ? Math.max(0, c.movementMinutes) : 0),
    0
  );
  const todayCheckin = checkins.find((c) => c.date === referenceDateStr);

  return {
    weeklyMovementMinutes,
    movementTargetMinutes: 150,
    todayHydrationGlasses:
      typeof todayCheckin?.hydrationGlasses === 'number'
        ? Math.max(0, todayCheckin.hydrationGlasses)
        : 0,
    hydrationTargetGlasses: 8,
    todayHydrationAwayFromMealsDone: Boolean(todayCheckin?.hydrationAwayFromMealsDone),
  };
}

export function applyDailyCheckinRewards(
  existingCheckins: import('../types/coach.ts').DailyCheckin[],
  candidateCheckin: import('../types/coach.ts').DailyCheckin,
  currentXp: number,
  currentBadges: import('../types/coach.ts').StanzaBadge[],
  todayDate: string,
  baseXpBonus = 0
): {
  updatedCheckin: import('../types/coach.ts').DailyCheckin;
  nextCheckins: import('../types/coach.ts').DailyCheckin[];
  nextXp: number;
  nextBadges: import('../types/coach.ts').StanzaBadge[];
  xpGained: number;
  unlockedTitles: string[];
} {
  let updatedCheckin: import('../types/coach.ts').DailyCheckin = { ...candidateCheckin };
  let xpGained = Math.max(0, baseXpBonus);
  const unlockedTitles: string[] = [];

  // Auto-award +10 XP once per day when >= 6 glasses AND away-from-meals confirmed
  if (
    (updatedCheckin.hydrationGlasses ?? 0) >= 6 &&
    Boolean(updatedCheckin.hydrationAwayFromMealsDone) &&
    !updatedCheckin.hydrationXpAwarded
  ) {
    updatedCheckin = { ...updatedCheckin, hydrationXpAwarded: true };
    xpGained += 10;
  }

  const exists = existingCheckins.some(
    (c) => c.date === updatedCheckin.date || c.id === updatedCheckin.id
  );
  const nextCheckins = exists
    ? existingCheckins.map((c) =>
        c.date === updatedCheckin.date || c.id === updatedCheckin.id ? updatedCheckin : c
      )
    : [...existingCheckins, updatedCheckin];

  const dreamCount = nextCheckins.filter((c) => Boolean(c.dreamJournal?.trim())).length;
  const { weeklyMovementMinutes } = calculateWeeklyMovementAndHydration(nextCheckins, todayDate);
  const shortSleepProtected =
    typeof updatedCheckin.sleepHours === 'number' &&
    updatedCheckin.sleepHours < 6 &&
    Boolean(updatedCheckin.afternoonParachuteDone);

  const nextBadges = currentBadges.map((b) => {
    if (b.id === 'stanza_creativita' && !b.unlockedAt && dreamCount >= 3) {
      unlockedTitles.push(`${b.stanza}: ${b.title}`);
      return { ...b, unlockedAt: todayDate };
    }
    if (b.id === 'stanza_natura' && !b.unlockedAt && weeklyMovementMinutes >= 150) {
      xpGained += 30;
      unlockedTitles.push(`${b.stanza}: ${b.title}`);
      return { ...b, unlockedAt: todayDate };
    }
    if (b.id === 'stanza_cura' && !b.unlockedAt && shortSleepProtected) {
      xpGained += 15;
      unlockedTitles.push(`${b.stanza}: ${b.title}`);
      return { ...b, unlockedAt: todayDate };
    }
    return b;
  });

  return {
    updatedCheckin,
    nextCheckins,
    nextXp: currentXp + xpGained,
    nextBadges,
    xpGained,
    unlockedTitles,
  };
}
