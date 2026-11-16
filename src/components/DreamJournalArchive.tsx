import React, { useMemo, useState } from 'react';
import { BookMarked, Printer, Search, Sparkles, ArrowUpDown } from 'lucide-react';
import { DailyCheckin } from '../types/coach.ts';

interface DreamJournalArchiveProps {
  id?: string;
  checkins: DailyCheckin[];
  dreamInsights: Record<string, string>;
  onSaveDreamInsight: (checkinId: string, insight: string) => void;
  getIdToken: () => Promise<string | null>;
  onPrintDreams: () => void;
}

export function DreamJournalArchive({
  id = 'dream-archive-section',
  checkins,
  dreamInsights,
  onSaveDreamInsight,
  getIdToken,
  onPrintDreams,
}: DreamJournalArchiveProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [loadingDreamId, setLoadingDreamId] = useState<string | null>(null);
  const [dreamInsightError, setDreamInsightError] = useState<string | null>(null);

  const dreamEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...checkins]
      .filter((c) => Boolean(c.dreamJournal?.trim()))
      .filter((c) => {
        if (!q) return true;
        return (
          c.date.toLowerCase().includes(q) ||
          (c.dreamJournal || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        sortOrder === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
      );
  }, [checkins, searchQuery, sortOrder]);

  const totalDreamsCount = useMemo(
    () => checkins.filter((c) => Boolean(c.dreamJournal?.trim())).length,
    [checkins]
  );

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
      onSaveDreamInsight(checkinId, data.insight);
    } catch (err) {
      setDreamInsightError(
        err instanceof Error ? err.message : 'Errore nella richiesta dello spunto PNL.'
      );
    } finally {
      setLoadingDreamId(null);
    }
  }

  return (
    <section
      id={id}
      aria-label="Archivio Diario dei Sogni e stampa"
      className="rounded-xl border border-[#E4E6E0] bg-white p-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
    >
      <div className="flex flex-col gap-3 border-b border-[#E4E6E0] pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-[#2B3732]">
        <div className="flex items-start gap-2.5">
          <BookMarked className="mt-0.5 h-5 w-5 shrink-0 text-[#1F6E5C] dark:text-[#36A68C]" />
          <div>
            <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
              Tutti i Diari dei Sogni
            </h2>
            <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              <span className="font-mono tabular-nums">{totalDreamsCount}</span>{' '}
              {totalDreamsCount === 1 ? 'sogno registrato' : 'sogni registrati'} · Visualizza, rileggi o stampa la raccolta completa.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-xs font-medium text-[#182420] transition-colors hover:bg-[#F3F4F0] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6] dark:hover:bg-[#222D28]"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-[#5C6762] dark:text-[#A3B0AA]" />
            <span>{sortOrder === 'desc' ? 'Più recenti prima' : 'Ordine cronologico'}</span>
          </button>

          <button
            type="button"
            disabled={totalDreamsCount === 0}
            onClick={onPrintDreams}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1F6E5C] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#185849] disabled:opacity-45"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Stampa tutti i sogni</span>
          </button>
        </div>
      </div>

      {totalDreamsCount > 0 && (
        <div className="mt-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-3.5 w-3.5 text-[#8A948E]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca per parola o data (es. 2026-11)..."
              aria-label="Cerca nei diari dei sogni"
              className="w-full rounded-lg border border-[#D7DBD2] bg-[#FAFBF8] py-2 pr-3 pl-8 text-xs text-[#182420] placeholder:text-[#8A948E] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
            />
          </div>
        </div>
      )}

      {dreamInsightError && (
        <p className="mt-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]">
          {dreamInsightError}
        </p>
      )}

      {totalDreamsCount === 0 ? (
        <div className="mt-4 rounded-xl border border-[#E4E6E0] bg-[#FAFBF8] p-4 text-xs leading-relaxed text-[#5C6762] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#A3B0AA]">
          Nessun sogno registrato finora. Scrivi nel riquadro “Diario dei Sogni” qui sopra nella sezione Buongiorno per creare il tuo archivio stampabile.
        </div>
      ) : dreamEntries.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[#E4E6E0] bg-[#FAFBF8] p-4 text-xs text-[#5C6762] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#A3B0AA]">
          Nessun sogno corrisponde alla ricerca “{searchQuery}”.
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
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                      {entry.date}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                      {typeof entry.sleepHours === 'number' ? `Sonno ${entry.sleepHours}h` : 'Sonno n.d.'}
                      {typeof entry.sleepQuality === 'number' ? ` · Riposo ${entry.sleepQuality}/5` : ''}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#182420] dark:text-[#EAECE6]">
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
  );
}

interface DreamPrintSheetProps {
  profileName: string;
  checkins: DailyCheckin[];
  dreamInsights: Record<string, string>;
}

export function DreamPrintSheet({
  profileName,
  checkins,
  dreamInsights,
}: DreamPrintSheetProps) {
  const entries = useMemo(
    () =>
      [...checkins]
        .filter((c) => Boolean(c.dreamJournal?.trim()))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [checkins]
  );

  const printDate = new Date().toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div id="dream-print-sheet" className="mx-auto max-w-3xl bg-white p-8 text-[#111827]">
      <header className="border-b border-[#D1D5DB] pb-4" style={{ display: 'block' }}>
        <h1 className="font-editorial text-2xl font-semibold text-[#111827]">
          Diario dei Sogni — {profileName}
        </h1>
        <p className="mt-1 text-xs text-[#4B5563]">
          Raccolta cronologica ({entries.length} {entries.length === 1 ? 'voce' : 'voci'}) · Stampato il {printDate}
        </p>
      </header>

      <div className="mt-6 space-y-4">
        {entries.map((entry) => {
          const insight = dreamInsights[entry.id];
          return (
            <article
              key={entry.id}
              className="print-card rounded-lg border border-[#D1D5DB] p-4"
            >
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2 text-xs">
                <strong className="font-mono text-sm tabular-nums text-[#111827]">
                  {entry.date}
                </strong>
                <span className="font-mono tabular-nums text-[#4B5563]">
                  {typeof entry.sleepHours === 'number' ? `Sonno: ${entry.sleepHours}h` : 'Sonno: n.d.'}
                  {typeof entry.sleepQuality === 'number' ? ` · Riposo: ${entry.sleepQuality}/5` : ''}
                </span>
              </div>
              <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-[#1F2937]">
                {entry.dreamJournal}
              </p>
              {insight && (
                <div className="mt-3 rounded border border-[#E5E7EB] bg-[#F9FAFB] p-2.5 text-xs text-[#374151]">
                  <strong>Spunto PNL di Lucilla:</strong> {insight}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
