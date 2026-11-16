import React, { useEffect, useState } from 'react';
import { Activity, Sunset, Moon, Check, Droplets, Sunrise } from 'lucide-react';
import { DailyCheckin, EmotionReflectionType } from '../types/coach.ts';

interface DailyRoutinesCardProps {
  todayDate: string;
  checkin: DailyCheckin;
  onSaveCheckin: (updated: DailyCheckin, xpDelta?: number) => void;
  initialSubTab?: 'movimento' | 'pomeriggio' | 'sera';
  todayMealsCount?: number;
  weeklyMovementMinutes?: number;
  onOpenBuongiorno?: () => void;
}

function resolveDefaultSubTabByHour(): 'movimento' | 'pomeriggio' | 'sera' {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= 5 * 60 && mins < 14 * 60) return 'movimento';
  if (mins >= 14 * 60 && mins < 19 * 60 + 30) return 'pomeriggio';
  return 'sera';
}

const SNACK_1730_OPTIONS = [
  '30g grana / parmigiano',
  '40g bresaola o prosciutto crudo sgrassato',
  '1 uovo sodo',
  '1 fetta Wasa + 30g formaggio light o 60g ricotta',
  '150g frutta fresca di stagione',
  '10–15g mandorle o noci',
];

const RITUAL_OPTIONS = [
  'Tisana calda non zuccherata (es. finocchietto o matè)',
  'Brodo caldo leggero in tazza',
  'Luci soffuse in cucina e smartphone lontano dal letto',
];

export function DailyRoutinesCard({
  todayDate,
  checkin,
  onSaveCheckin,
  initialSubTab,
  todayMealsCount = 0,
  weeklyMovementMinutes = 0,
  onOpenBuongiorno,
}: DailyRoutinesCardProps) {
  const [subTab, setSubTab] = useState<'movimento' | 'pomeriggio' | 'sera'>(
    () => initialSubTab ?? resolveDefaultSubTabByHour()
  );

  // Movement & anchor state
  const [anchorDone, setAnchorDone] = useState<boolean>(checkin.kinestheticAnchorDone ?? false);
  const [movementMinutes, setMovementMinutes] = useState<number>(checkin.movementMinutes ?? 20);

  // Afternoon state
  const [parachuteDone, setParachuteDone] = useState<boolean>(checkin.afternoonParachuteDone ?? false);
  const [snackChoice, setSnackChoice] = useState<string>(
    checkin.afternoonSnackChoice ?? SNACK_1730_OPTIONS[0]
  );

  // Evening state
  const [eveningSuccess, setEveningSuccess] = useState<string>(checkin.eveningSuccess ?? '');
  const [emotionType, setEmotionType] = useState<EmotionReflectionType>(
    checkin.eveningEmotionType ?? 'nessuna'
  );
  const [repairNote, setRepairNote] = useState<string>(checkin.eveningRepairOrCompassion ?? '');
  const [ritualDone, setRitualDone] = useState<boolean>(checkin.eveningRitualDone ?? false);
  const [ritualChoice, setRitualChoice] = useState<string>(
    checkin.eveningRitualChoice ?? RITUAL_OPTIONS[0]
  );

  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    setAnchorDone(checkin.kinestheticAnchorDone ?? false);
    setMovementMinutes(checkin.movementMinutes ?? 20);
    setParachuteDone(checkin.afternoonParachuteDone ?? false);
    setSnackChoice(checkin.afternoonSnackChoice ?? SNACK_1730_OPTIONS[0]);
    setEveningSuccess(checkin.eveningSuccess ?? '');
    setEmotionType(checkin.eveningEmotionType ?? 'nessuna');
    setRepairNote(checkin.eveningRepairOrCompassion ?? '');
    setRitualDone(checkin.eveningRitualDone ?? false);
    setRitualChoice(checkin.eveningRitualChoice ?? RITUAL_OPTIONS[0]);
  }, [checkin]);

  const hydrationGlasses = Math.max(0, checkin.hydrationGlasses ?? 0);
  const hydrationAwayDone = Boolean(checkin.hydrationAwayFromMealsDone);
  const morningDone = typeof checkin.sleepHours === 'number';
  const eveningDone = Boolean(checkin.eveningRitualDone || checkin.eveningSuccess?.trim());

  function notifySaved(msg: string) {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 3500);
  }

  function handleUpdateHydration(nextGlasses: number, nextAway: boolean) {
    const clamped = Math.min(20, Math.max(0, nextGlasses));
    onSaveCheckin(
      {
        ...checkin,
        date: todayDate,
        hydrationGlasses: clamped,
        hydrationAwayFromMealsDone: nextAway,
      },
      0
    );
    if (clamped >= 6 && nextAway && !checkin.hydrationXpAwarded) {
      notifySaved('Idratazione lontano dai pasti raggiunta: +10 XP!');
    }
  }

  function handleSaveMovement(e: React.FormEvent) {
    e.preventDefault();
    const xpBonus = !checkin.kinestheticAnchorDone && anchorDone ? 10 : 0;
    onSaveCheckin(
      {
        ...checkin,
        date: todayDate,
        kinestheticAnchorDone: anchorDone,
        movementMinutes,
      },
      xpBonus
    );
    notifySaved('Movimento e ancora salvati.');
  }

  function handleSaveAfternoon(e: React.FormEvent) {
    e.preventDefault();
    const xpBonus = !checkin.afternoonParachuteDone && parachuteDone ? 15 : 0;
    onSaveCheckin(
      {
        ...checkin,
        date: todayDate,
        afternoonParachuteDone: parachuteDone,
        afternoonSnackChoice: snackChoice,
      },
      xpBonus
    );
    notifySaved('Paracadute delle 17:30 aggiornato.');
  }

  function handleSaveEvening(e: React.FormEvent) {
    e.preventDefault();
    const xpBonus = !checkin.eveningSuccess && eveningSuccess.trim() ? 20 : 0;
    onSaveCheckin(
      {
        ...checkin,
        date: todayDate,
        eveningSuccess,
        eveningEmotionType: emotionType,
        eveningRepairOrCompassion: repairNote,
        eveningRitualDone: ritualDone,
        eveningRitualChoice: ritualChoice,
      },
      xpBonus
    );
    notifySaved('Chiusura serale e rituale salvati.');
  }

  return (
    <section
      aria-label="Routine proattive quotidiane"
      className="flex flex-col rounded-xl border border-[#E4E6E0] bg-white dark:border-[#2B3732] dark:bg-[#1B231F]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6E0] px-5 py-3.5 dark:border-[#2B3732]">
        <div>
          <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
            Routine del Giorno
          </h2>
          <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
            Movimento &amp; Ancora · 17:15 Paracadute · 21:30 Chiusura
          </p>
        </div>

        <div className="flex rounded-lg border border-[#E4E6E0] bg-[#F7F7F4] p-0.5 dark:border-[#2B3732] dark:bg-[#161D1A]">
          {[
            { id: 'movimento' as const, label: 'Movimento', icon: Activity },
            { id: 'pomeriggio' as const, label: '17:15 Paracadute', icon: Sunset },
            { id: 'sera' as const, label: '21:30 Sera', icon: Moon },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-white text-[#182420] shadow-xs dark:bg-[#1F332C] dark:text-[#EAECE6]'
                    : 'text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${active ? 'text-[#1F6E5C] dark:text-[#36A68C]' : ''}`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Prontezza del Giorno + Hydration Tracker (always visible) */}
      <div className="border-b border-[#E4E6E0] bg-[#FAFBF8] px-5 py-3 dark:border-[#2B3732] dark:bg-[#161D1A]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
          <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
            Prontezza del Giorno:
          </span>
          {onOpenBuongiorno ? (
            <button
              type="button"
              onClick={onOpenBuongiorno}
              className={`inline-flex items-center gap-1 hover:underline ${
                morningDone ? 'font-medium text-[#1F6E5C] dark:text-[#36A68C]' : ''
              }`}
            >
              <Sunrise className="h-3 w-3" />
              <span>{morningDone ? '✓ Buongiorno' : '○ Buongiorno'}</span>
            </button>
          ) : (
            <span className={morningDone ? 'font-medium text-[#1F6E5C] dark:text-[#36A68C]' : ''}>
              {morningDone ? '✓ Buongiorno' : '○ Buongiorno'}
            </span>
          )}
          <span
            className={`font-mono tabular-nums ${
              hydrationGlasses >= 6 && hydrationAwayDone
                ? 'font-medium text-[#1F6E5C] dark:text-[#36A68C]'
                : ''
            }`}
          >
            Idratazione {hydrationGlasses}/8
          </span>
          <span className={checkin.afternoonParachuteDone ? 'font-medium text-[#1F6E5C] dark:text-[#36A68C]' : ''}>
            {checkin.afternoonParachuteDone ? '✓ Paracadute 17:30' : '○ Paracadute 17:30'}
          </span>
          <span className="font-mono tabular-nums">Pasti oggi: {todayMealsCount}</span>
          <span className={eveningDone ? 'font-medium text-[#1F6E5C] dark:text-[#36A68C]' : ''}>
            {eveningDone ? '✓ Sera' : '○ Sera'}
          </span>
          <span
            className={`font-mono tabular-nums ${
              weeklyMovementMinutes >= 150 ? 'font-medium text-[#1F6E5C] dark:text-[#36A68C]' : ''
            }`}
          >
            Mov. sett.: {weeklyMovementMinutes}/150m
          </span>
        </div>

        {/* Hydration away-from-meals quick bar */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E4E6E0] bg-white px-3 py-2 dark:border-[#2B3732] dark:bg-[#1B231F]">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 shrink-0 text-[#1F6E5C] dark:text-[#36A68C]" />
            <div>
              <p className="text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                Acqua lontano dai pasti:{' '}
                <span className="font-mono font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                  {hydrationGlasses}/8 bicchieri
                </span>
              </p>
              <label className="mt-0.5 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                <input
                  type="checkbox"
                  checked={hydrationAwayDone}
                  onChange={(e) => handleUpdateHydration(hydrationGlasses, e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#1F6E5C]"
                />
                <span>Bevuta ≥30 min prima/dopo i pasti (target 6+ = +10 XP)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Rimuovi un bicchiere d'acqua"
              onClick={() => handleUpdateHydration(hydrationGlasses - 1, hydrationAwayDone)}
              className="h-7 w-7 rounded-md border border-[#D7DBD2] bg-white text-xs font-semibold text-[#5C6762] hover:text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#A3B0AA]"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => handleUpdateHydration(hydrationGlasses + 1, hydrationAwayDone)}
              className="rounded-md border border-[#1F6E5C] bg-[#EDF3F0] px-2.5 py-1 text-xs font-medium text-[#182420] hover:bg-[#DFECE6] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]"
            >
              +1 bicchiere
            </button>
          </div>
        </div>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 border-b border-[#D1E2DA] bg-[#EDF3F0] px-5 py-2 text-xs font-medium text-[#1F6E5C] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#36A68C]">
          <Check className="h-3.5 w-3.5" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* MOVEMENT & KINESTHETIC ANCHOR */}
      {subTab === 'movimento' && (
        <form onSubmit={handleSaveMovement} className="space-y-4 p-5">
          <div className="flex flex-col gap-3 rounded-lg border border-[#E4E6E0] p-4 sm:flex-row sm:items-center sm:justify-between dark:border-[#2B3732]">
            <div className="flex-1">
              <p className="text-xs font-semibold text-[#182420] dark:text-[#EAECE6]">
                Ancora Cinestesica &amp; Dopo nel Prima
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#5C6762] dark:text-[#A3B0AA]">
                Unisci pollice e indice per 10 secondi visualizzandoti leggero dopo 20 min di movimento piacevole (obiettivo 150 min/sett).
              </p>
              <label className="mt-2.5 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                <input
                  type="checkbox"
                  checked={anchorDone}
                  onChange={(e) => setAnchorDone(e.target.checked)}
                  className="h-4 w-4 rounded border-[#D7DBD2] accent-[#1F6E5C]"
                />
                <span>Ancora pollice-indice attivata oggi</span>
              </label>
            </div>
            <div className="shrink-0">
              <label
                htmlFor="mov-min"
                className="block text-[11px] text-[#5C6762] dark:text-[#A3B0AA]"
              >
                Movimento oggi (min)
              </label>
              <input
                id="mov-min"
                type="number"
                min="0"
                max="240"
                step="5"
                value={movementMinutes}
                onChange={(e) => setMovementMinutes(Number(e.target.value))}
                className="mt-1 w-24 rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#185849]"
            >
              Salva Movimento &amp; Ancora
            </button>
          </div>
        </form>
      )}

      {/* 17:15 AFTERNOON PARACHUTE */}
      {subTab === 'pomeriggio' && (
        <form onSubmit={handleSaveAfternoon} className="space-y-4 p-5">
          <div className="rounded-lg border border-[#E4E6E0] bg-[#F8F9F6] p-3.5 text-xs leading-relaxed text-[#182420] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#EAECE6]">
            <p className="font-semibold text-[#1F6E5C] dark:text-[#36A68C]">
              Paracadute anti-fame delle 17:30 (fascia protetta 18:00–20:00)
            </p>
            <p className="mt-1 text-[#5C6762] dark:text-[#A3B0AA]">
              Arrivare a cena sereni ti permette di scegliere con lucidità. Scegli una delle opzioni leggere della Dott.ssa Bardho prima del rientro serale:
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SNACK_1730_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSnackChoice(opt)}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  snackChoice === opt
                    ? 'border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                    : 'border-[#E4E6E0] bg-white text-[#5C6762] hover:text-[#182420] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#A3B0AA]'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
            <input
              type="checkbox"
              checked={parachuteDone}
              onChange={(e) => setParachuteDone(e.target.checked)}
              className="h-4 w-4 rounded border-[#D7DBD2] accent-[#1F6E5C]"
            />
            <span>Ho fatto lo spuntino paracadute alle 17:30 (+15 XP)</span>
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#185849]"
            >
              Salva Paracadute
            </button>
          </div>
        </form>
      )}

      {/* 21:30 EVENING CLOSURE & RITUAL */}
      {subTab === 'sera' && (
        <form onSubmit={handleSaveEvening} className="space-y-4 p-5">
          <div>
            <label
              htmlFor="evening-success"
              className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
            >
              1. Un piccolo successo di oggi (anche minuscolo)
            </label>
            <input
              id="evening-success"
              type="text"
              value={eveningSuccess}
              onChange={(e) => setEveningSuccess(e.target.value)}
              placeholder="Es. Ho posato la forchetta tra un boccone e l’altro o ho bevuto un matè caldo..."
              className="mt-1.5 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-sm text-[#182420] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
              2. Check emotivo: Colpa (riparabile) vs Vergogna (giudizio su di te)
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {[
                { id: 'nessuna' as const, label: 'Giornata serena' },
                { id: 'colpa' as const, label: 'Sento colpa (azione da riparare)' },
                { id: 'vergogna' as const, label: 'Sento vergogna (serve autocompassione)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEmotionType(opt.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    emotionType === opt.id
                      ? 'border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                      : 'border-[#E4E6E0] bg-white text-[#5C6762] hover:text-[#182420] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#A3B0AA]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {emotionType !== 'nessuna' && (
              <div className="mt-2 rounded-lg border border-[#E4E6E0] bg-[#F8F9F6] p-3 text-xs text-[#182420] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#EAECE6]">
                {emotionType === 'colpa'
                  ? 'La colpa guarda un singolo gesto ("cosa posso riparare al prossimo pasto con costanza?"). Tu sei molto più di un singolo episodio.'
                  : 'La vergogna sussurra "sono sbagliato" e invita a nascondersi. Portarla alla luce qui è già coraggio: parlati come faresti con un caro amico.'}
                <input
                  type="text"
                  aria-label="Nota di riparazione o autocompassione"
                  value={repairNote}
                  onChange={(e) => setRepairNote(e.target.value)}
                  placeholder="Scrivi una frase gentile di chiusura o il prossimo passo regolare..."
                  className="mt-2 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-xs text-[#182420] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
            )}
          </div>

          <div>
            <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
              3. Rituale di chiusura cucina
            </span>
            <div className="mt-1.5 space-y-1.5">
              {RITUAL_OPTIONS.map((rit) => (
                <button
                  key={rit}
                  type="button"
                  onClick={() => setRitualChoice(rit)}
                  className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    ritualChoice === rit
                      ? 'border-[#1F6E5C] bg-[#EDF3F0] font-medium text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                      : 'border-[#E4E6E0] bg-white text-[#5C6762] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#A3B0AA]'
                  }`}
                >
                  {rit}
                </button>
              ))}
            </div>
            <label className="mt-2.5 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
              <input
                type="checkbox"
                checked={ritualDone}
                onChange={(e) => setRitualDone(e.target.checked)}
                className="h-4 w-4 rounded border-[#D7DBD2] accent-[#1F6E5C]"
              />
              <span>Rituale di chiusura cucina completato</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#185849]"
            >
              Salva Chiusura Serale
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
