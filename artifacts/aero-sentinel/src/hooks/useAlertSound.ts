import { useRef, useCallback } from "react";

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx!.state === "suspended") audioCtx!.resume();
  return audioCtx!;
}

function playTone(freq: number, duration: number, startTime: number, volume = 0.25, type: OscillatorType = "sine") {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Sound 1 Single — Premium Tri-Tone (High→Mid→Low, single hit)
export function playAlertSound() {
  const t: number = getCtx().currentTime;
  playTone(1200, 0.15, t, 0.25, "sine");
  playTone(900, 0.12, t + 0.08, 0.2, "sine");
  playTone(600, 0.2, t + 0.15, 0.25, "sine");
}

export function useAlertSound() {
  const soundEnabled = useRef(true);

  const setEnabled = useCallback((v: boolean) => {
    soundEnabled.current = v;
    try { localStorage.setItem("aerosentinel-sound", v ? "1" : "0"); } catch {}
  }, []);

  const isEnabled = useCallback(() => {
    const stored = localStorage.getItem("aerosentinel-sound");
    if (stored !== null) soundEnabled.current = stored !== "0";
    return soundEnabled.current;
  }, []);

  const play = useCallback(() => {
    if (soundEnabled.current) playAlertSound();
  }, []);

  return { play, setEnabled, isEnabled };
}
