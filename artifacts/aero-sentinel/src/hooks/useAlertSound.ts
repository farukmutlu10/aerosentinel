import { useCallback, useEffect } from "react";

// ─── AudioContext tabanlı beep ───────────────────────────────────────────────
// Tarayıcılar user gesture olmadan AudioContext'i suspended tutar.
// Bu yüzden unlock mekanizması gerekiyor.

let audioCtx: AudioContext | null = null;
let _audioUnlocked = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

// ─── AudioContext unlock — sayfa yüklendiğinde hemen çağrılır ────────────────
function setupAudioUnlock() {
  if (_audioUnlocked || typeof window === "undefined") return;
  _audioUnlocked = true;

  const unlock = () => {
    try {
      const ctx = getCtx();
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    } catch { /* ignore */ }
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("pointerdown", unlock);
  };

  window.addEventListener("click", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
  window.addEventListener("pointerdown", unlock, { once: true });
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

// ─── Public: beep çal ───────────────────────────────────────────────────────
export function playAlertSound() {
  try {
    const ctx = getCtx();
    // AudioContext suspended ise resume et
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const t = ctx.currentTime;
    playTone(1200, 0.15, t, 0.25, "sine");
    playTone(900, 0.12, t + 0.08, 0.2, "sine");
    playTone(600, 0.2, t + 0.15, 0.25, "sine");
  } catch (err) {
    console.warn("[AeroSound] beep hatası:", err);
  }
}

export function useAlertSound() {
  // ─── Sayfa yüklendiğinde AudioContext unlock'ı hemen başlat ─────────────
  useEffect(() => {
    setupAudioUnlock();
  }, []);

  const soundEnabled = useCallback(() => {
    return localStorage.getItem("aerosentinel-sound") !== "0";
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    try { localStorage.setItem("aerosentinel-sound", v ? "1" : "0"); } catch {}
  }, []);

  const play = useCallback(() => {
    if (soundEnabled()) {
      playAlertSound();
    }
  }, [soundEnabled]);

  return { play, setEnabled, isEnabled: soundEnabled };
}
