import fs from 'node:fs';
import path from 'node:path';
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
import { createInitialSeedState } from './seedData.ts';
import {
  sanitizeBadges,
  sanitizeChatPayload,
  sanitizeCheckinPayload,
  sanitizeMeasurementPayload,
  sanitizeMealPayload,
  sanitizeSosPayload,
  sanitizeWheelPayload,
  clampNum,
  clampRequiredStr,
} from './firestoreSanitizers.ts';

export const ALLOWED_PERSONAL_EMAIL = 'diceless@gmail.com';

export interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  idToken: string;
}

export type FirestoreRestValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreRestValue> } };

export function toFirestoreValue(val: unknown): FirestoreRestValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreRestValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreRestValue> {
  const fields: Record<string, FirestoreRestValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

export function fromFirestoreValue(val: FirestoreRestValue | undefined): unknown {
  if (!val) return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values ?? []).map((v) => fromFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

export function fromFirestoreDocument(doc: {
  name?: string;
  fields?: Record<string, FirestoreRestValue>;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

let cachedConfig: FirebaseAppletConfig | null = null;

export function getFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as FirebaseAppletConfig;
  cachedConfig = parsed;
  return parsed;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const trimmed = idToken.trim();
  if (!trimmed) {
    throw new Error('Token Firebase mancante.');
  }
  const { apiKey } = getFirebaseAppletConfig();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: trimmed }),
    }
  );
  if (!res.ok) {
    throw new Error('Token Firebase non valido o scaduto.');
  }
  const data = (await res.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
    }>;
  };
  const user = data.users?.[0];
  if (!user?.localId || !user.email) {
    throw new Error('Account Google non verificabile.');
  }
  if (!user.emailVerified || user.email.toLowerCase() !== ALLOWED_PERSONAL_EMAIL) {
    throw new Error('Accesso riservato esclusivamente all’account personale autorizzato.');
  }
  return {
    uid: user.localId,
    email: user.email,
    idToken: trimmed,
  };
}

function getFirestoreBaseUrl(): { base: string; docRootPrefix: string } {
  const { projectId, firestoreDatabaseId } = getFirebaseAppletConfig();
  const dbId = firestoreDatabaseId || '(default)';
  const docRootPrefix = `projects/${projectId}/databases/${dbId}/documents`;
  return {
    base: `https://firestore.googleapis.com/v1/${docRootPrefix}`,
    docRootPrefix,
  };
}

async function listSubcollectionDocs(
  uid: string,
  idToken: string,
  subcollection: string
): Promise<Record<string, unknown>[]> {
  const { base } = getFirestoreBaseUrl();
  const url = `${base}/users/${encodeURIComponent(uid)}:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: subcollection }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ownerUid' },
            op: 'EQUAL',
            value: { stringValue: uid },
          },
        },
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore runQuery ${subcollection} failed: ${res.status} ${errText}`);
  }
  const rows = (await res.json()) as Array<{
    document?: { name?: string; fields?: Record<string, FirestoreRestValue> };
  }>;
  return rows.filter((r) => Boolean(r.document)).map((r) => fromFirestoreDocument(r.document!));
}

export async function fetchCoachStateFromFirestore(
  uid: string,
  idToken: string
): Promise<CoachState> {
  const seed = createInitialSeedState();
  const { base } = getFirestoreBaseUrl();
  const rootRes = await fetch(`${base}/users/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (rootRes.status === 404) {
    return seed;
  }
  if (!rootRes.ok) {
    const text = await rootRes.text();
    throw new Error(`Firestore get root failed: ${rootRes.status} ${text}`);
  }

  const rootDoc = fromFirestoreDocument(
    (await rootRes.json()) as { fields?: Record<string, FirestoreRestValue> }
  );

  const [mealsRaw, sosRaw, checkinsRaw, measRaw, wheelsRaw, visitsRaw, chatRaw] = await Promise.all([
    listSubcollectionDocs(uid, idToken, 'meals'),
    listSubcollectionDocs(uid, idToken, 'sosLogs'),
    listSubcollectionDocs(uid, idToken, 'checkins'),
    listSubcollectionDocs(uid, idToken, 'measurements'),
    listSubcollectionDocs(uid, idToken, 'wheelAssessments'),
    listSubcollectionDocs(uid, idToken, 'clinicalVisits'),
    listSubcollectionDocs(uid, idToken, 'chatMessages'),
  ]);

  const sortByCreated = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const ca = String(a.createdAt ?? '');
    const cb = String(b.createdAt ?? '');
    return ca.localeCompare(cb);
  };

  return {
    profile: (rootDoc.profile as UserProfile) ?? seed.profile,
    xp: typeof rootDoc.xp === 'number' ? rootDoc.xp : seed.xp,
    activeChallengeId:
      typeof rootDoc.activeChallengeId === 'string'
        ? rootDoc.activeChallengeId
        : seed.activeChallengeId,
    weighInDayOfWeek:
      typeof rootDoc.weighInDayOfWeek === 'string'
        ? rootDoc.weighInDayOfWeek
        : seed.weighInDayOfWeek,
    badges: Array.isArray(rootDoc.badges) ? (rootDoc.badges as StanzaBadge[]) : seed.badges,
    meals: (mealsRaw as unknown as MealEntry[]).sort((a, b) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
    ),
    sosLogs: (sosRaw as unknown as SosProvaEntry[]).sort((a, b) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
    ),
    checkins: (checkinsRaw as unknown as DailyCheckin[]).sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
    measurements: (measRaw as unknown as WeightTapeEntry[]).sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
    wheelAssessments: (wheelsRaw as unknown as WheelAssessment[]).sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
    clinicalVisits: (visitsRaw as unknown as ClinicalVisitEntry[]).sort((a, b) =>
      b.date.localeCompare(a.date)
    ),
    chatHistory: (
      chatRaw
        .sort((a, b) => {
          if (a.id === 'msg_welcome' && b.id !== 'msg_welcome') return -1;
          if (b.id === 'msg_welcome' && a.id !== 'msg_welcome') return 1;
          return sortByCreated(a, b);
        }) as unknown as ChatMessage[]
    ).slice(-50),
  };
}

interface CommitWriteOp {
  update?: {
    name: string;
    fields: Record<string, FirestoreRestValue>;
  };
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: Array<{
    fieldPath: string;
    setToServerValue: 'REQUEST_TIME';
  }>;
  currentDocument?: { exists?: boolean };
}

async function commitFirestoreWrites(idToken: string, writes: CommitWriteOp[]): Promise<void> {
  if (writes.length === 0) return;
  const { base } = getFirestoreBaseUrl();
  const res = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore commit failed: ${res.status} ${text}`);
  }
}

export async function appendChatMessagesViaRest(
  uid: string,
  idToken: string,
  messages: ChatMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  const { docRootPrefix } = getFirestoreBaseUrl();
  const writes: CommitWriteOp[] = messages.map((msg) => {
    const payload = sanitizeChatPayload(msg, uid);
    const msgId = String(payload.id);
    return {
      update: {
        name: `${docRootPrefix}/users/${uid}/chatMessages/${msgId}`,
        fields: toFirestoreFields(payload),
      },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ],
      currentDocument: { exists: false },
    };
  });
  await commitFirestoreWrites(idToken, writes);
}

export async function persistVoiceToolMutationToFirestore(
  uid: string,
  idToken: string,
  toolName: string,
  prevState: CoachState,
  nextState: CoachState
): Promise<void> {
  const { docRootPrefix } = getFirestoreBaseUrl();
  const writes: CommitWriteOp[] = [];

  const addRootUpdateIfChanged = () => {
    const rootFields: Record<string, unknown> = {
      xp: clampNum(nextState.xp, 0, 0, 1000000),
      activeChallengeId: clampRequiredStr(nextState.activeChallengeId, 'w1', 32),
      weighInDayOfWeek: clampRequiredStr(nextState.weighInDayOfWeek, 'Lunedì', 32),
      badges: sanitizeBadges(nextState.badges),
    };
    writes.push({
      update: {
        name: `${docRootPrefix}/users/${uid}`,
        fields: toFirestoreFields(rootFields),
      },
      updateMask: {
        fieldPaths: ['xp', 'activeChallengeId', 'weighInDayOfWeek', 'badges'],
      },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true },
    });
  };

  if (toolName === 'log_meal' && nextState.meals.length > prevState.meals.length) {
    const meal = nextState.meals[nextState.meals.length - 1];
    const payload = sanitizeMealPayload(meal, uid);
    writes.push({
      update: {
        name: `${docRootPrefix}/users/${uid}/meals/${String(payload.id)}`,
        fields: toFirestoreFields(payload),
      },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ],
      currentDocument: { exists: false },
    });
    addRootUpdateIfChanged();
  } else if (toolName === 'log_sos_prova' && nextState.sosLogs.length > prevState.sosLogs.length) {
    const sos = nextState.sosLogs[nextState.sosLogs.length - 1];
    const payload = sanitizeSosPayload(sos, uid);
    writes.push({
      update: {
        name: `${docRootPrefix}/users/${uid}/sosLogs/${String(payload.id)}`,
        fields: toFirestoreFields(payload),
      },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ],
      currentDocument: { exists: false },
    });
    addRootUpdateIfChanged();
  } else if (
    toolName === 'log_measurement' &&
    nextState.measurements.length > prevState.measurements.length
  ) {
    const meas = nextState.measurements[nextState.measurements.length - 1];
    const payload = sanitizeMeasurementPayload(meas, uid);
    writes.push({
      update: {
        name: `${docRootPrefix}/users/${uid}/measurements/${String(payload.id)}`,
        fields: toFirestoreFields(payload),
      },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ],
      currentDocument: { exists: false },
    });
    addRootUpdateIfChanged();
  } else if (
    toolName === 'update_wheel_area' &&
    nextState.wheelAssessments.length > prevState.wheelAssessments.length
  ) {
    const wheel = nextState.wheelAssessments[nextState.wheelAssessments.length - 1];
    const payload = sanitizeWheelPayload(wheel, uid);
    writes.push({
      update: {
        name: `${docRootPrefix}/users/${uid}/wheelAssessments/${String(payload.id)}`,
        fields: toFirestoreFields(payload),
      },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ],
      currentDocument: { exists: false },
    });
    addRootUpdateIfChanged();
  } else if (
    toolName === 'log_morning_checkin' ||
    toolName === 'log_afternoon_parachute' ||
    toolName === 'log_evening_closure' ||
    toolName === 'log_hydration'
  ) {
    const changedCheckin = nextState.checkins.find((nextC) => {
      const prevC = prevState.checkins.find((p) => p.id === nextC.id || p.date === nextC.date);
      return JSON.stringify(prevC) !== JSON.stringify(nextC);
    });
    if (changedCheckin) {
      const prevExists = prevState.checkins.some(
        (p) => p.id === changedCheckin.id || p.date === changedCheckin.date
      );
      const payload = sanitizeCheckinPayload(changedCheckin, uid);
      const checkinId = String(payload.id);
      if (prevExists) {
        const updatable: Record<string, unknown> = {};
        const updatableKeys = [
          'sleepHours',
          'sleepQuality',
          'dreamJournal',
          'morningDomandeNotes',
          'kinestheticAnchorDone',
          'movementMinutes',
          'afternoonParachuteDone',
          'afternoonSnackChoice',
          'eveningSuccess',
          'eveningEmotionType',
          'eveningRepairOrCompassion',
          'eveningRitualDone',
          'eveningRitualChoice',
          'hydrationGlasses',
          'hydrationAwayFromMealsDone',
          'hydrationXpAwarded',
        ];
        const fieldPaths: string[] = [];
        for (const k of updatableKeys) {
          if (payload[k] !== undefined) {
            updatable[k] = payload[k];
            fieldPaths.push(k);
          }
        }
        writes.push({
          update: {
            name: `${docRootPrefix}/users/${uid}/checkins/${checkinId}`,
            fields: toFirestoreFields(updatable),
          },
          updateMask: { fieldPaths },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { exists: true },
        });
      } else {
        writes.push({
          update: {
            name: `${docRootPrefix}/users/${uid}/checkins/${checkinId}`,
            fields: toFirestoreFields(payload),
          },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
          currentDocument: { exists: false },
        });
      }
      addRootUpdateIfChanged();
    }
  }

  await commitFirestoreWrites(idToken, writes);
}
