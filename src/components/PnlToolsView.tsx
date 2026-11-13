import React, { useState } from 'react';
import {
  Award,
  Scale,
  Target,
  Compass,
  Check,
  Headphones,
  Calendar,
  Bell,
  Pencil,
  Trash2,
  X,
  Play,
  BookMarked,
  Sparkles,
  Activity,
  Music,
  Pause,
} from 'lucide-react';
import { EditorialImage } from './EditorialImage.tsx';
import pnlCalmLandscapeImg from '../assets/images/pnl_calm_landscape_1794581848656.jpg';
import {
  DailyCheckin,
  StanzaBadge,
  UserProfile,
  WeightTapeEntry,
  WheelAreaScore,
  WheelAssessment,
} from '../types/coach.ts';
import {
  calculateBmi,
  calculateWeeklyMovementAndHydration,
  getLearningStage,
} from '../utils/bariclipRules.ts';
import { WEEKLY_CHALLENGES } from '../utils/seedData.ts';
import {
  generateWeeklyRoutinesIcs,
  PNL_AUDIO_SESSIONS,
  PnlAudioScriptId,
} from '../utils/insightsAndPlanner.ts';

interface PnlToolsViewProps {
  xp: number;
  activeChallengeId: string;
  onSelectChallenge: (id: string) => void;
  badges: StanzaBadge[];
  checkins: DailyCheckin[];
  wheelAssessments: WheelAssessment[];
  onSaveWheel: (assessment: WheelAssessment) => void;
  measurements: WeightTapeEntry[];
  weighInDayOfWeek: string;
  onAddMeasurement: (entry: WeightTapeEntry) => void;
  onUpdateMeasurement: (entry: WeightTapeEntry) => void;
  onDeleteMeasurement: (measId: string) => void;
  profile: UserProfile;
  getIdToken: () => Promise<string | null>;
  ambientMusicPlaying?: boolean;
  onToggleAmbientMusic?: () => void;
}

export function PnlToolsView({
  xp,
  activeChallengeId,
  onSelectChallenge,
  badges,
  checkins,
  wheelAssessments,
  onSaveWheel,
  measurements,
  weighInDayOfWeek,
  onAddMeasurement,
  onUpdateMeasurement,
  onDeleteMeasurement,
  profile,
  getIdToken,
  ambientMusicPlaying = false,
  onToggleAmbientMusic,
}: PnlToolsViewProps) {
  const today = new Date().toISOString().slice(0, 10);
  const stage = getLearningStage(xp);
  const latestWheel = wheelAssessments[wheelAssessments.length - 1];
  const { weeklyMovementMinutes } = calculateWeeklyMovementAndHydration(checkins, today);
  const weeklyMovementPercent = Math.min(100, Math.round((weeklyMovementMinutes / 150) * 100));
  const dreamEntries = [...checkins]
    .filter((c) => Boolean(c.dreamJournal?.trim()))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Ruota della Vita state
  const [areas, setAreas] = useState<WheelAreaScore[]>(
    latestWheel?.areas ?? [
      { areaId: 'lavoro', label: 'Lavoro', sa: 6, sd: 8 },
      { areaId: 'famiglia_attuale', label: 'Famiglia attuale', sa: 7, sd: 9 },
      { areaId: 'famiglia_origine', label: 'Famiglia d’origine', sa: 6, sd: 7 },
      { areaId: 'coppia', label: 'Coppia', sa: 7, sd: 9 },
      { areaId: 'salute_fisica', label: 'Salute fisica', sa: 5, sd: 9 },
      { areaId: 'salute_mentale', label: 'Salute mentale', sa: 6, sd: 9 },
      { areaId: 'tempo_libero', label: 'Tempo libero / svago', sa: 5, sd: 8 },
      { areaId: 'crescita', label: 'Crescita personale', sa: 7, sd: 9 },
      { areaId: 'amici', label: 'Amici e relazioni', sa: 7, sd: 8 },
    ]
  );
  const [focusAreaId, setFocusAreaId] = useState<string>(
    latestWheel?.focusAreaId ?? 'salute_fisica'
  );
  const [firstMicroStep, setFirstMicroStep] = useState<string>(
    latestWheel?.firstMicroStep ?? ''
  );
  const [wheelSaved, setWheelSaved] = useState(false);

  // Weigh-in & Tape Measure state (+ Edit/Delete)
  const latestM = [...measurements].sort((a, b) => b.date.localeCompare(a.date))[0];
  const [editingMeasId, setEditingMeasId] = useState<string | null>(null);
  const [measDate, setMeasDate] = useState<string>(today);
  const [weightKg, setWeightKg] = useState<number>(latestM?.weightKg ?? profile.baselineWeightKg);
  const [umbilicalCm, setUmbilicalCm] = useState<number>(
    latestM?.umbilicalCm ?? profile.baselineMeasuresCm.umbilical
  );
  const [hipsCm, setHipsCm] = useState<number>(
    latestM?.hipsCm ?? profile.baselineMeasuresCm.hips
  );
  const [chestCm, setChestCm] = useState<number>(
    latestM?.chestCm ?? profile.baselineMeasuresCm.chest
  );
  const [advisorNote, setAdvisorNote] = useState<string>('');
  const [confirmDeleteMeasId, setConfirmDeleteMeasId] = useState<string | null>(null);

  // PNL Guided Audio state
  const [loadingAudioId, setLoadingAudioId] = useState<PnlAudioScriptId | null>(null);
  const [audioSession, setAudioSession] = useState<{
    id: PnlAudioScriptId;
    title: string;
    scriptText: string;
    audioSrc: string | null;
    fallbackReason?: string;
  } | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Calendar ICS & Notification Reminders
  const [nextVisitDate, setNextVisitDate] = useState<string>('');
  const [notifStatus, setNotifStatus] = useState<string>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);

  // Dream Journal Archive + NLP Insights state
  const [dreamInsights, setDreamInsights] = useState<Record<string, string>>({});
  const [loadingDreamId, setLoadingDreamId] = useState<string | null>(null);
  const [dreamInsightError, setDreamInsightError] = useState<string | null>(null);

  function updateArea(areaId: string, field: 'sa' | 'sd', value: number) {
    setAreas((prev) =>
      prev.map((a) => (a.areaId === areaId ? { ...a, [field]: value } : a))
    );
  }

  function handleSaveWheel(e: React.FormEvent) {
    e.preventDefault();
    onSaveWheel({
      id: `wheel_${Date.now()}`,
      date: today,
      areas,
      focusAreaId,
      firstMicroStep: firstMicroStep.trim() || 'Un piccolo passo piacevole questa settimana',
    });
    setWheelSaved(true);
    setTimeout(() => setWheelSaved(false), 3000);
  }

  function resetMeasForm() {
    setEditingMeasId(null);
    setMeasDate(today);
    setAdvisorNote('');
  }

  function startEditMeas(m: WeightTapeEntry) {
    setEditingMeasId(m.id);
    setMeasDate(m.date);
    setWeightKg(m.weightKg);
    setUmbilicalCm(m.umbilicalCm ?? profile.baselineMeasuresCm.umbilical);
    setHipsCm(m.hipsCm ?? profile.baselineMeasuresCm.hips);
    setChestCm(m.chestCm ?? profile.baselineMeasuresCm.chest);
    setAdvisorNote(m.advisorNote ?? '');
  }

  function handleSaveMeasurement(e: React.FormEvent) {
    e.preventDefault();
    if (editingMeasId) {
      onUpdateMeasurement({
        id: editingMeasId,
        date: measDate,
        weightKg,
        umbilicalCm,
        hipsCm,
        chestCm,
        advisorNote: advisorNote.trim() || undefined,
      });
      resetMeasForm();
    } else {
      onAddMeasurement({
        id: `meas_${Date.now()}`,
        date: measDate,
        weightKg,
        umbilicalCm,
        hipsCm,
        chestCm,
        advisorNote: advisorNote.trim() || undefined,
      });
      setAdvisorNote('');
    }
  }

  async function handleGeneratePnlAudio(scriptId: PnlAudioScriptId) {
    setAudioError(null);
    setLoadingAudioId(scriptId);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Accesso richiesto per generare l’audio guidato.');

      const res = await fetch('/api/pnl-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scriptId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Impossibile caricare la visualizzazione guidata.');
      }

      const audioSrc = data.audioBase64
        ? `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`
        : null;

      setAudioSession({
        id: scriptId,
        title: data.title,
        scriptText: data.scriptText,
        audioSrc,
        fallbackReason: data.fallbackReason,
      });
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Errore nella sessione audio PNL.');
    } finally {
      setLoadingAudioId(null);
    }
  }

  function handleDownloadIcs() {
    const icsContent = generateWeeklyRoutinesIcs({
      referenceDateStr: today,
      weighInDayOfWeek,
      clinicianName: profile.clinicianName,
      clinicianPhone: profile.clinicianPhone,
      nextVisitDate: nextVisitDate || undefined,
    });
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lucilla_routine_bariclip.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setReminderNotice(
      'File .ics scaricato! Aprilo sul telefono o su Google Calendar per attivare i promemoria ricorrenti.'
    );
  }

  async function handleEnableBrowserNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifStatus('unsupported');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifStatus(perm);
    if (perm === 'granted') {
      new Notification('Lucilla · Promemoria Attivi', {
        body: `Perfetto! Ricorda il Paracadute delle 17:30 e la pesata serena di ${weighInDayOfWeek}.`,
        icon: '/pwa-192x192.png',
      });
      localStorage.setItem('lucilla_browser_reminders', 'enabled');
      setReminderNotice('Notifiche del browser attivate su questo dispositivo.');
    }
  }

  async function handleRequestDreamInsight(checkinId: string, dreamText: string, date: string) {
    setDreamInsightError(null);
    setLoadingDreamId(checkinId);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Accesso richiesto per ricevere lo spunto PNL di Lucilla.');
      const res = await fetch('/api/dream-insight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dreamText, date }),
      });
      const data = (await res.json()) as { insight?: string; error?: string };
      if (!res.ok || !data.insight) {
        throw new Error(data.error || 'Impossibile elaborare lo spunto PNL in questo momento.');
      }
      setDreamInsights((prev) => ({ ...prev, [checkinId]: data.insight! }));
    } catch (err) {
      setDreamInsightError(
        err instanceof Error ? err.message : 'Errore nella richiesta dello spunto PNL.'
      );
    } finally {
      setLoadingDreamId(null);
    }
  }

  // Build SVG 9-spoke radar points
  const cx = 170;
  const cy = 155;
  const maxR = 96;
  const n = areas.length;

  const polygonPoints = (key: 'sa' | 'sd') =>
    areas
      .map((a, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const r = (a[key] / 10) * maxR;
        return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="space-y-6">
      {/* Row 1: NLP Learning Curve + Positive Goal + Weekly Challenge */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-label="Palestra della Tolleranza e Curva Apprendimento PNL"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex items-center justify-between">
            <h1 className="font-editorial text-xl font-medium text-[#182420] dark:text-[#EAECE6]">
              Palestra della Tolleranza
            </h1>
            <span className="font-mono text-sm font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
              {xp} XP
            </span>
          </div>

          <p className="mt-2 rounded-lg border border-[#E4E6E0] bg-[#F8F9F6] p-3 text-xs leading-relaxed text-[#182420] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#EAECE6]">
            <span className="font-semibold text-[#1F6E5C] dark:text-[#36A68C]">
              Obiettivo in positivo:
            </span>{' '}
            “{profile.positiveGoal}”
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                {stage.title}
              </span>
              <span className="font-mono tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                {stage.progressPercent}%
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#5C6762] dark:text-[#A3B0AA]">{stage.subtitle}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#ECEEE8] dark:bg-[#26312C]">
              <div
                className="h-full bg-[#1F6E5C] transition-all"
                style={{ width: `${stage.progressPercent}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px] text-[#5C6762] dark:text-[#A3B0AA]">
              {[
                { num: 1, label: 'Incomp. Inconscia' },
                { num: 2, label: 'Incomp. Conscia' },
                { num: 3, label: 'Comp. Conscia' },
                { num: 4, label: 'Magro Natural.' },
              ].map((s) => (
                <div
                  key={s.num}
                  className={`rounded-md border px-2 py-1.5 text-center ${
                    stage.stageNumber >= s.num
                      ? 'border-[#C6D5CE] bg-[#EDF3F0] font-semibold text-[#182420] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                      : 'border-[#E4E6E0] bg-white dark:border-[#2B3732] dark:bg-[#1B231F]'
                  }`}
                >
                  {s.num}. {s.label}
                </div>
              ))}
            </div>
          </div>

          {/* Movimento Settimanale 150 min */}
          <div className="mt-5 border-t border-[#E4E6E0] pt-4 dark:border-[#2B3732]">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-[#182420] dark:text-[#EAECE6]">
                <Activity className="h-4 w-4 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>Movimento Settimanale (150 min)</span>
              </span>
              <span className="font-mono font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                {weeklyMovementMinutes}/150 min · {weeklyMovementPercent}%
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
              Al raggiungimento di 150 min settimanali si sblocca automaticamente la Stanza Natura (+30 XP).
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#ECEEE8] dark:bg-[#26312C]">
              <div
                className="h-full bg-[#1F6E5C] transition-all"
                style={{ width: `${weeklyMovementPercent}%` }}
              />
            </div>
          </div>

          {/* Stanze del Valore Badges */}
          <div className="mt-5 border-t border-[#E4E6E0] pt-4 dark:border-[#2B3732]">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#182420] dark:text-[#EAECE6]">
              <Award className="h-4 w-4 text-[#1F6E5C] dark:text-[#36A68C]" />
              <span>Stanze del Valore (oltre la bilancia)</span>
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {badges.map((b) => {
                const unlocked = Boolean(b.unlockedAt);
                return (
                  <div
                    key={b.id}
                    className={`rounded-lg border p-2.5 text-xs ${
                      unlocked
                        ? 'border-[#C6D5CE] bg-[#EDF3F0] dark:border-[#2F4E42] dark:bg-[#1F332C]'
                        : 'border-[#E4E6E0] bg-[#FAFBF8] opacity-75 dark:border-[#2B3732] dark:bg-[#161D1A]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                        {b.stanza}
                      </span>
                      {unlocked && (
                        <Check className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                      )}
                    </div>
                    <p className="mt-0.5 font-medium text-[#1F6E5C] dark:text-[#36A68C]">
                      {b.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                      {b.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right: Single Weekly Micro-Challenge + 7 Mosse Furbe */}
        <section
          aria-label="Micro-sfida settimanale e 7 Mosse Furbe"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-7 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
            <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
              Una Sola Micro-Sfida a Settimana (7 Mosse Furbe)
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#5C6762] dark:text-[#A3B0AA]">
            Costanza, non perfezione: alleni una leva alla volta dal livello più leggero fino all’autonomia.
          </p>

          <div className="mt-4 space-y-2.5">
            {WEEKLY_CHALLENGES.map((ch) => {
              const isActive = ch.id === activeChallengeId;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onSelectChallenge(ch.id)}
                  className={`block w-full rounded-xl border p-3.5 text-left transition-colors ${
                    isActive
                      ? 'border-[#1F6E5C] bg-[#EDF3F0] dark:border-[#36A68C] dark:bg-[#1F332C]'
                      : 'border-[#E4E6E0] bg-white hover:bg-[#FAFBF8] dark:border-[#2B3732] dark:bg-[#1B231F] dark:hover:bg-[#222D28]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#182420] dark:text-[#EAECE6]">
                      {ch.title}
                    </span>
                    <span className="font-mono text-[11px] text-[#1F6E5C] dark:text-[#36A68C]">
                      {isActive ? 'Attiva ora' : ch.levelTarget}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-[#5C6762] dark:text-[#A3B0AA]">
                    {ch.mossaFurba}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#182420] dark:text-[#EAECE6]">
                    {ch.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Row 2: Guided PNL Audio Visualizations + Smart Calendar (.ics) & Notifications */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-label="Visualizzazioni guidate PNL audio"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-7 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <EditorialImage
            src={pnlCalmLandscapeImg}
            alt="Paesaggio sereno di colline e ulivi nella bruma dell'alba"
            caption="Orizzonte di calma · Visualizzazioni PNL e respirazione"
            className="mb-4 h-36 w-full rounded-xl"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
              <div>
                <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                  Visualizzazioni Guidate PNL (Audio Lucilla)
                </h2>
                <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                  Sessioni da 2 minuti personalizzate con il tuo obiettivo in positivo per allenare calma, identità e sonno.
                </p>
              </div>
            </div>
            {onToggleAmbientMusic && (
              <button
                type="button"
                onClick={onToggleAmbientMusic}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  ambientMusicPlaying
                    ? 'border-[#1F6E5C] bg-[#1F6E5C] text-white'
                    : 'border-[#D7DBD2] bg-white text-[#5C6762] hover:text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                }`}
              >
                {ambientMusicPlaying ? <Pause className="h-3.5 w-3.5" /> : <Music className="h-3.5 w-3.5" />}
                <span>{ambientMusicPlaying ? 'Pausa sottofondo' : 'Musica di sottofondo'}</span>
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PNL_AUDIO_SESSIONS.map((ses) => {
              const isLoading = loadingAudioId === ses.id;
              const isActive = audioSession?.id === ses.id;
              return (
                <div
                  key={ses.id}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${
                    isActive
                      ? 'border-[#1F6E5C] bg-[#EDF3F0] dark:border-[#36A68C] dark:bg-[#1F332C]'
                      : 'border-[#E4E6E0] bg-[#FAFBF8] dark:border-[#2B3732] dark:bg-[#161D1A]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#1F6E5C] dark:text-[#36A68C]">
                      <span>{ses.focusTag}</span>
                      <span>{ses.durationLabel}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-[#182420] dark:text-[#EAECE6]">
                      {ses.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#5C6762] dark:text-[#A3B0AA]">
                      {ses.subtitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loadingAudioId !== null}
                    onClick={() => handleGeneratePnlAudio(ses.id)}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#1F6E5C] bg-white px-3 py-1.5 text-xs font-medium text-[#1F6E5C] hover:bg-[#EDF3F0] disabled:opacity-50 dark:border-[#36A68C] dark:bg-[#1B231F] dark:text-[#36A68C]"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>{isLoading ? 'Preparazione audio...' : 'Ascolta Sessione'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {audioError && (
            <p className="mt-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]">
              {audioError}
            </p>
          )}

          {audioSession && (
            <div className="mt-4 rounded-xl border border-[#C6D5CE] bg-[#F8F9F6] p-4 dark:border-[#2F4E42] dark:bg-[#161D1A]">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#182420] dark:text-[#EAECE6]">
                  {audioSession.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setAudioSession(null)}
                  className="text-xs text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA]"
                >
                  Chiudi player
                </button>
              </div>
              {audioSession.audioSrc ? (
                <audio controls autoPlay src={audioSession.audioSrc} className="mt-3 w-full" />
              ) : (
                <p className="mt-2 text-xs font-medium text-[#B45309] dark:text-[#FBBF24]">
                  {audioSession.fallbackReason || 'Modalità lettura guidata PNL.'}
                </p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-[#5C6762] dark:text-[#A3B0AA]">
                {audioSession.scriptText}
              </p>
            </div>
          )}
        </section>

        <section
          aria-label="Promemoria Calendario ICS e Notifiche"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex items-center gap-2 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
            <Calendar className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
            <div>
              <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                Promemoria Calendario &amp; Notifiche
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Sincronizza Paracadute 17:30, Chiusura 21:30 e Pesata di {weighInDayOfWeek} nel tuo telefono.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-[#E4E6E0] bg-[#F8F9F6] p-3 text-xs text-[#5C6762] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#A3B0AA]">
              <ul className="space-y-1">
                <li>
                  <strong className="text-[#182420] dark:text-[#EAECE6]">17:30 (Tutti i giorni):</strong>{' '}
                  Spuntino Paracadute anti-onda 18:00–20:00
                </li>
                <li>
                  <strong className="text-[#182420] dark:text-[#EAECE6]">21:30 (Tutti i giorni):</strong>{' '}
                  Piccolo successo &amp; rituale chiusura cucina
                </li>
                <li>
                  <strong className="text-[#182420] dark:text-[#EAECE6]">07:30 ({weighInDayOfWeek}):</strong>{' '}
                  Pesata settimanale &amp; metro da sarta
                </li>
              </ul>
            </div>

            <div>
              <label
                htmlFor="next-visit-date"
                className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
              >
                Data prossimo controllo clinico con {profile.clinicianName} (opzionale)
              </label>
              <input
                id="next-visit-date"
                type="date"
                value={nextVisitDate}
                onChange={(e) => setNextVisitDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185849]"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Scarica Promemoria Calendario (.ics)</span>
              </button>

              {notifStatus !== 'unsupported' && (
                <button
                  type="button"
                  onClick={handleEnableBrowserNotifications}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D7DBD2] bg-white px-4 py-2 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                >
                  <Bell className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                  <span>
                    {notifStatus === 'granted'
                      ? 'Invia Notifica di Test (Browser attivo)'
                      : 'Attiva Notifiche Browser su questo dispositivo'}
                  </span>
                </button>
              )}
            </div>

            {reminderNotice && (
              <p className="rounded-lg border border-[#C6D5CE] bg-[#EDF3F0] p-3 text-xs text-[#182420] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#EAECE6]">
                {reminderNotice}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Archivio Diario dei Sogni & Spunti PNL */}
      <section
        id="dream-archive-section"
        aria-label="Archivio Diario dei Sogni e spunti PNL"
        className="rounded-xl border border-[#E4E6E0] bg-white p-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
          <div className="flex items-center gap-2">
            <BookMarked className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
            <div>
              <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                Archivio Diario dei Sogni &amp; Spunti PNL
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Raccolta cronologica dei sogni annotati al risveglio: trasforma immagini ed emozioni in risorse positive.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
            {dreamEntries.length} {dreamEntries.length === 1 ? 'sogno' : 'sogni'}
          </span>
        </div>

        {dreamInsightError && (
          <p className="mt-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]">
            {dreamInsightError}
          </p>
        )}

        {dreamEntries.length === 0 ? (
          <div className="mt-4 rounded-xl border border-[#E4E6E0] bg-[#FAFBF8] p-4 text-xs leading-relaxed text-[#5C6762] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#A3B0AA]">
            Nessun sogno salvato finora. Compila il riquadro “Diario dei Sogni” nel Check-in Mattina per custodire qui le tue tracce notturne e chiedere uno spunto di PNL a Lucilla.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {dreamEntries.map((entry) => {
              const insight = dreamInsights[entry.id];
              const isLoading = loadingDreamId === entry.id;
              return (
                <article
                  key={entry.id}
                  className="flex flex-col justify-between rounded-xl border border-[#E4E6E0] bg-[#FAFBF8] p-4 dark:border-[#2B3732] dark:bg-[#161D1A]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                        {entry.date}
                      </span>
                      {typeof entry.sleepHours === 'number' && (
                        <span className="font-mono text-[11px] tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                          Sonno {entry.sleepHours}h
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[#182420] dark:text-[#EAECE6]">
                      {entry.dreamJournal}
                    </p>
                  </div>

                  <div className="mt-3 pt-2">
                    {insight ? (
                      <div className="rounded-lg border border-[#C6D5CE] bg-[#EDF3F0] p-3 text-xs leading-relaxed text-[#182420] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#EAECE6]">
                        <p className="mb-1 flex items-center gap-1.5 font-semibold text-[#1F6E5C] dark:text-[#36A68C]">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Spunto PNL di Lucilla</span>
                        </p>
                        <p>{insight}</p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={loadingDreamId !== null}
                        onClick={() =>
                          handleRequestDreamInsight(entry.id, entry.dreamJournal || '', entry.date)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1F6E5C] bg-white px-3 py-1.5 text-xs font-medium text-[#1F6E5C] hover:bg-[#EDF3F0] disabled:opacity-50 dark:border-[#36A68C] dark:bg-[#1B231F] dark:text-[#36A68C]"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{isLoading ? 'Riflessione PNL...' : 'Spunto PNL di Lucilla'}</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Row 3: Ruota della Vita (9 Areas) + Scale & Tape Measure */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Interactive Ruota della Vita */}
        <section
          aria-label="Ruota della Vita a 9 aree"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-7 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
            <div>
              <h2 className="flex items-center gap-2 font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                <Compass className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>Ruota della Vita (/ruota)</span>
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Confronto mensile tra Stato Attuale (SA) e Stato Desiderato (SD) su 9 aree.
              </p>
            </div>
            {wheelSaved && (
              <span className="text-xs font-medium text-[#1F6E5C] dark:text-[#36A68C]">
                Valutazione salvata!
              </span>
            )}
          </div>

          <form onSubmit={handleSaveWheel} className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-12">
            {/* Radar SVG */}
            <div className="flex flex-col items-center justify-center md:col-span-5">
              <svg
                viewBox="0 0 340 310"
                className="h-72 w-full max-w-[290px]"
                role="img"
                aria-label="Grafico Ruota della Vita"
              >
                {[2, 4, 6, 8, 10].map((ring) => (
                  <circle
                    key={ring}
                    cx={cx}
                    cy={cy}
                    r={(ring / 10) * maxR}
                    fill="none"
                    stroke="currentColor"
                    className="text-[#E4E6E0] dark:text-[#2B3732]"
                    strokeWidth="1"
                  />
                ))}
                {areas.map((a, i) => {
                  const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                  const x2 = cx + maxR * Math.cos(angle);
                  const y2 = cy + maxR * Math.sin(angle);
                  const lx = cx + (maxR + 24) * Math.cos(angle);
                  const ly = cy + (maxR + 24) * Math.sin(angle);
                  return (
                    <g key={a.areaId}>
                      <line
                        x1={cx}
                        y1={cy}
                        x2={x2}
                        y2={y2}
                        stroke="currentColor"
                        className="text-[#E4E6E0] dark:text-[#2B3732]"
                        strokeWidth="1"
                      />
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-[#5C6762] text-[9.5px] font-medium dark:fill-[#A3B0AA]"
                      >
                        {a.label.split(' ')[0]}
                      </text>
                    </g>
                  );
                })}
                {/* SD polygon */}
                <polygon
                  points={polygonPoints('sd')}
                  fill="#B45309"
                  fillOpacity="0.10"
                  stroke="#B45309"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                {/* SA polygon */}
                <polygon
                  points={polygonPoints('sa')}
                  fill="#1F6E5C"
                  fillOpacity="0.22"
                  stroke="#1F6E5C"
                  strokeWidth="2"
                />
              </svg>
              <div className="mt-2 flex gap-4 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 bg-[#1F6E5C]" />
                  Stato Attuale (SA)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 border border-dashed border-[#B45309] bg-[#B45309]/20" />
                  Desiderato (SD)
                </span>
              </div>
            </div>

            {/* Sliders for 9 areas */}
            <div className="space-y-2.5 md:col-span-7">
              {areas.map((a) => (
                <div key={a.areaId} className="grid grid-cols-12 items-center gap-2 text-xs">
                  <span className="col-span-5 truncate font-medium text-[#182420] dark:text-[#EAECE6]">
                    {a.label}
                  </span>
                  <div className="col-span-4 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-[#5C6762] dark:text-[#A3B0AA]">
                      SA
                    </span>
                    <input
                      type="range"
                      aria-label={`Stato attuale ${a.label}`}
                      min="1"
                      max="10"
                      value={a.sa}
                      onChange={(e) => updateArea(a.areaId, 'sa', Number(e.target.value))}
                      className="w-full accent-[#1F6E5C]"
                    />
                    <span className="w-4 font-mono tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                      {a.sa}
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center gap-1">
                    <span className="font-mono text-[10px] text-[#5C6762] dark:text-[#A3B0AA]">
                      SD
                    </span>
                    <input
                      type="number"
                      aria-label={`Stato desiderato ${a.label}`}
                      min="1"
                      max="10"
                      value={a.sd}
                      onChange={(e) => updateArea(a.areaId, 'sd', Number(e.target.value))}
                      className="w-11 rounded border border-[#D7DBD2] bg-white px-1 py-0.5 text-center font-mono text-xs tabular-nums dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                    />
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="wheel-focus"
                    className="block text-[11px] font-medium text-[#182420] dark:text-[#EAECE6]"
                  >
                    Area priorità questo mese
                  </label>
                  <select
                    id="wheel-focus"
                    value={focusAreaId}
                    onChange={(e) => setFocusAreaId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 text-xs dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                  >
                    {areas.map((a) => (
                      <option key={a.areaId} value={a.areaId}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="wheel-step"
                    className="block text-[11px] font-medium text-[#182420] dark:text-[#EAECE6]"
                  >
                    Primo micro-passo piacevole
                  </label>
                  <input
                    id="wheel-step"
                    type="text"
                    value={firstMicroStep}
                    onChange={(e) => setFirstMicroStep(e.target.value)}
                    placeholder="Es. Camminata 20 min mar/gio..."
                    className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 text-xs dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185849]"
                >
                  Salva Ruota della Vita
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Scale & Tape Measure (Bilancia Settimanale + Metro da Sarta with Edit/Delete) */}
        <section
          aria-label="Bilancia settimanale e metro da sarta"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex items-center justify-between border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
            <div>
              <h2 className="flex items-center gap-2 font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                <Scale className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>
                  {editingMeasId ? 'Modifica Misurazione' : 'Bilancia & Metro da Sarta'}
                </span>
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                1 pesata fissa a settimana ({weighInDayOfWeek}) come consigliera serena, mai quotidiana.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveMeasurement} className="mt-4 space-y-3.5">
            {editingMeasId && (
              <div>
                <label
                  htmlFor="meas-date"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Data misurazione
                </label>
                <input
                  id="meas-date"
                  type="date"
                  value={measDate}
                  onChange={(e) => setMeasDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 font-mono text-xs dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="meas-weight"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Peso (kg) · BMI {calculateBmi(weightKg, profile.heightCm)}
                </label>
                <input
                  id="meas-weight"
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label
                  htmlFor="meas-umb"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Girovita / Ombelico (cm)
                </label>
                <input
                  id="meas-umb"
                  type="number"
                  step="0.5"
                  value={umbilicalCm}
                  onChange={(e) => setUmbilicalCm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label
                  htmlFor="meas-hips"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Fianchi / Sedere (cm)
                </label>
                <input
                  id="meas-hips"
                  type="number"
                  step="0.5"
                  value={hipsCm}
                  onChange={(e) => setHipsCm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label
                  htmlFor="meas-chest"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Torace / Seno (cm)
                </label>
                <input
                  id="meas-chest"
                  type="number"
                  step="0.5"
                  value={chestCm}
                  onChange={(e) => setChestCm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="meas-note"
                className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
              >
                Cosa ti suggerisce la consigliera oggi?
              </label>
              <input
                id="meas-note"
                type="text"
                value={advisorNote}
                onChange={(e) => setAdvisorNote(e.target.value)}
                placeholder="Es. Vestiti più comodi e meno tensione serale..."
                className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-xs dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {editingMeasId && (
                <button
                  type="button"
                  onClick={resetMeasForm}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-xs font-medium text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Annulla</span>
                </button>
              )}
              <button
                type="submit"
                className="rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185849]"
              >
                {editingMeasId ? 'Salva Modifica Misura' : 'Registra Pesata & Misure'}
              </button>
            </div>
          </form>

          <div className="mt-4 border-t border-[#E4E6E0] pt-3 dark:border-[#2B3732]">
            <p className="text-xs font-medium text-[#5C6762] dark:text-[#A3B0AA]">
              Storico recente ({measurements.length})
            </p>
            <div className="mt-2 divide-y divide-[#ECEEE8] text-xs dark:divide-[#27322D]">
              {[...measurements]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 6)
                .map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="font-mono tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                      {m.date}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
                      {m.weightKg} kg
                    </span>
                    <span className="font-mono tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                      {m.umbilicalCm ?? '-'}/{m.hipsCm ?? '-'}/{m.chestCm ?? '-'} cm
                    </span>
                    {confirmDeleteMeasId === m.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteMeasurement(m.id);
                            setConfirmDeleteMeasId(null);
                            if (editingMeasId === m.id) resetMeasForm();
                          }}
                          className="rounded border border-[#B91C1C] bg-[#FEF2F2] px-1.5 py-0.5 text-[10px] font-semibold text-[#991B1B] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
                        >
                          Sì
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteMeasId(null)}
                          className="rounded border border-[#D7DBD2] px-1.5 py-0.5 text-[10px] text-[#5C6762] dark:border-[#33423C] dark:text-[#A3B0AA]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Modifica misurazione del ${m.date}`}
                          onClick={() => startEditMeas(m)}
                          className="rounded p-1 text-[#5C6762] hover:text-[#1F6E5C] dark:text-[#A3B0AA] dark:hover:text-[#36A68C]"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Elimina misurazione del ${m.date}`}
                          onClick={() => setConfirmDeleteMeasId(m.id)}
                          className="rounded p-1 text-[#5C6762] hover:text-[#B91C1C] dark:text-[#A3B0AA] dark:hover:text-[#FCA5A5]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
