export type AmbientTrackId =
  | 'respiro_mattina'
  | 'slow_eating'
  | 'paracadute_onda'
  | 'sera_soft';

export interface AmbientTrackMeta {
  id: AmbientTrackId;
  title: string;
  subtitle: string;
  tempoLabel: string;
  /** Distinct synthesis profile per preset */
  waveform: OscillatorType;
  pluckWave: OscillatorType;
  arpeggioMode: 'ascending' | 'gentle_chime' | 'warm_fifths' | 'nocturne';
  /** Frequencies (Hz) of the evolving chord sequence */
  chords: number[][];
  /** Melodic notes (Hz) for sparse plucks */
  plucks: number[];
  /** Low-pass cutoff frequency (Hz) */
  padCutoffHz: number;
  /** Interval between chord shifts (ms) */
  chordIntervalMs: number;
  /** Interval between melodic plucks (ms) */
  pluckIntervalMs: number;
  /** Subtle breeze/rain noise gain (0 to 0.04) */
  natureGain: number;
  /** Optional slow-eating mindful fork reminder chime every ~16s */
  mindfulBiteChime?: boolean;
}

export const AMBIENT_TRACKS: AmbientTrackMeta[] = [
  {
    id: 'respiro_mattina',
    title: 'Mattina Serena',
    subtitle: 'Arpa chiara in Do maggiore e brezza leggera',
    tempoLabel: '64 BPM · Do Magg7',
    waveform: 'sine',
    pluckWave: 'triangle',
    arpeggioMode: 'ascending',
    chords: [
      [130.81, 196.0, 246.94, 329.63], // Cmaj7
      [174.61, 220.0, 261.63, 349.23], // Fmaj7
      [146.83, 220.0, 261.63, 329.63], // Dm9
      [196.0, 246.94, 293.66, 392.0], // G6
    ],
    plucks: [523.25, 587.33, 659.25, 783.99, 880.0],
    padCutoffHz: 1100,
    chordIntervalMs: 7000,
    pluckIntervalMs: 1650,
    natureGain: 0.015,
  },
  {
    id: 'slow_eating',
    title: 'Slow Eating — Campana Lenta',
    subtitle: 'Campana tibetana ogni 16s e rintocchi lenti per posare la forchetta',
    tempoLabel: '50 BPM · Pausa bocconi',
    waveform: 'triangle',
    pluckWave: 'sine',
    arpeggioMode: 'gentle_chime',
    chords: [
      [146.83, 220.0, 293.66, 349.23], // Dm7
      [164.81, 246.94, 293.66, 392.0], // Em7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [130.81, 196.0, 246.94, 293.66], // Cmaj9
    ],
    plucks: [392.0, 440.0, 523.25, 587.33, 659.25],
    padCutoffHz: 780,
    chordIntervalMs: 8500,
    pluckIntervalMs: 3200,
    natureGain: 0.008,
    mindfulBiteChime: true,
  },
  {
    id: 'paracadute_onda',
    title: 'Paracadute 17:30 — Calma',
    subtitle: 'Armonie calde in Re minore e impulsi lenti anti-tensione',
    tempoLabel: '54 BPM · Re Minore',
    waveform: 'sine',
    pluckWave: 'sine',
    arpeggioMode: 'warm_fifths',
    chords: [
      [116.54, 174.61, 233.08, 293.66], // Bbmaj7
      [130.81, 196.0, 261.63, 329.63], // C
      [146.83, 220.0, 261.63, 349.23], // Dm7
      [110.0, 164.81, 220.0, 261.63], // Am7
    ],
    plucks: [293.66, 349.23, 440.0, 523.25, 587.33],
    padCutoffHz: 680,
    chordIntervalMs: 8000,
    pluckIntervalMs: 2400,
    natureGain: 0.022,
  },
  {
    id: 'sera_soft',
    title: 'Sera Soft — Pioggia Serena',
    subtitle: 'Pioggia leggera e accordi gravi distensivi per il riposo',
    tempoLabel: '46 BPM · Notturno',
    waveform: 'sine',
    pluckWave: 'sine',
    arpeggioMode: 'nocturne',
    chords: [
      [98.0, 146.83, 196.0, 233.08], // Gm7 low
      [103.83, 155.56, 196.0, 261.63], // Abmaj7
      [87.31, 130.81, 174.61, 220.0], // Fmaj7 low
      [98.0, 146.83, 174.61, 246.94], // G7sus
    ],
    plucks: [311.13, 392.0, 466.16, 523.25],
    padCutoffHz: 520,
    chordIntervalMs: 10000,
    pluckIntervalMs: 3600,
    natureGain: 0.036,
  },
];

export interface ParsedCustomMusicSource {
  type: 'youtube' | 'audio' | 'invalid';
  embedUrl?: string;
  audioUrl?: string;
  youtubeId?: string;
}

export function parseCustomMusicUrl(rawUrl: string): ParsedCustomMusicSource {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { type: 'invalid' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { type: 'invalid' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { type: 'invalid' };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const isYoutube =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com';

  if (isYoutube) {
    let videoId: string | null = null;
    if (host === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/live/') || parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1] ?? null;
    } else {
      videoId = parsed.searchParams.get('v');
    }

    const listId = parsed.searchParams.get('list');
    if (videoId && /^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      const playlistSuffix =
        listId && /^[a-zA-Z0-9_-]{6,64}$/.test(listId)
          ? `&list=${encodeURIComponent(listId)}`
          : '';
      return {
        type: 'youtube',
        youtubeId: videoId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&enablejsapi=1&rel=0&playsinline=1${playlistSuffix}`,
      };
    }
    if (listId && /^[a-zA-Z0-9_-]{6,64}$/.test(listId)) {
      return {
        type: 'youtube',
        youtubeId: listId,
        embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(listId)}&autoplay=1&enablejsapi=1&rel=0&playsinline=1`,
      };
    }
    return { type: 'invalid' };
  }

  return {
    type: 'audio',
    audioUrl: parsed.toString(),
  };
}

class AmbientMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private padOscs: OscillatorNode[] = [];
  private padFilter: BiquadFilterNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private chordTimer: number | null = null;
  private pluckTimer: number | null = null;
  private chimeTimer: number | null = null;
  private externalAudio: HTMLAudioElement | null = null;
  private currentTrackId: string = 'respiro_mattina';
  private currentExternalUrl: string | null = null;
  private chordIndex = 0;
  private pluckStep = 0;
  private playing = false;
  private volume = 0.45;

  public isPlaying(): boolean {
    return this.playing;
  }

  public getTrackId(): string {
    return this.currentTrackId;
  }

  public getVolume(): number {
    return this.volume;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.0001;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.85;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public start(trackId?: AmbientTrackId, nextVolume?: number): void {
    if (trackId) this.currentTrackId = trackId;
    this.currentExternalUrl = null;
    this.stopExternalAudioOnly();

    if (typeof nextVolume === 'number') this.volume = Math.max(0, Math.min(1, nextVolume));

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    this.clearAudioNodesOnly();
    const track = AMBIENT_TRACKS.find((t) => t.id === this.currentTrackId) ?? AMBIENT_TRACKS[0];

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = track.padCutoffHz;
    filter.Q.value = 0.7;

    const padBus = ctx.createGain();
    padBus.gain.value = 0.24;
    filter.connect(padBus);
    padBus.connect(this.masterGain);
    this.padFilter = filter;

    this.chordIndex = 0;
    const initialChord = track.chords[0];

    initialChord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? track.waveform : 'sine';
      osc.frequency.value = freq;
      osc.detune.value = (idx - 1.5) * (track.id === 'paracadute_onda' ? 5.5 : 3.0);

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = idx === 0 ? 0.34 : 0.2;
      osc.connect(voiceGain);
      voiceGain.connect(filter);
      osc.start();
      this.padOscs.push(osc);
    });

    if (track.natureGain > 0) {
      const bufferSize = ctx.sampleRate * 3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        output[i] = (b0 + b1 + b2 + white * 0.1848) * 0.04;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = track.id === 'sera_soft' ? 680 : 460;
      noiseFilter.Q.value = 0.6;

      const nGain = ctx.createGain();
      nGain.gain.value = track.natureGain;

      noise.connect(noiseFilter);
      noiseFilter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start();
      this.noiseSource = noise;
      this.noiseGain = nGain;
    }

    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(Math.max(0.02, this.volume * 0.7), now + 1.1);

    this.chordTimer = window.setInterval(() => {
      if (!this.ctx || !this.playing) return;
      this.chordIndex = (this.chordIndex + 1) % track.chords.length;
      const chord = track.chords[this.chordIndex];
      const t = this.ctx.currentTime;
      this.padOscs.forEach((osc, i) => {
        const nextFreq = chord[i % chord.length];
        osc.frequency.setTargetAtTime(nextFreq, t, 0.9);
      });
    }, track.chordIntervalMs);

    this.pluckStep = 0;
    this.triggerPluck(track);
    this.pluckTimer = window.setInterval(() => {
      this.triggerPluck(track);
    }, track.pluckIntervalMs);

    if (track.mindfulBiteChime) {
      this.chimeTimer = window.setInterval(() => {
        this.triggerSingingBowl(528);
      }, 16000);
    }

    this.playing = true;
  }

  public startExternalAudio(
    trackId: string,
    audioUrl: string,
    nextVolume?: number,
    onError?: (msg: string) => void
  ): void {
    this.clearAudioNodesOnly();
    this.stopExternalAudioOnly();
    this.currentTrackId = trackId;
    this.currentExternalUrl = audioUrl;
    if (typeof nextVolume === 'number') this.volume = Math.max(0, Math.min(1, nextVolume));

    if (typeof window === 'undefined') return;
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = this.volume;
    audio.preload = 'auto';
    audio.onerror = () => {
      this.playing = false;
      onError?.('Impossibile riprodurre questo link audio diretto. Verifica che l’URL punti a un file MP3/OGG pubblico o usa un link YouTube.');
    };
    this.externalAudio = audio;
    this.playing = true;
    void audio.play().catch(() => {
      this.playing = false;
      onError?.('Il browser ha bloccato o non supporta questo flusso audio. Verifica il link nelle Impostazioni.');
    });
  }

  private triggerPluck(track: AmbientTrackMeta): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const noteIdx =
      track.arpeggioMode === 'ascending'
        ? this.pluckStep % track.plucks.length
        : track.arpeggioMode === 'nocturne'
        ? (track.plucks.length - 1 - (this.pluckStep % track.plucks.length))
        : (this.pluckStep * 2 + this.chordIndex) % track.plucks.length;
    this.pluckStep += 1;
    const freq = track.plucks[noteIdx];

    const osc = ctx.createOscillator();
    osc.type = track.pluckWave;
    osc.frequency.setValueAtTime(freq, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = track.padCutoffHz * 1.8;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(track.id === 'sera_soft' ? 0.08 : 0.12, now + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 2.5);
  }

  private triggerSingingBowl(baseFreq: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    [baseFreq, baseFreq * 1.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(idx === 0 ? 0.14 : 0.04, now + 0.06);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);

      osc.connect(env);
      env.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + 4.4);
    });
  }

  public setVolume(nextVolume: number): void {
    this.volume = Math.max(0, Math.min(1, nextVolume));
    if (this.externalAudio) {
      this.externalAudio.volume = this.volume;
    }
    if (this.ctx && this.masterGain && this.playing && !this.currentExternalUrl) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(Math.max(0.001, this.volume * 0.7), now, 0.08);
    }
  }

  public stop(): void {
    this.playing = false;
    this.stopExternalAudioOnly();
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.12);
    }
    window.setTimeout(() => {
      if (!this.playing) {
        this.clearAudioNodesOnly();
      }
    }, 350);
  }

  public getFrequencyData(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || !this.playing || this.currentExternalUrl) return false;
    this.analyser.getByteFrequencyData(target);
    return true;
  }

  private stopExternalAudioOnly(): void {
    if (this.externalAudio) {
      try {
        this.externalAudio.pause();
        this.externalAudio.src = '';
      } catch {
        // ignore cleanup
      }
      this.externalAudio = null;
    }
  }

  private clearAudioNodesOnly(): void {
    if (this.chordTimer !== null) {
      window.clearInterval(this.chordTimer);
      this.chordTimer = null;
    }
    if (this.pluckTimer !== null) {
      window.clearInterval(this.pluckTimer);
      this.pluckTimer = null;
    }
    if (this.chimeTimer !== null) {
      window.clearInterval(this.chimeTimer);
      this.chimeTimer = null;
    }
    for (const osc of this.padOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore stopped osc
      }
    }
    this.padOscs = [];
    if (this.padFilter) {
      try {
        this.padFilter.disconnect();
      } catch {
        // ignore
      }
      this.padFilter = null;
    }
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
        this.noiseSource.disconnect();
      } catch {
        // ignore
      }
      this.noiseSource = null;
    }
    if (this.noiseGain) {
      try {
        this.noiseGain.disconnect();
      } catch {
        // ignore
      }
      this.noiseGain = null;
    }
  }
}

export const ambientMusicEngine = new AmbientMusicEngine();
