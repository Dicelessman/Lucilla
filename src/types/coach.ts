export type MealSlot = 'colazione' | 'pranzo' | 'spuntino_1730' | 'cena';

export type ProteinCategory =
  | 'carne_bianca'
  | 'carne_rossa'
  | 'pesce'
  | 'tonno_salmone'
  | 'uova'
  | 'formaggio'
  | 'legumi'
  | 'tofu_seitan'
  | 'affettato'
  | 'primo'
  | 'pasto_libero'
  | 'nessuno';

export type BodyZone = 'stomaco' | 'petto' | 'mani' | 'mascella' | 'testa' | 'gola';

export type HungerType = 'fisica' | 'emotiva' | 'abitudine';

export type RealNeed = 'riposo' | 'coccola' | 'premio' | 'compagnia' | 'distrazione' | 'chiarezza';

export type SosOutcome = 'onda_surfata' | 'scelta_consapevole' | 'mangiato_con_presenza' | 'mangiato_di_corsa';

export type EmotionReflectionType = 'nessuna' | 'colpa' | 'vergogna';

export type LearningStageId =
  | 'incompetenza_inconscia'
  | 'incompetenza_conscia'
  | 'competenza_conscia'
  | 'competenza_inconscia';

export interface CustomMusicTrack {
  id: string;
  title: string;
  url: string;
}

export interface UserProfile {
  name: string;
  heightCm: number;
  surgeryType: string;
  surgeryDate: string;
  surgeryWeightKg: number;
  surgeryBmi: number;
  lowestWeightKg: number;
  baselineWeightKg: number;
  baselineBmi: number;
  baselineDate: string;
  baselineMeasuresCm: {
    umbilical: number;
    hips: number;
    chest: number;
  };
  positiveGoal: string;
  clinicianName: string;
  clinicianPhone: string;
  clinicianEmail: string;
  customMusicTracks?: CustomMusicTrack[];
}

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  slot: MealSlot;
  description: string;
  proteinCategory: ProteinCategory;
  hasVegetables: boolean;
  preHungerScale: number; // 10 (fame estrema) -> 0 (scoppiando); ottimale 8-9
  postSatietyScale: number; // 10 -> 0; ottimale 5-6
  perceivedEnergy: number; // 1-5
  slowEatingUsed: boolean;
  slowMotionSecondsUsed: boolean;
  leftABite: boolean;
  symptomsReported: string[]; // e.g., ['vomito', 'rigurgito', 'bruciore', 'disfagia']
  notes?: string;
}

export interface SosProvaEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  situation: string;
  bodyZone: BodyZone;
  emotionName: string;
  intensityLevel: 1 | 2 | 3 | 4 | 5;
  hungerType: HungerType;
  realNeed: RealNeed;
  strategyUsed: string;
  waitedMinutes: number;
  outcome: SosOutcome;
  xpEarned: number;
  notes?: string;
}

export interface DailyCheckin {
  id: string;
  date: string; // YYYY-MM-DD
  sleepHours?: number;
  sleepQuality?: 1 | 2 | 3 | 4 | 5;
  dreamJournal?: string;
  morningDomandeNotes?: string;
  kinestheticAnchorDone?: boolean;
  movementMinutes?: number;
  afternoonParachuteDone?: boolean;
  afternoonSnackChoice?: string;
  eveningSuccess?: string;
  eveningEmotionType?: EmotionReflectionType;
  eveningRepairOrCompassion?: string;
  eveningRitualDone?: boolean;
  eveningRitualChoice?: string;
  hydrationGlasses?: number;
  hydrationAwayFromMealsDone?: boolean;
  hydrationXpAwarded?: boolean;
}

export interface ClinicalVisitEntry {
  id: string;
  date: string; // YYYY-MM-DD
  clinicianName: string;
  weightAtVisitKg?: number;
  summaryNotes: string;
  nextFocus: string;
  nextVisitDate?: string; // YYYY-MM-DD
}

export interface QuickMealIdea {
  title: string;
  proteinCategory: ProteinCategory;
  portionNote: string;
  prepMinutes: number;
  ingredients: string[];
  steps: string;
  bariclipTip: string;
}

export interface WeightTapeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  umbilicalCm?: number;
  hipsCm?: number;
  chestCm?: number;
  advisorNote?: string;
}

export interface WheelAreaScore {
  areaId: string;
  label: string;
  sa: number; // Stato Attuale 1-10
  sd: number; // Stato Desiderato 1-10
}

export interface WheelAssessment {
  id: string;
  date: string;
  areas: WheelAreaScore[];
  focusAreaId: string;
  firstMicroStep: string;
}

export interface WeeklyChallenge {
  id: string;
  weekNumber: number;
  title: string;
  levelTarget: string;
  mossaFurba: string;
  description: string;
  domandaUtile1: string;
  domandaUtile2: string;
}

export interface StanzaBadge {
  id: string;
  stanza: string;
  title: string;
  description: string;
  unlockedAt?: string;
}

export interface ChatAction {
  type: 'open_sos' | 'open_ruota' | 'open_report' | 'open_diary' | 'open_morning' | 'radio_borbottona';
  label: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  commandTriggered?: '/sos' | '/ruota' | '/report_bardho';
  redFlagTriggered?: boolean;
  slipUpReframed?: boolean;
  actions?: ChatAction[];
}

export interface CoachState {
  profile: UserProfile;
  xp: number;
  activeChallengeId: string;
  weighInDayOfWeek: string; // e.g., 'Lunedì'
  meals: MealEntry[];
  sosLogs: SosProvaEntry[];
  checkins: DailyCheckin[];
  measurements: WeightTapeEntry[];
  wheelAssessments: WheelAssessment[];
  clinicalVisits: ClinicalVisitEntry[];
  badges: StanzaBadge[];
  chatHistory: ChatMessage[];
}
