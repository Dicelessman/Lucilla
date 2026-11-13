import {
  BodyZone,
  CoachState,
  DailyCheckin,
  EmotionReflectionType,
  HungerType,
  MealEntry,
  MealSlot,
  ProteinCategory,
  RealNeed,
  SosOutcome,
  SosProvaEntry,
  WeightTapeEntry,
} from '../types/coach.ts';
import {
  applyDailyCheckinRewards,
  calculateBmi,
  calculateSosXp,
  calculateWeeklyMovementAndHydration,
  calculateWeeklyProteinCounts,
  evaluateSleepBiology,
  getLearningStage,
  getMonthlyTrendSummary,
  validateMealAgainstPlan,
} from './bariclipRules.ts';
import { WEEKLY_CHALLENGES } from './seedData.ts';

export interface VoiceToolExecutionResult {
  nextState: CoachState;
  toolResult: Record<string, unknown>;
  uiCommand?: {
    tab?: 'oggi' | 'diario' | 'pnl' | 'report';
    openSosModal?: boolean;
    openRadioBorbottona?: boolean;
    notice?: string;
  };
}

export function executeVoiceTool(
  state: CoachState,
  toolName: string,
  args: Record<string, unknown>,
  todayDate?: string
): VoiceToolExecutionResult {
  const today = todayDate || new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });

  switch (toolName) {
    case 'log_meal': {
      const slot = (args.slot as MealSlot) || 'pranzo';
      const description = String(args.description || 'Pasto registrato a voce');
      const proteinCategory = (args.proteinCategory as ProteinCategory) || 'nessuno';
      const hasVegetables = args.hasVegetables !== false;
      const preHungerScale = Number(args.preHungerScale ?? 8);
      const postSatietyScale = Number(args.postSatietyScale ?? 5);
      const slowEatingUsed = args.slowEatingUsed !== false;
      const leftABite = Boolean(args.leftABite ?? false);
      const symptomsReported = Array.isArray(args.symptomsReported)
        ? args.symptomsReported.map(String)
        : [];

      const candidate: Omit<MealEntry, 'id'> = {
        date: today,
        time: nowTime,
        slot,
        description,
        proteinCategory,
        hasVegetables,
        preHungerScale,
        postSatietyScale,
        perceivedEnergy: Number(args.perceivedEnergy ?? 4),
        slowEatingUsed,
        slowMotionSecondsUsed: Boolean(args.slowMotionSecondsUsed ?? slowEatingUsed),
        leftABite,
        symptomsReported,
      };

      const validation = validateMealAgainstPlan(candidate, state.meals);
      const newMeal: MealEntry = { id: `meal_v_${Date.now()}`, ...candidate };
      const nextMeals = [...state.meals, newMeal];
      const slowCount = nextMeals.filter((m) => m.slowEatingUsed).length;
      const nextBadges = state.badges.map((b) =>
        b.id === 'stanza_presenza' && !b.unlockedAt && slowCount >= 5
          ? { ...b, unlockedAt: today }
          : b
      );
      const xpGain = slowEatingUsed ? 15 : 5;

      return {
        nextState: {
          ...state,
          xp: state.xp + xpGain,
          meals: nextMeals,
          badges: nextBadges,
        },
        toolResult: {
          saved: true,
          meal: newMeal,
          xpGained: xpGain,
          duplicateCategoryWarning: validation.duplicateCategoryWarning,
          avoidItemsDetected: validation.avoidItemsDetected,
          redFlagSymptoms: validation.redFlagSymptoms,
          sundayPrimoWarning: validation.sundayPrimoWarning,
          satietyFeedback: validation.satietyFeedback,
        },
        uiCommand: {
          notice: `Pasto registrato a voce: ${description}`,
        },
      };
    }

    case 'log_morning_checkin': {
      const existing: DailyCheckin = state.checkins.find((c) => c.date === today) ?? {
        id: `chk_${today}`,
        date: today,
      };
      const sleepHours =
        args.sleepHours !== undefined ? Number(args.sleepHours) : existing.sleepHours;
      const updated: DailyCheckin = {
        ...existing,
        sleepHours,
        sleepQuality:
          args.sleepQuality !== undefined
            ? (Math.min(5, Math.max(1, Number(args.sleepQuality))) as 1 | 2 | 3 | 4 | 5)
            : existing.sleepQuality,
        dreamJournal:
          args.dreamJournal !== undefined ? String(args.dreamJournal) : existing.dreamJournal,
        morningDomandeNotes:
          args.morningDomandeNotes !== undefined
            ? String(args.morningDomandeNotes)
            : existing.morningDomandeNotes,
        kinestheticAnchorDone:
          args.kinestheticAnchorDone !== undefined
            ? Boolean(args.kinestheticAnchorDone)
            : existing.kinestheticAnchorDone,
        movementMinutes:
          args.movementMinutes !== undefined
            ? Number(args.movementMinutes)
            : existing.movementMinutes,
        hydrationGlasses:
          args.hydrationGlasses !== undefined
            ? Math.min(24, Math.max(0, Number(args.hydrationGlasses)))
            : existing.hydrationGlasses,
        hydrationAwayFromMealsDone:
          args.hydrationAwayFromMealsDone !== undefined
            ? Boolean(args.hydrationAwayFromMealsDone)
            : existing.hydrationAwayFromMealsDone,
      };

      const rewardRes = applyDailyCheckinRewards(
        state.checkins,
        updated,
        state.xp,
        state.badges,
        today,
        15
      );
      const sleepAlert =
        typeof sleepHours === 'number' ? evaluateSleepBiology(sleepHours) : null;

      return {
        nextState: {
          ...state,
          xp: rewardRes.nextXp,
          checkins: rewardRes.nextCheckins,
          badges: rewardRes.nextBadges,
        },
        toolResult: {
          saved: true,
          checkin: rewardRes.updatedCheckin,
          sleepAlert,
          unlockedBadges: rewardRes.unlockedTitles,
        },
        uiCommand: {
          notice:
            rewardRes.unlockedTitles.length > 0
              ? `Check-in salvato! Sbloccato: ${rewardRes.unlockedTitles[0]}`
              : 'Check-in Mattina & Diario dei Sogni aggiornato a voce',
        },
      };
    }

    case 'log_hydration': {
      const existing: DailyCheckin = state.checkins.find((c) => c.date === today) ?? {
        id: `chk_${today}`,
        date: today,
      };
      const addGlasses = args.addGlasses !== undefined ? Number(args.addGlasses) : 0;
      const explicitGlasses =
        args.hydrationGlasses !== undefined
          ? Number(args.hydrationGlasses)
          : (existing.hydrationGlasses ?? 0) + addGlasses;
      const updated: DailyCheckin = {
        ...existing,
        hydrationGlasses: Math.min(24, Math.max(0, Math.round(explicitGlasses))),
        hydrationAwayFromMealsDone:
          args.hydrationAwayFromMealsDone !== undefined
            ? Boolean(args.hydrationAwayFromMealsDone)
            : existing.hydrationAwayFromMealsDone ?? true,
      };

      const rewardRes = applyDailyCheckinRewards(
        state.checkins,
        updated,
        state.xp,
        state.badges,
        today,
        0
      );

      return {
        nextState: {
          ...state,
          xp: rewardRes.nextXp,
          checkins: rewardRes.nextCheckins,
          badges: rewardRes.nextBadges,
        },
        toolResult: {
          saved: true,
          hydrationGlasses: rewardRes.updatedCheckin.hydrationGlasses ?? 0,
          hydrationAwayFromMealsDone: Boolean(
            rewardRes.updatedCheckin.hydrationAwayFromMealsDone
          ),
          xpGained: rewardRes.xpGained,
        },
        uiCommand: {
          notice: `Idratazione aggiornata: ${rewardRes.updatedCheckin.hydrationGlasses ?? 0}/8 bicchieri`,
        },
      };
    }

    case 'log_afternoon_parachute': {
      const existing: DailyCheckin = state.checkins.find((c) => c.date === today) ?? {
        id: `chk_${today}`,
        date: today,
      };
      const updated: DailyCheckin = {
        ...existing,
        afternoonParachuteDone: args.done !== false,
        afternoonSnackChoice: String(args.snackChoice || '30g grana / parmigiano'),
      };
      const rewardRes = applyDailyCheckinRewards(
        state.checkins,
        updated,
        state.xp,
        state.badges,
        today,
        15
      );

      return {
        nextState: {
          ...state,
          xp: rewardRes.nextXp,
          checkins: rewardRes.nextCheckins,
          badges: rewardRes.nextBadges,
        },
        toolResult: { saved: true, checkin: rewardRes.updatedCheckin },
        uiCommand: { notice: 'Paracadute delle 17:30 registrato a voce' },
      };
    }

    case 'log_evening_closure': {
      const existing: DailyCheckin = state.checkins.find((c) => c.date === today) ?? {
        id: `chk_${today}`,
        date: today,
      };
      const updated: DailyCheckin = {
        ...existing,
        eveningSuccess:
          args.eveningSuccess !== undefined
            ? String(args.eveningSuccess)
            : existing.eveningSuccess,
        eveningEmotionType:
          (args.eveningEmotionType as EmotionReflectionType) ||
          existing.eveningEmotionType ||
          'nessuna',
        eveningRepairOrCompassion:
          args.eveningRepairOrCompassion !== undefined
            ? String(args.eveningRepairOrCompassion)
            : existing.eveningRepairOrCompassion,
        eveningRitualDone: args.eveningRitualDone !== false,
        eveningRitualChoice:
          args.eveningRitualChoice !== undefined
            ? String(args.eveningRitualChoice)
            : existing.eveningRitualChoice,
      };
      const rewardRes = applyDailyCheckinRewards(
        state.checkins,
        updated,
        state.xp,
        state.badges,
        today,
        20
      );

      return {
        nextState: {
          ...state,
          xp: rewardRes.nextXp,
          checkins: rewardRes.nextCheckins,
          badges: rewardRes.nextBadges,
        },
        toolResult: { saved: true, checkin: rewardRes.updatedCheckin },
        uiCommand: { notice: 'Chiusura serale e rituale registrati a voce' },
      };
    }

    case 'log_sos_prova': {
      const intensityLevel = Math.min(5, Math.max(1, Number(args.intensityLevel ?? 2))) as
        | 1
        | 2
        | 3
        | 4
        | 5;
      const waitedMinutes = Math.max(0, Number(args.waitedMinutes ?? 5));
      const xpEarned = calculateSosXp(intensityLevel, waitedMinutes, true);

      const entry: SosProvaEntry = {
        id: `sos_v_${Date.now()}`,
        date: today,
        time: nowTime,
        situation: String(args.situation || 'Onda emotiva gestita a voce con Lucilla'),
        bodyZone: (args.bodyZone as BodyZone) || 'stomaco',
        emotionName: String(args.emotionName || 'Tensione'),
        intensityLevel,
        hungerType: (args.hungerType as HungerType) || 'emotiva',
        realNeed: (args.realNeed as RealNeed) || 'riposo',
        strategyUsed: String(
          args.strategyUsed || 'Dialogo vocale con Lucilla + 3 respiri lenti'
        ),
        waitedMinutes,
        outcome: (args.outcome as SosOutcome) || 'onda_surfata',
        xpEarned,
        notes: args.notes ? String(args.notes) : undefined,
      };

      const nextBadges = state.badges.map((b) =>
        b.id === 'stanza_relazioni' && !b.unlockedAt && intensityLevel >= 4
          ? { ...b, unlockedAt: today }
          : b
      );

      return {
        nextState: {
          ...state,
          xp: state.xp + xpEarned,
          sosLogs: [...state.sosLogs, entry],
          badges: nextBadges,
        },
        toolResult: {
          saved: true,
          entry,
          clinicianContactIfNeeded:
            intensityLevel >= 4
              ? `${state.profile.clinicianName} · ${state.profile.clinicianPhone}`
              : null,
        },
        uiCommand: { notice: `Prova SOS salvata (+${xpEarned} XP)` },
      };
    }

    case 'log_measurement': {
      const weightKg = Number(args.weightKg ?? state.profile.baselineWeightKg);
      const entry: WeightTapeEntry = {
        id: `meas_v_${Date.now()}`,
        date: today,
        weightKg,
        umbilicalCm: args.umbilicalCm !== undefined ? Number(args.umbilicalCm) : undefined,
        hipsCm: args.hipsCm !== undefined ? Number(args.hipsCm) : undefined,
        chestCm: args.chestCm !== undefined ? Number(args.chestCm) : undefined,
        advisorNote: args.advisorNote ? String(args.advisorNote) : undefined,
      };
      return {
        nextState: {
          ...state,
          xp: state.xp + 15,
          measurements: [...state.measurements, entry],
        },
        toolResult: {
          saved: true,
          entry,
          bmi: calculateBmi(weightKg, state.profile.heightCm),
        },
        uiCommand: { notice: `Pesata registrata a voce: ${weightKg} kg` },
      };
    }

    case 'update_wheel_area': {
      const latest = state.wheelAssessments[state.wheelAssessments.length - 1];
      if (!latest) {
        return {
          nextState: state,
          toolResult: { saved: false, reason: 'Nessuna Ruota della Vita trovata' },
        };
      }
      const areaId = String(args.areaId || '');
      const updatedAreas = latest.areas.map((a) => {
        if (a.areaId !== areaId) return a;
        return {
          ...a,
          sa: args.sa !== undefined ? Math.min(10, Math.max(1, Number(args.sa))) : a.sa,
          sd: args.sd !== undefined ? Math.min(10, Math.max(1, Number(args.sd))) : a.sd,
        };
      });
      const updatedWheel = {
        ...latest,
        id: `wheel_v_${Date.now()}`,
        date: today,
        areas: updatedAreas,
        focusAreaId: args.focusAreaId ? String(args.focusAreaId) : latest.focusAreaId,
        firstMicroStep: args.firstMicroStep
          ? String(args.firstMicroStep)
          : latest.firstMicroStep,
      };
      return {
        nextState: {
          ...state,
          xp: state.xp + 20,
          wheelAssessments: [...state.wheelAssessments, updatedWheel],
        },
        toolResult: { saved: true, updatedWheel },
        uiCommand: {
          tab: 'pnl',
          notice: 'Ruota della Vita aggiornata a voce',
        },
      };
    }

    case 'navigate_or_open_tool': {
      const tab = args.tab as 'oggi' | 'diario' | 'pnl' | 'report' | undefined;
      const openSosModal = Boolean(args.openSosModal);
      const openRadioBorbottona = Boolean(args.openRadioBorbottona);
      return {
        nextState: state,
        toolResult: { ok: true, tab, openSosModal, openRadioBorbottona },
        uiCommand: {
          tab,
          openSosModal,
          openRadioBorbottona,
          notice: tab ? `Vista aperta: ${tab}` : undefined,
        },
      };
    }

    case 'get_current_progress': {
      const summary = getMonthlyTrendSummary(state);
      const stage = getLearningStage(state.xp);
      const weeklyCounts = calculateWeeklyProteinCounts(state.meals, today);
      const movementHydration = calculateWeeklyMovementAndHydration(state.checkins, today);
      const challenge =
        WEEKLY_CHALLENGES.find((w) => w.id === state.activeChallengeId) ??
        WEEKLY_CHALLENGES[0];
      return {
        nextState: state,
        toolResult: {
          profileName: state.profile.name,
          positiveGoal: state.profile.positiveGoal,
          xp: state.xp,
          learningStage: stage.title,
          activeChallenge: challenge.title,
          latestWeightKg: summary.latestWeight,
          bmi: calculateBmi(summary.latestWeight, state.profile.heightCm),
          weightDeltaKg: summary.weightDelta,
          slowEatingRatePercent: summary.slowEatingRate,
          avgPostSatiety: summary.avgPostSatiety,
          avgSleepHours: summary.avgSleep,
          surfedWaves: summary.surfedWaves,
          weeklyMovementMinutes: movementHydration.weeklyMovementMinutes,
          todayHydrationGlasses: movementHydration.todayHydrationGlasses,
          weeklyProteins: weeklyCounts.map((w) => ({
            label: w.label,
            current: w.current,
            target: w.target,
          })),
        },
      };
    }

    default:
      return {
        nextState: state,
        toolResult: { error: `Tool sconosciuto: ${toolName}` },
      };
  }
}
