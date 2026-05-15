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

  const init = useCallback((config: AudioConfig) => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
    }
    const ctx  = new AudioContext({ sampleRate: config.sampleRate });
    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current;
    gain.connect(ctx.destination);
    ctx.resume();
    audioCtxRef.current = ctx;
    gainNodeRef.current = gain;
    nextTimeRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      gainNodeRef.current = null;
    }
    nextTimeRef.current = 0;
  }, []);

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