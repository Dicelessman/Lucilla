import React, { useEffect, useState } from 'react';
import { X, Wind, Timer, Hand, Phone, Sparkles, Check, Music, Pause } from 'lucide-react';
import { BodyZone, HungerType, RealNeed, SosOutcome, SosProvaEntry, UserProfile } from '../types/coach.ts';
import { calculateSosXp } from '../utils/bariclipRules.ts';

interface SosWaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSaveProva: (entry: SosProvaEntry) => void;
  calmMusicPlaying?: boolean;
  onToggleCalmMusic?: () => void;
}

const BODY_ZONES: Array<{ id: BodyZone; label: string }> = [
  { id: 'stomaco', label: 'Stomaco' },
  { id: 'petto', label: 'Petto' },
  { id: 'mani', label: 'Mani' },
  { id: 'mascella', label: 'Mascella' },
  { id: 'gola', label: 'Gola' },
  { id: 'testa', label: 'Testa' },
];

const REAL_NEEDS: Array<{ id: RealNeed; label: string }> = [
  { id: 'riposo', label: 'Riposo / Silenzio' },
  { id: 'coccola', label: 'Coccola / Calore' },
  { id: 'premio', label: 'Premio / Riconoscimento' },
  { id: 'compagnia', label: 'Compagnia / Ascolto' },
  { id: 'distrazione', label: 'Distrazione sana' },
  { id: 'chiarezza', label: 'Chiarezza / Ordine' },
];

const MANUAL_DISTRACTIONS = [
  'Prepara un infuso di matè o tisana calda e sorseggiala lentamente',
  'Metti in ordine un cassetto o prepara materiale per la prossima attività scout',
  'Esci 5 minuti sul balcone o fai due passi ascoltando una canzone energica',
  'Lavati viso e mani con acqua fresca e cambia stanza',
];

export function SosWaveModal({
  isOpen,
  onClose,
  profile,
  onSaveProva,
  calmMusicPlaying = false,
  onToggleCalmMusic,
}: SosWaveModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [situation, setSituation] = useState('Impulso serale davanti alla dispensa / frigo');
  const [bodyZone, setBodyZone] = useState<BodyZone>('stomaco');
  const [emotionName, setEmotionName] = useState('Frustrazione / Stanchezza');
  const [intensity, setIntensity] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [hungerType, setHungerType] = useState<HungerType>('emotiva');
  const [realNeed, setRealNeed] = useState<RealNeed>('riposo');

  // Level 1-3 interactive tools
  const [breathCount, setBreathCount] = useState(0);
  const [preferManualOverTimer, setPreferManualOverTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [manualTask, setManualTask] = useState(MANUAL_DISTRACTIONS[0]);
  const [blurFoodImage, setBlurFoodImage] = useState(50);
  const [foulardActive, setFoulardActive] = useState(false);

  // Step 4 outcome
  const [waitedMinutes, setWaitedMinutes] = useState(5);
  const [outcome, setOutcome] = useState<SosOutcome>('onda_surfata');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (timerSeconds === null || timerSeconds <= 0) return;
    const t = setInterval(() => {
      setTimerSeconds((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [timerSeconds]);

  if (!isOpen) return null;

  function formatTimer(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function handleSave() {
    const now = new Date();
    const xpEarned = calculateSosXp(intensity, waitedMinutes, true);
    const entry: SosProvaEntry = {
      id: `sos_${Date.now()}`,
      date: now.toISOString().slice(0, 10),
      time: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      situation,
      bodyZone,
      emotionName,
      intensityLevel: intensity,
      hungerType,
      realNeed,
      strategyUsed:
        intensity >= 4
          ? 'Contatto persona fidata / supporto clinico Bardho'
          : preferManualOverTimer
          ? `Attività manuale (${manualTask.slice(0, 42)}...)`
          : `Respiri lenti + attesa ${waitedMinutes} min + visualizzazione PNL`,
      waitedMinutes,
      outcome,
      xpEarned,
      notes: notes.trim() || undefined,
    };
    onSaveProva(entry);
    setStep(1);
    setTimerSeconds(null);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sos-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#182420]/50 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E4E6E0] bg-white shadow-xl dark:border-[#2B3732] dark:bg-[#1B231F]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E4E6E0] px-6 py-4 dark:border-[#2B3732]">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-[#1F6E5C] dark:text-[#36A68C]">
              Protocollo /sos · Step {step} di 4
            </p>
            <h2
              id="sos-modal-title"
              className="font-editorial text-xl font-medium text-[#182420] dark:text-[#EAECE6]"
            >
              Surfare l’Onda &amp; Slegare l’Emozione
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi protocollo SOS"
            className="rounded-lg p-1.5 text-[#5C6762] hover:bg-[#F3F4F0] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:bg-[#222D28] dark:hover:text-[#EAECE6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* STEP 1: STOP, NAME, LOCATE */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-[#5C6762] dark:text-[#A3B0AA]">
                Fermati un attimo insieme a Lucilla. Nominare ciò che senti abbassa subito la spinta automatica.
              </p>

              <div>
                <label
                  htmlFor="sos-situation"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Che momento stai vivendo adesso?
                </label>
                <input
                  id="sos-situation"
                  type="text"
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-sm text-[#182420] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  Dove lo senti nel corpo?
                </span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {BODY_ZONES.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => setBodyZone(z.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        bodyZone === z.id
                          ? 'border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                          : 'border-[#E4E6E0] text-[#5C6762] hover:text-[#182420] dark:border-[#2B3732] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                      }`}
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="sos-emotion"
                    className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                  >
                    Che nome ha questa emozione?
                  </label>
                  <input
                    id="sos-emotion"
                    type="text"
                    value={emotionName}
                    onChange={(e) => setEmotionName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-sm text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                  />
                </div>
                <div>
                  <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                    Intensità dell’onda (1 = lieve · 5 = picco)
                  </span>
                  <div className="mt-1.5 flex gap-1.5">
                    {([1, 2, 3, 4, 5] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setIntensity(lvl)}
                        className={`h-9 flex-1 rounded-lg font-mono text-xs font-semibold tabular-nums transition-colors ${
                          intensity === lvl
                            ? lvl >= 4
                              ? 'bg-[#B45309] text-white'
                              : 'bg-[#1F6E5C] text-white'
                            : 'border border-[#D7DBD2] text-[#5C6762] dark:border-[#33423C] dark:text-[#A3B0AA]'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: HUNGER TEST & REAL NEED */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  Test della Fame: che tipo di spinta riconosci adesso?
                </span>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    {
                      id: 'fisica' as const,
                      title: 'Fame Fisica',
                      desc: 'Cresce graduale nello stomaco, accetta cibi semplici',
                    },
                    {
                      id: 'emotiva' as const,
                      title: 'Fame Emotiva',
                      desc: 'Arriva di colpo, chiede qualcosa di specifico subito',
                    },
                    {
                      id: 'abitudine' as const,
                      title: 'Fame d’Abitudine',
                      desc: 'Legata all’orario, al divano o a un automatismo',
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setHungerType(item.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        hungerType === item.id
                          ? 'border-[#1F6E5C] bg-[#EDF3F0] dark:border-[#36A68C] dark:bg-[#1F332C]'
                          : 'border-[#E4E6E0] hover:bg-[#F8F9F6] dark:border-[#2B3732] dark:hover:bg-[#161D1A]'
                      }`}
                    >
                      <p className="text-xs font-semibold text-[#182420] dark:text-[#EAECE6]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-[#5C6762] dark:text-[#A3B0AA]">
                        {item.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  Cosa ti sta chiedendo davvero il tuo corpo oltre al piatto?
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {REAL_NEEDS.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setRealNeed(n.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        realNeed === n.id
                          ? 'border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                          : 'border-[#E4E6E0] text-[#5C6762] hover:text-[#182420] dark:border-[#2B3732] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                      }`}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: GRADUATED INTERVENTION 1-5 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#E4E6E0] bg-[#F8F9F6] p-3.5 text-xs text-[#182420] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#EAECE6]">
                <span className="font-semibold text-[#1F6E5C] dark:text-[#36A68C]">
                  Intervento calibrato per Livello {intensity}/5:
                </span>{' '}
                {intensity === 1 && '3 respiri lenti (espirazione più lunga) e osservazione dell’ambiente.'}
                {intensity === 2 && 'Pausa di 5–10 min (oppure attività manuale se il timer ti mette fretta), acqua/matè e visualizzazione PNL.'}
                {intensity === 3 && 'Frase ponte ("È scomodo, passa") + micro-azione di cura + frase da amico gentile.'}
                {intensity >= 4 && 'Regola d’oro: "Quando l’onda è 4–5 scegli di condividerla insieme a una persona fidata."'}
              </div>

              {/* Breath pacer for all levels + Ambient calm audio toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E4E6E0] p-4 dark:border-[#2B3732]">
                <div className="flex items-center gap-3.5">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                    <span
                      aria-hidden="true"
                      className="animate-breath absolute inset-0 rounded-full border border-[#1F6E5C]/35 bg-[#EDF3F0] dark:border-[#36A68C]/40 dark:bg-[#1F332C]"
                    />
                    <Wind className="relative h-4 w-4 text-[#1F6E5C] dark:text-[#36A68C]" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#182420] dark:text-[#EAECE6]">
                      3 Respiri Lenti (inspira 4s · espira 6s)
                    </p>
                    <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                      Respiri completati: <span className="font-mono tabular-nums">{breathCount}/3</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onToggleCalmMusic && (
                    <button
                      type="button"
                      onClick={onToggleCalmMusic}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        calmMusicPlaying
                          ? 'border-[#1F6E5C] bg-[#EDF3F0] text-[#1F6E5C] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#36A68C]'
                          : 'border-[#D7DBD2] text-[#5C6762] hover:text-[#182420] dark:border-[#33423C] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                      }`}
                    >
                      {calmMusicPlaying ? <Pause className="h-3.5 w-3.5" /> : <Music className="h-3.5 w-3.5" />}
                      <span>{calmMusicPlaying ? 'Pausa musica' : 'Musica calma'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBreathCount((c) => Math.min(3, c + 1))}
                    className="rounded-lg border border-[#1F6E5C] px-3 py-1.5 text-xs font-medium text-[#1F6E5C] hover:bg-[#EDF3F0] dark:border-[#36A68C] dark:text-[#36A68C] dark:hover:bg-[#1F332C]"
                  >
                    {breathCount >= 3 ? 'Completati' : 'Segna 1 respiro'}
                  </button>
                </div>
              </div>

              {/* Level 2: Timer OR Manual Distraction */}
              {intensity <= 3 && (
                <div className="space-y-3 rounded-xl border border-[#E4E6E0] p-4 dark:border-[#2B3732]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#182420] dark:text-[#EAECE6]">
                      Pausa surfata (5–10 minuti)
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreferManualOverTimer((p) => !p)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1F6E5C] underline-offset-2 hover:underline dark:text-[#36A68C]"
                    >
                      <Hand className="h-3.5 w-3.5" />
                      <span>
                        {preferManualOverTimer
                          ? 'Torna al timer opzionale'
                          : 'Preferisco un’attività manuale calma'}
                      </span>
                    </button>
                  </div>

                  {!preferManualOverTimer ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTimerSeconds(300);
                          setWaitedMinutes(5);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D7DBD2] px-3 py-1.5 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:text-[#EAECE6] dark:hover:bg-[#222D28]"
                      >
                        <Timer className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                        <span>Avvia 5 min</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTimerSeconds(600);
                          setWaitedMinutes(10);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D7DBD2] px-3 py-1.5 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:text-[#EAECE6] dark:hover:bg-[#222D28]"
                      >
                        <Timer className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                        <span>Avvia 10 min</span>
                      </button>
                      {timerSeconds !== null && (
                        <span className="ml-auto font-mono text-lg font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                          {formatTimer(timerSeconds)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {MANUAL_DISTRACTIONS.map((task) => (
                        <button
                          key={task}
                          type="button"
                          onClick={() => {
                            setManualTask(task);
                            setWaitedMinutes(8);
                          }}
                          className={`block w-full rounded-lg border px-3 py-2 text-left text-xs ${
                            manualTask === task
                              ? 'border-[#1F6E5C] bg-[#EDF3F0] font-medium text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                              : 'border-[#E4E6E0] text-[#5C6762] dark:border-[#2B3732] dark:text-[#A3B0AA]'
                          }`}
                        >
                          {task}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* PNL Submodality Shift + Foulard Rosso */}
              {intensity <= 3 && (
                <div className="space-y-3 rounded-xl border border-[#E4E6E0] p-4 dark:border-[#2B3732]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#182420] dark:text-[#EAECE6]">
                      Visualizzazione PNL: sbiadisci l’impulso, illumina il te energico
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                      {blurFoodImage}% distanza
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Sfoca e rimpicciolisci l'immagine del cibo"
                    min="0"
                    max="100"
                    value={blurFoodImage}
                    onChange={(e) => setBlurFoodImage(Number(e.target.value))}
                    className="w-full accent-[#1F6E5C]"
                  />
                  <div className="flex items-center justify-between text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                    <span>Immagine cibo sbiadita in bianco e nero e lontana</span>
                    <button
                      type="button"
                      onClick={() => setFoulardActive((f) => !f)}
                      className={`rounded-md border px-2.5 py-1 font-medium ${
                        foulardActive
                          ? 'border-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]'
                          : 'border-[#E4E6E0] text-[#5C6762] dark:border-[#2B3732] dark:text-[#A3B0AA]'
                      }`}
                    >
                      {foulardActive ? 'Foulard rosso: ascolto il bambino di 4 anni' : 'Visualizza Foulard Rosso'}
                    </button>
                  </div>
                  {foulardActive && (
                    <p className="rounded-lg bg-[#F8F9F6] p-2.5 text-xs text-[#182420] dark:bg-[#161D1A] dark:text-[#EAECE6]">
                      Immagina il te stesso di 4 anni davanti a te: gli parli con tenerezza, accogli il suo bisogno di {realNeed} e gli dici: “Ci penso io a prendermi cura di noi con dolcezza.”
                    </p>
                  )}
                </div>
              )}

              {/* Level 3 Bridge phrase */}
              {intensity === 3 && (
                <div className="rounded-xl border border-[#C6D5CE] bg-[#EDF3F0] p-4 text-xs text-[#182420] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#EAECE6]">
                  <p className="font-semibold">Frase ponte da ripetere ad alta voce:</p>
                  <p className="mt-1 font-editorial text-base italic text-[#182420] dark:text-[#EAECE6]">
                    “È scomodo, posso sentirlo nel corpo, e passa. Scelgo cosa voglio davvero adesso.”
                  </p>
                </div>
              )}

              {/* Level 4-5 Contact Card */}
              {intensity >= 4 && (
                <div className="space-y-2.5 rounded-xl border border-[#F3D09B] bg-[#FFFBEB] p-4 text-xs text-[#78350F] dark:border-[#6B4F1D] dark:bg-[#2A2112] dark:text-[#FDE68A]">
                  <div className="flex items-center gap-2 font-semibold text-[#B45309] dark:text-[#FBBF24]">
                    <Phone className="h-4 w-4" />
                    <span>Livello {intensity}/5 — Condividi l’onda con una persona fidata</span>
                  </div>
                  <p className="leading-relaxed">
                    Chiama o scrivi adesso a una persona di fiducia (compagna, amico scout, familiare) per parlare 5 minuti d’altro o raccontare come ti senti.
                  </p>
                  <p className="font-mono text-[11px] font-medium text-[#182420] dark:text-[#EAECE6]">
                    Supporto clinico: {profile.clinicianName} · Cell. {profile.clinicianPhone} · {profile.clinicianEmail}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: LOG TO REGISTRO DELLE PROVE */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#E4E6E0] bg-[#F8F9F6] p-3.5 text-xs text-[#182420] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#EAECE6]">
                Qualunque sia stata la tua scelta, registrarla qui è <strong>informazione e coraggio</strong>, sempre dalla tua parte.
              </div>

              <div>
                <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  Come è andata?
                </span>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { id: 'onda_surfata' as const, label: 'Onda surfata (l’impulso è sceso)' },
                    { id: 'scelta_consapevole' as const, label: 'Scelta alternativa di cura (acqua, matè, camminata)' },
                    { id: 'mangiato_con_presenza' as const, label: 'Ho mangiato con presenza e lentezza' },
                    { id: 'mangiato_di_corsa' as const, label: 'Oggi ho mangiato di fretta (informazione utile)' },
                  ].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOutcome(o.id)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium ${
                        outcome === o.id
                          ? 'border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                          : 'border-[#E4E6E0] text-[#5C6762] dark:border-[#2B3732] dark:text-[#A3B0AA]'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="sos-waited"
                    className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                  >
                    Minuti di attesa prima della decisione
                  </label>
                  <input
                    id="sos-waited"
                    type="number"
                    min="0"
                    max="120"
                    value={waitedMinutes}
                    onChange={(e) => setWaitedMinutes(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-sm tabular-nums text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sos-notes"
                    className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                  >
                    Nota per il Registro delle Prove
                  </label>
                  <input
                    id="sos-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Cosa ha funzionato di più?"
                    className="mt-1.5 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-sm text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between border-t border-[#E4E6E0] bg-[#FAFAF8] px-6 py-3.5 dark:border-[#2B3732] dark:bg-[#161D1A]">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              className="rounded-lg border border-[#D7DBD2] bg-white px-4 py-2 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6] dark:hover:bg-[#222D28]"
            >
              Indietro
            </button>
          ) : (
            <span className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              +{calculateSosXp(intensity, waitedMinutes, true)} XP Muscolo Tolleranza
            </span>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185849]"
            >
              <span>Prosegui</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185849]"
            >
              <Check className="h-4 w-4" />
              <Sparkles className="h-3.5 w-3.5" />
              <span>Salva nel Registro delle Prove</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
