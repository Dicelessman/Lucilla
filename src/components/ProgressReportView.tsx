import React, { useMemo, useState } from 'react';
import {
  Copy,
  Download,
  Printer,
  Check,
  FileText,
  Sparkles,
  Pencil,
  Trash2,
  X,
  Stethoscope,
  Plus,
} from 'lucide-react';
import {
  ClinicalVisitEntry,
  CoachState,
  SosOutcome,
  SosProvaEntry,
} from '../types/coach.ts';
import {
  calculateBmi,
  calculateWeeklyProteinCounts,
  getMonthlyTrendSummary,
} from '../utils/bariclipRules.ts';
import {
  generateBardhoCsvExport,
  generateBardhoMarkdownReport,
} from '../utils/reportGenerator.ts';
import { generateWeeklyBriefing } from '../utils/insightsAndPlanner.ts';

interface ProgressReportViewProps {
  state: CoachState;
  onUpdateSos: (entry: SosProvaEntry) => void;
  onDeleteSos: (sosId: string) => void;
  onAddVisit: (visit: ClinicalVisitEntry) => void;
  onUpdateVisit: (visit: ClinicalVisitEntry) => void;
  onDeleteVisit: (visitId: string) => void;
}

export function ProgressReportView({
  state,
  onUpdateSos,
  onDeleteSos,
  onAddVisit,
  onUpdateVisit,
  onDeleteVisit,
}: ProgressReportViewProps) {
  const [copied, setCopied] = useState(false);
  const [editingSos, setEditingSos] = useState<SosProvaEntry | null>(null);
  const [confirmDeleteSosId, setConfirmDeleteSosId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const summary = getMonthlyTrendSummary(state);
  const currentBmi = calculateBmi(summary.latestWeight, state.profile.heightCm);
  const weeklyCounts = calculateWeeklyProteinCounts(state.meals, today);
  const markdownReport = generateBardhoMarkdownReport(state, today);
  const briefing = useMemo(() => generateWeeklyBriefing(state), [state]);

  // Clinical Visits CRUD state
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [visitDate, setVisitDate] = useState(today);
  const [visitClinician, setVisitClinician] = useState(state.profile.clinicianName);
  const [visitWeight, setVisitWeight] = useState<string>(String(summary.latestWeight));
  const [visitNextDate, setVisitNextDate] = useState('');
  const [visitSummaryNotes, setVisitSummaryNotes] = useState('');
  const [visitNextFocus, setVisitNextFocus] = useState('');
  const [confirmDeleteVisitId, setConfirmDeleteVisitId] = useState<string | null>(null);

  // Weight chart data
  const sortedWeights = [...state.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const minW = Math.min(...sortedWeights.map((m) => m.weightKg), 109) - 2;
  const maxW = Math.max(...sortedWeights.map((m) => m.weightKg), 126) + 2;

  // Circumference chart data
  const tapeEntries = sortedWeights.filter(
    (m) =>
      typeof m.umbilicalCm === 'number' ||
      typeof m.hipsCm === 'number' ||
      typeof m.chestCm === 'number'
  );
  const allCmValues = tapeEntries.flatMap((m) =>
    [m.umbilicalCm, m.hipsCm, m.chestCm].filter((v): v is number => typeof v === 'number')
  );
  const minCm = allCmValues.length > 0 ? Math.min(...allCmValues) - 3 : 115;
  const maxCm = allCmValues.length > 0 ? Math.max(...allCmValues) + 3 : 140;

  // Sleep & SOS correlation data
  const sleepEntries = [...state.checkins]
    .filter((c) => typeof c.sleepHours === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));

  function handleCopyMarkdown() {
    navigator.clipboard.writeText(markdownReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handleDownloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrintPdf() {
    window.print();
  }

  function handleSaveSosEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSos) return;
    onUpdateSos(editingSos);
    setEditingSos(null);
  }

  function openNewVisitForm() {
    setEditingVisitId(null);
    setVisitDate(today);
    setVisitClinician(state.profile.clinicianName);
    setVisitWeight(String(summary.latestWeight));
    setVisitNextDate('');
    setVisitSummaryNotes('');
    setVisitNextFocus('');
    setShowVisitForm(true);
  }

  function startEditVisit(visit: ClinicalVisitEntry) {
    setEditingVisitId(visit.id);
    setVisitDate(visit.date);
    setVisitClinician(visit.clinicianName);
    setVisitWeight(
      typeof visit.weightAtVisitKg === 'number' ? String(visit.weightAtVisitKg) : ''
    );
    setVisitNextDate(visit.nextVisitDate ?? '');
    setVisitSummaryNotes(visit.summaryNotes);
    setVisitNextFocus(visit.nextFocus ?? '');
    setShowVisitForm(true);
  }

  function handleSaveVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!visitSummaryNotes.trim()) return;
    const parsedWeight = visitWeight.trim() ? Number(visitWeight) : undefined;
    const entry: ClinicalVisitEntry = {
      id: editingVisitId ?? `visit_${Date.now()}`,
      date: visitDate || today,
      clinicianName: visitClinician.trim() || state.profile.clinicianName,
      weightAtVisitKg:
        typeof parsedWeight === 'number' && !Number.isNaN(parsedWeight)
          ? parsedWeight
          : undefined,
      summaryNotes: visitSummaryNotes.trim(),
      nextFocus: visitNextFocus.trim(),
      nextVisitDate: visitNextDate.trim() || undefined,
    };
    if (editingVisitId) {
      onUpdateVisit(entry);
    } else {
      onAddVisit(entry);
    }
    setShowVisitForm(false);
    setEditingVisitId(null);
  }

  // SVG polyline helper for weight trend
  const chartW = 460;
  const chartH = 160;
  const padX = 36;
  const padY = 20;
  const weightPoints = sortedWeights.map((m, idx) => {
    const x =
      sortedWeights.length === 1
        ? chartW / 2
        : padX + (idx / (sortedWeights.length - 1)) * (chartW - padX * 2);
    const y =
      padY + ((maxW - m.weightKg) / Math.max(1, maxW - minW)) * (chartH - padY * 2);
    return { x, y, m };
  });

  const buildCmPoints = (getter: (m: (typeof tapeEntries)[number]) => number | undefined) =>
    tapeEntries
      .map((m, idx) => {
        const val = getter(m);
        if (typeof val !== 'number') return null;
        const x =
          tapeEntries.length === 1
            ? chartW / 2
            : padX + (idx / (tapeEntries.length - 1)) * (chartW - padX * 2);
        const y =
          padY + ((maxCm - val) / Math.max(1, maxCm - minCm)) * (chartH - padY * 2);
        return { x, y, val, date: m.date, id: m.id };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

  const umbPoints = buildCmPoints((m) => m.umbilicalCm);
  const hipsPoints = buildCmPoints((m) => m.hipsCm);
  const chestPoints = buildCmPoints((m) => m.chestCm);

  return (
    <div className="space-y-6 print-full">
      {/* KPI Summary Strip */}
      <section
        aria-label="Riepilogo metriche mensili"
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <div className="print-card rounded-xl border border-[#E4E6E0] bg-white p-4 dark:border-[#2B3732] dark:bg-[#1B231F]">
          <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">Peso &amp; BMI attuale</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
            {summary.latestWeight} kg
          </p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
            BMI {currentBmi} · {summary.weightDelta > 0 ? '+' : ''}
            {summary.weightDelta} kg dal baseline
          </p>
        </div>

        <div className="print-card rounded-xl border border-[#E4E6E0] bg-white p-4 dark:border-[#2B3732] dark:bg-[#1B231F]">
          <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">Slow Eating &amp; Sazietà</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
            {summary.slowEatingRate}%
          </p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
            Sazietà media {summary.avgPostSatiety}/10 (target 5–6)
          </p>
        </div>

        <div className="print-card rounded-xl border border-[#E4E6E0] bg-white p-4 dark:border-[#2B3732] dark:bg-[#1B231F]">
          <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">Sonno medio</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
            {summary.avgSleep} h
          </p>
          <p className="mt-0.5 text-xs text-[#5C6762] dark:text-[#A3B0AA]">
            Soglia grelina: 6.0 h/notte
          </p>
        </div>

        <div className="print-card rounded-xl border border-[#E4E6E0] bg-white p-4 dark:border-[#2B3732] dark:bg-[#1B231F]">
          <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">Onde Emotive Surfate</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
            {summary.surfedWaves}/{summary.totalSos}
          </p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
            {state.xp} XP Muscolo Tolleranza
          </p>
        </div>
      </section>

      {/* Automated Briefing della Settimana (Sleep-Hunger-Emotion Correlations) */}
      <section
        aria-label="Briefing automatico della settimana e correlazioni"
        className="print-card rounded-xl border border-[#E4E6E0] bg-white p-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
            <div>
              <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                Briefing della Settimana (Correlazioni Automatiche)
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">{briefing.headline}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {briefing.insights.map((ins) => (
            <div
              key={ins.id}
              className={`rounded-xl border p-3.5 text-xs ${
                ins.tone === 'attention'
                  ? 'border-[#F3D09B] bg-[#FFFBEB] dark:border-[#78350F] dark:bg-[#292011]'
                  : ins.tone === 'positive'
                  ? 'border-[#C6D5CE] bg-[#EDF3F0] dark:border-[#2F4E42] dark:bg-[#1F332C]'
                  : 'border-[#E4E6E0] bg-[#F8F9F6] dark:border-[#2B3732] dark:bg-[#161D1A]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                  {ins.title}
                </span>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                  {ins.metric}
                </span>
              </div>
              <p className="mt-1.5 leading-relaxed text-[#5C6762] dark:text-[#CBD5CF]">
                {ins.narrative}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Graphical Monthly Progress Summary: Weight + Tape Measure + Sleep */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Weight Trend SVG */}
        <section
          aria-label="Grafico andamento peso"
          className="print-card rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-6 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
            Riepilogo Grafico: Andamento Peso
          </h2>
          <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
            Andamento multi-settimana verso il traguardo in positivo (109 kg)
          </p>

          <div className="mt-4">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full"
              role="img"
              aria-label="Grafico lineare andamento peso"
            >
              {(() => {
                const targetY =
                  padY + ((maxW - 109) / Math.max(1, maxW - minW)) * (chartH - padY * 2);
                return (
                  <g>
                    <line
                      x1={padX}
                      y1={targetY}
                      x2={chartW - padX}
                      y2={targetY}
                      stroke="#1F6E5C"
                      strokeDasharray="4 4"
                      strokeOpacity="0.45"
                    />
                    <text x={padX} y={targetY - 4} className="fill-[#1F6E5C] font-mono text-[9px] dark:fill-[#36A68C]">
                      Obiettivo 109 kg
                    </text>
                  </g>
                );
              })()}

              {weightPoints.length > 1 && (
                <polyline
                  fill="none"
                  stroke="currentColor"
                  className="text-[#182420] dark:text-[#EAECE6]"
                  strokeWidth="2.5"
                  points={weightPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                />
              )}

              {weightPoints.map((p) => (
                <g key={p.m.id}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4.5"
                    fill="#1F6E5C"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                  <text
                    x={p.x}
                    y={p.y - 9}
                    textAnchor="middle"
                    className="fill-[#182420] font-mono text-[9.5px] font-semibold dark:fill-[#EAECE6]"
                  >
                    {p.m.weightKg}
                  </text>
                  <text
                    x={p.x}
                    y={chartH - 3}
                    textAnchor="middle"
                    className="fill-[#5C6762] font-mono text-[8.5px] dark:fill-[#A3B0AA]"
                  >
                    {p.m.date.slice(5)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </section>

        {/* Tape Measure Multi-Metric SVG Chart */}
        <section
          aria-label="Grafico circonferenze metro da sarta"
          className="print-card rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-6 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                Metro da Sarta: Ombelico, Fianchi &amp; Torace
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Circonferenze in cm oltre il numero della bilancia
              </p>
            </div>
            <div className="flex gap-3 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 bg-[#1F6E5C]" /> Ombelico
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 bg-[#B45309]" /> Fianchi
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 bg-[#64748B]" /> Torace
              </span>
            </div>
          </div>

          <div className="mt-4">
            {tapeEntries.length === 0 ? (
              <p className="py-12 text-center text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Registra le circonferenze in Strumenti PNL per visualizzare la curva del metro da sarta.
              </p>
            ) : (
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full"
                role="img"
                aria-label="Grafico multi-linea circonferenze ombelico, fianchi e torace"
              >
                {chestPoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#64748B"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    points={chestPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  />
                )}
                {hipsPoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#B45309"
                    strokeWidth="2"
                    points={hipsPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  />
                )}
                {umbPoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#1F6E5C"
                    strokeWidth="2.5"
                    points={umbPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  />
                )}

                {umbPoints.map((p) => (
                  <g key={`u_${p.id}`}>
                    <circle cx={p.x} cy={p.y} r="3.5" fill="#1F6E5C" />
                    <text
                      x={p.x}
                      y={p.y - 7}
                      textAnchor="middle"
                      className="fill-[#1F6E5C] font-mono text-[8.5px] font-semibold dark:fill-[#36A68C]"
                    >
                      {p.val}
                    </text>
                    <text
                      x={p.x}
                      y={chartH - 3}
                      textAnchor="middle"
                      className="fill-[#5C6762] font-mono text-[8.5px] dark:fill-[#A3B0AA]"
                    >
                      {p.date.slice(5)}
                    </text>
                  </g>
                ))}
                {hipsPoints.map((p) => (
                  <g key={`h_${p.id}`}>
                    <circle cx={p.x} cy={p.y} r="3" fill="#B45309" />
                    <text
                      x={p.x}
                      y={p.y + 11}
                      textAnchor="middle"
                      className="fill-[#B45309] font-mono text-[8.5px] dark:fill-[#FBBF24]"
                    >
                      {p.val}
                    </text>
                  </g>
                ))}
                {chestPoints.map((p) => (
                  <circle key={`c_${p.id}`} cx={p.x} cy={p.y} r="2.5" fill="#64748B" />
                ))}
              </svg>
            )}
          </div>
        </section>

        {/* Sleep vs Cravings & Weekly Bariclip Adherence */}
        <section
          aria-label="Correlazione sonno e aderenza piano"
          className="print-card rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-12 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                Sonno, Fame Fisiologica &amp; Onde SOS
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Confronto tra ore di sonno (soglia 6h grelina/leptina) ed episodi SOS nello stesso giorno.
              </p>

              <div className="mt-4 space-y-2.5">
                {sleepEntries.length === 0 ? (
                  <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                    Nessun dato di sonno registrato finora. Compila il Check-in Mattina per avviare il confronto.
                  </p>
                ) : (
                  sleepEntries.map((c) => {
                    const hours = c.sleepHours ?? 0;
                    const isShort = hours < 6;
                    const pct = Math.min(100, Math.round((hours / 9) * 100));
                    const sosSameDay = state.sosLogs.filter((s) => s.date === c.date).length;
                    return (
                      <div key={c.id} className="grid grid-cols-12 items-center gap-2 text-xs">
                        <span className="col-span-3 font-mono tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                          {c.date.slice(5)}
                        </span>
                        <div className="col-span-6 h-3 overflow-hidden rounded bg-[#ECEEE8] dark:bg-[#26312C]">
                          <div
                            className={`h-full ${isShort ? 'bg-[#B45309]' : 'bg-[#1F6E5C]'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="col-span-3 text-right font-mono tabular-nums text-[#182420] dark:text-[#EAECE6]">
                          {hours}h · {sosSameDay} SOS
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="border-t border-[#E4E6E0] pt-4 lg:col-span-6 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0 dark:border-[#2B3732]">
              <h3 className="text-sm font-semibold text-[#182420] dark:text-[#EAECE6]">
                Copertura Frequenze Settimanali (Piano Bardho)
              </h3>
              <p className="mt-0.5 text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Riepilogo attuale dalla settimana in corso
              </p>
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                {weeklyCounts.slice(0, 8).map((w) => (
                  <div key={w.category} className="flex items-center justify-between border-b border-[#ECEEE8] pb-1 dark:border-[#27322D]">
                    <span className="truncate text-[#5C6762] dark:text-[#A3B0AA]">{w.label}</span>
                    <span className="font-mono font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
                      {w.current}/{w.target}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Diario Visite Cliniche & Note Dott.ssa Bardho */}
      <section
        aria-label="Diario Visite Cliniche e Note della Dott.ssa Bardho"
        className="print-card rounded-xl border border-[#E4E6E0] bg-white p-6 dark:border-[#2B3732] dark:bg-[#1B231F]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E6E0] pb-4 dark:border-[#2B3732]">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
            <div>
              <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                Diario Visite Cliniche &amp; Note {state.profile.clinicianName}
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Indicazioni post-visita, accordi pratici e prossimi controlli medici inclusi automaticamente nel report.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openNewVisitForm}
            className="no-print inline-flex items-center gap-1.5 rounded-lg bg-[#1F6E5C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#185849]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nuova visita</span>
          </button>
        </div>

        {showVisitForm && (
          <form
            onSubmit={handleSaveVisit}
            className="no-print mt-4 space-y-3 rounded-xl border border-[#C6D5CE] bg-[#F8F9F6] p-4 text-xs dark:border-[#2F4E42] dark:bg-[#161D1A]"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                {editingVisitId ? 'Modifica visita clinica' : 'Registra visita clinica'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowVisitForm(false);
                  setEditingVisitId(null);
                }}
                className="text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Data visita
                </label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 font-mono dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Specialista
                </label>
                <input
                  type="text"
                  value={visitClinician}
                  onChange={(e) => setVisitClinician(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Peso alla visita (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={visitWeight}
                  onChange={(e) => setVisitWeight(e.target.value)}
                  placeholder="Es. 122.4"
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 font-mono dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Prossimo controllo (opz.)
                </label>
                <input
                  type="date"
                  value={visitNextDate}
                  onChange={(e) => setVisitNextDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 font-mono dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                Note cliniche &amp; indicazioni ricevute
              </label>
              <textarea
                rows={2}
                required
                value={visitSummaryNotes}
                onChange={(e) => setVisitSummaryNotes(e.target.value)}
                placeholder="Es. Confermata ottima tolleranza ai cibi proteici, idratazione lontana dai pasti e focus su slow eating..."
                className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                Prossimo obiettivo concordato (opzionale)
              </label>
              <input
                type="text"
                value={visitNextFocus}
                onChange={(e) => setVisitNextFocus(e.target.value)}
                placeholder="Es. Consolidare 150 min di camminata settimanale e idratazione 8 bicchieri"
                className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowVisitForm(false);
                  setEditingVisitId(null);
                }}
                className="rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-[#182420] dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#1F6E5C] px-4 py-1.5 font-semibold text-white hover:bg-[#185849]"
              >
                {editingVisitId ? 'Salva modifiche visita' : 'Salva visita clinica'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-3">
          {state.clinicalVisits.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E4E6E0] bg-[#FAFBF8] p-4 text-xs dark:border-[#2B3732] dark:bg-[#161D1A]">
              <p className="text-[#5C6762] dark:text-[#A3B0AA]">
                Nessuna visita clinica registrata al momento. Annota qui gli appunti di ogni colloquio con {state.profile.clinicianName}.
              </p>
              <button
                type="button"
                onClick={openNewVisitForm}
                className="no-print rounded-lg border border-[#1F6E5C] bg-white px-3 py-1.5 font-medium text-[#1F6E5C] hover:bg-[#EDF3F0] dark:border-[#36A68C] dark:bg-[#1B231F] dark:text-[#36A68C]"
              >
                Registra prima visita
              </button>
            </div>
          ) : (
            [...state.clinicalVisits]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((v) => (
                <article
                  key={v.id}
                  className="rounded-xl border border-[#E4E6E0] bg-[#FAFBF8] p-4 text-xs dark:border-[#2B3732] dark:bg-[#161D1A]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                        {v.date}
                      </span>
                      <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                        {v.clinicianName}
                      </span>
                      {typeof v.weightAtVisitKg === 'number' && (
                        <span className="font-mono tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                          · {v.weightAtVisitKg} kg
                        </span>
                      )}
                      {v.nextVisitDate && (
                        <span className="font-mono tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                          · Prossimo controllo: {v.nextVisitDate}
                        </span>
                      )}
                    </div>

                    <div className="no-print flex items-center gap-1">
                      {confirmDeleteVisitId === v.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteVisit(v.id);
                              setConfirmDeleteVisitId(null);
                              if (editingVisitId === v.id) {
                                setShowVisitForm(false);
                                setEditingVisitId(null);
                              }
                            }}
                            className="rounded border border-[#B91C1C] bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-semibold text-[#991B1B] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
                          >
                            Conferma
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteVisitId(null)}
                            className="rounded border border-[#D7DBD2] px-2 py-0.5 text-[11px] text-[#5C6762] dark:border-[#33423C] dark:text-[#A3B0AA]"
                          >
                            Annulla
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`Modifica visita del ${v.date}`}
                            onClick={() => startEditVisit(v)}
                            className="rounded p-1 text-[#5C6762] hover:text-[#1F6E5C] dark:text-[#A3B0AA] dark:hover:text-[#36A68C]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Elimina visita del ${v.date}`}
                            onClick={() => setConfirmDeleteVisitId(v.id)}
                            className="rounded p-1 text-[#5C6762] hover:text-[#B91C1C] dark:text-[#A3B0AA] dark:hover:text-[#FCA5A5]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 leading-relaxed text-[#182420] dark:text-[#EAECE6]">
                    {v.summaryNotes}
                  </p>
                  {v.nextFocus && (
                    <p className="mt-1.5 text-[11px] font-medium text-[#1F6E5C] dark:text-[#36A68C]">
                      Focus concordato: {v.nextFocus}
                    </p>
                  )}
                </article>
              ))
          )}
        </div>
      </section>

      {/* Clinical Report / Registro delle Prove (/report_bardho) with Edit & Delete */}
      <section
        aria-label="Report Clinico Dott.ssa Bardho e Registro delle Prove"
        className="print-card rounded-xl border border-[#E4E6E0] bg-white p-6 dark:border-[#2B3732] dark:bg-[#1B231F]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E6E0] pb-4 dark:border-[#2B3732]">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-[#1F6E5C] dark:text-[#36A68C]">
              Comando /report_bardho
            </p>
            <h2 className="font-editorial text-xl font-medium text-[#182420] dark:text-[#EAECE6]">
              Registro delle Prove &amp; Report Clinico — {state.profile.clinicianName}
            </h2>
            <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              {state.profile.name} · Percorso clinico dal {state.profile.surgeryDate} · {state.profile.clinicianPhone}
            </p>
          </div>

          <div className="no-print flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#1F6E5C]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copied ? 'Copiato!' : 'Copia Markdown'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleDownloadFile(
                  markdownReport,
                  `report_bardho_${today}.md`,
                  'text/markdown;charset=utf-8'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Scarica .md</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleDownloadFile(
                  generateBardhoCsvExport(state),
                  `registro_prove_${today}.csv`,
                  'text/csv;charset=utf-8'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Esporta CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F6E5C] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#185849]"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Stampa / PDF</span>
            </button>
          </div>
        </div>

        {/* Inline Edit Form for SOS Prova */}
        {editingSos && (
          <form
            onSubmit={handleSaveSosEdit}
            className="no-print mt-4 space-y-3 rounded-xl border border-[#C6D5CE] bg-[#F8F9F6] p-4 text-xs dark:border-[#2F4E42] dark:bg-[#161D1A]"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                Modifica Prova SOS ({editingSos.date} · {editingSos.time})
              </span>
              <button
                type="button"
                onClick={() => setEditingSos(null)}
                className="text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Situazione
                </label>
                <input
                  type="text"
                  value={editingSos.situation}
                  onChange={(e) => setEditingSos({ ...editingSos, situation: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Emozione
                </label>
                <input
                  type="text"
                  value={editingSos.emotionName}
                  onChange={(e) => setEditingSos({ ...editingSos, emotionName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Esito
                </label>
                <select
                  value={editingSos.outcome}
                  onChange={(e) =>
                    setEditingSos({ ...editingSos, outcome: e.target.value as SosOutcome })
                  }
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                >
                  <option value="onda_surfata">Onda surfata</option>
                  <option value="scelta_consapevole">Scelta consapevole</option>
                  <option value="mangiato_con_presenza">Mangiato con presenza</option>
                  <option value="mangiato_di_corsa">Mangiato di corsa</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Strategia usata
                </label>
                <input
                  type="text"
                  value={editingSos.strategyUsed}
                  onChange={(e) => setEditingSos({ ...editingSos, strategyUsed: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Attesa (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={editingSos.waitedMinutes}
                  onChange={(e) =>
                    setEditingSos({ ...editingSos, waitedMinutes: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 font-mono dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#182420] dark:text-[#EAECE6]">
                  Note cliniche
                </label>
                <input
                  type="text"
                  value={editingSos.notes ?? ''}
                  onChange={(e) => setEditingSos({ ...editingSos, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSos(null)}
                className="rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-[#182420] dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#1F6E5C] px-3.5 py-1.5 font-semibold text-white hover:bg-[#185849]"
              >
                Salva Prova SOS
              </button>
            </div>
          </form>
        )}

        {/* Registro delle Prove Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#E4E6E0] text-[#5C6762] dark:border-[#2B3732] dark:text-[#A3B0AA]">
                <th className="py-2 pr-3 font-medium">Data · Ora</th>
                <th className="py-2 pr-3 font-medium">Frustrazione / Situazione</th>
                <th className="py-2 pr-3 font-medium">Zona &amp; Emozione</th>
                <th className="py-2 pr-3 text-center font-medium">Livello</th>
                <th className="py-2 pr-3 font-medium">Cosa ho fatto</th>
                <th className="py-2 pr-3 font-medium">Come è andata</th>
                <th className="no-print py-2 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEE8] dark:divide-[#27322D]">
              {state.sosLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                    Nessuna prova registrata finora. Usa “SOS Onda” quando vuoi tracciare un momento critico.
                  </td>
                </tr>
              ) : (
                [...state.sosLogs]
                  .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
                  .map((s) => (
                    <tr key={s.id} className="hover:bg-[#FAFBF8] dark:hover:bg-[#222D28]">
                      <td className="whitespace-nowrap py-2.5 pr-3 font-mono tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                        {s.date} · {s.time}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-[#182420] dark:text-[#EAECE6]">
                        {s.situation}
                      </td>
                      <td className="py-2.5 pr-3 text-[#5C6762] dark:text-[#A3B0AA]">
                        {s.bodyZone} · {s.emotionName}
                      </td>
                      <td className="py-2.5 pr-3 text-center font-mono font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
                        {s.intensityLevel}/5
                      </td>
                      <td className="py-2.5 pr-3 text-[#182420] dark:text-[#EAECE6]">
                        {s.strategyUsed} ({s.waitedMinutes} min)
                      </td>
                      <td className="py-2.5 pr-3 text-[#1F6E5C] dark:text-[#36A68C]">
                        {(() => {
                          const raw = s.outcome.replace(/_/g, ' ');
                          return raw.charAt(0).toUpperCase() + raw.slice(1);
                        })()}
                      </td>
                      <td className="no-print whitespace-nowrap py-2.5 text-right">
                        {confirmDeleteSosId === s.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteSos(s.id);
                                setConfirmDeleteSosId(null);
                                if (editingSos?.id === s.id) setEditingSos(null);
                              }}
                              className="rounded border border-[#B91C1C] bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-semibold text-[#991B1B] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
                            >
                              Conferma
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSosId(null)}
                              className="rounded border border-[#D7DBD2] px-2 py-0.5 text-[11px] text-[#5C6762] dark:border-[#33423C] dark:text-[#A3B0AA]"
                            >
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Modifica prova ${s.situation}`}
                              onClick={() => setEditingSos(s)}
                              className="rounded p-1 text-[#5C6762] hover:text-[#1F6E5C] dark:text-[#A3B0AA] dark:hover:text-[#36A68C]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Elimina prova ${s.situation}`}
                              onClick={() => setConfirmDeleteSosId(s.id)}
                              className="rounded p-1 text-[#5C6762] hover:text-[#B91C1C] dark:text-[#A3B0AA] dark:hover:text-[#FCA5A5]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
