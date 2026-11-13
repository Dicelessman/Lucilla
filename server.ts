import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  Behavior,
  FunctionDeclaration,
  FunctionResponseScheduling,
  GoogleGenAI,
  InteractionStatus,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';
import { ChatAction, CoachState, ProteinCategory, QuickMealIdea } from './src/types/coach.ts';
import {
  buildDeterministicDreamInsight,
  buildDeterministicQuickMealIdeas,
  buildPnlAudioScriptText,
  PnlAudioScriptId,
} from './src/utils/insightsAndPlanner.ts';
import {
  calculateWeeklyProteinCounts,
  detectCommand,
  detectRedFlags,
  detectSlipUpPhrase,
  detectSosPhrase,
  getLearningStage,
  isSunday,
  NO_SAME_DAY_REPEAT_CATEGORIES,
} from './src/utils/bariclipRules.ts';
import { createInitialSeedState, WEEKLY_CHALLENGES } from './src/utils/seedData.ts';
import { executeVoiceTool } from './src/utils/voiceActions.ts';
import {
  appendChatMessagesViaRest,
  fetchCoachStateFromFirestore,
  persistVoiceToolMutationToFirestore,
  VerifiedFirebaseUser,
  verifyFirebaseIdToken,
} from './src/utils/serverFirebase.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'coach-state.json');

async function readLegacyLocalStateIfExists(): Promise<CoachState> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as CoachState;
    if (parsed && parsed.profile && Array.isArray(parsed.meals)) {
      return parsed;
    }
  } catch {
    // ignore missing local file
  }
  return createInitialSeedState();
}

function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

async function requireVerifiedUser(req: express.Request): Promise<VerifiedFirebaseUser> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new Error('Autenticazione richiesta.');
  }
  return verifyFirebaseIdToken(token);
}

function makeUniqueMsgId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function buildLucillaSystemInstruction(state: CoachState, today: string, isVoiceMode = false): string {
  const counts = calculateWeeklyProteinCounts(state.meals, today);
  const countsText = counts.map((c) => `${c.label}: ${c.current}/${c.target}`).join(' | ');
  const todayCheckin = state.checkins.find((c) => c.date === today);
  const stage = getLearningStage(state.xp);
  const challenge =
    WEEKLY_CHALLENGES.find((w) => w.id === state.activeChallengeId) ?? WEEKLY_CHALLENGES[0];

  return `Sei Lucilla, il coach quotidiano empatico, maieutico e gamificato di Davide Rossi per la gestione delle abitudini emotive e alimentari.
Fondi il Protocollo Clinico-Psicologico e Nutrizionale della Dott.ssa Elida Bardho con il Metodo "Giusto Peso Per Sempre" e la PNL Applicata di Debora Conti.

PROFILO DI DAVIDE ROSSI:
- Altezza: 184 cm. Intervento Bariclip (09/03/2022). Peso intervento: 141 kg (BMI 41.6), peso minimo: 104 kg, baseline piano: 126 kg (BMI 37.2).
- Obiettivo formulato in positivo: "${state.profile.positiveGoal}"
- Clinico di riferimento: ${state.profile.clinicianName} (${state.profile.clinicianPhone} — ${state.profile.clinicianEmail}).
- Stadio attuale apprendimento PNL: ${stage.title} (${state.xp} XP).
- Sfida settimanale attiva: ${challenge.title} — ${challenge.description}
- Frequenze proteiche Bariclip questa settimana: ${countsText}
- Check-in di oggi (${today}): ${
    todayCheckin
      ? `Sonno ${todayCheckin.sleepHours ?? 'non registrato'}h; Paracadute 17:30 ${
          todayCheckin.afternoonParachuteDone ? 'fatto' : 'da fare'
        }.`
      : 'Non ancora compilato oggi.'
  }

4 REGOLE DI IGIENE LINGUISTICA PNL OBBLIGATORIE (APPLICALE IN OGNI SINGOLA FRASE):
1. RIFORMULAZIONE TEMPORALE: Quando Davide parla di vecchie abitudini disfunzionali ("mi abbuffo", "mangio in fretta", "non riesco"), rispondi coniugandole al PASSATO ("Fino a ieri mangiavi in fretta, oggi stai allenando un ritmo nuovo").
2. ZERO NEGAZIONI E ZERO PAROLONI: La mente inconscia non elabora il "non" (effetto giraffa viola). Evita frasi come "non mangiare dolci", "non abbuffarti", "non devi" e parole melodrammatiche ("tragedia, guerra, angoscia, schifo"). Usa esclusivamente direzioni POSITIVE ("puoi scegliere un'alternativa che ti fa stare bene") e definizioni neutre ("quella vecchia abitudine", "quell'onda emotiva").
3. DAL "DEVO" AL "VOGLIO": Sostituisci ogni dovere imposto con desiderio, scelta e vantaggio immediato ("Cosa vuoi regalarti adesso?", "Quale cura semplice scegli per sentirti leggero?").
4. DOMANDE UTILI A GRAPPOLO: Guida Davide con 1-2 domande esplorative orientate alla soluzione (Cosa/Come/Quando + Posso/Voglio).

PROTOCOLLI CLINICI:
- Se Davide segnala vomito, rigurgito, bruciore o difficoltà a mandar giù (disfagia), suggerisci subito di ridurre i volumi dei bocconi, masticare molto lentamente posando la forchetta tra un boccone e l'altro e contattare la Dott.ssa Elida Bardho (Cell. 335/6898371 — elibardho@gmail.com).
- Se esprime pensiero "tutto o niente" ("ho rovinato tutto", "ho fallito"), applica il reframing della "scivolata utile": un episodio è informazione, mai fallimento, e il pasto successivo riparte regolarmente con costanza e autocompassione.
- Distingui colpa (comportamento riparabile) da vergogna (giudizio sull'identità che porta a nascondersi).
- Ricorda che Davide ama soluzioni pratiche (matè caldo, attività manuali, camminate/scout) invece di timer rigidi che possono mettergli ansia.
${
  isVoiceMode
    ? `- MODALITÀ VOCALE LIVE ATTIVA: Parla in italiano naturale, caldo e colloquiale, con turni brevi (2-4 frasi). Quando Davide ti racconta un pasto, le ore di sonno, un sogno, uno spuntino, un'onda SOS, una pesata o vuole aprire una sezione dell'app (es. Ruota della Vita, Diario, Report Bardho), chiama subito lo strumento (tool) corrispondente per salvare i dati nel suo diario mentre continuate a parlare.`
    : '- Rispondi in italiano naturale, caldo, conciso (massimo 120-160 parole) e rispettoso.'
}`;
}

const LIVE_VOICE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'log_meal',
    description:
      'Registra un pasto nel Diario Alimentare di Davide verificando le regole Bariclip (ripetizioni giornaliere, alimenti da evitare, red flag fisiche, sazietà 10->0).',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        slot: {
          type: Type.STRING,
          description: 'Uno tra: colazione, pranzo, spuntino_1730, cena',
        },
        description: {
          type: Type.STRING,
          description: 'Descrizione di ciò che Davide ha mangiato',
        },
        proteinCategory: {
          type: Type.STRING,
          description:
            'Uno tra: carne_bianca, carne_rossa, pesce, tonno_salmone, uova, formaggio, legumi, tofu_seitan, affettato, primo, pasto_libero, nessuno',
        },
        hasVegetables: { type: Type.BOOLEAN },
        preHungerScale: { type: Type.NUMBER, description: 'Scala 10->0 prima del pasto (target 8-9)' },
        postSatietyScale: { type: Type.NUMBER, description: 'Scala 10->0 a fine pasto (target 5-6)' },
        slowEatingUsed: { type: Type.BOOLEAN },
        leftABite: { type: Type.BOOLEAN },
        symptomsReported: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Eventuali sintomi come vomito, rigurgito, bruciore, difficoltà a mandar giù',
        },
      },
      required: ['slot', 'description', 'proteinCategory'],
    },
  },
  {
    name: 'log_morning_checkin',
    description:
      'Registra il check-in mattutino: ore di sonno, qualità, Diario dei Sogni, pensieri guida, Ancora Cinestesica e minuti di movimento.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        sleepHours: { type: Type.NUMBER },
        sleepQuality: { type: Type.NUMBER, description: 'Da 1 a 5' },
        dreamJournal: { type: Type.STRING, description: 'Testo libero del sogno raccontato' },
        morningDomandeNotes: { type: Type.STRING },
        kinestheticAnchorDone: { type: Type.BOOLEAN },
        movementMinutes: { type: Type.NUMBER },
        hydrationGlasses: { type: Type.NUMBER },
        hydrationAwayFromMealsDone: { type: Type.BOOLEAN },
      },
    },
  },
  {
    name: 'log_hydration',
    description:
      'Registra i bicchieri di acqua bevuti oggi lontano dai pasti secondo il protocollo Bariclip.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        addGlasses: { type: Type.NUMBER, description: 'Numero bicchieri da aggiungere (es. 1 o 2)' },
        hydrationGlasses: { type: Type.NUMBER, description: 'Totale esplicito bicchieri di oggi' },
        hydrationAwayFromMealsDone: {
          type: Type.BOOLEAN,
          description: 'Conferma che l’acqua è bevuta lontano dai pasti (almeno 30 min prima/dopo)',
        },
      },
    },
  },
  {
    name: 'log_afternoon_parachute',
    description: 'Registra lo spuntino paracadute delle 17:30 per proteggere la fascia 18:00-20:00.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        done: { type: Type.BOOLEAN },
        snackChoice: { type: Type.STRING },
      },
    },
  },
  {
    name: 'log_evening_closure',
    description:
      'Registra la chiusura serale: un piccolo successo di oggi, riflessione su colpa o vergogna, e rituale di chiusura cucina.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        eveningSuccess: { type: Type.STRING },
        eveningEmotionType: { type: Type.STRING, description: 'nessuna, colpa, oppure vergogna' },
        eveningRepairOrCompassion: { type: Type.STRING },
        eveningRitualDone: { type: Type.BOOLEAN },
        eveningRitualChoice: { type: Type.STRING },
      },
    },
  },
  {
    name: 'log_sos_prova',
    description:
      'Salva un episodio SOS o onda emotiva nel Registro delle Prove per la Dott.ssa Bardho assegnando XP.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        situation: { type: Type.STRING },
        bodyZone: { type: Type.STRING, description: 'stomaco, petto, mani, mascella, testa, gola' },
        emotionName: { type: Type.STRING },
        intensityLevel: { type: Type.NUMBER, description: 'Da 1 a 5' },
        hungerType: { type: Type.STRING, description: 'fisica, emotiva, abitudine' },
        realNeed: { type: Type.STRING, description: 'riposo, coccola, premio, compagnia, distrazione, chiarezza' },
        strategyUsed: { type: Type.STRING },
        waitedMinutes: { type: Type.NUMBER },
        outcome: {
          type: Type.STRING,
          description: 'onda_surfata, scelta_consapevole, mangiato_con_presenza, mangiato_di_corsa',
        },
        notes: { type: Type.STRING },
      },
      required: ['situation', 'emotionName', 'intensityLevel', 'outcome'],
    },
  },
  {
    name: 'log_measurement',
    description: 'Registra la pesata settimanale e le misure del metro da sarta (ombelico, fianchi, torace).',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        weightKg: { type: Type.NUMBER },
        umbilicalCm: { type: Type.NUMBER },
        hipsCm: { type: Type.NUMBER },
        chestCm: { type: Type.NUMBER },
        advisorNote: { type: Type.STRING },
      },
      required: ['weightKg'],
    },
  },
  {
    name: 'update_wheel_area',
    description: 'Aggiorna un punteggio Stato Attuale (sa) o Desiderato (sd) della Ruota della Vita.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        areaId: {
          type: Type.STRING,
          description:
            'lavoro, famiglia_attuale, famiglia_origine, coppia, salute_fisica, salute_mentale, tempo_libero, crescita, amici',
        },
        sa: { type: Type.NUMBER, description: 'Stato Attuale 1-10' },
        sd: { type: Type.NUMBER, description: 'Stato Desiderato 1-10' },
        focusAreaId: { type: Type.STRING },
        firstMicroStep: { type: Type.STRING },
      },
      required: ['areaId'],
    },
  },
  {
    name: 'navigate_or_open_tool',
    description:
      'Apre una scheda dell’app o uno strumento interattivo sullo schermo mentre parli con Davide.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab: { type: Type.STRING, description: 'oggi, diario, pnl, report' },
        openSosModal: { type: Type.BOOLEAN },
        openRadioBorbottona: { type: Type.BOOLEAN },
      },
    },
  },
  {
    name: 'get_current_progress',
    description:
      'Legge lo stato aggiornato di peso, XP, stadio PNL, frequenze proteiche settimanali e onde surfate.',
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

function buildFallbackReply(
  message: string,
  command: '/sos' | '/ruota' | '/report_bardho' | null,
  redFlags: string[],
  slipUp: boolean,
  sosTriggered: boolean
): string {
  if (redFlags.length > 0) {
    return `Grazie per avermi segnalato subito questo segnale del corpo (${redFlags.join(
      ', '
    )}). Con il Bariclip il corpo ti sta chiedendo più spazio e lentezza: nei prossimi pasti puoi ridurre le porzioni, masticare molto lentamente appoggiando la forchetta tra un boccone e l'altro e contattare la Dott.ssa Elida Bardho al 335/6898371 (elibardho@gmail.com) per confrontarvi insieme. Come ti senti in questo momento?`;
  }
  if (command === '/sos' || sosTriggered) {
    return `Eccoci insieme Davide, fermiamoci un respiro. Fino a ieri quell'impulso ti guidava in automatico, oggi stai già scegliendo di osservarlo. Dove senti questa sensazione nel corpo in questo momento — nello stomaco, nel petto, nella mascella o nelle mani? E che nome ha quell'emozione lì da 1 a 5?`;
  }
  if (command === '/ruota') {
    return `Apriamo la tua Ruota della Vita su tutte e 9 le aree! Guardare con curiosità lo Stato Attuale rispetto allo Stato Desiderato ci aiuta a capire quale piccolo passo piacevole vuoi regalarti questa settimana. Quale area ti attira di più oggi?`;
  }
  if (command === '/report_bardho') {
    return `Ho preparato il tuo Registro delle Prove e il riepilogo clinico aggiornato per la Dott.ssa Bardho. Ogni pagina compilata con sincerità è coraggio e consapevolezza. Vuoi rivederlo o esportarlo ora?`;
  }
  if (slipUp) {
    return `Fermiamoci un istante con gentilezza: quello che fino a ieri vedevi come un passo falso, oggi è una scivolata utile ricca di informazioni. Un episodio solo resta un episodio, e il tuo percorso prosegue sereno già dal prossimo pasto regolare. Cosa vuoi regalarti adesso di semplice e confortevole per chiudere con calma questo momento?`;
  }
  return `Ti ascolto con piacere, Davide. Oggi stai allenando il tuo ritmo da persona Magra Naturalmente in progress: cosa puoi scegliere di semplice e piacevole nelle prossime ore per sentirti leggero e padrone della tua giornata?`;
}

function safeSendWs(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Protected one-time migration export of prior local JSON state
  app.get('/api/state', async (req, res) => {
    try {
      await requireVerifiedUser(req);
    } catch (authErr) {
      return res.status(401).json({
        error: authErr instanceof Error ? authErr.message : 'Accesso non autorizzato.',
      });
    }
    try {
      const state = await readLegacyLocalStateIfExists();
      res.json(state);
    } catch (err) {
      console.error('GET /api/state error:', err);
      res.status(500).json({ error: 'Impossibile caricare lo stato iniziale.' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    let verifiedUser: VerifiedFirebaseUser;
    try {
      verifiedUser = await requireVerifiedUser(req);
    } catch (authErr) {
      return res.status(401).json({
        error: authErr instanceof Error ? authErr.message : 'Accesso non autorizzato.',
      });
    }

    try {
      const { message } = req.body as { message?: string };
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Messaggio vuoto.' });
      }

      const state = await fetchCoachStateFromFirestore(verifiedUser.uid, verifiedUser.idToken);
      const today = new Date().toISOString().slice(0, 10);
      const command = detectCommand(message);
      const redFlags = detectRedFlags(message);
      const slipUp = detectSlipUpPhrase(message);
      const sosTriggered = detectSosPhrase(message) || command === '/sos';

      const actions: ChatAction[] = [];
      if (sosTriggered) {
        actions.push({ type: 'open_sos', label: 'Avvia Protocollo SOS (4 Step)' });
        actions.push({ type: 'radio_borbottona', label: 'Gioca con Radio Borbottona' });
      }
      if (command === '/ruota') {
        actions.push({ type: 'open_ruota', label: 'Apri Ruota della Vita' });
      }
      if (command === '/report_bardho') {
        actions.push({ type: 'open_report', label: 'Apri Report Dott.ssa Bardho' });
      }
      if (slipUp) {
        actions.push({ type: 'open_diary', label: 'Pianifica Prossimo Pasto Regolare' });
      }

      let replyText = '';
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          });
          const recentHistory = state.chatHistory
            .slice(-6)
            .map((m) => `${m.role === 'user' ? 'Davide' : 'Lucilla'}: ${m.content}`)
            .join('\n');

          const prompt = `${recentHistory ? `Conversazione recente:\n${recentHistory}\n\n` : ''}Messaggio attuale di Davide: "${message}"
${command ? `\nComando rapido attivato: ${command}` : ''}
${
  redFlags.length > 0
    ? `\nATTENZIONE CLINICA BARICLIP RILEVATA: ${redFlags.join(', ')}. Applica immediatamente il protocollo red flag.`
    : ''
}
${
  slipUp
    ? `\nSCIVOLONE / PENSIERO TUTTO-O-NIENTE RILEVATO: Trasforma con dolcezza in "scivolata utile", nessuna vergogna, prossimo pasto regolare.`
    : ''
}
${
  sosTriggered
    ? `\nPROTOCOLLO SOS SURFARE L'ONDA ATTIVATO: Accompagna Davide nel nominare e localizzare nel corpo l'emozione e scegliere tra respiro, attività manuale, matè caldo o pausa consapevole.`
    : ''
}`;

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              systemInstruction: buildLucillaSystemInstruction(state, today, false),
            },
          });

          if (response.text && response.text.trim()) {
            replyText = response.text.trim();
          }
        } catch (aiError) {
          console.error('Gemini API error, using rule-based NLP fallback:', aiError);
        }
      }

      if (!replyText) {
        replyText = buildFallbackReply(message, command, redFlags, slipUp, sosTriggered);
      }

      const nowTime = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const userMsg = {
        id: makeUniqueMsgId('u'),
        role: 'user' as const,
        content: message.trim(),
        timestamp: nowTime,
        commandTriggered: command ?? undefined,
      };

      const assistantMsg = {
        id: makeUniqueMsgId('a'),
        role: 'assistant' as const,
        content: replyText,
        timestamp: nowTime,
        commandTriggered: command ?? undefined,
        redFlagTriggered: redFlags.length > 0,
        slipUpReframed: slipUp,
        actions: actions.length > 0 ? actions : undefined,
      };

      await appendChatMessagesViaRest(verifiedUser.uid, verifiedUser.idToken, [
        userMsg,
        assistantMsg,
      ]);

      res.json({
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        command,
        redFlags,
        slipUp,
        sosTriggered,
      });
    } catch (err) {
      console.error('POST /api/chat error:', err);
      res.status(500).json({ error: 'Errore nella risposta di Lucilla.' });
    }
  });

  const VALID_PROTEIN_CATEGORIES: ProteinCategory[] = [
    'carne_bianca',
    'carne_rossa',
    'pesce',
    'tonno_salmone',
    'uova',
    'formaggio',
    'legumi',
    'tofu_seitan',
    'affettato',
    'primo',
    'pasto_libero',
    'nessuno',
  ];

  app.post('/api/analyze-meal-photo', async (req, res) => {
    try {
      await requireVerifiedUser(req);
    } catch (authErr) {
      return res.status(401).json({
        error: authErr instanceof Error ? authErr.message : 'Accesso non autorizzato.',
      });
    }

    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Immagine mancante.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(503).json({
          error: 'Chiave GEMINI_API_KEY non configurata sul server per l’analisi foto.',
        });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      const safeMime =
        mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: cleanBase64,
              },
            },
            {
              text: `Analizza questa foto del piatto per il Diario Alimentare Bariclip (Protocollo Dott.ssa Bardho).
Descrivi in italiano gli alimenti visibili con stima pratica della porzione, classifica la fonte proteica principale in una delle categorie consentite (carne_bianca, carne_rossa, pesce, tonno_salmone, uova, formaggio, legumi, tofu_seitan, affettato, primo, pasto_libero, nessuno), indica se sono presenti verdure, segnala eventuali elementi da moderare secondo il piano (es. fritti, salse pesanti, dolci, alcol, gassate) senza tono giudicante, e aggiungi un breve consiglio Bariclip positivo e pratico sulle porzioni o sulla masticazione lenta (es. appoggiare la forchetta tra un boccone e l'altro). Zero negazioni dure, tono caldo ed empatico.`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: 'Descrizione sintetica in italiano del piatto e stima porzioni.',
              },
              proteinCategory: {
                type: Type.STRING,
                description:
                  'Esattamente una tra: carne_bianca, carne_rossa, pesce, tonno_salmone, uova, formaggio, legumi, tofu_seitan, affettato, primo, pasto_libero, nessuno',
              },
              hasVegetables: {
                type: Type.BOOLEAN,
              },
              avoidItemsWarning: {
                type: Type.STRING,
                description:
                  'Eventuale nota gentile su fritti/zuccheri/alcol se visibili, oppure stringa vuota.',
              },
              bariclipPortionNote: {
                type: Type.STRING,
                description:
                  'Consiglio breve post-Bariclip su bocconi piccoli e Slow Eating.',
              },
            },
            required: [
              'description',
              'proteinCategory',
              'hasVegetables',
              'avoidItemsWarning',
              'bariclipPortionNote',
            ],
          },
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        return res.status(502).json({ error: 'Risposta vuota dal modello di analisi.' });
      }

      const parsed = JSON.parse(rawText) as {
        description?: string;
        proteinCategory?: string;
        hasVegetables?: boolean;
        avoidItemsWarning?: string;
        bariclipPortionNote?: string;
      };

      const normalizedCategory: ProteinCategory = VALID_PROTEIN_CATEGORIES.includes(
        parsed.proteinCategory as ProteinCategory
      )
        ? (parsed.proteinCategory as ProteinCategory)
        : 'nessuno';

      res.json({
        description: String(parsed.description || 'Pasto analizzato da foto').slice(0, 580),
        proteinCategory: normalizedCategory,
        hasVegetables: Boolean(parsed.hasVegetables),
        avoidItemsWarning: String(parsed.avoidItemsWarning || '').trim(),
        bariclipPortionNote: String(parsed.bariclipPortionNote || '').trim(),
      });
    } catch (err) {
      console.error('POST /api/analyze-meal-photo error:', err);
      res.status(500).json({ error: 'Impossibile analizzare la foto del piatto in questo momento.' });
    }
  });

  app.post('/api/pnl-audio', async (req, res) => {
    let verifiedUser: VerifiedFirebaseUser;
    try {
      verifiedUser = await requireVerifiedUser(req);
    } catch (authErr) {
      return res.status(401).json({
        error: authErr instanceof Error ? authErr.message : 'Accesso non autorizzato.',
      });
    }

    try {
      const { scriptId } = req.body as { scriptId?: PnlAudioScriptId };
      const validIds: PnlAudioScriptId[] = [
        'dopo_nel_prima',
        'come_se',
        'ancora_cinestesica',
        'chiusura_cucina',
      ];
      if (!scriptId || !validIds.includes(scriptId)) {
        return res.status(400).json({ error: 'Sessione di visualizzazione PNL non valida.' });
      }

      const state = await fetchCoachStateFromFirestore(verifiedUser.uid, verifiedUser.idToken);
      const firstName = state.profile.name.split(' ')[0] || 'Davide';
      const { title, scriptText } = buildPnlAudioScriptText(
        scriptId,
        state.profile.positiveGoal,
        firstName
      );

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.json({
          title,
          scriptText,
          audioBase64: null,
          mimeType: null,
          fallbackReason: 'Audio cloud non attivo: mostra testo guidato PNL.',
        });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const ttsResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: scriptText,
                  speechMetadata: {
                    style: 'Warm, calm, soothing Italian mindfulness and NLP coach voice, unhurried reassuring pacing',
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });

        const audioBase64 =
          ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;

        res.json({
          title,
          scriptText,
          audioBase64,
          mimeType: audioBase64 ? 'audio/wav' : null,
        });
      } catch (ttsErr) {
        console.error('Gemini TTS error, returning text script fallback:', ttsErr);
        res.json({
          title,
          scriptText,
          audioBase64: null,
          mimeType: null,
          fallbackReason: 'Sintesi vocale momentaneamente occupata: leggi la guida PNL qui sotto.',
        });
      }
    } catch (err) {
      console.error('POST /api/pnl-audio error:', err);
      res.status(500).json({ error: 'Errore nella generazione della sessione guidata PNL.' });
    }
  });

  app.post('/api/meal-ideas', async (req, res) => {
    let verifiedUser: VerifiedFirebaseUser;
    try {
      verifiedUser = await requireVerifiedUser(req);
    } catch (authErr) {
      return res.status(401).json({
        error: authErr instanceof Error ? authErr.message : 'Accesso non autorizzato.',
      });
    }

    try {
      const { pantryNote } = req.body as { pantryNote?: string };
      const today = new Date().toISOString().slice(0, 10);
      const state = await fetchCoachStateFromFirestore(verifiedUser.uid, verifiedUser.idToken);
      const weeklyCounts = calculateWeeklyProteinCounts(state.meals, today);
      const remaining = weeklyCounts.filter(
        (c) => c.current < c.target && c.category !== 'pasto_libero'
      );
      const todayUsedProtected = state.meals
        .filter((m) => m.date === today && (m.slot === 'pranzo' || m.slot === 'cena'))
        .map((m) => m.proteinCategory)
        .filter((cat) => NO_SAME_DAY_REPEAT_CATEGORIES.includes(cat));

      const fallbackIdeas = buildDeterministicQuickMealIdeas(state.meals, today, pantryNote || '');

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.json({ ideas: fallbackIdeas, source: 'rules' });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const remainingList =
          remaining.length > 0
            ? remaining
                .map((r) => `${r.category} (${r.label}, porzione ${r.portionGuide}, mancanti ${r.target - r.current})`)
                .join('; ')
            : 'tutte le frequenze settimanali raggiunte, proponi pesce o carne bianca leggera';

        const prompt = `Genera esattamente 3 idee di ricette lampo (massimo 10-12 minuti di preparazione) compatibili con chirurgia Bariclip per Davide Rossi.
- Frequenze proteiche rimanenti questa settimana: ${remainingList}.
- Fonti protette già usate oggi a pranzo/cena (da variare per il secondo pasto di oggi): ${todayUsedProtected.join(', ') || 'nessuna'}.
- Oggi è domenica? ${isSunday(today) ? 'Sì (il primo piatto non va proposto di domenica)' : 'No'}.
${pantryNote?.trim() ? `- Ingredienti già in frigo/dispensa segnalati da Davide: "${pantryNote.trim()}". Integrali se compatibili col piano.` : ''}
- Ogni ricetta deve usare 1 sola fonte proteica fra: carne_bianca, carne_rossa, pesce, tonno_salmone, uova, formaggio, legumi, tofu_seitan, affettato, primo.
- Zero fritti, zero alcol, zero zuccheri semplici, zero gassate, sempre verdure abbinate e 1 cucchiaio olio EVO.
- Linguaggio PNL positivo (zero negazioni dure).`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                ideas: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      proteinCategory: { type: Type.STRING },
                      portionNote: { type: Type.STRING },
                      prepMinutes: { type: Type.NUMBER },
                      ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                      steps: { type: Type.STRING },
                      bariclipTip: { type: Type.STRING },
                    },
                    required: [
                      'title',
                      'proteinCategory',
                      'portionNote',
                      'prepMinutes',
                      'ingredients',
                      'steps',
                      'bariclipTip',
                    ],
                  },
                },
              },
              required: ['ideas'],
            },
          },
        });

        const parsed = response.text ? (JSON.parse(response.text) as { ideas?: QuickMealIdea[] }) : null;
        const normalized: QuickMealIdea[] = (parsed?.ideas ?? [])
          .slice(0, 3)
          .map((idea) => ({
            title: String(idea.title || 'Piatto espresso Bariclip').slice(0, 120),
            proteinCategory: VALID_PROTEIN_CATEGORIES.includes(idea.proteinCategory)
              ? idea.proteinCategory
              : 'pesce',
            portionNote: String(idea.portionNote || 'Porzione piano').slice(0, 80),
            prepMinutes: Math.min(30, Math.max(3, Number(idea.prepMinutes || 8))),
            ingredients: Array.isArray(idea.ingredients)
              ? idea.ingredients.map(String).slice(0, 6)
              : ['Proteina piano', 'Verdure di stagione', '1 cucchiaio olio EVO'],
            steps: String(idea.steps || 'Cottura dolce e veloce in padella o al vapore.').slice(0, 420),
            bariclipTip: String(
              idea.bariclipTip || 'Appoggia la forchetta tra un boccone e l’altro.'
            ).slice(0, 220),
          }));

        if (normalized.length > 0) {
          return res.json({ ideas: normalized, source: 'gemini' });
        }
      } catch (aiErr) {
        console.error('Gemini meal-ideas error, using deterministic fallback:', aiErr);
      }

      res.json({ ideas: fallbackIdeas, source: 'rules' });
    } catch (err) {
      console.error('POST /api/meal-ideas error:', err);
      res.status(500).json({ error: 'Impossibile generare le idee ricette in questo momento.' });
    }
  });

  app.post('/api/dream-insight', async (req, res) => {
    let verifiedUser: VerifiedFirebaseUser;
    try {
      verifiedUser = await requireVerifiedUser(req);
    } catch (authErr) {
      return res.status(401).json({
        error: authErr instanceof Error ? authErr.message : 'Accesso non autorizzato.',
      });
    }

    try {
      const { dreamText, date } = req.body as { dreamText?: string; date?: string };
      if (!dreamText || !dreamText.trim()) {
        return res.status(400).json({ error: 'Testo del sogno mancante.' });
      }
      const state = await fetchCoachStateFromFirestore(verifiedUser.uid, verifiedUser.idToken);
      const today = new Date().toISOString().slice(0, 10);
      const fallback = buildDeterministicDreamInsight(dreamText, state.profile.positiveGoal);

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.json({ insight: fallback, source: 'rules' });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const prompt = `Davide ti condivide questo sogno dal suo Diario dei Sogni (${date || today}):
"${dreamText.trim().slice(0, 1500)}"

Offri una breve risonanza di PNL Applicata (massimo 70 parole, 2-3 frasi):
- Collega simboli o sensazioni del sogno alle risorse interiori di Davide e al suo obiettivo positivo ("${state.profile.positiveGoal}").
- Chiudi con 1 Domanda Utile orientata alla soluzione da portare nella giornata di oggi.
- ZERO negazioni (mai usare la parola "non"), coniuga al passato eventuali pesi vecchi, usa "voglio/posso" al posto di "devo".`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction: buildLucillaSystemInstruction(state, today, false),
          },
        });
        const text = response.text?.trim();
        if (text) {
          return res.json({ insight: text, source: 'gemini' });
        }
      } catch (aiErr) {
        console.error('Gemini dream-insight error, returning fallback:', aiErr);
      }

      res.json({ insight: fallback, source: 'rules' });
    } catch (err) {
      console.error('POST /api/dream-insight error:', err);
      res.status(500).json({ error: 'Errore nella riflessione PNL sul sogno.' });
    }
  });

  app.post('/api/radio-audio', async (req, res) => {
    try {
      await requireVerifiedUser(req);
    } catch (authErr) {
      return res.status(401).json({
        error: authErr instanceof Error ? authErr.message : 'Accesso non autorizzato.',
      });
    }

    try {
      const { phrase, mode } = req.body as {
        phrase?: string;
        mode?: '33giri' | 'speedy' | 'lontano';
      };
      const cleanPhrase = (phrase || '').trim().slice(0, 400);
      if (!cleanPhrase) {
        return res.status(400).json({ error: 'Frase Radio Borbottona mancante.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.json({
          audioBase64: null,
          mimeType: null,
          mode: mode || '33giri',
        });
      }

      const stylePrompt =
        mode === '33giri'
          ? 'Caricature sleepy slow bored mumbling voice, comedic and detached'
          : mode === 'speedy'
          ? 'Fast comedic chipmunk-like chatter, brisk and light-hearted'
          : 'Soft distant background murmur, detached and mild';

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const ttsResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanPhrase,
                  speechMetadata: { style: stylePrompt },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });
        const audioBase64 =
          ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
        return res.json({
          audioBase64,
          mimeType: audioBase64 ? 'audio/wav' : null,
          mode: mode || '33giri',
        });
      } catch (ttsErr) {
        console.error('Gemini radio-audio TTS error, returning browser fallback:', ttsErr);
        return res.json({
          audioBase64: null,
          mimeType: null,
          mode: mode || '33giri',
        });
      }
    } catch (err) {
      console.error('POST /api/radio-audio error:', err);
      res.status(500).json({ error: 'Errore sintesi Radio Borbottona.' });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: hmrDisabled ? false : { server: httpServer, path: '/vite-hmr' },
        ws: { server: httpServer, path: '/vite-hmr' },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Real-time Gemini Live Audio WebSocket bridge (/api/live)
  // Use noServer: true so Vite's HMR WebSocket upgrades are never aborted by ws.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', 'http://localhost');
    if (reqUrl.pathname === '/api/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs, req) => {
    const reqUrl = new URL(req.url || '/', 'http://localhost');
    const idToken = reqUrl.searchParams.get('token') || '';

    let verifiedUser: VerifiedFirebaseUser;
    try {
      verifiedUser = await verifyFirebaseIdToken(idToken);
    } catch (authErr) {
      safeSendWs(clientWs, {
        type: 'error',
        message:
          authErr instanceof Error
            ? authErr.message
            : 'Accesso non autorizzato alla sessione vocale.',
      });
      clientWs.close();
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      safeSendWs(clientWs, {
        type: 'error',
        message: 'Chiave GEMINI_API_KEY non configurata nei Secrets del server.',
      });
      clientWs.close();
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    let liveState: CoachState;
    try {
      liveState = await fetchCoachStateFromFirestore(verifiedUser.uid, verifiedUser.idToken);
    } catch (loadErr) {
      console.error('Failed to load Firestore state for Live session:', loadErr);
      liveState = createInitialSeedState();
    }

    const today = new Date().toISOString().slice(0, 10);

    let inputBuffer = '';
    let outputBuffer = '';
    let closed = false;

    const flushTranscriptsToHistory = async () => {
      const uText = inputBuffer.trim();
      const aText = outputBuffer.trim();
      if (!uText && !aText) return;
      inputBuffer = '';
      outputBuffer = '';
      try {
        const nowTime = new Date().toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const additions = [];
        if (uText) {
          additions.push({
            id: makeUniqueMsgId('uv'),
            role: 'user' as const,
            content: uText,
            timestamp: nowTime,
          });
        }
        if (aText) {
          additions.push({
            id: makeUniqueMsgId('av'),
            role: 'assistant' as const,
            content: aText,
            timestamp: nowTime,
          });
        }
        await appendChatMessagesViaRest(verifiedUser.uid, verifiedUser.idToken, additions);
        liveState = {
          ...liveState,
          chatHistory: [...liveState.chatHistory, ...additions].slice(-50),
        };
        safeSendWs(clientWs, { type: 'stateUpdate', state: liveState });
      } catch (err) {
        console.error('Failed to persist live transcripts to Firestore:', err);
      }
    };

    try {
      const session = await ai.live.connect({
        model: 'gemini-3.8-live-extended-thinking',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: LIVE_VOICE_TOOLS }],
          systemInstruction: buildLucillaSystemInstruction(liveState, today, true),
        },
        callbacks: {
          onopen: () => {
            safeSendWs(clientWs, { type: 'ready' });
          },
          onmessage: async (message: LiveServerMessage) => {
            if (closed) return;
            const content = message.serverContent;

            if (content?.interrupted) {
              safeSendWs(clientWs, { type: 'interrupted' });
            }

            if (content?.inputTranscription?.text) {
              inputBuffer += content.inputTranscription.text;
              safeSendWs(clientWs, {
                type: 'inputTranscript',
                text: content.inputTranscription.text,
              });
            }

            if (content?.outputTranscription?.text) {
              outputBuffer += content.outputTranscription.text;
              safeSendWs(clientWs, {
                type: 'outputTranscript',
                text: content.outputTranscription.text,
              });
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                safeSendWs(clientWs, { type: 'audio', data: part.inlineData.data });
              }
            }

            for (const call of message.toolCall?.functionCalls ?? []) {
              try {
                const prevState = liveState;
                const exec = executeVoiceTool(
                  prevState,
                  call.name ?? '',
                  (call.args as Record<string, unknown>) ?? {},
                  today
                );
                await persistVoiceToolMutationToFirestore(
                  verifiedUser.uid,
                  verifiedUser.idToken,
                  call.name ?? '',
                  prevState,
                  exec.nextState
                );
                liveState = exec.nextState;

                safeSendWs(clientWs, {
                  type: 'stateUpdate',
                  state: exec.nextState,
                  uiCommand: exec.uiCommand,
                });

                session.sendToolResponse({
                  functionResponses: [
                    {
                      id: call.id,
                      name: call.name,
                      response: exec.toolResult,
                      scheduling: FunctionResponseScheduling.WHEN_IDLE,
                    },
                  ],
                });
              } catch (toolErr) {
                console.error('Live tool execution error:', toolErr);
                session.sendToolResponse({
                  functionResponses: [
                    {
                      id: call.id,
                      name: call.name,
                      response: { error: 'Errore nel salvataggio vocale su cloud.' },
                      scheduling: FunctionResponseScheduling.WHEN_IDLE,
                    },
                  ],
                });
              }
            }

            const status = content?.interactionStatus;
            if (status) {
              safeSendWs(clientWs, { type: 'status', status });
              if (status === InteractionStatus.IDLE) {
                await flushTranscriptsToHistory();
              }
            }
          },
          onerror: (err) => {
            console.error('Gemini Live session error:', err);
            safeSendWs(clientWs, {
              type: 'error',
              message: 'Connessione vocale Live interrotta. Riprova tra un istante.',
            });
          },
          onclose: () => {
            if (!closed) {
              safeSendWs(clientWs, { type: 'closed' });
            }
          },
        },
      });

      clientWs.on('message', (raw) => {
        try {
          const payload = JSON.parse(raw.toString()) as {
            type?: string;
            data?: string;
            text?: string;
          };
          if (payload.type === 'audio' && payload.data) {
            session.sendRealtimeInput({
              audio: { data: payload.data, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (payload.type === 'text' && payload.text) {
            session.sendRealtimeInput({ text: payload.text });
          }
        } catch (parseErr) {
          console.error('Client WS message error:', parseErr);
        }
      });

      clientWs.on('close', async () => {
        closed = true;
        await flushTranscriptsToHistory();
        try {
          session.close();
        } catch {
          // ignore close errors
        }
      });
    } catch (connErr) {
      console.error('Failed to connect Gemini Live:', connErr);
      safeSendWs(clientWs, {
        type: 'error',
        message: 'Impossibile avviare la sessione vocale Live con Lucilla.',
      });
      clientWs.close();
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Lucilla Coach server listening on http://localhost:${PORT}`);
  });
}

startServer();
