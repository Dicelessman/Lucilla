import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Utensils,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Search,
  Info,
  Camera,
  Pencil,
  Trash2,
  CalendarPlus,
  ShoppingBasket,
  Copy,
  Check,
  X,
  Sparkles,
  Music,
  Pause,
} from 'lucide-react';
import { EditorialImage } from './EditorialImage.tsx';
import mediterraneanBowlImg from '../assets/images/bariclip_mediterranean_bowl_1794581848948.jpg';
import {
  MealEntry,
  MealSlot,
  ProteinCategory,
  QuickMealIdea,
  UserProfile,
} from '../types/coach.ts';
import {
  calculateWeeklyProteinCounts,
  MealValidationResult,
  validateMealAgainstPlan,
} from '../utils/bariclipRules.ts';
import {
  filterMealsByPeriodAndQuery,
  generateWeeklyMealPlan,
  MealPeriodFilter,
} from '../utils/insightsAndPlanner.ts';

interface FoodDiaryViewProps {
  meals: MealEntry[];
  profile: UserProfile;
  onAddMeal: (meal: MealEntry) => void;
  onUpdateMeal: (meal: MealEntry) => void;
  onDeleteMeal: (mealId: string) => void;
  getIdToken: () => Promise<string | null>;
  slowMusicPlaying?: boolean;
  onToggleSlowMusic?: () => void;
}

const PROTEIN_OPTIONS: Array<{ value: ProteinCategory; label: string }> = [
  { value: 'carne_bianca', label: 'Carne bianca (180g)' },
  { value: 'carne_rossa', label: 'Carne rossa magra (120g)' },
  { value: 'pesce', label: 'Pesce fresco/surgelato (220g)' },
  { value: 'tonno_salmone', label: 'Tonno nat. (120g) / Salmone aff. (80g)' },
  { value: 'uova', label: 'Uova (2–3)' },
  { value: 'formaggio', label: 'Formaggio light / Ricotta (100g)' },
  { value: 'legumi', label: 'Legumi cotti (200g)' },
  { value: 'tofu_seitan', label: 'Tofu / Tempeh / Seitan (150g)' },
  { value: 'affettato', label: 'Affettato magro (50g)' },
  { value: 'primo', label: 'Primo piatto (80g pasta/riso + cond.)' },
  { value: 'pasto_libero', label: 'Pasto libero domenicale (1/2 pizza + farinata)' },
  { value: 'nessuno', label: 'Colazione / Spuntino / Solo verdure' },
];

const SYMPTOM_OPTIONS = ['vomito', 'rigurgito', 'bruciore', 'difficoltà a mandar giù'];

const SLOT_LABELS: Record<MealSlot, string> = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  spuntino_1730: 'Spuntino 17:30',
  cena: 'Cena',
};

async function compressImageToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Impossibile leggere il file immagine.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Formato immagine non supportato.'));
    el.src = dataUrl;
  });

  const maxSide = 1024;
  let { width, height } = img;
  if (width > maxSide || height > maxSide) {
    const ratio = Math.min(maxSide / width, maxSide / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { base64: dataUrl, mimeType: file.type || 'image/jpeg' };
  }
  ctx.drawImage(img, 0, 0, width, height);
  const jpegUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { base64: jpegUrl, mimeType: 'image/jpeg' };
}

export function FoodDiaryView({
  meals,
  profile,
  onAddMeal,
  onUpdateMeal,
  onDeleteMeal,
  getIdToken,
  slowMusicPlaying = false,
  onToggleSlowMusic,
}: FoodDiaryViewProps) {
  const today = new Date().toISOString().slice(0, 10);
  const formRef = useRef<HTMLElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState<string>('12:30');
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<MealSlot>('pranzo');
  const [description, setDescription] = useState('');
  const [proteinCategory, setProteinCategory] = useState<ProteinCategory>('carne_bianca');
  const [hasVegetables, setHasVegetables] = useState(true);
  const [preHunger, setPreHunger] = useState(8);
  const [postSatiety, setPostSatiety] = useState(5);
  const [energy, setEnergy] = useState(4);
  const [slowEatingUsed, setSlowEatingUsed] = useState(true);
  const [slowMotionDone, setSlowMotionDone] = useState(false);
  const [leftABite, setLeftABite] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  // Multimodal photo analysis state
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoAdvice, setPhotoAdvice] = useState<{
    avoidItemsWarning: string;
    bariclipPortionNote: string;
  } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // 30s Slow Motion countdown
  const [slowCountdown, setSlowCountdown] = useState<number | null>(null);

  // Validation feedback after save
  const [lastValidation, setLastValidation] = useState<MealValidationResult | null>(null);
  const [lastSavedMode, setLastSavedMode] = useState<'added' | 'updated'>('added');

  // History filter & delete confirm
  const [searchQuery, setSearchQuery] = useState('');
  const [slotFilter, setSlotFilter] = useState<MealSlot | 'tutti'>('tutti');
  const [periodFilter, setPeriodFilter] = useState<MealPeriodFilter>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [guideTab, setGuideTab] = useState<'colazione' | 'spuntino' | 'pasti' | 'domenica'>('pasti');

  // Shopping list checkboxes & copy
  const [checkedShopIds, setCheckedShopIds] = useState<Record<string, boolean>>({});
  const [copiedShop, setCopiedShop] = useState(false);

  // Quick meal ideas generator (AI / rules)
  const [pantryNote, setPantryNote] = useState('');
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [quickIdeas, setQuickIdeas] = useState<QuickMealIdea[]>([]);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  useEffect(() => {
    if (slowCountdown === null) return;
    if (slowCountdown <= 0) {
      setSlowMotionDone(true);
      setSlowCountdown(null);
      return;
    }
    const id = setTimeout(() => setSlowCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [slowCountdown]);

  const weeklyCounts = useMemo(() => calculateWeeklyProteinCounts(meals, today), [meals, today]);
  const weeklyPlan = useMemo(() => generateWeeklyMealPlan(meals, today), [meals, today]);

  function toggleSymptom(sym: string) {
    setSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  }

  function resetFormToDefault() {
    setEditingMealId(null);
    setDate(today);
    setSlot('pranzo');
    setDescription('');
    setProteinCategory('carne_bianca');
    setHasVegetables(true);
    setPreHunger(8);
    setPostSatiety(5);
    setEnergy(4);
    setSlowEatingUsed(true);
    setSlowMotionDone(false);
    setLeftABite(false);
    setSymptoms([]);
    setNotes('');
    setPhotoPreview(null);
    setPhotoAdvice(null);
    setPhotoError(null);
  }

  function startEditMeal(m: MealEntry) {
    setEditingMealId(m.id);
    setEditingTime(m.time);
    setDate(m.date);
    setSlot(m.slot);
    setDescription(m.description);
    setProteinCategory(m.proteinCategory);
    setHasVegetables(m.hasVegetables);
    setPreHunger(m.preHungerScale);
    setPostSatiety(m.postSatietyScale);
    setEnergy(m.perceivedEnergy);
    setSlowEatingUsed(m.slowEatingUsed);
    setSlowMotionDone(m.slowMotionSecondsUsed);
    setLeftABite(m.leftABite);
    setSymptoms(m.symptomsReported ?? []);
    setNotes(m.notes ?? '');
    setLastValidation(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoError(null);
    setPhotoAdvice(null);
    setAnalyzingPhoto(true);
    try {
      const { base64, mimeType } = await compressImageToBase64(file);
      setPhotoPreview(base64);

      const token = await getIdToken();
      if (!token) {
        throw new Error('Sessione non valida. Ricarica o accedi di nuovo.');
      }

      const res = await fetch('/api/analyze-meal-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Impossibile analizzare la foto.');
      }

      setDescription(data.description || '');
      if (data.proteinCategory) {
        setProteinCategory(data.proteinCategory as ProteinCategory);
      }
      setHasVegetables(Boolean(data.hasVegetables));
      if (data.avoidItemsWarning || data.bariclipPortionNote) {
        setPhotoAdvice({
          avoidItemsWarning: data.avoidItemsWarning || '',
          bariclipPortionNote: data.bariclipPortionNote || '',
        });
      }
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Analisi foto momentaneamente non disponibile.'
      );
    } finally {
      setAnalyzingPhoto(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;

    const nowTime =
      editingMealId !== null
        ? editingTime
        : new Date().toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
          });

    const candidate: Omit<MealEntry, 'id'> = {
      date,
      time: nowTime,
      slot,
      description: description.trim(),
      proteinCategory,
      hasVegetables,
      preHungerScale: preHunger,
      postSatietyScale: postSatiety,
      perceivedEnergy: energy,
      slowEatingUsed,
      slowMotionSecondsUsed: slowMotionDone,
      leftABite,
      symptomsReported: symptoms,
      notes: notes.trim() || undefined,
    };

    const otherMeals = editingMealId ? meals.filter((m) => m.id !== editingMealId) : meals;
    const validation = validateMealAgainstPlan(candidate, otherMeals);
    setLastValidation(validation);

    if (editingMealId) {
      setLastSavedMode('updated');
      onUpdateMeal({
        id: editingMealId,
        ...candidate,
      });
    } else {
      setLastSavedMode('added');
      onAddMeal({
        id: `meal_${Date.now()}`,
        ...candidate,
      });
    }

    resetFormToDefault();
  }

  function handleCopyShoppingList() {
    const lines = weeklyPlan.shoppingList.map(
      (item) => `${checkedShopIds[item.id] ? '[x]' : '[ ]'} ${item.name} — ${item.quantityNote}`
    );
    navigator.clipboard.writeText(
      `Lista Spesa Settimanale (Davide)\n\n${lines.join('\n')}`
    );
    setCopiedShop(true);
    setTimeout(() => setCopiedShop(false), 2500);
  }

  async function handleGenerateQuickIdeas() {
    setIdeasError(null);
    setLoadingIdeas(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Accesso richiesto per generare le ricette lampo.');
      const res = await fetch('/api/meal-ideas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pantryNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Impossibile generare idee ricette.');
      }
      setQuickIdeas(Array.isArray(data.ideas) ? data.ideas : []);
    } catch (err) {
      setIdeasError(
        err instanceof Error ? err.message : 'Errore nella generazione ricette lampo.'
      );
    } finally {
      setLoadingIdeas(false);
    }
  }

  const filteredMeals = useMemo(
    () =>
      filterMealsByPeriodAndQuery(
        meals,
        today,
        periodFilter,
        slotFilter === 'tutti' ? 'all' : slotFilter,
        searchQuery
      ),
    [meals, today, periodFilter, slotFilter, searchQuery]
  );

  const filteredSlowPct = useMemo(() => {
    if (filteredMeals.length === 0) return 0;
    const slow = filteredMeals.filter((m) => m.slowEatingUsed).length;
    return Math.round((slow / filteredMeals.length) * 100);
  }, [filteredMeals]);

  return (
    <div className="space-y-6">
      {/* Top Grid: Conscious Meal Logger + Weekly Protein Frequency Tracker */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Meal Logger */}
        <section
          ref={formRef}
          aria-label="Diario Alimentare Consapevole"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-7 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
            <div>
              <h1 className="font-editorial text-xl font-medium text-[#182420] dark:text-[#EAECE6]">
                {editingMealId
                  ? 'Modifica Pasto Registrato'
                  : 'Diario Alimentare & Slow Eating'}
              </h1>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Scala sazietà 10→0 · Avvia a 8–9 · Fermati sereno a 5–6
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoSelected}
              />
              <button
                type="button"
                disabled={analyzingPhoto}
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] disabled:opacity-60 dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6] dark:hover:bg-[#222D28]"
              >
                <Camera className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>{analyzingPhoto ? 'Analisi piatto...' : 'Foto Piatto AI'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSlowCountdown(30)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1F6E5C] bg-[#EDF3F0] px-3 py-1.5 text-xs font-medium text-[#182420] hover:bg-[#DFECE6] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]"
              >
                <Clock className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>
                  {slowCountdown !== null
                    ? `Slow Motion: ${slowCountdown}s`
                    : slowMotionDone
                    ? 'Slow Motion (30s)'
                    : 'Slow Motion 30s'}
                </span>
              </button>

              {onToggleSlowMusic && (
                <button
                  type="button"
                  onClick={onToggleSlowMusic}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    slowMusicPlaying
                      ? 'border-[#1F6E5C] bg-[#1F6E5C] text-white'
                      : 'border-[#D7DBD2] bg-white text-[#5C6762] hover:text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                  }`}
                >
                  {slowMusicPlaying ? <Pause className="h-3.5 w-3.5" /> : <Music className="h-3.5 w-3.5" />}
                  <span>{slowMusicPlaying ? 'Pausa musica' : 'Musica Slow'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Photo Analysis Preview / Advice */}
          {(photoPreview || photoAdvice || photoError) && (
            <div className="mt-4 space-y-2">
              {photoError && (
                <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]">
                  {photoError}
                </div>
              )}
              {(photoPreview || photoAdvice) && (
                <div className="flex flex-col gap-3 rounded-xl border border-[#C6D5CE] bg-[#EDF3F0] p-3.5 sm:flex-row sm:items-start dark:border-[#2F4E42] dark:bg-[#1F332C]">
                  {photoPreview && (
                    <img
                      src={photoPreview}
                      alt="Anteprima piatto analizzato"
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1 text-xs text-[#182420] dark:text-[#EAECE6]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#1F6E5C] dark:text-[#36A68C]">
                        <Sparkles className="h-3.5 w-3.5" />
                        Riconoscimento Piatto completato
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoPreview(null);
                          setPhotoAdvice(null);
                        }}
                        className="text-[11px] text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA]"
                      >
                        Nascondi
                      </button>
                    </div>
                    {analyzingPhoto ? (
                      <p className="mt-1 text-[#5C6762] dark:text-[#A3B0AA]">
                        Lucilla sta leggendo ingredienti e porzioni...
                      </p>
                    ) : (
                      <>
                        {photoAdvice?.bariclipPortionNote && (
                          <p className="mt-1 leading-relaxed">{photoAdvice.bariclipPortionNote}</p>
                        )}
                        {photoAdvice?.avoidItemsWarning && (
                          <p className="mt-1 font-medium text-[#92400E] dark:text-[#FCD34D]">
                            Nota piano: {photoAdvice.avoidItemsWarning}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {lastValidation && (
            <div className="mt-4 space-y-2">
              {lastValidation.redFlagSymptoms.length > 0 && (
                <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs text-[#7F1D1D] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FECACA]">
                  <div className="flex items-center gap-1.5 font-semibold text-[#B91C1C] dark:text-[#FCA5A5]">
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                      Segnale fisico rilevato ({lastValidation.redFlagSymptoms.join(', ')})
                    </span>
                  </div>
                  <p className="mt-1">
                    Riduci i volumi dei bocconi, mastica molto lentamente appoggiando la forchetta tra un boccone e l’altro e contatta {profile.clinicianName} ({profile.clinicianPhone} · {profile.clinicianEmail}).
                  </p>
                </div>
              )}

              {lastValidation.duplicateCategoryWarning && (
                <div className="rounded-lg border border-[#F3D09B] bg-[#FFFBEB] p-3 text-xs text-[#92400E] dark:border-[#78350F] dark:bg-[#292011] dark:text-[#FDE68A]">
                  {lastValidation.duplicateCategoryWarning}
                </div>
              )}

              {lastValidation.sundayPrimoWarning && (
                <div className="rounded-lg border border-[#F3D09B] bg-[#FFFBEB] p-3 text-xs text-[#92400E] dark:border-[#78350F] dark:bg-[#292011] dark:text-[#FDE68A]">
                  {lastValidation.sundayPrimoWarning}
                </div>
              )}

              {lastValidation.avoidItemsDetected.length > 0 && (
                <div className="rounded-lg border border-[#F3D09B] bg-[#FFFBEB] p-3 text-xs text-[#92400E] dark:border-[#78350F] dark:bg-[#292011] dark:text-[#FDE68A]">
                  Nota informativa dal piano: hai annotato {lastValidation.avoidItemsDetected.join(', ')}. Nessun giudizio — al prossimo pasto puoi scegliere acqua, verdure e proteine leggere.
                </div>
              )}

              <div className="flex items-center gap-2 rounded-lg border border-[#C6D5CE] bg-[#EDF3F0] p-3 text-xs text-[#182420] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#EAECE6]">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>
                  {lastSavedMode === 'updated' ? 'Pasto aggiornato!' : 'Pasto registrato!'}{' '}
                  {lastValidation.satietyFeedback}
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="meal-date"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Data
                </label>
                <input
                  id="meal-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 font-mono text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  Momento del pasto
                </span>
                <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {(Object.keys(SLOT_LABELS) as MealSlot[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSlot(s)}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium ${
                        slot === s
                          ? 'border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                          : 'border-[#E4E6E0] text-[#5C6762] dark:border-[#2B3732] dark:text-[#A3B0AA]'
                      }`}
                    >
                      {SLOT_LABELS[s].split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="meal-protein"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Categoria Piano Bardho
                </label>
                <select
                  id="meal-protein"
                  value={proteinCategory}
                  onChange={(e) => setProteinCategory(e.target.value as ProteinCategory)}
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                >
                  {PROTEIN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="meal-desc"
                  className="block text-xs font-medium text-[#182420] dark:text-[#EAECE6]"
                >
                  Cosa hai scelto nel piatto?
                </label>
                <input
                  id="meal-desc"
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Es. Orata 220g con finocchi e 1 cucchiaio olio EVO"
                  className="mt-1 w-full rounded-lg border border-[#D7DBD2] bg-white px-3 py-2 text-sm text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                />
              </div>
            </div>

            {/* Satiety Scale 10 -> 0 */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E4E6E0] bg-[#F8F9F6] p-3.5 sm:grid-cols-3 dark:border-[#2B3732] dark:bg-[#161D1A]">
              <div>
                <div className="flex justify-between text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  <label htmlFor="pre-hunger">Fame pre-pasto</label>
                  <span className="font-mono tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                    {preHunger}/10
                  </span>
                </div>
                <input
                  id="pre-hunger"
                  type="range"
                  min="0"
                  max="10"
                  value={preHunger}
                  onChange={(e) => setPreHunger(Number(e.target.value))}
                  className="mt-2 w-full accent-[#1F6E5C]"
                />
                <p className="mt-1 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                  10 = sto svenendo · Target 8–9
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  <label htmlFor="post-satiety">Sazietà fine pasto</label>
                  <span className="font-mono tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                    {postSatiety}/10
                  </span>
                </div>
                <input
                  id="post-satiety"
                  type="range"
                  min="0"
                  max="10"
                  value={postSatiety}
                  onChange={(e) => setPostSatiety(Number(e.target.value))}
                  className="mt-2 w-full accent-[#1F6E5C]"
                />
                <p className="mt-1 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                  0 = scoppiando · Target 5–6
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
                  <label htmlFor="energy-level">Energia percepita</label>
                  <span className="font-mono tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                    {energy}/5
                  </span>
                </div>
                <input
                  id="energy-level"
                  type="range"
                  min="1"
                  max="5"
                  value={energy}
                  onChange={(e) => setEnergy(Number(e.target.value))}
                  className="mt-2 w-full accent-[#1F6E5C]"
                />
                <p className="mt-1 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                  Leggerezza post-pasto
                </p>
              </div>
            </div>

            {/* Slow Eating Checklist */}
            <div className="flex flex-wrap gap-4 text-xs text-[#182420] dark:text-[#EAECE6]">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={hasVegetables}
                  onChange={(e) => setHasVegetables(e.target.checked)}
                  className="h-4 w-4 accent-[#1F6E5C]"
                />
                <span>Verdure incluse + 1 cucchiaio olio EVO</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={slowEatingUsed}
                  onChange={(e) => setSlowEatingUsed(e.target.checked)}
                  className="h-4 w-4 accent-[#1F6E5C]"
                />
                <span>Forchetta posata, annuso, mastico lento</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={leftABite}
                  onChange={(e) => setLeftABite(e.target.checked)}
                  className="h-4 w-4 accent-[#1F6E5C]"
                />
                <span>Ho lasciato un piccolo boccone (sazietà 5–6)</span>
              </label>
            </div>

            {/* Red Flag Physical Symptoms Check */}
            <div>
              <span className="block text-xs font-medium text-[#5C6762] dark:text-[#A3B0AA]">
                Eventuali segnali fisici post-pasto (opzionale):
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {SYMPTOM_OPTIONS.map((sym) => {
                  const selected = symptoms.includes(sym);
                  const label = sym.charAt(0).toUpperCase() + sym.slice(1);
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => toggleSymptom(sym)}
                      className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                        selected
                          ? 'border-[#B91C1C] bg-[#FEF2F2] font-medium text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]'
                          : 'border-[#E4E6E0] text-[#5C6762] hover:text-[#182420] dark:border-[#2B3732] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingMealId && (
                <button
                  type="button"
                  onClick={resetFormToDefault}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D7DBD2] bg-white px-3.5 py-2 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Annulla modifica</span>
                </button>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-[#1F6E5C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185849]"
              >
                <Utensils className="h-3.5 w-3.5" />
                <span>{editingMealId ? 'Salva Modifiche Pasto' : 'Registra Pasto nel Diario'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Right: Weekly Protein Frequencies & Bardho Plan Reference */}
        <div className="space-y-6 lg:col-span-5">
          <div className="overflow-hidden rounded-xl border border-[#E4E6E0] bg-white dark:border-[#2B3732] dark:bg-[#1B231F]">
            <EditorialImage
              src={mediterraneanBowlImg}
              alt="Piatto mediterraneo equilibrato con pesce, verdure e olio extravergine"
              caption="Piatto equilibrato · 1 proteina, verdure e olio EVO"
              className="h-36 w-full"
            />
          </div>

          <section
            aria-label="Frequenze settimanali piano nutrizionale"
            className="rounded-xl border border-[#E4E6E0] bg-white p-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
          >
            <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
              Frequenze Settimanali (Piano Bardho)
            </h2>
            <p className="mt-0.5 text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              Varietà proteica settimanale · Senza ripetere uova, formaggi, affettati, legumi o tofu nello stesso giorno.
            </p>

            <div className="mt-4 divide-y divide-[#ECEEE8] dark:divide-[#27322D]">
              {weeklyCounts.map((item) => {
                const pct = Math.min(100, Math.round((item.current / item.target) * 100));
                return (
                  <div key={item.category} className="py-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#182420] dark:text-[#EAECE6]">
                        {item.label}{' '}
                        <span className="font-normal text-[#5C6762] dark:text-[#A3B0AA]">
                          ({item.portionGuide})
                        </span>
                      </span>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          item.status === 'ok'
                            ? 'text-[#1F6E5C] dark:text-[#36A68C]'
                            : item.status === 'over'
                            ? 'text-[#B45309] dark:text-[#FBBF24]'
                            : 'text-[#182420] dark:text-[#EAECE6]'
                        }`}
                      >
                        {item.current}/{item.target}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#ECEEE8] dark:bg-[#26312C]">
                      <div
                        className={`h-full transition-all ${
                          item.status === 'over' ? 'bg-[#B45309]' : 'bg-[#1F6E5C]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Reference Guide */}
          <section
            aria-label="Guida rapida opzioni piano"
            className="rounded-xl border border-[#E4E6E0] bg-white p-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#182420] dark:text-[#EAECE6]">
                <Info className="h-4 w-4 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>Opzioni Piano Alimentare</span>
              </h3>
              <div className="flex gap-1">
                {[
                  { id: 'colazione' as const, label: 'Colazione' },
                  { id: 'spuntino' as const, label: '17:30' },
                  { id: 'pasti' as const, label: 'Pranzo/Cena' },
                  { id: 'domenica' as const, label: 'Dom.' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setGuideTab(t.id)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                      guideTab === t.id
                        ? 'bg-[#EDF3F0] text-[#182420] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                        : 'text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 text-xs leading-relaxed text-[#5C6762] dark:text-[#A3B0AA]">
              {guideTab === 'colazione' && (
                <ul className="list-disc space-y-1 pl-4">
                  <li>Abituale, oppure: 2 uova all’occhio di bue + 2–3 fette Wasa integrali</li>
                  <li>Pane integrale 40g + affettato magro 50g oppure ricotta/spalmabile light 80g</li>
                  <li>2–3 biscotti d’avena s/z + latte scremato 200ml o yogurt greco 0% 125g con semi e 100g frutta</li>
                </ul>
              )}
              {guideTab === 'spuntino' && (
                <ul className="list-disc space-y-1 pl-4">
                  <li>Paracadute ore 17:30 per proteggere la fascia 18:00–20:00:</li>
                  <li>30g grana/parmigiano · 40g bresaola/crudo sgrassato · 1 uovo sodo · 1 Wasa + 30g formaggio light o 60g ricotta · 150g frutta fresca · 10–15g mandorle/noci.</li>
                </ul>
              )}
              {guideTab === 'pasti' && (
                <ul className="list-disc space-y-1 pl-4">
                  <li>1 Secondo dalle frequenze + Verdure a volontà + 1 cucchiaio olio EVO.</li>
                  <li>1x/sett Primo piatto (80g pasta/riso crudo + verdure + 1 cucchiaio olio + 60g tonno nat. o 100g legumi), lontano dalla domenica sera.</li>
                </ul>
              )}
              {guideTab === 'domenica' && (
                <ul className="list-disc space-y-1 pl-4">
                  <li>Domenica pranzo: solo secondo + verdure (niente pasta o riso).</li>
                  <li>Domenica sera (pasto libero): piatto di verdure prima + mezza pizza + 1–2 fette di farinata.</li>
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Weekly Meal Planner & Smart Shopping List */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-label="Piano settimanale automatico dalle frequenze mancanti"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-7 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex items-center gap-2 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
            <CalendarPlus className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
            <div>
              <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                Piano Pasti dalle Frequenze Rimanenti
              </h2>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Suggerimenti pratici fino a domenica senza ripetizioni nello stesso giorno e con il primo piatto lontano dalla domenica sera.
              </p>
            </div>
          </div>

          {weeklyPlan.suggestions.length === 0 ? (
            <p className="mt-4 text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              Tutte le frequenze proteiche di questa settimana risultano già coperte! Puoi variare liberamente tra pesce fresco, carne bianca e verdure.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#ECEEE8] dark:divide-[#27322D]">
              {weeklyPlan.suggestions.map((sug) => (
                <div
                  key={`${sug.date}_${sug.slot}`}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#1F6E5C] dark:text-[#36A68C]">
                        {sug.dayLabel} · {sug.slot === 'pranzo' ? 'Pranzo' : 'Cena'}
                      </span>
                      <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                        {sug.title} ({sug.portionGuide})
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#5C6762] dark:text-[#A3B0AA]">{sug.idea}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDate(sug.date);
                      setSlot(sug.slot);
                      setProteinCategory(sug.proteinCategory);
                      setDescription(sug.idea);
                      setHasVegetables(true);
                      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="shrink-0 self-start rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1 text-[11px] font-medium text-[#182420] hover:bg-[#EDF3F0] sm:self-center dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6] dark:hover:bg-[#1F332C]"
                  >
                    Precompila diario
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Quick AI Meal Ideas from Remaining Weekly Proteins */}
          <div className="mt-5 border-t border-[#E4E6E0] pt-4 dark:border-[#2B3732]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#182420] dark:text-[#EAECE6]">
                  <Sparkles className="h-4 w-4 text-[#1F6E5C] dark:text-[#36A68C]" />
                  <span>Idee Ricette Lampo (AI · 5–10 min)</span>
                </h3>
                <p className="text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                  Calcolate sulle proteine rimanenti della settimana e senza ripetizioni nella giornata.
                </p>
              </div>
            </div>

            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                aria-label="Ingredienti disponibili in dispensa"
                value={pantryNote}
                onChange={(e) => setPantryNote(e.target.value)}
                placeholder="Opzionale: cosa hai in frigo? (es. zucchine, ricotta, finocchi...)"
                className="flex-1 rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-xs text-[#182420] placeholder:text-[#8A948E] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              />
              <button
                type="button"
                disabled={loadingIdeas}
                onClick={handleGenerateQuickIdeas}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#1F6E5C] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#185849] disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{loadingIdeas ? 'Creo 3 idee...' : 'Idee Ricette Lampo (AI)'}</span>
              </button>
            </div>

            {ideasError && (
              <p className="mt-2 text-xs text-[#B91C1C] dark:text-[#FCA5A5]">{ideasError}</p>
            )}

            {quickIdeas.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2.5">
                {quickIdeas.map((idea, idx) => (
                  <div
                    key={`${idea.title}_${idx}`}
                    className="rounded-lg border border-[#C6D5CE] bg-[#F8FAF9] p-3 text-xs dark:border-[#2F4E42] dark:bg-[#161D1A]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                          {idea.title}
                        </span>
                        <span className="ml-2 font-mono text-[11px] tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                          {idea.prepMinutes} min · {idea.portionNote}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDate(today);
                          setProteinCategory(idea.proteinCategory);
                          setDescription(`${idea.title}: ${idea.ingredients.join(', ')}`);
                          setHasVegetables(true);
                          formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="rounded-md border border-[#1F6E5C] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1F6E5C] hover:bg-[#EDF3F0] dark:border-[#36A68C] dark:bg-[#1B231F] dark:text-[#36A68C]"
                      >
                        Usa nel Diario
                      </button>
                    </div>
                    <p className="mt-1 text-[#5C6762] dark:text-[#A3B0AA]">
                      <strong className="text-[#182420] dark:text-[#EAECE6]">Ingredienti:</strong>{' '}
                      {idea.ingredients.join(' · ')}
                    </p>
                    <p className="mt-1 leading-relaxed text-[#182420] dark:text-[#EAECE6]">
                      {idea.steps}
                    </p>
                    <p className="mt-1 text-[11px] text-[#1F6E5C] dark:text-[#36A68C]">
                      {idea.bariclipTip}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section
          aria-label="Lista della spesa settimanale"
          className="rounded-xl border border-[#E4E6E0] bg-white p-5 lg:col-span-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
            <div className="flex items-center gap-2">
              <ShoppingBasket className="h-5 w-5 text-[#1F6E5C] dark:text-[#36A68C]" />
              <div>
                <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                  Lista della Spesa
                </h2>
                <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                  Calcolata sulle porzioni mancanti questa settimana
                </p>
              </div>
            </div>
            {weeklyPlan.shoppingList.length > 0 && (
              <button
                type="button"
                onClick={handleCopyShoppingList}
                className="inline-flex items-center gap-1 rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1 text-xs font-medium text-[#182420] hover:bg-[#F3F4F0] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              >
                {copiedShop ? (
                  <Check className="h-3.5 w-3.5 text-[#1F6E5C]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedShop ? 'Copiata!' : 'Copia'}</span>
              </button>
            )}
          </div>

          {weeklyPlan.shoppingList.length === 0 ? (
            <p className="mt-4 text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              Nessun ingrediente extra mancante per questa settimana.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {weeklyPlan.shoppingList.map((item) => {
                const checked = Boolean(checkedShopIds[item.id]);
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                      checked
                        ? 'border-[#E4E6E0] bg-[#F8F9F6] opacity-65 dark:border-[#2B3732] dark:bg-[#161D1A]'
                        : 'border-[#E4E6E0] bg-white dark:border-[#2B3732] dark:bg-[#1B231F]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setCheckedShopIds((prev) => ({ ...prev, [item.id]: e.target.checked }))
                        }
                        className="mt-0.5 h-3.5 w-3.5 accent-[#1F6E5C]"
                      />
                      <div>
                        <p
                          className={`font-medium ${
                            checked
                              ? 'line-through text-[#5C6762] dark:text-[#A3B0AA]'
                              : 'text-[#182420] dark:text-[#EAECE6]'
                          }`}
                        >
                          {item.name}
                        </p>
                        <p className="text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                          {item.group}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-[#1F6E5C] dark:text-[#36A68C]">
                      {item.quantityNote}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Logged Meals Table with Edit & Delete */}
      <section
        aria-label="Storico pasti registrati"
        className="rounded-xl border border-[#E4E6E0] bg-white p-5 dark:border-[#2B3732] dark:bg-[#1B231F]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E6E0] pb-3.5 dark:border-[#2B3732]">
          <div>
            <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
              Pasti Registrati ({filteredMeals.length})
            </h2>
            <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              Slow Eating nel filtro: <span className="font-mono font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">{filteredSlowPct}%</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[#E4E6E0] bg-[#F7F7F4] p-0.5 dark:border-[#2B3732] dark:bg-[#161D1A]">
              {[
                { id: 'week' as const, label: 'Questa settimana' },
                { id: 'month' as const, label: '30 giorni' },
                { id: 'all' as const, label: 'Tutto' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodFilter(p.id)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    periodFilter === p.id
                      ? 'bg-white text-[#182420] shadow-xs dark:bg-[#1F332C] dark:text-[#EAECE6]'
                      : 'text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#8A948E]" />
              <input
                type="text"
                aria-label="Cerca nei pasti"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca alimento..."
                className="rounded-lg border border-[#D7DBD2] bg-white py-1.5 pl-8 pr-3 text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
              />
            </div>

            <select
              aria-label="Filtra per pasto"
              value={slotFilter}
              onChange={(e) => setSlotFilter(e.target.value as MealSlot | 'tutti')}
              className="rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 text-xs text-[#182420] dark:border-[#33423C] dark:bg-[#161D1A] dark:text-[#EAECE6]"
            >
              <option value="tutti">Tutti i momenti</option>
              <option value="colazione">Colazione</option>
              <option value="pranzo">Pranzo</option>
              <option value="spuntino_1730">Spuntino 17:30</option>
              <option value="cena">Cena</option>
            </select>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#E4E6E0] text-[#5C6762] dark:border-[#2B3732] dark:text-[#A3B0AA]">
                <th className="py-2 pr-3 font-medium">Data · Ora</th>
                <th className="py-2 pr-3 font-medium">Pasto</th>
                <th className="py-2 pr-3 font-medium">Descrizione</th>
                <th className="py-2 pr-3 text-right font-medium">Fame→Sazietà</th>
                <th className="py-2 pr-3 text-right font-medium">Slow Eating</th>
                <th className="py-2 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEE8] dark:divide-[#27322D]">
              {filteredMeals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                    Nessun pasto registrato con i filtri correnti. Usa il modulo qui sopra per iniziare.
                  </td>
                </tr>
              ) : (
                filteredMeals.map((m) => (
                  <tr key={m.id} className="hover:bg-[#FAFBF8] dark:hover:bg-[#222D28]">
                    <td className="whitespace-nowrap py-2.5 pr-3 font-mono tabular-nums text-[#5C6762] dark:text-[#A3B0AA]">
                      {m.date} · {m.time}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 font-medium text-[#182420] dark:text-[#EAECE6]">
                      {SLOT_LABELS[m.slot]}
                    </td>
                    <td className="py-2.5 pr-3 text-[#182420] dark:text-[#EAECE6]">
                      {m.description}
                      {m.symptomsReported.length > 0 && (
                        <span className="ml-2 font-medium text-[#B91C1C] dark:text-[#FCA5A5]">
                          [{m.symptomsReported.join(', ')}]
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums text-[#182420] dark:text-[#EAECE6]">
                      {m.preHungerScale} → {m.postSatietyScale}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right text-[#1F6E5C] dark:text-[#36A68C]">
                      {m.slowEatingUsed ? 'Sì' : 'Rapido'}
                      {m.leftABite ? ' · Boccone lasciato' : ''}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right">
                      {confirmDeleteId === m.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteMeal(m.id);
                              setConfirmDeleteId(null);
                              if (editingMealId === m.id) resetFormToDefault();
                            }}
                            className="rounded border border-[#B91C1C] bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-semibold text-[#991B1B] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
                          >
                            Conferma
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-[#D7DBD2] px-2 py-0.5 text-[11px] text-[#5C6762] dark:border-[#33423C] dark:text-[#A3B0AA]"
                          >
                            Annulla
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Modifica pasto ${m.description}`}
                            onClick={() => startEditMeal(m)}
                            className="rounded p-1 text-[#5C6762] hover:bg-[#EDF3F0] hover:text-[#1F6E5C] dark:text-[#A3B0AA] dark:hover:bg-[#1F332C] dark:hover:text-[#36A68C]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Elimina pasto ${m.description}`}
                            onClick={() => setConfirmDeleteId(m.id)}
                            className="rounded p-1 text-[#5C6762] hover:bg-[#FEF2F2] hover:text-[#B91C1C] dark:text-[#A3B0AA] dark:hover:bg-[#2A1717] dark:hover:text-[#FCA5A5]"
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
