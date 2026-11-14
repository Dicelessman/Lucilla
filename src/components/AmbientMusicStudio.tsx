import React, { useEffect, useRef } from 'react';
import {
  ExternalLink,
  Pause,
  Play,
  Plus,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CustomMusicTrack } from '../types/coach.ts';
import {
  AMBIENT_TRACKS,
  ambientMusicEngine,
  parseCustomMusicUrl,
} from '../utils/ambientMusicEngine.ts';

interface AmbientMusicStudioProps {
  isPlaying: boolean;
  trackId: string;
  customTracks: CustomMusicTrack[];
  volume: number;
  audioError?: string | null;
  onSelectTrack: (trackId: string) => void;
  onTogglePlay: () => void;
  onChangeVolume: (volume: number) => void;
  onOpenMusicSettings: () => void;
}

export function AmbientMusicStudio({
  isPlaying,
  trackId,
  customTracks,
  volume,
  audioError,
  onSelectTrack,
  onTogglePlay,
  onChangeVolume,
  onOpenMusicSettings,
}: AmbientMusicStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const builtinTrack = AMBIENT_TRACKS.find((t) => t.id === trackId);
  const customTrack = customTracks.find((t) => t.id === trackId);
  const parsedCustom = customTrack ? parseCustomMusicUrl(customTrack.url) : null;
  const isYoutubePlaying =
    isPlaying && Boolean(customTrack && parsedCustom?.type === 'youtube' && parsedCustom.embedUrl);

  const activeTitle = customTrack
    ? customTrack.title
    : (builtinTrack ?? AMBIENT_TRACKS[0]).title;
  const activeSubtitle = customTrack
    ? parsedCustom?.type === 'youtube'
      ? `Brano personale YouTube · ${activeTitle}`
      : `Brano personale audio · ${activeTitle}`
    : `${(builtinTrack ?? AMBIENT_TRACKS[0]).title} · ${(builtinTrack ?? AMBIENT_TRACKS[0]).subtitle}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buffer = new Uint8Array(new ArrayBuffer(32));
    let rafId = 0;

    const renderFrame = (time: number) => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const hasAudio = ambientMusicEngine.getFrequencyData(buffer);
      const isDark = document.documentElement.classList.contains('dark');
      const barCount = 24;
      const gap = 4;
      const barWidth = (width - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        let ratio = 0.14;
        if (isPlaying) {
          if (hasAudio) {
            const raw = buffer[i % buffer.length] / 255;
            const wave = 0.18 + 0.14 * Math.sin(time * 0.002 + i * 0.45);
            ratio = Math.min(0.95, Math.max(0.14, raw * 0.72 + wave));
          } else {
            ratio = 0.25 + 0.25 * Math.abs(Math.sin(time * 0.0022 + i * 0.35));
          }
        }
        const barHeight = Math.max(3, Math.round(height * ratio));
        const y = height - barHeight;

        ctx.fillStyle = isPlaying
          ? isDark
            ? '#36A68C'
            : '#1F6E5C'
          : isDark
          ? '#2B3732'
          : '#D7DBD2';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      if (isPlaying) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, trackId]);

  return (
    <section
      aria-label="Rilassati con la musica"
      className="rounded-xl border border-[#E4E6E0] bg-white px-5 py-4 dark:border-[#2B3732] dark:bg-[#1B231F]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Play + Title + Visualizer */}
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Metti in pausa la musica' : 'Riproduci musica'}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
              isPlaying
                ? 'bg-[#1F6E5C] text-white hover:bg-[#185849]'
                : 'border border-[#1F6E5C] bg-[#EDF3F0] text-[#1F6E5C] hover:bg-[#DCE9E3] dark:border-[#36A68C] dark:bg-[#1F332C] dark:text-[#36A68C]'
            }`}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>

          <div className="min-w-0">
            <h2 className="truncate font-editorial text-base font-medium text-[#182420] dark:text-[#EAECE6]">
              Rilassati con la musica
            </h2>
            <p className="truncate text-xs text-[#5C6762] dark:text-[#A3B0AA]">
              {activeSubtitle}
            </p>
          </div>

          <canvas
            ref={canvasRef}
            width={148}
            height={36}
            aria-hidden="true"
            className="hidden shrink-0 sm:block"
          />
        </div>

        {/* Right: Built-in + Custom Track Selector + Settings Shortcut + Volume */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg bg-[#F3F4F0] p-1 dark:bg-[#161D1A]">
            {AMBIENT_TRACKS.map((t) => {
              const selected = t.id === trackId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTrack(t.id)}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-white text-[#182420] shadow-xs dark:bg-[#222D28] dark:text-[#EAECE6]'
                      : 'text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                  }`}
                >
                  {t.title.split(' — ')[0]}
                </button>
              );
            })}

            {customTracks.map((ct) => {
              const selected = ct.id === trackId;
              return (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => onSelectTrack(ct.id)}
                  className={`max-w-[140px] truncate whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-white text-[#1F6E5C] shadow-xs dark:bg-[#222D28] dark:text-[#36A68C]'
                      : 'text-[#5C6762] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:text-[#EAECE6]'
                  }`}
                >
                  {ct.title}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenMusicSettings}
            title="Aggiungi link YouTube o audio nelle Impostazioni"
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#E4E6E0] bg-[#FAFBF8] px-2.5 py-1.5 text-xs font-medium text-[#1F6E5C] transition-colors hover:bg-[#EDF3F0] dark:border-[#2B3732] dark:bg-[#161D1A] dark:text-[#36A68C] dark:hover:bg-[#1F332C]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Link musica</span>
          </button>

          <div className="flex items-center gap-2 rounded-lg border border-[#E4E6E0] bg-[#FAFBF8] px-2.5 py-1.5 dark:border-[#2B3732] dark:bg-[#161D1A]">
            <button
              type="button"
              onClick={() => onChangeVolume(volume > 0 ? 0 : 0.45)}
              aria-label={volume === 0 ? 'Riattiva volume' : 'Azzera volume'}
              className="text-[#5C6762] hover:text-[#1F6E5C] dark:text-[#A3B0AA] dark:hover:text-[#36A68C]"
            >
              {volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <input
              type="range"
              aria-label="Volume musica"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onChangeVolume(Number(e.target.value))}
              className="w-16 accent-[#1F6E5C]"
            />
          </div>
        </div>
      </div>

      {audioError && (
        <p className="mt-2.5 text-xs text-[#B91C1C] dark:text-[#FCA5A5]">{audioError}</p>
      )}

      {isYoutubePlaying && parsedCustom?.embedUrl && customTrack && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[#E4E6E0] bg-[#F8F9F6] p-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-[#2B3732] dark:bg-[#161D1A]">
          <div className="aspect-video w-full overflow-hidden rounded-md sm:w-64">
            <iframe
              key={customTrack.id}
              src={parsedCustom.embedUrl}
              title={customTrack.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
          <div className="flex flex-1 flex-col justify-between gap-2 px-1 text-xs">
            <p className="font-medium text-[#182420] dark:text-[#EAECE6]">
              In riproduzione da YouTube: {customTrack.title}
            </p>
            <p className="text-[#5C6762] dark:text-[#A3B0AA]">
              Se il video richiede un tocco manuale su mobile, premi Play direttamente nel riquadro.
            </p>
            <div>
              <a
                href={customTrack.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#1F6E5C] hover:underline dark:text-[#36A68C]"
              >
                <span>Apri link originale</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface AmbientMusicMiniBarProps {
  isPlaying: boolean;
  trackId: string;
  customTracks: CustomMusicTrack[];
  volume: number;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onChangeVolume: (volume: number) => void;
  onStopAndHide: () => void;
}

export function AmbientMusicMiniBar({
  isPlaying,
  trackId,
  customTracks,
  volume,
  onTogglePlay,
  onNextTrack,
  onChangeVolume,
  onStopAndHide,
}: AmbientMusicMiniBarProps) {
  const builtin = AMBIENT_TRACKS.find((t) => t.id === trackId);
  const custom = customTracks.find((t) => t.id === trackId);
  const title = custom ? custom.title : (builtin ?? AMBIENT_TRACKS[0]).title;

  return (
    <div
      role="region"
      aria-label="Lettore Rilassati con la musica"
      className="no-print fixed right-4 bottom-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-[#C6D5CE] bg-white/95 px-3.5 py-2 shadow-md backdrop-blur-sm dark:border-[#2F4E42] dark:bg-[#1B231F]/95"
    >
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Pausa musica' : 'Avvia musica'}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1F6E5C] text-white hover:bg-[#185849]"
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>

      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[#182420] dark:text-[#EAECE6]">
          {title}
        </p>
        <p className="truncate text-[10px] text-[#5C6762] dark:text-[#A3B0AA]">
          Rilassati con la musica
        </p>
      </div>

      <button
        type="button"
        onClick={onNextTrack}
        aria-label="Brano successivo"
        title="Brano successivo"
        className="rounded-md p-1 text-[#5C6762] hover:bg-[#F3F4F0] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:bg-[#222D28] dark:hover:text-[#EAECE6]"
      >
        <SkipForward className="h-3.5 w-3.5" />
      </button>

      <input
        type="range"
        aria-label="Volume lettore musica"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={(e) => onChangeVolume(Number(e.target.value))}
        className="hidden w-14 accent-[#1F6E5C] sm:block"
      />

      <button
        type="button"
        onClick={onStopAndHide}
        aria-label="Chiudi lettore musica"
        className="rounded-md p-1 text-[#5C6762] hover:bg-[#F3F4F0] hover:text-[#182420] dark:text-[#A3B0AA] dark:hover:bg-[#222D28] dark:hover:text-[#EAECE6]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
