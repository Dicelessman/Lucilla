import React from 'react';
import {
  LifeBuoy,
  BookOpen,
  Compass,
  BarChart3,
  MessageCircleHeart,
  Mic,
  PhoneOff,
  Send,
  SlidersHorizontal,
  Moon,
  Sun,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { SignOutButton } from './AuthGate.tsx';
import { LiveStatus, VoiceTransport } from '../hooks/useLiveVoice.ts';

export type ActiveTab = 'oggi' | 'diario' | 'pnl' | 'report';

interface TopNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenSos: () => void;
  onOpenProfile: () => void;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  xp: number;
  liveStatus: LiveStatus;
  voiceTransport?: VoiceTransport;
  isRecordingTurn?: boolean;
  isProcessingTurn?: boolean;
  onToggleLiveCall: () => void;
  onSendVoiceTurn?: () => void;
  onStartNextVoiceTurn?: () => void;
  onStopLiveCall?: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'oggi', label: 'Oggi', icon: MessageCircleHeart },
  { id: 'diario', label: 'Diario & Piano', icon: BookOpen },
  { id: 'pnl', label: 'Strumenti PNL', icon: Compass },
  { id: 'report', label: 'Progressi & Report', icon: BarChart3 },
];

export function TopNav({
  activeTab,
  onSelectTab,
  onOpenSos,
  onOpenProfile,
  isDarkTheme,
  onToggleTheme,
  xp,
  liveStatus,
  voiceTransport = 'websocket',
  isRecordingTurn = false,
  isProcessingTurn = false,
  onToggleLiveCall,
  onSendVoiceTurn,
  onStartNextVoiceTurn,
  onStopLiveCall,
  onSignOut,
}: TopNavProps) {
  const isLive = liveStatus === 'active' || liveStatus === 'connecting';
  const isTurnSendMode =
    liveStatus === 'active' && voiceTransport === 'turn' && isRecordingTurn;
  const isTurnProcessing =
    liveStatus === 'active' && voiceTransport === 'turn' && isProcessingTurn;
  const isTurnReadyForNext =
    liveStatus === 'active' &&
    voiceTransport === 'turn' &&
    !isRecordingTurn &&
    !isProcessingTurn;

  function handlePrimaryVoiceClick() {
    if (liveStatus === 'idle' || liveStatus === 'error') {
      onToggleLiveCall();
      return;
    }
    if (liveStatus === 'connecting') {
      onStopLiveCall?.();
      return;
    }
    if (voiceTransport === 'turn') {
      if (isRecordingTurn) {
        onSendVoiceTurn?.();
      } else if (!isProcessingTurn) {
        onStartNextVoiceTurn?.();
      }
      return;
    }
    onStopLiveCall?.();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#E4E6E0] bg-white/95 backdrop-blur-sm dark:border-[#2B3732] dark:bg-[#1B231F]/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        {/* Left: Brand Wordmark */}
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="font-editorial text-2xl font-semibold tracking-tight text-[#182420] dark:text-[#EAECE6]">
            Lucilla
          </span>
          <span className="hidden text-xs text-[#5C6762] xl:inline dark:text-[#A3B0AA]">
            Davide Rossi · <span className="font-mono tabular-nums">{xp} XP</span>
          </span>
        </div>

        {/* Center: 4 Single-line Nav Links */}
        <nav aria-label="Navigazione principale" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition-colors lg:px-3 lg:text-sm ${
                  isActive
                    ? 'bg-[#EDF3F0] text-[#182420] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                    : 'text-[#5C6762] hover:bg-[#F3F4F0] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:bg-[#222D28] dark:hover:text-[#EAECE6]'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    isActive
                      ? 'text-[#1F6E5C] dark:text-[#36A68C]'
                      : 'text-[#5C6762] dark:text-[#A3B0AA]'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Utilities + Live Audio Call / Send + Primary SOS CTA + Sign Out */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden sm:block">
            <PWAInstallButton />
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDarkTheme ? 'Passa a modalità Giorno' : 'Attiva modalità Sera Soft'}
            title={isDarkTheme ? 'Modalità Giorno' : 'Modalità Sera Soft'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E4E6E0] bg-white text-[#5C6762] transition-colors hover:bg-[#F3F4F0] hover:text-[#182420] dark:border-[#2B3732] dark:bg-[#1B231F] dark:text-[#A3B0AA] dark:hover:bg-[#222D28] dark:hover:text-[#EAECE6]"
          >
            {isDarkTheme ? <Sun className="h-4 w-4 text-[#E6B86A]" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Profilo clinico e impostazioni"
            title="Profilo & Impostazioni"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E4E6E0] bg-white text-[#5C6762] transition-colors hover:bg-[#F3F4F0] hover:text-[#182420] dark:border-[#2B3732] dark:bg-[#1B231F] dark:text-[#A3B0AA] dark:hover:bg-[#222D28] dark:hover:text-[#EAECE6]"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={isTurnProcessing}
            onClick={handlePrimaryVoiceClick}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors disabled:opacity-60 sm:px-3 sm:text-sm ${
              isTurnSendMode
                ? 'border-[#1F6E5C] bg-[#1F6E5C] font-semibold text-white hover:bg-[#185849]'
                : isTurnReadyForNext
                ? 'border-[#1F6E5C] bg-[#EDF3F0] font-semibold text-[#182420] hover:bg-[#DFECE6] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#EAECE6]'
                : isLive
                ? 'border-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]'
                : 'border-[#1F6E5C] bg-white text-[#1F6E5C] hover:bg-[#EDF3F0] dark:border-[#36A68C] dark:bg-[#1B231F] dark:text-[#36A68C] dark:hover:bg-[#1F332C]'
            }`}
          >
            {isTurnSendMode ? (
              <>
                <Send className="h-4 w-4" />
                <span className="sm:hidden">Invia</span>
                <span className="hidden sm:inline">Invia a Lucilla</span>
              </>
            ) : isTurnProcessing ? (
              <>
                <Mic className="h-4 w-4" />
                <span>Invio...</span>
              </>
            ) : isTurnReadyForNext ? (
              <>
                <Mic className="h-4 w-4 text-[#1F6E5C] dark:text-[#36A68C]" />
                <span className="sm:hidden">Parla</span>
                <span className="hidden sm:inline">Parla ancora</span>
              </>
            ) : isLive ? (
              <>
                <PhoneOff className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {liveStatus === 'connecting' ? 'Connessione...' : 'Chiudi Live'}
                </span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                <span className="hidden sm:inline">Parla Live</span>
              </>
            )}
          </button>

          {liveStatus === 'active' && voiceTransport === 'turn' && onStopLiveCall && (
            <button
              type="button"
              onClick={onStopLiveCall}
              aria-label="Chiudi chat vocale"
              title="Chiudi chat vocale"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B] transition-colors hover:bg-[#FEE2E2] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSos}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1F6E5C] px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#185849] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6E5C] sm:gap-2 sm:px-3.5 sm:text-sm"
          >
            <LifeBuoy className="h-4 w-4" />
            <span>SOS Onda</span>
          </button>

          <SignOutButton onSignOut={onSignOut} />
        </div>
      </div>

      {/* Mobile Nav Strip */}
      <nav
        aria-label="Navigazione mobile"
        className="flex border-t border-[#E4E6E0] bg-white px-2 md:hidden dark:border-[#2B3732] dark:bg-[#1B231F]"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-[#1F6E5C] dark:text-[#36A68C]'
                  : 'text-[#5C6762] dark:text-[#A3B0AA]'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label.split(' & ')[0]}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
