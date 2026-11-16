import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookMarked,
  Check,
  FileText,
  Printer,
  Scale,
  Sparkles,
  Sunrise,
} from 'lucide-react';
import { CustomMusicTrack, DailyCheckin, WeightTapeEntry } from '../types/coach.ts';
import { evaluateSleepBiology } from '../utils/bariclipRules.ts';
import { AmbientMusicStudio } from './AmbientMusicStudio.tsx';
import { DreamJournalArchive } from './DreamJournalArchive.tsx';

interface BuongiornoViewProps {
  todayDate: string;
  checkin: DailyCheckin;
  allCheckins: DailyCheckin[];
  measurements: WeightTapeEntry[];
  onSaveCheckin: (updated: DailyCheckin, xpDelta?: number) => void;
  onSaveMorningWeight: (weightKg: number) => void;
  // Music studio props
  musicPlaying: boolean;
  musicTrackId: string;
  customMusicTracks: CustomMusicTrack[];
  musicVolume: number;
  musicAudioError?: string | null;
  onSelectMusicTrack: (trackId: string) => void;
  onToggleMusicPlay: () => void;
  onChangeMusicVolume: (volume: number) => void;
  onOpenMusicSettings: () => void;
  // Dream archive + print props
  dreamInsights: Record<string, string>;
  onSaveDreamInsight: (checkinId: string, insight: string) => void;
  getIdToken: () => Promise<string | null>;
  onPrintDreams: () => void;
}

export function BuongiornoView({
  todayDate,
  checkin,
  allCheckins,
  measurements,
  onSaveCheckin,
  onSaveMorningWeight,
  musicPlaying,
  musicTrackId,
  customMusicTracks,
  musicVolume,
  musicAudioError,
  onSelectMusicTrack,
  onToggleMusicPlay,
  onChangeMusicVolume,
  onOpenMusicSettings,
  dreamInsights,
  onSaveDreamInsight,
  getIdToken,
  onPrintDreams,
}: BuongiornoViewProps) {
  const sortedMeasurements = [...measurements].sort((a, b) => b.date.localeCompare(a.date));
  const todayMeasurement = sortedMeasurements.find((m) => m.date === todayDate);
  const latestMeasurement = sortedMeasurements[0];

  const [sleepHours, setSleepHours] = useState<number>(checkin.sleepHours ?? 7);
  const [sleepQuality, setSleepQuality] = useState<1 | 2 | 3 | 4 | 5>(checkin.sleepQuality ?? 4);
  const [dreamJournal, setDreamJournal] = useState<string>(checkin.dreamJournal ?? '');
  const [morningWeightInput, setMorningWeightInput] = useState<string>(
    todayMeasurement ? String(todayMeasurement.weightKg) : ''
  );
  const [usefulNotes, setUsefulNotes] = useState<string>(
    checkin.morningUsefulNotes ?? checkin.morningDomandeNotes ?? ''
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [notesSavedNotice, setNotesSavedNotice] = useState<string | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);

  useEffect(() => {
    setSleepHours(checkin.sleepHours ?? 7);
    setSleepQuality(checkin.sleepQuality ?? 4);
    setDreamJournal(checkin.dreamJournal ?? '');
    setUsefulNotes(checkin.morningUsefulNotes ?? checkin.morningDomandeNotes ?? '');
  }, [checkin]);

  useEffect(() => {
    if (todayMeasurement) {
      setMorningWeightInput(String(todayMeasurement.weightKg));
    }
  }, [todayMeasurement]);

  const sleepAlert = evaluateSleepBiology(sleepHours);
  const totalDreamsCount = allCheckins.filter((c) => Boolean(c.dreamJournal?.trim())).length;

  function showNotice(msg: string) {
    setSavedNotice(msg);
    window.setTimeout(() => setSavedNotice(null), 3500);
  }

  function handleSaveMorning(e: React.FormEvent) {
    e.preventDefault();
    setWeightError(null);

    const trimmedWeight = morningWeightInput.trim().replace(',', '.');
    let parsedWeight: number | null = null;
    if (trimmedWeight !== '') {
      const num = Number(trimmedWeight);
      if (!Number.isFinite(num) || num < 30 || num > 350) {
        setWeightError('Inserisci un peso valido tra 30 e 350 kg.');
        return;
      }
      parsedWeight = Number(num.toFixed(1));
    }

    const hadSleepBefore = typeof checkin.sleepHours === 'number';
    const hadDreamBefore = Boolean(checkin.dreamJournal?.trim());
    const hasDreamNow = Boolean(dreamJournal.trim());
    const xpBonus = (!hadSleepBefore ? 15 : 0) + (!hadDreamBefore && hasDreamNow ? 10 : 0);

    onSaveCheckin(
      {
        ...checkin,
        date: todayDate,
        sleepHours,
        sleepQuality,
        dreamJournal,
        morningUsefulNotes: usefulNotes,
      },
      xpBonus
    );

    if (parsedWeight !== null) {
      onSaveMorningWeight(parsedWeight);
    }

    showNotice(
      parsedWeight !== null
        ? `Buongiorno salvato (${parsedWeight} kg registrati per oggi).`
        : 'Sonno e diario dei sogni salvati.'
    );
  }

  function handleSaveUsefulNotes(e: React.FormEvent) {
    e.preventDefault();
    onSaveCheckin(
      {
        ...checkin,
        date: todayDate,
        morningUsefulNotes: usefulNotes,
      },
      0
    );
    setNotesSavedNotice('Annotazioni utili salvate.');
    window.setTimeout(() => setNotesSavedNotice(null), 3000);
  }

  function scrollToDreamArchive() {
    document
      .getElementById('buongiorno-dream-archive')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-6">
      {/* Rilassati con la musica */}
      <AmbientMusicStudio
        isPlaying={musicPlaying}
        trackId={musicTrackId}
        customTracks={customMusicTracks}
        volume={musicVolume}
        audioError={musicAudioError}
        onSelectTrack={onSelectMusicTrack}
        onTogglePlay={onToggleMusicPlay}
        onChangeVolume={onChangeMusicVolume}
        onOpenMusicSettings={onOpenMusicSettings}
      />

      {/* Primary 2-Column Morning Check-in + Useful Notes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Sonno stanotte + Diario dei Sogni + Peso del Mattino */}
        <section
          aria-label="Check-in del mattino: sonno, sogni e peso"
          className="rounded-xl border border-[#E4E6E0] bg-white lg:col-span-7 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6E0] px-5 py-3.5 dark:border-[#2B3732]">
            <div className="flex items-center gap-2">
              <Sunrise className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
              <div>
                <h1 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                  Buongiorno
                </h1>
                <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                  Sonno di stanotte, Diario dei sogni e peso del mattino
                </p>
              </div>
            </div>
            <span className="font-mono text-xs tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
              {todayDate}
            </span>
          </div>

          {savedNotice && (
            <div className="flex items-center gap-2 border-b border-[#D1E2DA] bg-[#EDF3F0] px-5 py-2 text-xs font-medium text-[#1F6E5C] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#36A68C]">
              <Check className="h-3.5 w-3.5" />
              <span>{savedNotice}</span>
            </div>
          )}

          <form onSubmit={handleSaveMorning} className="space-y-4 p-5">
            {/* Sleep hours + quality */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="buongiorno-sleep-hours"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Ore di sonno stanotte
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  <input
                    id="buongiorno-sleep-hours"
                    type="number"
                    step="0.5"
                    min="2"
                    max="12"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(Number(e.target.value))}
                    className="w-24 rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-sm tabular-nums text-[#182420] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                  />
                  <span className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                    ore (soglia: 6h)
                  </span>
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  Qualità riposo (1–5)
                </span>
                <div className="mt-1.5 flex gap-1.5">
                  {([1, 2, 3, 4, 5] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSleepQuality(q)}
                      className={`h-9 w-9 rounded-lg font-mono text-xs font-medium tabular-nums transition-colors ${
                        sleepQuality === q
                          ? 'bg-[#1F6E5C] text-white'
                          : 'border border-[#D7DBD2] bg-white text-[#5C6762] hover:text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#A3B0AA]'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {sleepAlert.isShortSleep && (
              <div className="rounded-lg border border-[#F3D09B] bg-[#FFFBEB] p-3.5 text-xs text-[#92400E] dark:border-[#78350F] dark:bg-[#292011] dark:text-[#FDE68A]">
                <div className="flex items-center gap-1.5 font-semibold text-[#B45309] dark:text-[#FBBF24]">
                  <AlertCircle className="h-4 w-4" />
                  <span>{sleepAlert.title}</span>
                </div>
                <p className="mt-1 leading-relaxed">{sleepAlert.physiologySummary}</p>
                <p className="mt-1.5 font-medium text-[#78350F] dark:text-[#FCD34D]">
                  {sleepAlert.gentleAction}
                </p>
              </div>
            )}

            {/* Dream Journal */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="buongiorno-dream-journal"
                  className="flex items-center gap-1.5 text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  <BookMarked className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                  <span>Diario dei sogni (spazio libero del mattino)</span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={scrollToDreamArchive}
                    className="text-[11px] font-medium text-[#1F6E5C] hover:underline dark:text-[#36A68C]"
                  >
                    Vedi tutti ({totalDreamsCount})
                  </button>
                  <button
                    type="button"
                    disabled={totalDreamsCount === 0}
                    onClick={onPrintDreams}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1F6E5C] hover:underline disabled:opacity-45 dark:text-[#36A68C]"
                  >
                    <Printer className="h-3 w-3" />
                    <span>Stampa tutti</span>
                  </button>
                </div>
              </div>
              <textarea
                id="buongiorno-dream-journal"
                rows={4}
                value={dreamJournal}
                onChange={(e) => setDreamJournal(e.target.value)}
                placeholder="Annota liberamente immagini, sensazioni o frammenti di sogni di questa notte..."
                className="mt-1.5 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-sm text-[#182420] placeholder:text-[#8A948E] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              />
            </div>

            {/* Morning Weight right after Dream Journal */}
            <div className="rounded-lg border border-[#E4E6E0] bg-[#FAFBF8] p-3.5 dark:border-[#2B3732] dark:bg-[#161D1A]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <label
                    htmlFor="buongiorno-morning-weight"
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#182420] dark:text-[#EAECE6]"
                  >
                    <Scale className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                    <span>Peso del mattino (kg)</span>
                  </label>
                  <p className="mt-0.5 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                    {todayMeasurement
                      ? `Registrato oggi: ${todayMeasurement.weightKg} kg`
                      : latestMeasurement
                      ? `Ultimo peso salvato: ${latestMeasurement.weightKg} kg (${latestMeasurement.date})`
                      : 'Inserisci il peso di oggi se desideri registrarlo nel grafico.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="buongiorno-morning-weight"
                    type="number"
                    step="0.1"
                    min="30"
                    max="350"
                    value={morningWeightInput}
                    onChange={(e) => setMorningWeightInput(e.target.value)}
                    placeholder={latestMeasurement ? String(latestMeasurement.weightKg) : 'Es. 118.5'}
                    className="w-28 rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-sm tabular-nums text-[#182420] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                  />
                  <span className="text-xs font-medium text-[#5C6762] dark:text-[#A3B0AA]">kg</span>
                </div>
              </div>
              {weightError && (
                <p className="mt-2 text-xs text-[#B91C1C] dark:text-[#FCA5A5]">{weightError}</p>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#185849]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Salva Buongiorno</span>
              </button>
            </div>
          </form>
        </section>

        {/* Right: Annotazioni utili */}
        <section
          aria-label="Annotazioni utili del mattino"
          className="flex flex-col rounded-xl border border-[#E4E6E0] bg-white lg:col-span-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#E4E6E0] px-5 py-3.5 dark:border-[#2B3732]">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
              <div>
                <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                  Annotazioni utili
                </h2>
                <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                  Appunti pratici, intenzioni o promemoria per oggi
                </p>
              </div>
            </div>
          </div>

          {notesSavedNotice && (
            <div className="flex items-center gap-2 border-b border-[#D1E2DA] bg-[#EDF3F0] px-5 py-2 text-xs font-medium text-[#1F6E5C] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#36A68C]">
              <Check className="h-3.5 w-3.5" />
              <span>{notesSavedNotice}</span>
            </div>
          )}

          <form onSubmit={handleSaveUsefulNotes} className="flex flex-1 flex-col justify-between p-5">
            <div className="flex flex-1 flex-col">
              <label
                htmlFor="buongiorno-useful-notes"
                className="text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
              >
                Le tue note libere di oggi
              </label>
              <textarea
                id="buongiorno-useful-notes"
                rows={10}
                value={usefulNotes}
                onChange={(e) => setUsefulNotes(e.target.value)}
                placeholder="Scrivi qui pensieri utili, obiettivi semplici della giornata, cosa tenere a mente alle 17:30 o spunti da ricordare..."
                className="mt-2 flex-1 rounded-lg border border-[#D7DBD2] bg-[#FAFBF8] px-3 py-2.5 text-sm leading-relaxed text-[#182420] placeholder:text-[#8A948E] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-[#1F6E5C] bg-[#EDF3F0] px-4 py-2 text-xs font-semibold text-[#182420] transition-colors hover:bg-[#DFECE6] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]"
              >
                <Check className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>Salva annotazioni</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Tutti i Diari dei Sogni (Visualizzazione & Stampa) */}
      <DreamJournalArchive
        id="buongiorno-dream-archive"
        checkins={allCheckins}
        dreamInsights={dreamInsights}
        onSaveDreamInsight={onSaveDreamInsight}
        getIdToken={getIdToken}
        onPrintDreams={onPrintDreams}
      />
    </div>
  );
}
