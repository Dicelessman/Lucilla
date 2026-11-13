import { CoachState } from '../types/coach.ts';
import {
  calculateBmi,
  calculateWeeklyProteinCounts,
  getLearningStage,
  getMonthlyTrendSummary,
} from './bariclipRules.ts';

export function generateBardhoMarkdownReport(state: CoachState, referenceDate?: string): string {
  const today = referenceDate || new Date().toISOString().slice(0, 10);
  const summary = getMonthlyTrendSummary(state);
  const stage = getLearningStage(state.xp);
  const weeklyCounts = calculateWeeklyProteinCounts(state.meals, today);
  const latestMeasure = [...state.measurements].sort((a, b) => b.date.localeCompare(a.date))[0];
  const currentBmi = calculateBmi(summary.latestWeight, state.profile.heightCm);

  const sosRows = [...state.sosLogs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (s) =>
        `| ${s.date} ${s.time} | ${s.situation} (${s.emotionName}, ${s.bodyZone}) | ${s.intensityLevel}/5 | ${s.strategyUsed} (${s.waitedMinutes} min) | ${s.outcome.replace(/_/g, ' ')} |`
    )
    .join('\n');

  const checkinRows = [...state.checkins]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((c) => {
      const sleepStr = c.sleepHours !== undefined ? `${c.sleepHours}h (q.${c.sleepQuality ?? '-'}/5)` : '-';
      const emotionNote =
        c.eveningEmotionType && c.eveningEmotionType !== 'nessuna'
          ? `${c.eveningEmotionType}: ${c.eveningRepairOrCompassion || '-'}`
          : c.eveningSuccess || '-';
      return `| ${c.date} | ${sleepStr} | ${c.afternoonParachuteDone ? 'Sì' : 'No'} | ${emotionNote} |`;
    })
    .join('\n');

  const proteinRows = weeklyCounts
    .map((p) => `- **${p.label}** (${p.portionGuide}): ${p.current} / ${p.target} questa settimana`)
    .join('\n');

  const avgHydration = (() => {
    const withH = state.checkins.filter((c) => typeof c.hydrationGlasses === 'number');
    if (withH.length === 0) return null;
    const sum = withH.reduce((acc, c) => acc + (c.hydrationGlasses ?? 0), 0);
    return Number((sum / withH.length).toFixed(1));
  })();

  const visitRows = [...(state.clinicalVisits ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (v) =>
        `- **${v.date} — ${v.clinicianName}**${
          v.weightAtVisitKg ? ` (${v.weightAtVisitKg} kg)` : ''
        }: ${v.summaryNotes} _Focus successivo:_ ${v.nextFocus}${
          v.nextVisitDate ? ` (Prossimo controllo: ${v.nextVisitDate})` : ''
        }`
    )
    .join('\n');

  return `# Report Clinico & Registro delle Prove — Dott.ssa Elida Bardho
**Paziente:** ${state.profile.name} (${state.profile.heightCm} cm)
**Data report:** ${today}
**Intervento:** ${state.profile.surgeryType} (${state.profile.surgeryDate})
**Clinico di riferimento:** ${state.profile.clinicianName} — ${state.profile.clinicianPhone} (${state.profile.clinicianEmail})

---

## 1. Quadro Antropometrico e Obiettivo PNL
- **Peso attuale:** ${summary.latestWeight} kg (BMI ${currentBmi}) | **Variazione dal baseline:** ${summary.weightDelta > 0 ? '+' : ''}${summary.weightDelta} kg
- **Baseline (${state.profile.baselineDate}):** ${state.profile.baselineWeightKg} kg (BMI ${state.profile.baselineBmi})
- **Ultime misure (ombelico / fianchi / torace):** ${latestMeasure?.umbilicalCm ?? state.profile.baselineMeasuresCm.umbilical} / ${latestMeasure?.hipsCm ?? state.profile.baselineMeasuresCm.hips} / ${latestMeasure?.chestCm ?? state.profile.baselineMeasuresCm.chest} cm
- **Obiettivo formulato in positivo:** _"${state.profile.positiveGoal}"_
- **Stadio Apprendimento PNL:** ${stage.title} (${state.xp} XP Muscolo della Tolleranza)

---

## 2. Indicatori di Aderenza Comportamentale
- **Slow Eating nei pasti registrati:** ${summary.slowEatingRate}%
- **Sazietà media post-pasto (scala 10 -> 0):** ${summary.avgPostSatiety} (zona ideale 5–6)
- **Sonno medio registrato:** ${summary.avgSleep} ore/notte
- **Idratazione media lontano dai pasti:** ${avgHydration !== null ? `${avgHydration} bicchieri/giorno` : 'In avvio'}
- **Onde emotive gestite con presenza:** ${summary.surfedWaves} su ${summary.totalSos} episodi

---

## 3. Aderenza Frequenze Settimanali Piano Bariclip
${proteinRows}

---

## 4. Registro delle Prove (Allenamento alla Frustrazione)
| Data e Ora | Frustrazione / Situazione | Livello (1-5) | Cosa ho fatto | Come è andata |
| --- | --- | :---: | --- | --- |
${sosRows || '| - | Nessuna prova registrata | - | - | - |'}

---

## 5. Diario Sonno, Paracadute 17:30 e Note Emotive (Colpa vs Vergogna)
| Data | Sonno | Spuntino 17:30 | Successo / Riparazione emotiva serale |
| --- | --- | :---: | --- |
${checkinRows || '| - | - | - | - |'}

---

## 6. Diario Visite Cliniche & Note Dott.ssa Bardho
${visitRows || '- Nessuna visita registrata finora.'}
`;
}

export function generateBardhoCsvExport(state: CoachState): string {
  const header = ['Data', 'Ora', 'Situazione', 'Zona Corpo', 'Emozione', 'Livello 1-5', 'Tipo Fame', 'Strategia', 'Minuti Attesa', 'Esito'].join(',');
  const rows = state.sosLogs.map((s) =>
    [
      s.date,
      s.time,
      `"${s.situation.replace(/"/g, '""')}"`,
      s.bodyZone,
      `"${s.emotionName.replace(/"/g, '""')}"`,
      s.intensityLevel,
      s.hungerType,
      `"${s.strategyUsed.replace(/"/g, '""')}"`,
      s.waitedMinutes,
      s.outcome,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}
