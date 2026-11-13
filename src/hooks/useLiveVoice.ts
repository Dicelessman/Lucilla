import { useCallback, useEffect, useRef, useState } from 'react';
import { CoachState } from '../types/coach.ts';
import { base64ToFloat32, float32ToInt16Base64 } from '../utils/audioPcm.ts';

export type LiveStatus = 'idle' | 'connecting' | 'active' | 'error';

export interface LiveUiCommand {
  tab?: 'oggi' | 'diario' | 'pnl' | 'report';
  openSosModal?: boolean;
  openRadioBorbottona?: boolean;
  notice?: string;
}

interface UseLiveVoiceOptions {
  onStateUpdate: (state: CoachState, uiCommand?: LiveUiCommand) => void;
  getIdToken: () => Promise<string | null>;
}

export function useLiveVoice({ onStateUpdate, getIdToken }: UseLiveVoiceOptions) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [liveModelTranscript, setLiveModelTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastVoiceNotice, setLastVoiceNotice] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const onStateUpdateRef = useRef(onStateUpdate);

  useEffect(() => {
    onStateUpdateRef.current = onStateUpdate;
  }, [onStateUpdate]);

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

  const stopCall = useCallback(() => {
    stopOutputPlayback();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
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

    setStatus('idle');
    setIsMuted(false);
    setLiveUserTranscript('');
    setLiveModelTranscript('');
  }, [stopOutputPlayback]);

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

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/live?token=${encodeURIComponent(idToken)}`
      );
      wsRef.current = ws;

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
        setErrorMessage('Errore di connessione WebSocket con il server vocale.');
        setStatus('error');
        stopCall();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
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
  }, [getIdToken, playPcmChunk, status, stopCall, stopOutputPlayback]);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

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
    isMuted,
    isModelSpeaking,
    liveUserTranscript,
    liveModelTranscript,
    errorMessage,
    lastVoiceNotice,
    startCall,
    stopCall,
    toggleMute,
    sendLiveText,
    clearError: () => setErrorMessage(null),
  };
}
