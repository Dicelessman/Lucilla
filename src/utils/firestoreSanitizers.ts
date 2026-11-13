import {
  ChatMessage,
  ClinicalVisitEntry,
  DailyCheckin,
  MealEntry,
  SosProvaEntry,
  StanzaBadge,
  UserProfile,
  WeightTapeEntry,
  WheelAssessment,
} from '../types/coach.ts';

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export function sanitizeId(raw: string, prefix = 'doc'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  if (cleaned && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}_${Date.now()}`;
}

export function clampStr(val: string | undefined, maxLen: number): string | undefined {
  if (val === undefined || val === null) return undefined;
  const trimmed = String(val).trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

export function clampRequiredStr(val: string | undefined, fallback: string, maxLen: number): string {
  const s = clampStr(val, maxLen);
  return s ?? fallback.slice(0, maxLen);
}

export function clampNum(val: unknown, fallback: number, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function sanitizeProfile(profile: UserProfile): Record<string, unknown> {
  return {
    name: clampRequiredStr(profile.name, 'Davide Rossi', 100),
    heightCm: clampNum(profile.heightCm, 184, 100, 250),
    surgeryType: clampRequiredStr(profile.surgeryType, 'Bariclip', 60),
    surgeryDate: clampRequiredStr(profile.surgeryDate, '2022-03-09', 16),
    surgeryWeightKg: clampNum(profile.surgeryWeightKg, 141, 30, 350),
    surgeryBmi: clampNum(profile.surgeryBmi, 41.6, 10, 100),
    lowestWeightKg: clampNum(profile.lowestWeightKg, 104, 30, 350),
    baselineWeightKg: clampNum(profile.baselineWeightKg, 126, 30, 350),
    baselineBmi: clampNum(profile.baselineBmi, 37.2, 10, 100),
    baselineDate: clampRequiredStr(profile.baselineDate, '2026-10-24', 16),
    baselineMeasuresCm: {
      umbilical: clampNum(profile.baselineMeasuresCm?.umbilical, 134, 40, 250),
      hips: clampNum(profile.baselineMeasuresCm?.hips, 124, 40, 250),
      chest: clampNum(profile.baselineMeasuresCm?.chest, 129, 40, 250),
    },
    positiveGoal: clampRequiredStr(
      profile.positiveGoal,
      'Voglio pesare 109 kg (sotto i 110 kg), sentirmi leggero, energico e padrone delle mie scelte.',
      500
    ),
    clinicianName: clampRequiredStr(profile.clinicianName, 'Dott.ssa Elida Bardho', 100),
    clinicianPhone: clampRequiredStr(profile.clinicianPhone, '335/6898371', 40),
    clinicianEmail: clampRequiredStr(profile.clinicianEmail, 'elibardho@gmail.com', 100),
  };
}

export function sanitizeBadges(badges: StanzaBadge[]): Record<string, unknown>[] {
  return badges.slice(0, 20).map((b) =>
    stripUndefined({
      id: sanitizeId(b.id, 'badge'),
      stanza: clampRequiredStr(b.stanza, 'Stanza', 80),
      title: clampRequiredStr(b.title, 'Traguardo', 120),
      description: clampRequiredStr(b.description, '', 300),
      unlockedAt: b.unlockedAt ? clampStr(b.unlockedAt, 16) : undefined,
    })
  );
}

export function sanitizeMealPayload(meal: MealEntry, uid: string): Record<string, unknown> {
  const id = sanitizeId(meal.id, 'meal');
  return stripUndefined({
    ownerUid: uid,
    id,
    date: clampRequiredStr(meal.date, new Date().toISOString().slice(0, 10), 16),
    time: clampRequiredStr(meal.time, '12:00', 16),
    slot: meal.slot,
    description: clampRequiredStr(meal.description, 'Pasto registrato', 600),
    proteinCategory: clampRequiredStr(meal.proteinCategory, 'nessuno', 40),
    hasVegetables: Boolean(meal.hasVegetables),
    preHungerScale: clampNum(meal.preHungerScale, 8, 0, 10),
    postSatietyScale: clampNum(meal.postSatietyScale, 5, 0, 10),
    perceivedEnergy: clampNum(meal.perceivedEnergy, 4, 1, 5),
    slowEatingUsed: Boolean(meal.slowEatingUsed),
    slowMotionSecondsUsed: Boolean(meal.slowMotionSecondsUsed),
    leftABite: Boolean(meal.leftABite),
    symptomsReported: (meal.symptomsReported ?? [])
      .map((s) => String(s).trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 10),
    notes: clampStr(meal.notes, 600),
  });
}

export function sanitizeSosPayload(entry: SosProvaEntry, uid: string): Record<string, unknown> {
  const id = sanitizeId(entry.id, 'sos');
  return stripUndefined({
    ownerUid: uid,
    id,
    date: clampRequiredStr(entry.date, new Date().toISOString().slice(0, 10), 16),
    time: clampRequiredStr(entry.time, '18:00', 16),
    situation: clampRequiredStr(entry.situation, 'Onda emotiva gestita', 500),
    bodyZone: clampRequiredStr(entry.bodyZone, 'stomaco', 32),
    emotionName: clampRequiredStr(entry.emotionName, 'Tensione', 200),
    intensityLevel: clampNum(entry.intensityLevel, 2, 1, 5),
    hungerType: entry.hungerType,
    realNeed: clampRequiredStr(entry.realNeed, 'riposo', 40),
    strategyUsed: clampRequiredStr(entry.strategyUsed, 'Respiri lenti', 400),
    waitedMinutes: clampNum(entry.waitedMinutes, 5, 0, 240),
    outcome: entry.outcome,
    xpEarned: clampNum(entry.xpEarned, 25, 0, 500),
    notes: clampStr(entry.notes, 600),
  });
}

export function sanitizeCheckinPayload(checkin: DailyCheckin, uid: string): Record<string, unknown> {
  const id = sanitizeId(checkin.id || `chk_${checkin.date}`, 'chk');
  return stripUndefined({
    ownerUid: uid,
    id,
    date: clampRequiredStr(checkin.date, new Date().toISOString().slice(0, 10), 16),
    sleepHours:
      checkin.sleepHours !== undefined ? clampNum(checkin.sleepHours, 7, 0, 24) : undefined,
    sleepQuality:
      checkin.sleepQuality !== undefined ? clampNum(checkin.sleepQuality, 3, 1, 5) : undefined,
    dreamJournal: clampStr(checkin.dreamJournal, 2000),
    morningDomandeNotes: clampStr(checkin.morningDomandeNotes, 1000),
    kinestheticAnchorDone:
      checkin.kinestheticAnchorDone !== undefined
        ? Boolean(checkin.kinestheticAnchorDone)
        : undefined,
    movementMinutes:
      checkin.movementMinutes !== undefined
        ? clampNum(checkin.movementMinutes, 0, 0, 600)
        : undefined,
    afternoonParachuteDone:
      checkin.afternoonParachuteDone !== undefined
        ? Boolean(checkin.afternoonParachuteDone)
        : undefined,
    afternoonSnackChoice: clampStr(checkin.afternoonSnackChoice, 250),
    eveningSuccess: clampStr(checkin.eveningSuccess, 600),
    eveningEmotionType: checkin.eveningEmotionType,
    eveningRepairOrCompassion: clampStr(checkin.eveningRepairOrCompassion, 800),
    eveningRitualDone:
      checkin.eveningRitualDone !== undefined ? Boolean(checkin.eveningRitualDone) : undefined,
    eveningRitualChoice: clampStr(checkin.eveningRitualChoice, 250),
    hydrationGlasses:
      checkin.hydrationGlasses !== undefined
        ? clampNum(checkin.hydrationGlasses, 0, 0, 24)
        : undefined,
    hydrationAwayFromMealsDone:
      checkin.hydrationAwayFromMealsDone !== undefined
        ? Boolean(checkin.hydrationAwayFromMealsDone)
        : undefined,
    hydrationXpAwarded:
      checkin.hydrationXpAwarded !== undefined
        ? Boolean(checkin.hydrationXpAwarded)
        : undefined,
  });
}

export function sanitizeMeasurementPayload(
  entry: WeightTapeEntry,
  uid: string
): Record<string, unknown> {
  const id = sanitizeId(entry.id, 'meas');
  return stripUndefined({
    ownerUid: uid,
    id,
    date: clampRequiredStr(entry.date, new Date().toISOString().slice(0, 10), 16),
    weightKg: clampNum(entry.weightKg, 120, 30, 350),
    umbilicalCm:
      entry.umbilicalCm !== undefined ? clampNum(entry.umbilicalCm, 120, 40, 250) : undefined,
    hipsCm: entry.hipsCm !== undefined ? clampNum(entry.hipsCm, 120, 40, 250) : undefined,
    chestCm: entry.chestCm !== undefined ? clampNum(entry.chestCm, 120, 40, 250) : undefined,
    advisorNote: clampStr(entry.advisorNote, 500),
  });
}

export function sanitizeWheelPayload(
  assessment: WheelAssessment,
  uid: string
): Record<string, unknown> {
  const id = sanitizeId(assessment.id, 'wheel');
  const areas = (assessment.areas ?? []).slice(0, 12).map((a) => ({
    areaId: clampRequiredStr(a.areaId, 'area', 64),
    label: clampRequiredStr(a.label, 'Area', 80),
    sa: clampNum(a.sa, 5, 1, 10),
    sd: clampNum(a.sd, 8, 1, 10),
  }));
  return {
    ownerUid: uid,
    id,
    date: clampRequiredStr(assessment.date, new Date().toISOString().slice(0, 10), 16),
    areas,
    focusAreaId: clampRequiredStr(assessment.focusAreaId, areas[0]?.areaId ?? 'salute_fisica', 64),
    firstMicroStep: clampRequiredStr(
      assessment.firstMicroStep,
      'Un piccolo passo piacevole oggi.',
      400
    ),
  };
}

export function sanitizeChatPayload(msg: ChatMessage, uid: string): Record<string, unknown> {
  const id = sanitizeId(msg.id, 'msg');
  return stripUndefined({
    ownerUid: uid,
    id,
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: clampRequiredStr(msg.content, '...', 4000),
    timestamp: clampRequiredStr(msg.timestamp, '00:00', 16),
    commandTriggered: clampStr(msg.commandTriggered, 32),
    redFlagTriggered:
      msg.redFlagTriggered !== undefined ? Boolean(msg.redFlagTriggered) : undefined,
    slipUpReframed:
      msg.slipUpReframed !== undefined ? Boolean(msg.slipUpReframed) : undefined,
    actions:
      msg.actions && msg.actions.length > 0
        ? msg.actions.slice(0, 6).map((a) => ({
            type: String(a.type).slice(0, 40),
            label: String(a.label).slice(0, 120),
          }))
        : undefined,
  });
}

export function sanitizeClinicalVisitPayload(
  visit: ClinicalVisitEntry,
  uid: string
): Record<string, unknown> {
  const id = sanitizeId(visit.id, 'visit');
  return stripUndefined({
    ownerUid: uid,
    id,
    date: clampRequiredStr(visit.date, new Date().toISOString().slice(0, 10), 16),
    clinicianName: clampRequiredStr(visit.clinicianName, 'Dott.ssa Elida Bardho', 120),
    weightAtVisitKg:
      visit.weightAtVisitKg !== undefined
        ? clampNum(visit.weightAtVisitKg, 120, 30, 350)
        : undefined,
    summaryNotes: clampRequiredStr(visit.summaryNotes, 'Visita di controllo Bariclip', 1200),
    nextFocus: clampRequiredStr(visit.nextFocus, 'Proseguire con costanza', 600),
    nextVisitDate: clampStr(visit.nextVisitDate, 16),
  });
}
