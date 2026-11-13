import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Sparkles,
  Volume2,
  AlertTriangle,
  ArrowUpRight,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Play,
  Square,
} from 'lucide-react';
import { ChatAction, ChatMessage } from '../types/coach.ts';
import { LiveStatus } from '../hooks/useLiveVoice.ts';

interface CoachChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onTriggerAction: (action: ChatAction['type']) => void;
  isSending: boolean;
  liveStatus: LiveStatus;
  isMuted: boolean;
  isModelSpeaking: boolean;
  liveUserTranscript: string;
  liveModelTranscript: string;
  liveError: string | null;
  lastVoiceNotice: string | null;
  onStartLiveCall: () => void;
  onStopLiveCall: () => void;
  onToggleMute: () => void;
  onSendLiveText: (text: string) => void;
  externalRadioOpen?: boolean;
  getIdToken?: () => Promise<string | null>;
}

const QUICK_PROMPTS = [
  { label: '/sos Surfa l’onda', text: '/sos Sto sentendo un impulso vicino al frigo' },
  { label: '/ruota Ruota della Vita', text: '/ruota' },
  { label: '/report_bardho Report', text: '/report_bardho' },
  { label: 'Ho voglia di dolce', text: 'Sono un po’ nervoso dopo il lavoro e ho voglia di dolce' },
  { label: 'Scivolone oggi', text: 'Oggi ho mangiato troppo fuori pasto e temo di aver rovinato tutto' },
];

export function CoachChatPanel({
  messages,
  onSendMessage,
  onTriggerAction,
  isSending,
  liveStatus,
  isMuted,
  isModelSpeaking,
  liveUserTranscript,
  liveModelTranscript,
  liveError,
  lastVoiceNotice,
  onStartLiveCall,
  onStopLiveCall,
  onToggleMute,
  onSendLiveText,
  externalRadioOpen,
  getIdToken,
}: CoachChatPanelProps) {
  const [input, setInput] = useState('');
  const [showRadioWidget, setShowRadioWidget] = useState(false);
  const [radioMode, setRadioMode] = useState<'33giri' | 'speedy' | 'lontano'>('33giri');
  const [radioPhrase, setRadioPhrase] = useState('Non ce la fai mai a seguire il piano...');
  const [radioLoading, setRadioLoading] = useState(false);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioError, setRadioError] = useState<string | null>(null);
  const radioAudioCtxRef = useRef<AudioContext | null>(null);
  const radioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (externalRadioOpen) {
      setShowRadioWidget(true);
    }
  }, [externalRadioOpen]);

  useEffect(() => {
    return () => {
      try {
        radioSourceRef.current?.stop();
        radioAudioCtxRef.current?.close();
      } catch {
        // ignore audio cleanup error
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending, liveUserTranscript, liveModelTranscript]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isSending) return;
    const text = input.trim();
    setInput('');
    if (liveStatus === 'active') {
      onSendLiveText(text);
    } else {
      await onSendMessage(text);
    }
  }

  function handleQuickPrompt(text: string) {
    if (liveStatus === 'active') {
      onSendLiveText(text);
    } else {
      onSendMessage(text);
    }
  }

  function stopRadioAudio() {
    try {
      radioSourceRef.current?.stop();
      radioSourceRef.current = null;
    } catch {
      // ignore stop error
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setRadioPlaying(false);
  }

  async function handlePlayRadioEffect() {
    if (radioPlaying) {
      stopRadioAudio();
      return;
    }
    const clean = radioPhrase.trim();
    if (!clean) return;
    setRadioError(null);
    setRadioLoading(true);

    const playSpeechSynthesisFallback = () => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setRadioError('Riproduzione audio non supportata su questo browser.');
        return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'it-IT';
      if (radioMode === '33giri') {
        utter.rate = 0.65;
        utter.pitch = 0.55;
        utter.volume = 0.9;
      } else if (radioMode === 'speedy') {
        utter.rate = 1.65;
        utter.pitch = 1.6;
        utter.volume = 0.9;
      } else {
        utter.rate = 0.95;
        utter.pitch = 0.9;
        utter.volume = 0.3;
      }
      utter.onend = () => setRadioPlaying(false);
      utter.onerror = () => setRadioPlaying(false);
      setRadioPlaying(true);
      window.speechSynthesis.speak(utter);
    };

    try {
      const token = getIdToken ? await getIdToken() : null;
      if (!token) {
        playSpeechSynthesisFallback();
        return;
      }

      const res = await fetch('/api/radio-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phrase: clean, mode: radioMode }),
      });

      if (!res.ok) {
        playSpeechSynthesisFallback();
        return;
      }

      const data = (await res.json()) as { audioBase64?: string | null };
      if (!data.audioBase64) {
        playSpeechSynthesisFallback();
        return;
      }

      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = radioAudioCtxRef.current ?? new AudioCtx();
      radioAudioCtxRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = decoded;

      if (radioMode === '33giri') {
        source.playbackRate.value = 0.72;
        source.connect(ctx.destination);
      } else if (radioMode === 'speedy') {
        source.playbackRate.value = 1.42;
        source.connect(ctx.destination);
      } else {
        source.playbackRate.value = 0.96;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        const gain = ctx.createGain();
        gain.gain.value = 0.35;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
      }

      source.onended = () => {
        setRadioPlaying(false);
        radioSourceRef.current = null;
      };
      radioSourceRef.current = source;
      setRadioPlaying(true);
      source.start(0);
    } catch {
      playSpeechSynthesisFallback();
    } finally {
      setRadioLoading(false);
    }
  }

  function handleActionClick(type: ChatAction['type']) {
    if (type === 'radio_borbottona') {
      setShowRadioWidget((prev) => !prev);
      return;
    }
    onTriggerAction(type);
  }

  return (
    <section
      aria-label="Conversazione con Lucilla"
      className="flex h-full min-h-[540px] flex-col rounded-xl border border-[#E4E6E0] bg-white dark:border-[#2B3732] dark:bg-[#1B231F]"
    >
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E6E0] px-5 py-3.5 dark:border-[#2B3732]">
        <div>
          <h2 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
            Dialogo con Lucilla
          </h2>
          <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
            Protocollo Bardho · PNL Giusto Peso · Voce Live &amp; Testo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={liveStatus === 'active' || liveStatus === 'connecting' ? onStopLiveCall : onStartLiveCall}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              liveStatus === 'active' || liveStatus === 'connecting'
                ? 'border-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]'
                : 'border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] hover:bg-[#DFECE6] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
            }`}
          >
            {liveStatus === 'active' || liveStatus === 'connecting' ? (
              <>
                <PhoneOff className="h-3.5 w-3.5" />
                <span>Termina Voce</span>
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>Chat Live Audio</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowRadioWidget((prev) => !prev)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E4E6E0] px-2.5 py-1.5 text-xs font-medium text-[#182420] transition-colors hover:bg-[#F3F4F0] dark:border-[#2B3732] dark:text-[#EAECE6] dark:hover:bg-[#222D28]"
          >
            <Volume2 className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
            <span>Radio Borbottona</span>
          </button>
        </div>
      </div>

      {/* Live Voice Session Banner */}
      {(liveStatus === 'connecting' || liveStatus === 'active' || liveError || lastVoiceNotice) && (
        <div className="border-b border-[#E4E6E0] bg-[#EDF3F0] px-5 py-3 text-xs dark:border-[#2B3732] dark:bg-[#1F332C]">
          {liveError ? (
            <div className="flex items-center gap-2 font-medium text-[#991B1B] dark:text-[#FCA5A5]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{liveError}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium text-[#182420] dark:text-[#EAECE6]">
                <Radio className="h-4 w-4 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span>
                  {liveStatus === 'connecting'
                    ? 'Attivazione microfono e connessione vocale con Lucilla...'
                    : isMuted
                    ? 'Chiamata Live attiva · Microfono in pausa'
                    : isModelSpeaking
                    ? 'Chiamata Live attiva · Lucilla sta parlando (puoi interromperla)'
                    : 'Chiamata Live attiva · In ascolto, parla liberamente'}
                </span>
              </div>

              {liveStatus === 'active' && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="inline-flex items-center gap-1 rounded-md border border-[#C6D5CE] bg-white px-2.5 py-1 text-xs font-medium text-[#182420] hover:bg-[#F7F7F4] dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
                  >
                    {isMuted ? (
                      <>
                        <Mic className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                        <span>Riattiva Mic</span>
                      </>
                    ) : (
                      <>
                        <MicOff className="h-3.5 w-3.5 text-[#5C6762] dark:text-[#A3B0AA]" />
                        <span>Silenzia</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onStopLiveCall}
                    className="inline-flex items-center gap-1 rounded-md border border-[#FCA5A5] bg-white px-2.5 py-1 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
                  >
                    <PhoneOff className="h-3.5 w-3.5" />
                    <span>Chiudi</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {lastVoiceNotice && (
            <p className="mt-1.5 font-medium text-[#1F6E5C] dark:text-[#36A68C]">{lastVoiceNotice}</p>
          )}
        </div>
      )}

      {/* Optional Interactive PNL Radio Borbottona Toy */}
      {showRadioWidget && (
        <div className="border-b border-[#E4E6E0] bg-[#F7F8F5] px-5 py-3.5 dark:border-[#2B3732] dark:bg-[#161D1A]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#1F6E5C] dark:text-[#36A68C]">
                Gioco PNL · Radio Borbottona
              </p>
              <p className="text-xs text-[#5C6762] dark:text-[#A3B0AA]">
                Quando la voce critica borbotta, trasformane il tono fino a farla sorridere.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRadioWidget(false)}
              className="text-xs font-medium text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]"
            >
              Chiudi
            </button>
          </div>
          <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <input
              type="text"
              aria-label="Frase della voce critica"
              value={radioPhrase}
              onChange={(e) => setRadioPhrase(e.target.value)}
              className="flex-1 rounded-lg border border-[#D7DBD2] bg-white px-3 py-1.5 text-xs text-[#182420] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
            />
            <div className="flex gap-1.5">
              {[
                { id: '33giri' as const, label: '45→33 giri' },
                { id: 'speedy' as const, label: 'Speedy Gonzales' },
                { id: 'lontano' as const, label: 'Sposta nel piede' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setRadioMode(m.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    radioMode === m.id
                      ? 'bg-[#1F6E5C] text-white'
                      : 'border border-[#D7DBD2] bg-white text-[#5C6762] hover:text-[#182420] dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#A3B0AA]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[#E4E6E0] bg-white px-3 py-2 text-xs text-[#182420] dark:border-[#2B3732] dark:bg-[#1B231F] dark:text-[#EAECE6]">
            <div className="min-w-0 flex-1">
              {radioMode === '33giri' && (
                <span className="tracking-widest text-[#5C6762] dark:text-[#A3B0AA]">
                  “{radioPhrase.split(' ').join(' . . . ')}” (voce lentissima, profonda e impastata — quanto perde potere adesso?)
                </span>
              )}
              {radioMode === 'speedy' && (
                <span className="font-mono text-[11px] text-[#1F6E5C] dark:text-[#36A68C]">
                  “{radioPhrase.replace(/\s+/g, '')}!” (vocina acuta da cartone animato in 0,4 secondi!)
                </span>
              )}
              {radioMode === 'lontano' && (
                <span className="text-[#5C6762] dark:text-[#A3B0AA]">
                  Immagina quella voce provenire dal tallone sinistro a volume bassissimo, mentre la tua voce guida lucida ti parla dal centro del petto: “È scomodo, passa.”
                </span>
              )}
              {radioError && (
                <p className="mt-1 text-[11px] text-[#B91C1C] dark:text-[#FCA5A5]">{radioError}</p>
              )}
            </div>
            <button
              type="button"
              disabled={radioLoading || !radioPhrase.trim()}
              onClick={handlePlayRadioEffect}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                radioPlaying
                  ? 'border border-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]'
                  : 'border border-[#1F6E5C] bg-[#EDF3F0] text-[#182420] hover:bg-[#DFECE6] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
              }`}
            >
              {radioPlaying ? (
                <>
                  <Square className="h-3 w-3" />
                  <span>Ferma audio</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 text-[#1F6E5C] dark:text-[#36A68C]" />
                  <span>{radioLoading ? 'Preparo tono...' : 'Ascolta effetto audio'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
        style={{ maxHeight: '520px' }}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
                <span className="font-semibold text-[#182420] dark:text-[#EAECE6]">
                  {isUser ? 'Davide' : 'Lucilla'}
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums">{msg.timestamp}</span>
              </div>

              <div
                className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-[#1F6E5C] text-white'
                    : msg.redFlagTriggered
                    ? 'border border-[#FCA5A5] bg-[#FEF2F2] text-[#7F1D1D] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FECACA]'
                    : 'border border-[#E4E6E0] bg-[#F8F9F6] text-[#182420] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#EAECE6]'
                }`}
              >
                {msg.redFlagTriggered && (
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C] dark:text-[#FCA5A5]">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Attenzione Clinica Bariclip</span>
                  </div>
                )}
                <p className="whitespace-pre-line">{msg.content}</p>
              </div>

              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.actions.map((act, idx) => (
                    <button
                      key={`${msg.id}_act_${idx}`}
                      type="button"
                      onClick={() => handleActionClick(act.type)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#C6D5CE] bg-[#EDF3F0] px-3 py-1.5 text-xs font-medium text-[#182420] transition-colors hover:bg-[#DFECE6] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#EAECE6]"
                    >
                      <span>{act.label}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Live streaming voice transcripts */}
        {liveUserTranscript && (
          <div className="flex flex-col items-end">
            <div className="mb-1 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
              Davide (voce in diretta)
            </div>
            <div className="max-w-[90%] rounded-xl bg-[#1F6E5C]/85 px-4 py-2.5 text-sm text-white">
              {liveUserTranscript}
            </div>
          </div>
        )}

        {liveModelTranscript && (
          <div className="flex flex-col items-start">
            <div className="mb-1 text-[11px] text-[#5C6762] dark:text-[#A3B0AA]">
              Lucilla (voce in diretta)
            </div>
            <div className="max-w-[90%] rounded-xl border border-[#C6D5CE] bg-[#EDF3F0] px-4 py-2.5 text-sm text-[#182420] dark:border-[#2F4E42] dark:bg-[#1F332C] dark:text-[#EAECE6]">
              {liveModelTranscript}
            </div>
          </div>
        )}

        {isSending && (
          <div className="flex items-start gap-2 text-xs text-[#5C6762] dark:text-[#A3B0AA]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
            <span>Lucilla sta preparando la risposta...</span>
          </div>
        )}
      </div>

      {/* Quick Commands & Composer */}
      <div className="border-t border-[#E4E6E0] bg-[#FAFAF8] px-4 py-3 dark:border-[#2B3732] dark:bg-[#161D1A]">
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp.label}
              type="button"
              disabled={isSending}
              onClick={() => handleQuickPrompt(qp.text)}
              className="rounded-md border border-[#E4E6E0] bg-white px-2.5 py-1 text-xs font-medium text-[#5C6762] transition-colors hover:border-[#1F6E5C] hover:text-[#182420] disabled:opacity-50 dark:border-[#2B3732] dark:bg-[#1B231F] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]"
            >
              {qp.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor="lucilla-chat-input" className="sr-only">
            Scrivi a Lucilla
          </label>
          <input
            id="lucilla-chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              liveStatus === 'active'
                ? 'Parla nel microfono o invia un testo rapido in chiamata...'
                : 'Scrivi come ti senti o usa /sos, /ruota, /report_bardho...'
            }
            className="flex-1 rounded-lg border border-[#D7DBD2] bg-white px-3.5 py-2.5 text-sm text-[#182420] placeholder:text-[#8A948E] focus:border-[#1F6E5C] focus:outline-none dark:border-[#33423C] dark:bg-[#1B231F] dark:text-[#EAECE6]"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            aria-label="Invia messaggio a Lucilla"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F6E5C] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#185849] disabled:opacity-45"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Invia</span>
          </button>
        </form>
      </div>
    </section>
  );
}
