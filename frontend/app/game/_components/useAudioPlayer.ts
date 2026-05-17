"use client";

import { useCallback, useRef } from "react";

interface AudioConfig {
  sampleRate: number;
  channels: number;
}

export function useAudioPlayer() {
  const audioCtxRef  = useRef<AudioContext | null>(null); // The AudioContext instance for managing audio playback
  const gainNodeRef  = useRef<GainNode | null>(null); // The GainNode for controlling the audio volume
  const nextTimeRef  = useRef<number>(0); // The next scheduled time for audio playback, used to ensure smooth timing of audio chunks
  const volumeRef    = useRef<number>(1); // The current volume level, stored in a ref to allow updates without re-rendering the component
  const unlockRef    = useRef<(() => void) | null>(null); // A ref to store the unlock function for audio context
  const removeUnlock = useCallback(() => {
    if (unlockRef.current) {
      document.removeEventListener("click",   unlockRef.current);
      document.removeEventListener("keydown", unlockRef.current);
      unlockRef.current = null;
    }
  }, []);
  // Initializes the audio context with the specified configuration, 
  // sets up the gain node for volume contro
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

    // Unlock function : resumes the audio context on the first user interaction
    const unlock = () => { ctx.resume(); removeUnlock(); };  
    document.addEventListener("click",   unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    audioCtxRef.current = ctx;
    gainNodeRef.current = gain;
    nextTimeRef.current = 0;
  }, [removeUnlock]);

  // Stops audio playback and cleans up the audio context and gain node
  const stop = useCallback(() => {
    removeUnlock();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      gainNodeRef.current = null;
    }
    nextTimeRef.current = 0;
  }, [removeUnlock]);

  // Sets the audio volume by updating the gain node's gain value
  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = v;
    }
  }, []);

  // Plays a chunk of audio data by creating an AudioBuffer from the provided ArrayBuffer,
  // scheduling it to play at the correct time, and ensuring smooth playback by managing the timing of audio chunks
  const playChunk = useCallback((arrayBuffer: ArrayBuffer, channels: number) => {
    const ctx  = audioCtxRef.current; // get the current AudioContext
    const gain = gainNodeRef.current; // get the current GainNode
    if (!ctx || !gain) return; // if the audio context or gain node is not initialized, do nothing

    if (ctx.state === "suspended") ctx.resume(); // if the audio context is suspended, resume it to allow playback

    const raw    = new DataView(arrayBuffer); // create a DataView for reading the raw audio data from the ArrayBuffer
    
    // calculate the number of audio frames based on the byte length of the data, 
    // accounting for 16-bit samples and the number of channels
    const frames = (raw.byteLength / 2) / channels; 
    
    // create an AudioBuffer with the specified number of channels, 
    // frames, and sample rate
    const buf    = ctx.createBuffer(channels, frames, ctx.sampleRate); 

    // fill the AudioBuffer with the audio data from the ArrayBuffer,
    // converting the 16-bit integer samples to floating-point values in the range [-1, 1]
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