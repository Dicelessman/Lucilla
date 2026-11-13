import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ALLOWED_PERSONAL_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase.ts';
import {
  ChatMessage,
  ClinicalVisitEntry,
  CoachState,
  DailyCheckin,
  MealEntry,
  SosProvaEntry,
  StanzaBadge,
  UserProfile,
  WeightTapeEntry,
  WheelAssessment,
} from '../types/coach.ts';
import { createInitialSeedState, DEFAULT_BADGES } from './seedData.ts';
import {
  clampNum,
  clampRequiredStr,
  sanitizeBadges,
  sanitizeChatPayload,
  sanitizeCheckinPayload,
  sanitizeClinicalVisitPayload,
  sanitizeMeasurementPayload,
  sanitizeMealPayload,
  sanitizeProfile,
  sanitizeSosPayload,
  sanitizeWheelPayload,
  stripUndefined,
} from './firestoreSanitizers.ts';

function extractCreatedMs(data: Record<string, unknown>, id: string): number {
  const created = data.createdAt;
  if (created instanceof Timestamp) {
    return created.toMillis();
  }
  const match = id.match(/(\d{10,})$/);
  return match ? Number(match[1]) : 0;
}

export async function migrateLocalDataToFirestore(
  uid: string,
  email: string,
  idToken: string
): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  let snap;
  try {
    snap = await getDocFromServer(userDocRef);
  } catch (serverErr) {
    const code = (serverErr as { code?: string })?.code ?? '';
    if (code === 'permission-denied') {
      handleFirestoreError(serverErr, OperationType.GET, `users/${uid}`);
    }
    try {
      snap = await getDoc(userDocRef);
    } catch (cacheErr) {
      handleFirestoreError(cacheErr, OperationType.GET, `users/${uid}`);
    }
  }

  if (snap.exists()) {
    return;
  }

  let sourceState: CoachState = createInitialSeedState();
  try {
    const res = await fetch('/api/state', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      const remote = (await res.json()) as CoachState;
      if (remote && remote.profile && Array.isArray(remote.meals)) {
        sourceState = remote;
      }
    }
  } catch {
    // Use seed state as fallback
  }

  // 1. Create root /users/{uid} FIRST because subcollection rules check userRootExists(uid)
  try {
    await setDoc(userDocRef, {
      ownerUid: uid,
      email: (email || ALLOWED_PERSONAL_EMAIL).trim().toLowerCase(),
      xp: clampNum(sourceState.xp, 225, 0, 1000000),
      activeChallengeId: clampRequiredStr(sourceState.activeChallengeId, 'w2', 32),
      weighInDayOfWeek: clampRequiredStr(sourceState.weighInDayOfWeek, 'Lunedì', 32),
      profile: sanitizeProfile(sourceState.profile),
      badges: sanitizeBadges(sourceState.badges),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
  }

  // 2. Collect all subcollection documents into chunked batches (<400 writes each)
  const ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

  for (const meal of sourceState.meals ?? []) {
    const payload = sanitizeMealPayload(meal, uid);
    ops.push({
      ref: doc(db, 'users', uid, 'meals', String(payload.id)),
      data: { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  for (const sos of sourceState.sosLogs ?? []) {
    const payload = sanitizeSosPayload(sos, uid);
    ops.push({
      ref: doc(db, 'users', uid, 'sosLogs', String(payload.id)),
      data: { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  for (const chk of sourceState.checkins ?? []) {
    const payload = sanitizeCheckinPayload(chk, uid);
    ops.push({
      ref: doc(db, 'users', uid, 'checkins', String(payload.id)),
      data: { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  for (const meas of sourceState.measurements ?? []) {
    const payload = sanitizeMeasurementPayload(meas, uid);
    ops.push({
      ref: doc(db, 'users', uid, 'measurements', String(payload.id)),
      data: { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  for (const wheel of sourceState.wheelAssessments ?? []) {
    const payload = sanitizeWheelPayload(wheel, uid);
    ops.push({
      ref: doc(db, 'users', uid, 'wheelAssessments', String(payload.id)),
      data: { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  for (const visit of sourceState.clinicalVisits ?? []) {
    const payload = sanitizeClinicalVisitPayload(visit, uid);
    ops.push({
      ref: doc(db, 'users', uid, 'clinicalVisits', String(payload.id)),
      data: { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  for (const msg of (sourceState.chatHistory ?? []).slice(-50)) {
    const payload = sanitizeChatPayload(msg, uid);
    ops.push({
      ref: doc(db, 'users', uid, 'chatMessages', String(payload.id)),
      data: { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  const CHUNK_SIZE = 350;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(item.ref, item.data);
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/migrationBatch`);
    }
  }
}

export function subscribeToCoachState(
  uid: string,
  onData: (state: CoachState) => void,
  onError: (err: Error) => void
): () => void {
  const seed = createInitialSeedState();
  let currentRoot: {
    profile: UserProfile;
    xp: number;
    activeChallengeId: string;
    weighInDayOfWeek: string;
    badges: StanzaBadge[];
  } | null = null;
  let meals: MealEntry[] = [];
  let sosLogs: SosProvaEntry[] = [];
  let checkins: DailyCheckin[] = [];
  let measurements: WeightTapeEntry[] = [];
  let wheelAssessments: WheelAssessment[] = [];
  let clinicalVisits: ClinicalVisitEntry[] = [];
  let chatHistory: ChatMessage[] = [];

  let rootReady = false;

  const emit = () => {
    if (!rootReady || !currentRoot) return;
    onData({
      profile: currentRoot.profile,
      xp: currentRoot.xp,
      activeChallengeId: currentRoot.activeChallengeId,
      weighInDayOfWeek: currentRoot.weighInDayOfWeek,
      badges: currentRoot.badges,
      meals,
      sosLogs,
      checkins,
      measurements,
      wheelAssessments,
      clinicalVisits,
      chatHistory,
    });
  };

  const unsubRoot = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      currentRoot = {
        profile: (d.profile as UserProfile) ?? seed.profile,
        xp: typeof d.xp === 'number' ? d.xp : seed.xp,
        activeChallengeId:
          typeof d.activeChallengeId === 'string' ? d.activeChallengeId : seed.activeChallengeId,
        weighInDayOfWeek:
          typeof d.weighInDayOfWeek === 'string' ? d.weighInDayOfWeek : seed.weighInDayOfWeek,
        badges: Array.isArray(d.badges) ? (d.badges as StanzaBadge[]) : seed.badges,
      };
      rootReady = true;
      emit();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const subCol = <T>(
    subName: string,
    mapper: (items: Array<{ raw: Record<string, unknown>; id: string }>) => T[],
    assign: (items: T[]) => void
  ) =>
    onSnapshot(
      query(collection(db, 'users', uid, subName), where('ownerUid', '==', uid)),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          raw: d.data() as Record<string, unknown>,
          id: d.id,
        }));
        assign(mapper(rows));
        emit();
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `users/${uid}/${subName}`);
        } catch (wrapped) {
          onError(wrapped as Error);
        }
      }
    );

  const unsubMeals = subCol<MealEntry>(
    'meals',
    (rows) =>
      rows
        .map((r) => r.raw as unknown as MealEntry)
        .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)),
    (items) => {
      meals = items;
    }
  );

  const unsubSos = subCol<SosProvaEntry>(
    'sosLogs',
    (rows) =>
      rows
        .map((r) => r.raw as unknown as SosProvaEntry)
        .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)),
    (items) => {
      sosLogs = items;
    }
  );

  const unsubCheckins = subCol<DailyCheckin>(
    'checkins',
    (rows) =>
      rows
        .map((r) => r.raw as unknown as DailyCheckin)
        .sort((a, b) => a.date.localeCompare(b.date)),
    (items) => {
      checkins = items;
    }
  );

  const unsubMeas = subCol<WeightTapeEntry>(
    'measurements',
    (rows) =>
      rows
        .sort((a, b) => {
          const dCmp = String(a.raw.date ?? '').localeCompare(String(b.raw.date ?? ''));
          return dCmp !== 0 ? dCmp : extractCreatedMs(a.raw, a.id) - extractCreatedMs(b.raw, b.id);
        })
        .map((r) => r.raw as unknown as WeightTapeEntry),
    (items) => {
      measurements = items;
    }
  );

  const unsubWheels = subCol<WheelAssessment>(
    'wheelAssessments',
    (rows) =>
      rows
        .sort((a, b) => {
          const dCmp = String(a.raw.date ?? '').localeCompare(String(b.raw.date ?? ''));
          return dCmp !== 0 ? dCmp : extractCreatedMs(a.raw, a.id) - extractCreatedMs(b.raw, b.id);
        })
        .map((r) => r.raw as unknown as WheelAssessment),
    (items) => {
      wheelAssessments = items;
    }
  );

  const unsubVisits = subCol<ClinicalVisitEntry>(
    'clinicalVisits',
    (rows) =>
      rows
        .sort((a, b) => String(b.raw.date ?? '').localeCompare(String(a.raw.date ?? '')))
        .map((r) => r.raw as unknown as ClinicalVisitEntry),
    (items) => {
      clinicalVisits = items;
    }
  );

  const unsubChat = subCol<ChatMessage>(
    'chatMessages',
    (rows) =>
      rows
        .sort((a, b) => {
          if (a.id === 'msg_welcome' && b.id !== 'msg_welcome') return -1;
          if (b.id === 'msg_welcome' && a.id !== 'msg_welcome') return 1;
          return extractCreatedMs(a.raw, a.id) - extractCreatedMs(b.raw, b.id);
        })
        .map((r) => r.raw as unknown as ChatMessage)
        .slice(-50),
    (items) => {
      chatHistory = items;
    }
  );

  return () => {
    unsubRoot();
    unsubMeals();
    unsubSos();
    unsubCheckins();
    unsubMeas();
    unsubWheels();
    unsubVisits();
    unsubChat();
  };
}

export async function updateUserRootInFirestore(
  uid: string,
  updates: {
    xp?: number;
    activeChallengeId?: string;
    weighInDayOfWeek?: string;
    badges?: StanzaBadge[];
    profile?: UserProfile;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.xp !== undefined) payload.xp = clampNum(updates.xp, 0, 0, 1000000);
  if (updates.activeChallengeId !== undefined) {
    payload.activeChallengeId = clampRequiredStr(updates.activeChallengeId, 'w1', 32);
  }
  if (updates.weighInDayOfWeek !== undefined) {
    payload.weighInDayOfWeek = clampRequiredStr(updates.weighInDayOfWeek, 'Lunedì', 32);
  }
  if (updates.badges !== undefined) {
    payload.badges = sanitizeBadges(updates.badges);
  }
  if (updates.profile !== undefined) {
    payload.profile = sanitizeProfile(updates.profile);
  }

  try {
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function saveMealToFirestore(
  uid: string,
  meal: MealEntry,
  nextXp: number,
  nextBadges: StanzaBadge[]
): Promise<void> {
  const payload = sanitizeMealPayload(meal, uid);
  const mealId = String(payload.id);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'meals', mealId), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', uid), {
    xp: clampNum(nextXp, 0, 0, 1000000),
    badges: sanitizeBadges(nextBadges),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/meals/${mealId}`);
  }
}

export async function saveSosToFirestore(
  uid: string,
  entry: SosProvaEntry,
  nextXp: number,
  nextBadges: StanzaBadge[]
): Promise<void> {
  const payload = sanitizeSosPayload(entry, uid);
  const sosId = String(payload.id);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'sosLogs', sosId), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', uid), {
    xp: clampNum(nextXp, 0, 0, 1000000),
    badges: sanitizeBadges(nextBadges),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/sosLogs/${sosId}`);
  }
}

export async function upsertCheckinToFirestore(
  uid: string,
  checkin: DailyCheckin,
  nextXp: number,
  nextBadges: StanzaBadge[]
): Promise<void> {
  const payload = sanitizeCheckinPayload(checkin, uid);
  const checkinId = String(payload.id);
  const checkinRef = doc(db, 'users', uid, 'checkins', checkinId);
  let exists = false;
  try {
    const snap = await getDoc(checkinRef);
    exists = snap.exists();
  } catch {
    exists = false;
  }

  const batch = writeBatch(db);
  if (exists) {
    const updatable = stripUndefined({
      sleepHours: payload.sleepHours,
      sleepQuality: payload.sleepQuality,
      dreamJournal: payload.dreamJournal,
      morningDomandeNotes: payload.morningDomandeNotes,
      kinestheticAnchorDone: payload.kinestheticAnchorDone,
      movementMinutes: payload.movementMinutes,
      afternoonParachuteDone: payload.afternoonParachuteDone,
      afternoonSnackChoice: payload.afternoonSnackChoice,
      eveningSuccess: payload.eveningSuccess,
      eveningEmotionType: payload.eveningEmotionType,
      eveningRepairOrCompassion: payload.eveningRepairOrCompassion,
      eveningRitualDone: payload.eveningRitualDone,
      eveningRitualChoice: payload.eveningRitualChoice,
      hydrationGlasses: payload.hydrationGlasses,
      hydrationAwayFromMealsDone: payload.hydrationAwayFromMealsDone,
      hydrationXpAwarded: payload.hydrationXpAwarded,
      updatedAt: serverTimestamp(),
    });
    batch.update(checkinRef, updatable);
  } else {
    batch.set(checkinRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.update(doc(db, 'users', uid), {
    xp: clampNum(nextXp, 0, 0, 1000000),
    badges: sanitizeBadges(nextBadges),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/checkins/${checkinId}`);
  }
}

export async function saveMeasurementToFirestore(
  uid: string,
  entry: WeightTapeEntry,
  nextXp: number
): Promise<void> {
  const payload = sanitizeMeasurementPayload(entry, uid);
  const measId = String(payload.id);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'measurements', measId), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', uid), {
    xp: clampNum(nextXp, 0, 0, 1000000),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/measurements/${measId}`);
  }
}

export async function saveWheelToFirestore(
  uid: string,
  assessment: WheelAssessment,
  nextXp: number
): Promise<void> {
  const payload = sanitizeWheelPayload(assessment, uid);
  const wheelId = String(payload.id);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'wheelAssessments', wheelId), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', uid), {
    xp: clampNum(nextXp, 0, 0, 1000000),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/wheelAssessments/${wheelId}`);
  }
}

export async function appendChatMessagesToFirestore(
  uid: string,
  messages: ChatMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  const batch = writeBatch(db);
  for (const msg of messages) {
    const payload = sanitizeChatPayload(msg, uid);
    const msgId = String(payload.id);
    batch.set(doc(db, 'users', uid, 'chatMessages', msgId), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/chatMessages`);
  }
}

export async function updateMealInFirestore(uid: string, meal: MealEntry): Promise<void> {
  const payload = sanitizeMealPayload(meal, uid);
  const mealId = String(payload.id);
  const updatable = stripUndefined({
    date: payload.date,
    time: payload.time,
    slot: payload.slot,
    description: payload.description,
    proteinCategory: payload.proteinCategory,
    hasVegetables: payload.hasVegetables,
    preHungerScale: payload.preHungerScale,
    postSatietyScale: payload.postSatietyScale,
    perceivedEnergy: payload.perceivedEnergy,
    slowEatingUsed: payload.slowEatingUsed,
    slowMotionSecondsUsed: payload.slowMotionSecondsUsed,
    leftABite: payload.leftABite,
    symptomsReported: payload.symptomsReported,
    notes: payload.notes,
    updatedAt: serverTimestamp(),
  });
  try {
    await updateDoc(doc(db, 'users', uid, 'meals', mealId), updatable);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/meals/${mealId}`);
  }
}

export async function deleteMealFromFirestore(uid: string, mealId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'meals', mealId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/meals/${mealId}`);
  }
}

export async function updateSosInFirestore(uid: string, entry: SosProvaEntry): Promise<void> {
  const payload = sanitizeSosPayload(entry, uid);
  const sosId = String(payload.id);
  const updatable = stripUndefined({
    date: payload.date,
    time: payload.time,
    situation: payload.situation,
    bodyZone: payload.bodyZone,
    emotionName: payload.emotionName,
    intensityLevel: payload.intensityLevel,
    hungerType: payload.hungerType,
    realNeed: payload.realNeed,
    strategyUsed: payload.strategyUsed,
    waitedMinutes: payload.waitedMinutes,
    outcome: payload.outcome,
    xpEarned: payload.xpEarned,
    notes: payload.notes,
    updatedAt: serverTimestamp(),
  });
  try {
    await updateDoc(doc(db, 'users', uid, 'sosLogs', sosId), updatable);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/sosLogs/${sosId}`);
  }
}

export async function deleteSosFromFirestore(uid: string, sosId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'sosLogs', sosId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/sosLogs/${sosId}`);
  }
}

export async function updateMeasurementInFirestore(
  uid: string,
  entry: WeightTapeEntry
): Promise<void> {
  const payload = sanitizeMeasurementPayload(entry, uid);
  const measId = String(payload.id);
  const updatable = stripUndefined({
    date: payload.date,
    weightKg: payload.weightKg,
    umbilicalCm: payload.umbilicalCm,
    hipsCm: payload.hipsCm,
    chestCm: payload.chestCm,
    advisorNote: payload.advisorNote,
    updatedAt: serverTimestamp(),
  });
  try {
    await updateDoc(doc(db, 'users', uid, 'measurements', measId), updatable);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/measurements/${measId}`);
  }
}

export async function deleteMeasurementFromFirestore(
  uid: string,
  measId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'measurements', measId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/measurements/${measId}`);
  }
}

export async function saveClinicalVisitToFirestore(
  uid: string,
  visit: ClinicalVisitEntry
): Promise<void> {
  const payload = sanitizeClinicalVisitPayload(visit, uid);
  const visitId = String(payload.id);
  try {
    await setDoc(doc(db, 'users', uid, 'clinicalVisits', visitId), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/clinicalVisits/${visitId}`);
  }
}

export async function updateClinicalVisitInFirestore(
  uid: string,
  visit: ClinicalVisitEntry
): Promise<void> {
  const payload = sanitizeClinicalVisitPayload(visit, uid);
  const visitId = String(payload.id);
  const updatable = stripUndefined({
    date: payload.date,
    clinicianName: payload.clinicianName,
    weightAtVisitKg: payload.weightAtVisitKg,
    summaryNotes: payload.summaryNotes,
    nextFocus: payload.nextFocus,
    nextVisitDate: payload.nextVisitDate,
    updatedAt: serverTimestamp(),
  });
  try {
    await updateDoc(doc(db, 'users', uid, 'clinicalVisits', visitId), updatable);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/clinicalVisits/${visitId}`);
  }
}

export async function deleteClinicalVisitFromFirestore(
  uid: string,
  visitId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'clinicalVisits', visitId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/clinicalVisits/${visitId}`);
  }
}

export async function resetToCleanStartInFirestore(
  uid: string,
  freshWelcomeMsg: ChatMessage,
  baselineMeasurement?: WeightTapeEntry
): Promise<void> {
  const subcollections = [
    'meals',
    'sosLogs',
    'checkins',
    'measurements',
    'wheelAssessments',
    'clinicalVisits',
    'chatMessages',
  ];

  const refsToDelete: Array<ReturnType<typeof doc>> = [];
  for (const sub of subcollections) {
    try {
      const snap = await getDocs(
        query(collection(db, 'users', uid, sub), where('ownerUid', '==', uid))
      );
      for (const d of snap.docs) {
        refsToDelete.push(d.ref);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `users/${uid}/${sub}`);
    }
  }

  const CHUNK_SIZE = 350;
  for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const ref of refsToDelete.slice(i, i + CHUNK_SIZE)) {
      batch.delete(ref);
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}/resetBatch`);
    }
  }

  const cleanBadges: StanzaBadge[] = DEFAULT_BADGES.map((b) => ({
    id: b.id,
    stanza: b.stanza,
    title: b.title,
    description: b.description,
  }));

  const finalBatch = writeBatch(db);
  finalBatch.update(doc(db, 'users', uid), {
    xp: 0,
    activeChallengeId: 'w1',
    badges: sanitizeBadges(cleanBadges),
    updatedAt: serverTimestamp(),
  });

  const welcomePayload = sanitizeChatPayload(freshWelcomeMsg, uid);
  finalBatch.set(doc(db, 'users', uid, 'chatMessages', String(welcomePayload.id)), {
    ...welcomePayload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (baselineMeasurement) {
    const measPayload = sanitizeMeasurementPayload(baselineMeasurement, uid);
    finalBatch.set(doc(db, 'users', uid, 'measurements', String(measPayload.id)), {
      ...measPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await finalBatch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/resetFinalize`);
  }
}
