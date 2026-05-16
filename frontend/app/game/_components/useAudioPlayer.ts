"use client";

import { useCallback, useRef } from "react";

interface AudioConfig {
  sampleRate: number;
  channels: number;
}

export function useAudioPlayer() {
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const gainNodeRef  = useRef<GainNode | null>(null);
  const nextTimeRef  = useRef<number>(0);
  const volumeRef    = useRef<number>(1);
  const unlockRef    = useRef<(() => void) | null>(null);

  const removeUnlock = useCallback(() => {
    if (unlockRef.current) {
      document.removeEventListener("click",   unlockRef.current);
      document.removeEventListener("keydown", unlockRef.current);
      unlockRef.current = null;
    }
  }, []);

  const init = useCallback((config: AudioConfig) => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
    }
    removeUnlock();
    const ctx  = new AudioContext({ sampleRate: config.sampleRate });
    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current;
    gain.connect(ctx.destination);
    ctx.resume();

    // Safari keeps AudioContext suspended until a user gesture; unlock on first interaction.
    const unlock = () => { ctx.resume(); removeUnlock(); };
    unlockRef.current = unlock;
    document.addEventListener("click",   unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    audioCtxRef.current = ctx;
    gainNodeRef.current = gain;
    nextTimeRef.current = 0;
  }, [removeUnlock]);

  const stop = useCallback(() => {
    removeUnlock();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      gainNodeRef.current = null;
    }
    nextTimeRef.current = 0;
  }, [removeUnlock]);

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = v;
    }
  }, []);

  const playChunk = useCallback((arrayBuffer: ArrayBuffer, channels: number) => {
    const ctx  = audioCtxRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain) return;

    if (ctx.state === "suspended") ctx.resume();

    const raw    = new DataView(arrayBuffer);
    const frames = (raw.byteLength / 2) / channels;
    const buf    = ctx.createBuffer(channels, frames, ctx.sampleRate);

    for (let ch = 0; ch < channels; ch++) {
      const out = buf.getChannelData(ch);
      for (let i = 0; i < frames; i++) {
        out[i] = raw.getInt16((i * channels + ch) * 2, true) / 32768;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);

    const now = ctx.currentTime;
    if (nextTimeRef.current < now + 0.05) nextTimeRef.current = now + 0.05;
    src.start(nextTimeRef.current);
    nextTimeRef.current += buf.duration;
  }, []);

  return { init, stop, setVolume, playChunk };
}