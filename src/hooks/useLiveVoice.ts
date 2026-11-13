import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage, CoachState } from '../types/coach.ts';
import { base64ToFloat32, float32ToInt16Base64 } from '../utils/audioPcm.ts';

export type LiveStatus = 'idle' | 'connecting' | 'active' | 'error';
export type VoiceTransport = 'websocket' | 'turn';

export interface LiveUiCommand {
  tab?: 'oggi' | 'diario' | 'pnl' | 'report';
  openSosModal?: boolean;
  openRadioBorbottona?: boolean;
  notice?: string;
}

interface UseLiveVoiceOptions {
  onStateUpdate: (state: CoachState, uiCommand?: LiveUiCommand) => void;
  onTurnMessages?: (messages: ChatMessage[], uiCommand?: LiveUiCommand) => void;
  getIdToken: () => Promise<string | null>;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossibile convertire audio registrato.'));
      }
    };
    reader.onerror = () => reject(new Error('Errore lettura audio registrato.'));
    reader.readAsDataURL(blob);
  });
}

function pickSupportedRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

export function useLiveVoice({
  onStateUpdate,
  onTurnMessages,
  getIdToken,
}: UseLiveVoiceOptions) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [voiceTransport, setVoiceTransport] = useState<VoiceTransport>('websocket');
  const [isMuted, setIsMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [isRecordingTurn, setIsRecordingTurn] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [liveModelTranscript, setLiveModelTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastVoiceNotice, setLastVoiceNotice] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const wsOpenedRef = useRef<boolean>(false);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const discardOnStopRef = useRef<boolean>(false);
  const turnAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const voiceTransportRef = useRef<VoiceTransport>('websocket');
  const onStateUpdateRef = useRef(onStateUpdate);
  const onTurnMessagesRef = useRef(onTurnMessages);

  useEffect(() => {
    onStateUpdateRef.current = onStateUpdate;
  }, [onStateUpdate]);

  useEffect(() => {
    onTurnMessagesRef.current = onTurnMessages;
  }, [onTurnMessages]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const stopOutputPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore already-stopped sources
      }
    }
    activeSourcesRef.current = [];
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    if (turnAudioRef.current) {
      try {
        turnAudioRef.current.pause();
        turnAudioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      turnAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsModelSpeaking(false);
  }, []);

  const playPcmChunk = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const float32 = base64ToFloat32(base64Audio);
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now;
    }
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
    setIsModelSpeaking(true);

    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      if (activeSourcesRef.current.length === 0) {
        setIsModelSpeaking(false);
      }
    };
  }, []);

  const cleanupWsAndAudioGraph = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }, []);

  const stopCall = useCallback(() => {
    stopOutputPlayback();

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      discardOnStopRef.current = true;
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    recordedChunksRef.current = [];
    setIsRecordingTurn(false);
    setIsProcessingTurn(false);

    cleanupWsAndAudioGraph();

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    setStatus('idle');
    setIsMuted(false);
    setLiveUserTranscript('');
    setLiveModelTranscript('');
  }, [cleanupWsAndAudioGraph, stopOutputPlayback]);

  const playTurnReplyAudio = useCallback(
    (audioBase64: string | null | undefined, audioMimeType: string | null | undefined, text: string) => {
      stopOutputPlayback();

      if (audioBase64) {
        try {
          const mime = audioMimeType || 'audio/wav';
          const audio = new Audio(`data:${mime};base64,${audioBase64}`);
          turnAudioRef.current = audio;
          setIsModelSpeaking(true);
          audio.onended = () => {
            if (turnAudioRef.current === audio) {
              turnAudioRef.current = null;
              setIsModelSpeaking(false);
            }
          };
          audio.onerror = () => {
            if (turnAudioRef.current === audio) {
              turnAudioRef.current = null;
              setIsModelSpeaking(false);
            }
          };
          audio.play().catch(() => {
            setIsModelSpeaking(false);
          });
          return;
        } catch {
          // fallback to browser speech synthesis below
        }
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window && text.trim()) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'it-IT';
        utter.rate = 0.98;
        utter.onend = () => setIsModelSpeaking(false);
        utter.onerror = () => setIsModelSpeaking(false);
        setIsModelSpeaking(true);
        window.speechSynthesis.speak(utter);
      }
    },
    [stopOutputPlayback]
  );

  const submitAudioTurn = useCallback(
    async (blob: Blob) => {
      if (blob.size < 400) {
        setErrorMessage('Registrazione troppo breve: parla per almeno 1 secondo.');
        return;
      }

      setIsProcessingTurn(true);
      setErrorMessage(null);
      try {
        const idToken = await getIdToken();
        if (!idToken) {
          setErrorMessage('Sessione Google scaduta. Effettua di nuovo l’accesso.');
          return;
        }

        const dataUrl = await blobToBase64(blob);
        const commaIdx = dataUrl.indexOf(',');
        const cleanAudioBase64 =
          dataUrl.startsWith('data:') && commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
        const cleanMime = (blob.type || 'audio/webm').split(';')[0].trim() || 'audio/webm';

        const res = await fetch('/api/voice-turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            audioBase64: cleanAudioBase64,
            mimeType: cleanMime,
          }),
        });

        const rawText = await res.text();
        let payload: {
          error?: string;
          transcript?: string;
          userMessage?: ChatMessage;
          assistantMessage?: ChatMessage;
          audioBase64?: string | null;
          audioMimeType?: string | null;
          command?: string | null;
          sosTriggered?: boolean;
        } = {};
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = {};
        }

        if (!res.ok) {
          setErrorMessage(
            payload.error || `Errore vocale (${res.status}). Riprova tra un istante.`
          );
          return;
        }

        const additions: ChatMessage[] = [];
        if (payload.userMessage) additions.push(payload.userMessage);
        if (payload.assistantMessage) additions.push(payload.assistantMessage);

        let uiCommand: LiveUiCommand | undefined;
        if (payload.command === '/ruota') {
          uiCommand = { tab: 'pnl', notice: 'Aperta la Ruota della Vita' };
        } else if (payload.command === '/report_bardho') {
          uiCommand = { tab: 'report', notice: 'Aperto il Report Dott.ssa Bardho' };
        } else if (payload.sosTriggered) {
          uiCommand = { openSosModal: true, notice: 'Attivato Protocollo SOS' };
        }

        if (additions.length > 0 && onTurnMessagesRef.current) {
          onTurnMessagesRef.current(additions, uiCommand);
        }
        if (uiCommand?.notice) {
          setLastVoiceNotice(uiCommand.notice);
          setTimeout(() => setLastVoiceNotice(null), 4500);
        }

        if (payload.assistantMessage?.content) {
          playTurnReplyAudio(
            payload.audioBase64,
            payload.audioMimeType,
            payload.assistantMessage.content
          );
        }
      } catch {
        setErrorMessage('Errore di rete durante l’invio vocale a Lucilla.');
      } finally {
        setIsProcessingTurn(false);
      }
    },
    [getIdToken, playTurnReplyAudio]
  );

  const beginTurnRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return;

    stopOutputPlayback();
    setErrorMessage(null);
    recordedChunksRef.current = [];
    discardOnStopRef.current = false;

    const mimeType = pickSupportedRecorderMime();
    const options: MediaRecorderOptions = mimeType
      ? { mimeType, audioBitsPerSecond: 32000 }
      : { audioBitsPerSecond: 32000 };
    const recorder = new MediaRecorder(stream, options);
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        recordedChunksRef.current.push(ev.data);
      }
    };

    recorder.onstop = () => {
      const shouldDiscard = discardOnStopRef.current;
      discardOnStopRef.current = false;
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      recorderRef.current = null;
      setIsRecordingTurn(false);

      if (shouldDiscard || chunks.length === 0) return;
      const finalBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      void submitAudioTurn(finalBlob);
    };

    recorder.start();
    setIsRecordingTurn(true);
    setIsMuted(false);
  }, [stopOutputPlayback, submitAudioTurn]);

  const startTurnModeSession = useCallback(
    (noticeText?: string) => {
      cleanupWsAndAudioGraph();
      voiceTransportRef.current = 'turn';
      setVoiceTransport('turn');
      setStatus('active');
      setErrorMessage(null);
      if (noticeText) {
        setLastVoiceNotice(noticeText);
        setTimeout(() => setLastVoiceNotice(null), 5000);
      }
      beginTurnRecording();
    },
    [beginTurnRecording, cleanupWsAndAudioGraph]
  );

  const sendVoiceTurn = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    discardOnStopRef.current = false;
    rec.stop();
  }, []);

  const startNextVoiceTurn = useCallback(() => {
    if (voiceTransportRef.current !== 'turn' || isProcessingTurn) return;
    beginTurnRecording();
  }, [beginTurnRecording, isProcessingTurn]);

  const startCall = useCallback(async () => {
    if (status === 'connecting' || status === 'active') return;
    setErrorMessage(null);
    setLastVoiceNotice(null);
    setLiveUserTranscript('');
    setLiveModelTranscript('');
    setStatus('connecting');

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        setErrorMessage('Sessione Google non attiva. Effettua di nuovo l’accesso.');
        setStatus('error');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      let supportsWebsocket = true;
      try {
        const capRes = await fetch('/api/capabilities');
        if (capRes.ok) {
          const cap = (await capRes.json()) as { liveWebsocket?: boolean };
          supportsWebsocket = cap.liveWebsocket !== false;
        }
      } catch {
        supportsWebsocket = true;
      }

      if (!supportsWebsocket) {
        startTurnModeSession('Modalità vocale a turni attiva · Parla e tocca "Invia a Lucilla"');
        return;
      }

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsOpenedRef.current = false;
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/live?token=${encodeURIComponent(idToken)}`
      );
      wsRef.current = ws;
      voiceTransportRef.current = 'websocket';
      setVoiceTransport('websocket');

      ws.onopen = () => {
        wsOpenedRef.current = true;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
            status?: string;
            state?: CoachState;
            uiCommand?: LiveUiCommand;
          };

          if (msg.type === 'ready') {
            setStatus('active');
          } else if (msg.type === 'audio' && msg.data) {
            playPcmChunk(msg.data);
          } else if (msg.type === 'interrupted') {
            stopOutputPlayback();
          } else if (msg.type === 'inputTranscript' && msg.text) {
            setLiveUserTranscript((prev) => `${prev}${msg.text}`);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            setLiveModelTranscript((prev) => `${prev}${msg.text}`);
          } else if (msg.type === 'status' && msg.status === 'IDLE') {
            setLiveUserTranscript('');
            setLiveModelTranscript('');
          } else if (msg.type === 'stateUpdate' && msg.state) {
            onStateUpdateRef.current(msg.state, msg.uiCommand);
            if (msg.uiCommand?.notice) {
              setLastVoiceNotice(msg.uiCommand.notice);
              setTimeout(() => setLastVoiceNotice(null), 4500);
            }
          } else if (msg.type === 'error') {
            setErrorMessage(msg.message || 'Errore nella chiamata vocale Live.');
            setStatus('error');
            stopCall();
          } else if (msg.type === 'closed') {
            stopCall();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        if (!wsOpenedRef.current && streamRef.current) {
          startTurnModeSession('Modalità vocale a turni attiva · Parla e tocca "Invia a Lucilla"');
          return;
        }
        setErrorMessage('Errore di connessione WebSocket con il server vocale.');
        setStatus('error');
        stopCall();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          if (!wsOpenedRef.current && streamRef.current) {
            startTurnModeSession('Modalità vocale a turni attiva · Parla e tocca "Invia a Lucilla"');
            return;
          }
          stopCall();
        }
      };

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current) return;
        const currentWs = wsRef.current;
        if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
        const floatData = e.inputBuffer.getChannelData(0);
        const base64Pcm = float32ToInt16Base64(floatData);
        currentWs.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permesso microfono negato: abilita il microfono nel browser per parlare con Lucilla.'
          : 'Impossibile accedere al microfono per la chat live audio.';
      setErrorMessage(msg);
      setStatus('error');
      stopCall();
    }
  }, [getIdToken, playPcmChunk, startTurnModeSession, status, stopCall, stopOutputPlayback]);

  const toggleMute = useCallback(() => {
    if (voiceTransportRef.current === 'turn') {
      if (isRecordingTurn && recorderRef.current && recorderRef.current.state !== 'inactive') {
        discardOnStopRef.current = true;
        recorderRef.current.stop();
        setIsMuted(true);
      } else if (!isProcessingTurn) {
        beginTurnRecording();
      }
      return;
    }
    setIsMuted((m) => !m);
  }, [beginTurnRecording, isProcessingTurn, isRecordingTurn]);

  const sendLiveText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && text.trim()) {
      ws.send(JSON.stringify({ type: 'text', text: text.trim() }));
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCall();
    };
  }, [stopCall]);

  return {
    status,
    voiceTransport,
    isMuted,
    isModelSpeaking,
    isRecordingTurn,
    isProcessingTurn,
    liveUserTranscript,
    liveModelTranscript,
    errorMessage,
    lastVoiceNotice,
    startCall,
    stopCall,
    toggleMute,
    sendLiveText,
    sendVoiceTurn,
    startNextVoiceTurn,
    clearError: () => setErrorMessage(null),
  };
}
