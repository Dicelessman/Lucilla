import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { Mic, MicOff, PhoneOff, Radio } from 'lucide-react';
import { AuthGate } from './components/AuthGate.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton.tsx';
import { ActiveTab, TopNav } from './components/TopNav.tsx';
import { CoachChatPanel } from './components/CoachChatPanel.tsx';
import { DailyRoutinesCard } from './components/DailyRoutinesCard.tsx';
import { SosWaveModal } from './components/SosWaveModal.tsx';
import { FoodDiaryView } from './components/FoodDiaryView.tsx';
import { PnlToolsView } from './components/PnlToolsView.tsx';
import { ProgressReportView } from './components/ProgressReportView.tsx';
import { ProfileSettingsModal, ThemePreference } from './components/ProfileSettingsModal.tsx';
import { AmbientMusicMiniBar, AmbientMusicStudio } from './components/AmbientMusicStudio.tsx';
import { EditorialImage } from './components/EditorialImage.tsx';
import heroBotanicalImg from './assets/images/lucilla_botanical_hero_1794581848374.jpg';
import {
  AMBIENT_TRACKS,
  ambientMusicEngine,
  AmbientTrackId,
  parseCustomMusicUrl,
} from './utils/ambientMusicEngine.ts';
import {
  ChatAction,
  ChatMessage,
  ClinicalVisitEntry,
  CoachState,
  DailyCheckin,
  MealEntry,
  SosProvaEntry,
  UserProfile,
  WeightTapeEntry,
  WheelAssessment,
} from './types/coach.ts';
import {
  applyDailyCheckinRewards,
  calculateBmi,
  calculateWeeklyMovementAndHydration,
  getLearningStage,
  getMonthlyTrendSummary,
} from './utils/bariclipRules.ts';
import { createInitialSeedState, DEFAULT_BADGES, WEEKLY_CHALLENGES } from './utils/seedData.ts';
import { LiveUiCommand, useLiveVoice } from './hooks/useLiveVoice.ts';
import {
  appendChatMessagesToFirestore,
  deleteClinicalVisitFromFirestore,
  deleteMealFromFirestore,
  deleteMeasurementFromFirestore,
  deleteSosFromFirestore,
  migrateLocalDataToFirestore,
  resetToCleanStartInFirestore,
  saveClinicalVisitToFirestore,
  saveMealToFirestore,
  saveMeasurementToFirestore,
  saveSosToFirestore,
  saveWheelToFirestore,
  subscribeToCoachState,
  updateClinicalVisitInFirestore,
  updateMealInFirestore,
  updateMeasurementInFirestore,
  updateSosInFirestore,
  updateUserRootInFirestore,
  upsertCheckinToFirestore,
} from './utils/firestoreSync.ts';

interface AuthenticatedCoachAppProps {
  user: User;
  onSignOut: () => Promise<void>;
}

const THEME_STORAGE_KEY = 'lucilla_theme_mode';

function resolveIsDarkTheme(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  return h >= 21 || (h === 20 && m >= 30) || h < 6;
}

function loadInitialThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto_evening') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'light';
}

function resolveDefaultTrackByHour(): AmbientTrackId {
  const h = new Date().getHours();
  if (h >= 5 && h < 14) return 'respiro_mattina';
  if (h >= 14 && h < 20) return 'paracadute_onda';
  return 'sera_soft';
}

function mergeUniqueMessages(existing: ChatMessage[], additions: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of existing) map.set(m.id, m);
  for (const m of additions) map.set(m.id, m);
  return Array.from(map.values()).slice(-50);
}

function AuthenticatedCoachApp({ user, onSignOut }: AuthenticatedCoachAppProps) {
  const [state, setState] = useState<CoachState>(() => createInitialSeedState());
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('oggi');
  const [sosOpen, setSosOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [radioOpenSignal, setRadioOpenSignal] = useState(false);

  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    loadInitialThemePreference()
  );
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() =>
    resolveIsDarkTheme(loadInitialThemePreference())
  );
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTrackId, setMusicTrackId] = useState<string>(() =>
    resolveDefaultTrackByHour()
  );
  const [musicVolume, setMusicVolume] = useState(0.45);
  const [musicDockDismissed, setMusicDockDismissed] = useState(false);
  const [musicAudioError, setMusicAudioError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const customMusicTracks = state.profile.customMusicTracks ?? [];

  useEffect(() => {
    return () => {
      ambientMusicEngine.stop();
    };
  }, []);

  function startTrackById(targetId: string, nextVolume = musicVolume) {
    setMusicAudioError(null);
    const custom = customMusicTracks.find((t) => t.id === targetId);
    if (custom) {
      const parsed = parseCustomMusicUrl(custom.url);
      if (parsed.type === 'youtube' && parsed.embedUrl) {
        ambientMusicEngine.stop();
        setMusicTrackId(custom.id);
        setMusicDockDismissed(false);
        setMusicPlaying(true);
        return;
      }
      if (parsed.type === 'audio' && parsed.audioUrl) {
        setMusicTrackId(custom.id);
        setMusicDockDismissed(false);
        setMusicPlaying(true);
        ambientMusicEngine.startExternalAudio(
          custom.id,
          parsed.audioUrl,
          nextVolume,
          (msg) => {
            setMusicAudioError(msg);
            setMusicPlaying(false);
          }
        );
        return;
      }
      setMusicAudioError('Link musicale non valido. Controlla l’URL nelle Impostazioni.');
      setMusicPlaying(false);
      return;
    }

    const builtinId = (AMBIENT_TRACKS.find((t) => t.id === targetId)?.id ??
      AMBIENT_TRACKS[0].id) as AmbientTrackId;
    setMusicTrackId(builtinId);
    setMusicDockDismissed(false);
    ambientMusicEngine.start(builtinId, nextVolume);
    setMusicPlaying(true);
  }

  function handleToggleMusic() {
    if (musicPlaying) {
      ambientMusicEngine.stop();
      setMusicPlaying(false);
    } else {
      startTrackById(musicTrackId, musicVolume);
    }
  }

  function handleSelectMusicTrack(nextTrackId: string) {
    startTrackById(nextTrackId, musicVolume);
  }

  function handleToggleTrackPreset(presetId: AmbientTrackId) {
    if (musicPlaying && musicTrackId === presetId) {
      ambientMusicEngine.stop();
      setMusicPlaying(false);
    } else {
      startTrackById(presetId, musicVolume);
    }
  }

  function handleChangeMusicVolume(nextVolume: number) {
    setMusicVolume(nextVolume);
    ambientMusicEngine.setVolume(nextVolume);
  }

  function handleNextMusicTrack() {
    const allIds = [...AMBIENT_TRACKS.map((t) => t.id), ...customMusicTracks.map((c) => c.id)];
    const idx = allIds.indexOf(musicTrackId);
    const nextId = allIds[(idx + 1) % allIds.length] ?? AMBIENT_TRACKS[0].id;
    startTrackById(nextId, musicVolume);
  }

  function handleStopAndHideMusic() {
    ambientMusicEngine.stop();
    setMusicPlaying(false);
    setMusicDockDismissed(true);
  }

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // Ignore storage errors
    }
    const apply = () => {
      const dark = resolveIsDarkTheme(themePreference);
      setIsDarkTheme(dark);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    if (themePreference !== 'auto_evening') return;
    const timer = window.setInterval(apply, 60000);
    return () => window.clearInterval(timer);
  }, [themePreference]);

  function handleQuickToggleTheme() {
    setThemePreference((prev) => {
      const currentlyDark = resolveIsDarkTheme(prev);
      return currentlyDark ? 'light' : 'dark';
    });
  }

  const getIdToken = useCallback(async () => {
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  const handleVoiceStateUpdate = useCallback(
    (nextState: CoachState, uiCommand?: LiveUiCommand) => {
      setState(nextState);
      if (uiCommand?.tab) {
        setActiveTab(uiCommand.tab);
      }
      if (uiCommand?.openSosModal) {
        setSosOpen(true);
      }
      if (uiCommand?.openRadioBorbottona) {
        setActiveTab('oggi');
        setRadioOpenSignal(true);
      }
    },
    []
  );

  const handleTurnVoiceMessages = useCallback(
    (messages: ChatMessage[], uiCommand?: LiveUiCommand) => {
      setState((prev) => ({
        ...prev,
        chatHistory: mergeUniqueMessages(prev.chatHistory, messages),
      }));
      if (uiCommand?.tab) {
        setActiveTab(uiCommand.tab);
      }
      if (uiCommand?.openSosModal) {
        setSosOpen(true);
      }
      if (uiCommand?.openRadioBorbottona) {
        setActiveTab('oggi');
        setRadioOpenSignal(true);
      }
    },
    []
  );

  const liveVoice = useLiveVoice({
    onStateUpdate: handleVoiceStateUpdate,
    onTurnMessages: handleTurnVoiceMessages,
    getIdToken,
  });

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const idToken = await user.getIdToken();
        await migrateLocalDataToFirestore(
          user.uid,
          user.email ?? 'diceless@gmail.com',
          idToken
        );
        if (!mounted) return;

        unsubscribe = subscribeToCoachState(
          user.uid,
          (remoteState) => {
            if (!mounted) return;
            setState(remoteState);
            setSyncError(null);
            setLoading(false);
          },
          (err) => {
            if (!mounted) return;
            console.error('Firestore subscription error:', err);
            setSyncError(
              'Errore di sincronizzazione con il cloud. Verifica la connessione o i permessi.'
            );
            setLoading(false);
          }
        );
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to initialize Firestore state:', err);
        setSyncError('Impossibile inizializzare il diario sincronizzato.');
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  async function handleSendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setIsSendingChat(true);

    if (trimmed.toLowerCase().startsWith('/ruota')) {
      setActiveTab('pnl');
    } else if (trimmed.toLowerCase().startsWith('/report_bardho')) {
      setActiveTab('report');
    }

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        throw new Error('Chat request failed');
      }

      const data = (await res.json()) as {
        userMessage: ChatMessage;
        assistantMessage: ChatMessage;
      };
      setState((prev) => ({
        ...prev,
        chatHistory: mergeUniqueMessages(prev.chatHistory, [
          data.userMessage,
          data.assistantMessage,
        ]),
      }));

      if (trimmed.toLowerCase().startsWith('/sos')) {
        setSosOpen(true);
      }
    } catch {
      const nowTime = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const fallbackUser: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: nowTime,
      };
      const fallbackAssistant: ChatMessage = {
        id: `a_${Date.now() + 1}`,
        role: 'assistant',
        content:
          'Sono qui con te Davide. Fermiamoci un respiro insieme: cosa stai sentendo nel corpo in questo momento e quale piccola cura semplice vuoi scegliere adesso?',
        timestamp: nowTime,
        actions: [{ type: 'open_sos', label: 'Avvia Protocollo SOS (4 Step)' }],
      };
      setState((prev) => ({
        ...prev,
        chatHistory: mergeUniqueMessages(prev.chatHistory, [fallbackUser, fallbackAssistant]),
      }));
      try {
        await appendChatMessagesToFirestore(user.uid, [fallbackUser, fallbackAssistant]);
      } catch {
        // Firestore offline persistence handles queued writes when back online
      }
    } finally {
      setIsSendingChat(false);
    }
  }

  function handleTriggerAction(action: ChatAction['type']) {
    if (action === 'open_sos') setSosOpen(true);
    if (action === 'open_ruota') setActiveTab('pnl');
    if (action === 'open_report') setActiveTab('report');
    if (action === 'open_diary') setActiveTab('diario');
    if (action === 'open_morning') setActiveTab('oggi');
  }

  function handleSaveCheckin(updated: DailyCheckin, xpDelta = 0) {
    const rewardRes = applyDailyCheckinRewards(
      state.checkins,
      updated,
      state.xp,
      state.badges,
      today,
      xpDelta
    );

    const exists = state.checkins.some((c) => c.date === rewardRes.updatedCheckin.date);
    const nextCheckins = exists
      ? state.checkins.map((c) =>
          c.date === rewardRes.updatedCheckin.date ? rewardRes.updatedCheckin : c
        )
      : [...state.checkins, rewardRes.updatedCheckin];

    setState((prev) => ({
      ...prev,
      xp: rewardRes.nextXp,
      checkins: nextCheckins,
      badges: rewardRes.nextBadges,
    }));

    upsertCheckinToFirestore(
      user.uid,
      rewardRes.updatedCheckin,
      rewardRes.nextXp,
      rewardRes.nextBadges
    ).catch((err) => {
      console.error('Checkin sync error:', err);
    });
  }

  function handleSaveSosProva(entry: SosProvaEntry) {
    const nextLogs = [...state.sosLogs, entry];
    const nextBadges = state.badges.map((b) =>
      b.id === 'stanza_relazioni' && !b.unlockedAt && entry.intensityLevel >= 4
        ? { ...b, unlockedAt: today }
        : b
    );
    const nextXp = state.xp + entry.xpEarned;

    setState((prev) => ({
      ...prev,
      xp: nextXp,
      sosLogs: nextLogs,
      badges: nextBadges,
    }));

    saveSosToFirestore(user.uid, entry, nextXp, nextBadges).catch((err) => {
      console.error('SOS sync error:', err);
    });
  }

  function handleUpdateSos(entry: SosProvaEntry) {
    setState((prev) => ({
      ...prev,
      sosLogs: prev.sosLogs.map((s) => (s.id === entry.id ? entry : s)),
    }));

    updateSosInFirestore(user.uid, entry).catch((err) => {
      console.error('SOS update sync error:', err);
    });
  }

  function handleDeleteSos(sosId: string) {
    setState((prev) => ({
      ...prev,
      sosLogs: prev.sosLogs.filter((s) => s.id !== sosId),
    }));

    deleteSosFromFirestore(user.uid, sosId).catch((err) => {
      console.error('SOS delete sync error:', err);
    });
  }

  function handleAddMeal(meal: MealEntry) {
    const nextMeals = [...state.meals, meal];
    const slowCount = nextMeals.filter((m) => m.slowEatingUsed).length;
    const nextBadges = state.badges.map((b) =>
      b.id === 'stanza_presenza' && !b.unlockedAt && slowCount >= 5
        ? { ...b, unlockedAt: today }
        : b
    );
    const nextXp = state.xp + (meal.slowEatingUsed ? 15 : 5);

    setState((prev) => ({
      ...prev,
      xp: nextXp,
      meals: nextMeals,
      badges: nextBadges,
    }));

    saveMealToFirestore(user.uid, meal, nextXp, nextBadges).catch((err) => {
      console.error('Meal sync error:', err);
    });
  }

  function handleUpdateMeal(meal: MealEntry) {
    setState((prev) => ({
      ...prev,
      meals: prev.meals.map((m) => (m.id === meal.id ? meal : m)),
    }));

    updateMealInFirestore(user.uid, meal).catch((err) => {
      console.error('Meal update sync error:', err);
    });
  }

  function handleDeleteMeal(mealId: string) {
    setState((prev) => ({
      ...prev,
      meals: prev.meals.filter((m) => m.id !== mealId),
    }));

    deleteMealFromFirestore(user.uid, mealId).catch((err) => {
      console.error('Meal delete sync error:', err);
    });
  }

  function handleSelectChallenge(challengeId: string) {
    setState((prev) => ({
      ...prev,
      activeChallengeId: challengeId,
    }));

    updateUserRootInFirestore(user.uid, { activeChallengeId: challengeId }).catch((err) => {
      console.error('Challenge sync error:', err);
    });
  }

  function handleSaveWheel(assessment: WheelAssessment) {
    const nextXp = state.xp + 25;
    setState((prev) => ({
      ...prev,
      xp: nextXp,
      wheelAssessments: [...prev.wheelAssessments, assessment],
    }));

    saveWheelToFirestore(user.uid, assessment, nextXp).catch((err) => {
      console.error('Wheel sync error:', err);
    });
  }

  function handleAddMeasurement(entry: WeightTapeEntry) {
    const nextXp = state.xp + 15;
    setState((prev) => ({
      ...prev,
      xp: nextXp,
      measurements: [...prev.measurements, entry],
    }));

    saveMeasurementToFirestore(user.uid, entry, nextXp).catch((err) => {
      console.error('Measurement sync error:', err);
    });
  }

  function handleUpdateMeasurement(entry: WeightTapeEntry) {
    setState((prev) => ({
      ...prev,
      measurements: prev.measurements.map((m) => (m.id === entry.id ? entry : m)),
    }));

    updateMeasurementInFirestore(user.uid, entry).catch((err) => {
      console.error('Measurement update sync error:', err);
    });
  }

  function handleDeleteMeasurement(measId: string) {
    setState((prev) => ({
      ...prev,
      measurements: prev.measurements.filter((m) => m.id !== measId),
    }));

    deleteMeasurementFromFirestore(user.uid, measId).catch((err) => {
      console.error('Measurement delete sync error:', err);
    });
  }

  function handleAddClinicalVisit(visit: ClinicalVisitEntry) {
    setState((prev) => ({
      ...prev,
      clinicalVisits: [...prev.clinicalVisits, visit],
    }));

    saveClinicalVisitToFirestore(user.uid, visit).catch((err) => {
      console.error('Clinical visit sync error:', err);
    });
  }

  function handleUpdateClinicalVisit(visit: ClinicalVisitEntry) {
    setState((prev) => ({
      ...prev,
      clinicalVisits: prev.clinicalVisits.map((v) => (v.id === visit.id ? visit : v)),
    }));

    updateClinicalVisitInFirestore(user.uid, visit).catch((err) => {
      console.error('Clinical visit update sync error:', err);
    });
  }

  function handleDeleteClinicalVisit(visitId: string) {
    setState((prev) => ({
      ...prev,
      clinicalVisits: prev.clinicalVisits.filter((v) => v.id !== visitId),
    }));

    deleteClinicalVisitFromFirestore(user.uid, visitId).catch((err) => {
      console.error('Clinical visit delete sync error:', err);
    });
  }

  async function handleSaveProfile(updatedProfile: UserProfile, updatedWeighInDay: string) {
    setState((prev) => ({
      ...prev,
      profile: updatedProfile,
      weighInDayOfWeek: updatedWeighInDay,
    }));

    await updateUserRootInFirestore(user.uid, {
      profile: updatedProfile,
      weighInDayOfWeek: updatedWeighInDay,
    });
  }

  async function handleResetDemoData(keepBaselineMeasurement: boolean) {
    const nowTime = new Date().toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const freshWelcome: ChatMessage = {
      id: 'msg_welcome',
      role: 'assistant',
      timestamp: nowTime,
      content: `Benvenuto nel tuo percorso reale, ${state.profile.name.split(' ')[0]}! Da questo momento costruisci giorno per giorno il tuo nuovo equilibrio con presenza, ascolto del corpo e scelte da persona magra. Come ti senti oggi e quale piccolo passo vuoi regalarti?`,
      actions: [
        { type: 'open_morning', label: 'Check-in Mattina & Sogni' },
        { type: 'open_sos', label: 'Surfa un’onda (/sos)' },
        { type: 'open_diary', label: 'Registra Pasto Slow' },
      ],
    };

    const baselineMeasurement: WeightTapeEntry | undefined = keepBaselineMeasurement
      ? {
          id: 'w_base',
          date: state.profile.baselineDate || today,
          weightKg: state.profile.baselineWeightKg,
          umbilicalCm: state.profile.baselineMeasuresCm.umbilical,
          hipsCm: state.profile.baselineMeasuresCm.hips,
          chestCm: state.profile.baselineMeasuresCm.chest,
          advisorNote: `Misurazione baseline iniziale (${state.profile.clinicianName})`,
        }
      : undefined;

    await resetToCleanStartInFirestore(user.uid, freshWelcome, baselineMeasurement);

    setState((prev) => ({
      ...prev,
      xp: 0,
      activeChallengeId: 'w1',
      meals: [],
      sosLogs: [],
      checkins: [],
      measurements: baselineMeasurement ? [baselineMeasurement] : [],
      wheelAssessments: [],
      clinicalVisits: [],
      chatHistory: [freshWelcome],
      badges: DEFAULT_BADGES.map((b) => ({
        id: b.id,
        stanza: b.stanza,
        title: b.title,
        description: b.description,
      })),
    }));
  }

  function handleToggleLiveCall() {
    if (liveVoice.status === 'active' || liveVoice.status === 'connecting') {
      liveVoice.stopCall();
    } else {
      setActiveTab('oggi');
      window.setTimeout(() => {
        document
          .getElementById('coach-chat-panel')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
      liveVoice.startCall();
    }
  }

  const todayCheckin: DailyCheckin =
    state.checkins.find((c) => c.date === today) ?? {
      id: `chk_${today}`,
      date: today,
    };

  const activeChallenge =
    WEEKLY_CHALLENGES.find((c) => c.id === state.activeChallengeId) ?? WEEKLY_CHALLENGES[0];

  const stage = getLearningStage(state.xp);
  const summary = getMonthlyTrendSummary(state);
  const currentBmi = calculateBmi(summary.latestWeight, state.profile.heightCm);
  const todayMealsCount = state.meals.filter((m) => m.date === today).length;
  const { weeklyMovementMinutes } = calculateWeeklyMovementAndHydration(state.checkins, today);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F7F4] px-4 text-center dark:bg-[#131917]">
        <p className="font-editorial text-2xl font-semibold text-[#182420] dark:text-[#EAECE6]">
          Lucilla
        </p>
        <p className="mt-2 text-sm text-[#5C6762] dark:text-[#A3B0AA]">
          Sincronizzazione del diario di Davide dal cloud...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F4] text-[#182420] dark:bg-[#131917] dark:text-[#EAECE6]">
      <OfflineIndicator />

      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSos={() => setSosOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        isDarkTheme={isDarkTheme}
        onToggleTheme={handleQuickToggleTheme}
        xp={state.xp}
        liveStatus={liveVoice.status}
        voiceTransport={liveVoice.voiceTransport}
        isRecordingTurn={liveVoice.isRecordingTurn}
        isProcessingTurn={liveVoice.isProcessingTurn}
        onToggleLiveCall={handleToggleLiveCall}
        onSendVoiceTurn={liveVoice.sendVoiceTurn}
        onStartNextVoiceTurn={liveVoice.startNextVoiceTurn}
        onStopLiveCall={liveVoice.stopCall}
        onSignOut={() => {
          liveVoice.stopCall();
          ambientMusicEngine.stop();
          setMusicPlaying(false);
          onSignOut();
        }}
      />

      {/* Persistent Cross-Tab Live Audio Bar when navigating away from Oggi */}
      {(liveVoice.status === 'active' || liveVoice.status === 'connecting') && activeTab !== 'oggi' && (
        <div className="no-print border-b border-[#C6D5CE] bg-[#EDF3F0] px-4 py-2.5 text-xs dark:border-[#2F4E42] dark:bg-[#1F332C]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 sm:px-2">
            <div className="flex items-center gap-2 font-medium text-[#182420] dark:text-[#EAECE6]">
              <Radio className="h-4 w-4 text-[#1F6E5C] dark:text-[#36A68C]" />
              <span>
                {liveVoice.voiceTransport === 'turn'
                  ? liveVoice.isProcessingTurn
                    ? 'Voce con Lucilla · Elaborazione risposta...'
                    : liveVoice.isRecordingTurn
                    ? 'Voce con Lucilla · In ascolto del tuo turno'
                    : liveVoice.isModelSpeaking
                    ? 'Voce con Lucilla · Sta rispondendo...'
                    : 'Voce con Lucilla · Pronto'
                  : liveVoice.isMuted
                  ? 'Chiamata Live con Lucilla · Microfono in pausa'
                  : liveVoice.isModelSpeaking
                  ? 'Chiamata Live con Lucilla · Sta parlando...'
                  : 'Chiamata Live con Lucilla · In ascolto'}
              </span>
              {liveVoice.lastVoiceNotice && (
                <span className="font-semibold text-[#1F6E5C] dark:text-[#36A68C]">
                  · {liveVoice.lastVoiceNotice}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {liveVoice.voiceTransport === 'turn' && liveVoice.isRecordingTurn && (
                <button
                  type="button"
                  onClick={liveVoice.sendVoiceTurn}
                  className="inline-flex items-center gap-1 rounded-md bg-[#1F6E5C] px-2.5 py-1 font-semibold text-white"
                >
                  <span>Invia a Lucilla</span>
                </button>
              )}
              {liveVoice.voiceTransport === 'turn' &&
                !liveVoice.isRecordingTurn &&
                !liveVoice.isProcessingTurn && (
                  <button
                    type="button"
                    onClick={liveVoice.startNextVoiceTurn}
                    className="inline-flex items-center gap-1 rounded-md bg-[#1F6E5C] px-2.5 py-1 font-semibold text-white"
                  >
                    <Mic className="h-3.5 w-3.5" />
                    <span>Parla ancora</span>
                  </button>
                )}
              {liveVoice.voiceTransport === 'websocket' && (
                <button
                  type="button"
                  onClick={liveVoice.toggleMute}
                  className="inline-flex items-center gap-1 rounded-md border border-[#C6D5CE] bg-white px-2.5 py-1 font-medium text-[#182420] dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                >
                  {liveVoice.isMuted ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  <span>{liveVoice.isMuted ? 'Riattiva' : 'Silenzia'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={liveVoice.stopCall}
                className="inline-flex items-center gap-1 rounded-md border border-[#FCA5A5] bg-white px-2.5 py-1 font-medium text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                <span>Chiudi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Mobile utility row: XP + PWA Install */}
        <div className="mb-4 flex items-center justify-between gap-2 sm:hidden">
          <span className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
            {state.profile.name} · <span className="font-mono tabular-nums">{state.xp} XP</span>
          </span>
          <PWAInstallButton />
        </div>

        {syncError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-[#F3D09B] bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E] dark:border-[#6B4F1D] dark:bg-[#2A2112] dark:text-[#FDE68A]"
          >
            {syncError}
          </div>
        )}

        {activeTab === 'oggi' && (
          <div className="space-y-6">
            {/* Compact Overview Header Strip with Botanical Editorial Artwork */}
            <section
              aria-label="Quadro rapido del giorno"
              className="overflow-hidden rounded-xl border border-[#E4E6E0] bg-white dark:border-[#2B3732] dark:bg-[#1B231F]"
            >
              <div className="flex flex-col lg:flex-row lg:items-stretch">
                <div className="h-32 shrink-0 lg:h-auto lg:w-56">
                  <EditorialImage
                    src={heroBotanicalImg}
                    alt="Pietra calda, tessuto di lino e acqua serena al sole del mattino"
                    className="h-full w-full"
                  />
                </div>

                <div className="flex flex-1 flex-col justify-between gap-4 px-5 py-4 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-[#1F6E5C] dark:text-[#36A68C]">
                      {stage.title} · {activeChallenge.title}
                    </p>
                    <h1 className="mt-1 font-editorial text-xl font-medium text-[#182420] sm:text-2xl dark:text-[#EAECE6]">
                      “{state.profile.positiveGoal}”
                    </h1>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-6 border-t border-[#ECEEE8] pt-3 xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0 dark:border-[#2B3732]">
                    <div>
                      <p className="text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">Peso &amp; BMI</p>
                      <p className="font-mono text-base font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
                        {summary.latestWeight} kg · {currentBmi}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">Slow Eating</p>
                      <p className="font-mono text-base font-semibold tabular-nums text-[#1F6E5C] dark:text-[#36A68C]">
                        {summary.slowEatingRate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">Onde surfate</p>
                      <p className="font-mono text-base font-semibold tabular-nums text-[#182420] dark:text-[#EAECE6]">
                        {summary.surfedWaves}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Rilassati con la musica */}
            <AmbientMusicStudio
              isPlaying={musicPlaying}
              trackId={musicTrackId}
              customTracks={customMusicTracks}
              volume={musicVolume}
              audioError={musicAudioError}
              onSelectTrack={handleSelectMusicTrack}
              onTogglePlay={handleToggleMusic}
              onChangeVolume={handleChangeMusicVolume}
              onOpenMusicSettings={() => setProfileOpen(true)}
            />

            {/* Primary 2-Column Coach + Proactive Routines */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <CoachChatPanel
                  messages={state.chatHistory}
                  onSendMessage={handleSendMessage}
                  onTriggerAction={handleTriggerAction}
                  isSending={isSendingChat}
                  liveStatus={liveVoice.status}
                  voiceTransport={liveVoice.voiceTransport}
                  isMuted={liveVoice.isMuted}
                  isModelSpeaking={liveVoice.isModelSpeaking}
                  isRecordingTurn={liveVoice.isRecordingTurn}
                  isProcessingTurn={liveVoice.isProcessingTurn}
                  micLevel={liveVoice.micLevel}
                  liveUserTranscript={liveVoice.liveUserTranscript}
                  liveModelTranscript={liveVoice.liveModelTranscript}
                  liveError={liveVoice.errorMessage}
                  lastVoiceNotice={liveVoice.lastVoiceNotice}
                  onStartLiveCall={liveVoice.startCall}
                  onStopLiveCall={liveVoice.stopCall}
                  onToggleMute={liveVoice.toggleMute}
                  onSendLiveText={liveVoice.sendLiveText}
                  onSendVoiceTurn={liveVoice.sendVoiceTurn}
                  onStartNextVoiceTurn={liveVoice.startNextVoiceTurn}
                  externalRadioOpen={radioOpenSignal}
                  getIdToken={getIdToken}
                />
              </div>
              <div className="lg:col-span-6">
                <DailyRoutinesCard
                  todayDate={today}
                  checkin={todayCheckin}
                  activeChallenge={activeChallenge}
                  onSaveCheckin={handleSaveCheckin}
                  todayMealsCount={todayMealsCount}
                  weeklyMovementMinutes={weeklyMovementMinutes}
                  onOpenDreamArchive={() => {
                    setActiveTab('pnl');
                    window.setTimeout(() => {
                      document
                        .getElementById('dream-archive-section')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 120);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diario' && (
          <FoodDiaryView
            meals={state.meals}
            profile={state.profile}
            onAddMeal={handleAddMeal}
            onUpdateMeal={handleUpdateMeal}
            onDeleteMeal={handleDeleteMeal}
            getIdToken={getIdToken}
            slowMusicPlaying={musicPlaying && musicTrackId === 'slow_eating'}
            onToggleSlowMusic={() => handleToggleTrackPreset('slow_eating')}
          />
        )}

        {activeTab === 'pnl' && (
          <PnlToolsView
            xp={state.xp}
            activeChallengeId={state.activeChallengeId}
            onSelectChallenge={handleSelectChallenge}
            badges={state.badges}
            checkins={state.checkins}
            wheelAssessments={state.wheelAssessments}
            onSaveWheel={handleSaveWheel}
            measurements={state.measurements}
            weighInDayOfWeek={state.weighInDayOfWeek}
            onAddMeasurement={handleAddMeasurement}
            onUpdateMeasurement={handleUpdateMeasurement}
            onDeleteMeasurement={handleDeleteMeasurement}
            profile={state.profile}
            getIdToken={getIdToken}
            ambientMusicPlaying={musicPlaying}
            onToggleAmbientMusic={handleToggleMusic}
          />
        )}

        {activeTab === 'report' && (
          <ProgressReportView
            state={state}
            onUpdateSos={handleUpdateSos}
            onDeleteSos={handleDeleteSos}
            onAddVisit={handleAddClinicalVisit}
            onUpdateVisit={handleUpdateClinicalVisit}
            onDeleteVisit={handleDeleteClinicalVisit}
          />
        )}
      </main>

      {musicPlaying && !musicDockDismissed && activeTab !== 'oggi' && (
        <AmbientMusicMiniBar
          isPlaying={musicPlaying}
          trackId={musicTrackId}
          customTracks={customMusicTracks}
          volume={musicVolume}
          onTogglePlay={handleToggleMusic}
          onNextTrack={handleNextMusicTrack}
          onChangeVolume={handleChangeMusicVolume}
          onStopAndHide={handleStopAndHideMusic}
        />
      )}

      <SosWaveModal
        isOpen={sosOpen}
        onClose={() => setSosOpen(false)}
        profile={state.profile}
        onSaveProva={handleSaveSosProva}
        calmMusicPlaying={musicPlaying && musicTrackId === 'paracadute_onda'}
        onToggleCalmMusic={() => handleToggleTrackPreset('paracadute_onda')}
      />

      <ProfileSettingsModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={state.profile}
        weighInDayOfWeek={state.weighInDayOfWeek}
        themePreference={themePreference}
        onChangeThemePreference={setThemePreference}
        onSaveProfile={handleSaveProfile}
        onResetDemoData={handleResetDemoData}
      />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const pref = loadInitialThemePreference();
    document.documentElement.classList.toggle('dark', resolveIsDarkTheme(pref));
  }, []);

  return (
    <AuthGate>
      {(user, handleSignOut) => (
        <AuthenticatedCoachApp user={user} onSignOut={handleSignOut} />
      )}
    </AuthGate>
  );
}
