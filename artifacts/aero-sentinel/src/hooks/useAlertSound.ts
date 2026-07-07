import { useCallback, useEffect } from "react";

// ─── AudioContext tabanlı beep ───────────────────────────────────────────────
// Tarayıcılar user gesture olmadan AudioContext'i suspended tutar.
// Bu yüzden unlock mekanizması gerekiyor.

let audioCtx: AudioContext | null = null;
let _audioUnlocked = false;
// Tarayıcı autoplay politikası yüzünden context suspended kaldığı için bir beep
// çalınamadıysa, bir sonraki user gesture'da (unlock) tekrar denenmesi için
// kuyruğa alınır — aksi halde o alert için sessizce hiç ses çıkmaz ve hiçbir
// hata da görünmez.
let _pendingBeep = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
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

function emitTones(ctx: AudioContext) {
  const t = ctx.currentTime;
  playTone(1200, 0.15, t, 0.25, "sine");
  playTone(900, 0.12, t + 0.08, 0.2, "sine");
  playTone(600, 0.2, t + 0.15, 0.25, "sine");
}

// Best-effort tactile fallback for when AudioContext can't produce sound
// (suspended, no prior user gesture). Some Android browsers still allow
// navigator.vibrate() without a fresh gesture; many recent ones restrict it
// the same as autoplay, so this may silently no-op — that's fine, it costs
// nothing to try and never blocks the audio path.
function tryVibrate(pattern: number[] = [200, 100, 200, 100, 200]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch { /* ignore — unsupported or restricted */ }
}

// ─── AudioContext unlock — sayfa yüklendiğinde hemen çağrılır ────────────────
function setupAudioUnlock() {
  if (_audioUnlocked || typeof window === "undefined") return;
  _audioUnlocked = true;

  const unlock = () => {
    try {
      const ctx = getCtx();
      if (ctx.state === "suspended") {
        ctx.resume()
          .then(() => {
            if (_pendingBeep && ctx.state === "running") {
              _pendingBeep = false;
              emitTones(ctx);
            }
          })
          .catch((err) => console.warn("[AeroSound] unlock resume başarısız:", err));
      }
    } catch (err) {
      console.warn("[AeroSound] unlock hatası:", err);
    }
    // Tüm event listener'ları tek seferde kaldır
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

// ─── Public: beep çal ───────────────────────────────────────────────────────
export function playAlertSound() {
  try {
    const ctx = getCtx();
    if (ctx.state === "running") {
      emitTones(ctx);
      tryVibrate(); // extra tactile cue even when audio works — useful when device volume is low
      return;
    }
    // Suspended (veya closed) — resume dene, ama SADECE gerçekten "running"
    // durumuna geçtiyse ses çal. Önceki kod resume().catch() içinde bile
    // tonu çalmayı deniyordu; suspended context'te oscillator/gain node'ları
    // schedule edilir ama hiçbir ses üretilmez — sessiz başarısızlık, hiç
    // log da yok. Şimdi başarısız/hâlâ-suspended durumunda beep bir sonraki
    // user gesture'a kadar kuyruğa alınıyor ve durum açıkça loglanıyor.
    tryVibrate(); // try immediately — some browsers allow vibrate without a gesture even when audio is blocked
    ctx.resume()
      .then(() => {
        if (ctx.state === "running") {
          emitTones(ctx);
        } else {
          _pendingBeep = true;
          console.warn(`[AeroSound] resume sonrası context hâlâ '${ctx.state}' — beep kuyruğa alındı, bir sonraki kullanıcı etkileşiminde çalınacak`);
        }
      })
      .catch((err) => {
        _pendingBeep = true;
        console.warn("[AeroSound] resume başarısız (muhtemelen autoplay politikası) — beep kuyruğa alındı:", err);
      });
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
