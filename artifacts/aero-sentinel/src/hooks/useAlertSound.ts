import { useCallback, useEffect } from "react";

// ─── Programatik WAV beep oluştur ───────────────────────────────────────────
// AudioContext user gesture gerektirir, bu yüzden <audio> elementi ile
// programatik WAV beep oluşturuyoruz. Bu yöntem user gesture gerektirmez.
function createBeepWavUrl(): string {
  const sampleRate = 22050;
  const durationMs = 350;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (t < 0.15) {
      const env = Math.max(0, 1 - t / 0.15);
      sample += Math.sin(2 * Math.PI * 1200 * t) * 0.3 * env;
    }
    if (t >= 0.08 && t < 0.20) {
      const env = Math.max(0, 1 - (t - 0.08) / 0.12);
      sample += Math.sin(2 * Math.PI * 900 * t) * 0.25 * env;
    }
    if (t >= 0.15 && t < 0.35) {
      const env = Math.max(0, 1 - (t - 0.15) / 0.20);
      sample += Math.sin(2 * Math.PI * 600 * t) * 0.3 * env;
    }

    view.setInt16(44 + i * bytesPerSample, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

// ─── Global beep URL (bir kez oluştur) ──────────────────────────────────────
let _beepUrl: string | null = null;
function getBeepUrl(): string {
  if (!_beepUrl) _beepUrl = createBeepWavUrl();
  return _beepUrl;
}

// ─── Audio elementi ile beep çal ────────────────────────────────────────────
export function playAlertSound() {
  try {
    const audio = new Audio(getBeepUrl());
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch { /* ignore */ }
}

export function useAlertSound() {
  const soundEnabled = useCallback(() => {
    return localStorage.getItem("aerosentinel-sound") !== "0";
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    try { localStorage.setItem("aerosentinel-sound", v ? "1" : "0"); } catch {}
  }, []);

  const play = useCallback(() => {
    if (soundEnabled()) playAlertSound();
  }, [soundEnabled]);

  return { play, setEnabled, isEnabled: soundEnabled };
}
