import React, { useEffect, useState } from 'react';
import { X, Save, RotateCcw, Moon, Sun, Clock, AlertTriangle } from 'lucide-react';
import { UserProfile } from '../types/coach.ts';
import { calculateBmi } from '../utils/bariclipRules.ts';

export type ThemePreference = 'light' | 'dark' | 'auto_evening';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  weighInDayOfWeek: string;
  themePreference: ThemePreference;
  onChangeThemePreference: (pref: ThemePreference) => void;
  onSaveProfile: (updatedProfile: UserProfile, updatedWeighInDay: string) => Promise<void>;
  onResetDemoData: (keepBaselineMeasurement: boolean) => Promise<void>;
}

const WEEKDAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

export function ProfileSettingsModal({
  isOpen,
  onClose,
  profile,
  weighInDayOfWeek,
  themePreference,
  onChangeThemePreference,
  onSaveProfile,
  onResetDemoData,
}: ProfileSettingsModalProps) {
  const [positiveGoal, setPositiveGoal] = useState(profile.positiveGoal);
  const [weighDay, setWeighDay] = useState(weighInDayOfWeek);
  const [heightCm, setHeightCm] = useState(profile.heightCm);
  const [baselineWeightKg, setBaselineWeightKg] = useState(profile.baselineWeightKg);
  const [umbilical, setUmbilical] = useState(profile.baselineMeasuresCm.umbilical);
  const [hips, setHips] = useState(profile.baselineMeasuresCm.hips);
  const [chest, setChest] = useState(profile.baselineMeasuresCm.chest);
  const [clinicianName, setClinicianName] = useState(profile.clinicianName);
  const [clinicianPhone, setClinicianPhone] = useState(profile.clinicianPhone);
  const [clinicianEmail, setClinicianEmail] = useState(profile.clinicianEmail);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Two-step Reset Demo Data state
  const [showResetBox, setShowResetBox] = useState(false);
  const [keepBaseline, setKeepBaseline] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPositiveGoal(profile.positiveGoal);
      setWeighDay(weighInDayOfWeek);
      setHeightCm(profile.heightCm);
      setBaselineWeightKg(profile.baselineWeightKg);
      setUmbilical(profile.baselineMeasuresCm.umbilical);
      setHips(profile.baselineMeasuresCm.hips);
      setChest(profile.baselineMeasuresCm.chest);
      setClinicianName(profile.clinicianName);
      setClinicianPhone(profile.clinicianPhone);
      setClinicianEmail(profile.clinicianEmail);
      setShowResetBox(false);
      setSavedMsg(null);
    }
  }, [isOpen, profile, weighInDayOfWeek]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updatedProfile: UserProfile = {
        ...profile,
        heightCm,
        baselineWeightKg,
        baselineBmi: calculateBmi(baselineWeightKg, heightCm),
        baselineMeasuresCm: {
          umbilical,
          hips,
          chest,
        },
        positiveGoal: positiveGoal.trim() || profile.positiveGoal,
        clinicianName: clinicianName.trim() || profile.clinicianName,
        clinicianPhone: clinicianPhone.trim() || profile.clinicianPhone,
        clinicianEmail: clinicianEmail.trim() || profile.clinicianEmail,
      };
      await onSaveProfile(updatedProfile, weighDay);
      setSavedMsg('Profilo clinico e preferenze salvati su cloud.');
      setTimeout(() => setSavedMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmReset() {
    setResetting(true);
    try {
      await onResetDemoData(keepBaseline);
      setShowResetBox(false);
      onClose();
    } finally {
      setResetting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#182420]/50 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E4E6E0] bg-white shadow-xl dark:border-[#2B3732] dark:bg-[#1B231F]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E4E6E0] px-6 py-4 dark:border-[#2B3732]">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-[#1F6E5C] dark:text-[#36A68C]">
              Profilo &amp; Preferenze
            </p>
            <h2
              id="profile-modal-title"
              className="font-editorial text-xl font-medium text-[#182420] dark:text-[#EAECE6]"
            >
              Percorso di {profile.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi impostazioni profilo"
            className="rounded-lg p-1.5 text-[#5C6762] hover:bg-[#F3F4F0] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:bg-[#24302A] dark:hover:text-[#EAECE6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Theme Preference */}
          <section className="rounded-xl border border-[#E4E6E0] bg-[#F8F9F6] p-4 dark:border-[#2B3732] dark:bg-[#161D1A]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#1F6E5C] dark:text-[#36A68C]">
              Comfort Visivo (Modalità Sera Soft)
            </h3>
            <p className="mt-1 text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              Tonalità calda a basso riverbero pensata per l’uso serale e prima del riposo.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { id: 'light' as const, label: 'Giorno', icon: Sun },
                { id: 'dark' as const, label: 'Sera Soft', icon: Moon },
                { id: 'auto_evening' as const, label: 'Auto (≥20:30)', icon: Clock },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = themePreference === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeThemePreference(opt.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                        : 'border-[#E4E6E0] bg-white text-[#5C6762] hover:text-[#182420] dark:border-[#2B3732] dark:bg-[#1B231F] dark:text-[#A3B0AA]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Editable Clinical Profile Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {savedMsg && (
              <div className="rounded-lg border border-[#C6D5CE] bg-[#EDF3F0] px-3.5 py-2.5 text-xs font-medium text-[#182420] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#EAECE6]">
                {savedMsg}
              </div>
            )}

            <div>
              <label
                htmlFor="prof-goal"
                className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
              >
                Obiettivo formulato in positivo (PNL)
              </label>
              <textarea
                id="prof-goal"
                rows={2}
                value={positiveGoal}
                onChange={(e) => setPositiveGoal(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-sm text-[#182420] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="prof-weigh-day"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Giorno fisso pesata
                </label>
                <select
                  id="prof-weigh-day"
                  value={weighDay}
                  onChange={(e) => setWeighDay(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="prof-height"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Altezza (cm)
                </label>
                <input
                  id="prof-height"
                  type="number"
                  min={120}
                  max={230}
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-xs tabular-nums text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label
                  htmlFor="prof-base-w"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Peso baseline (kg)
                </label>
                <input
                  id="prof-base-w"
                  type="number"
                  step="0.1"
                  value={baselineWeightKg}
                  onChange={(e) => setBaselineWeightKg(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-xs tabular-nums text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="prof-umb"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Ombelico baseline (cm)
                </label>
                <input
                  id="prof-umb"
                  type="number"
                  step="0.5"
                  value={umbilical}
                  onChange={(e) => setUmbilical(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-xs tabular-nums text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label
                  htmlFor="prof-hips"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Fianchi baseline (cm)
                </label>
                <input
                  id="prof-hips"
                  type="number"
                  step="0.5"
                  value={hips}
                  onChange={(e) => setHips(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-xs tabular-nums text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label
                  htmlFor="prof-chest"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Torace baseline (cm)
                </label>
                <input
                  id="prof-chest"
                  type="number"
                  step="0.5"
                  value={chest}
                  onChange={(e) => setChest(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-xs tabular-nums text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="prof-clin-name"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Clinico di riferimento
                </label>
                <input
                  id="prof-clin-name"
                  type="text"
                  value={clinicianName}
                  onChange={(e) => setClinicianName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label
                  htmlFor="prof-clin-phone"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Telefono clinico
                </label>
                <input
                  id="prof-clin-phone"
                  type="text"
                  value={clinicianPhone}
                  onChange={(e) => setClinicianPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <label
                  htmlFor="prof-clin-email"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Email clinico
                </label>
                <input
                  id="prof-clin-email"
                  type="email"
                  value={clinicianEmail}
                  onChange={(e) => setClinicianEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185849] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvataggio...' : 'Salva Profilo'}</span>
              </button>
            </div>
          </form>

          {/* Clean Start / Reset Demo Data */}
          <section className="border-t border-[#E4E6E0] pt-5 dark:border-[#2B3732]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[#182420] dark:text-[#EAECE6]">
                  Inizia dal tuo percorso reale (Azzera dati demo)
                </h3>
                <p className="text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                  Svuota pasti, prove SOS, pesate e messaggi demo mantenendo il tuo profilo clinico.
                </p>
              </div>
              {!showResetBox && (
                <button
                  type="button"
                  onClick={() => setShowResetBox(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-white px-3 py-1.5 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Azzera dati demo...</span>
                </button>
              )}
            </div>

            {showResetBox && (
              <div className="mt-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-xs text-[#7F1D1D] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FECACA]">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Conferma azzeramento dati demo</span>
                </div>
                <p className="mt-1 leading-relaxed">
                  Verranno eliminati tutti i pasti, episodi SOS, check-in, pesate e chat attuali dal cloud, azzerando XP a 0. Il tuo profilo clinico resterà intatto.
                </p>
                <label className="mt-2.5 flex cursor-pointer items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={keepBaseline}
                    onChange={(e) => setKeepBaseline(e.target.checked)}
                    className="h-4 w-4 accent-[#B91C1C]"
                  />
                  <span>
                    Conserva la tua misurazione baseline iniziale ({baselineWeightKg} kg · {umbilical}/{hips}/{chest} cm)
                  </span>
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowResetBox(false)}
                    className="rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 font-medium text-[#182420] dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={handleConfirmReset}
                    className="rounded-lg bg-[#B91C1C] px-3.5 py-1.5 font-semibold text-white hover:bg-[#991B1B] disabled:opacity-50"
                  >
                    {resetting ? 'Azzeramento...' : 'Sì, inizia dal mio percorso reale'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
