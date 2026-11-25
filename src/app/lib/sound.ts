// Âm thanh game tạo bằng Web Audio (không cần file âm thanh).
// Tự tuân theo cài đặt Âm thanh của người dùng.

import { loadSettings, type Settings } from "./settings";

export type SoundName = "move" | "capture" | "check" | "found" | "end" | "alert" | "test";

let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined") return null;

  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AC) return null;
    ctx = new AC();
  }

  if (ctx.state === "suspended") void ctx.resume();

  return ctx;
}

function allowed(name: SoundName, s: Settings) {
  if (!s.sound.enabled || s.sound.volume <= 0) return false;
  if (name === "move" || name === "capture" || name === "check") return s.sound.moves;
  if (name === "found" || name === "end") return s.sound.match;
  if (name === "alert") return s.sound.alerts;

  return true;
}

// Một nốt ngắn có đường bao âm lượng.
function tone(
  ac: AudioContext,
  out: AudioNode,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  peak = 1,
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// Tiếng "cộc" của quân gỗ: nhiễu ngắn qua bộ lọc.
function knock(ac: AudioContext, out: AudioNode, start: number, pitch: number, peak = 1) {
  const length = Math.floor(ac.sampleRate * 0.06);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);

  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();

  src.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = pitch;
  filter.Q.value = 4;
  gain.gain.value = peak;
  src.connect(filter).connect(gain).connect(out);
  src.start(start);
}

export function playSound(name: SoundName, settings: Settings = loadSettings()) {
  if (!allowed(name, settings)) return;

  const ac = audio();

  if (!ac) return;

  const master = ac.createGain();

  master.gain.value = (settings.sound.volume / 100) * 0.6;
  master.connect(ac.destination);

  const t = ac.currentTime + 0.01;

  switch (name) {
    case "move":
      knock(ac, master, t, 900, 1.2);
      break;
    case "capture":
      knock(ac, master, t, 700, 1.4);
      knock(ac, master, t + 0.07, 1100, 1);
      break;
    case "check":
      knock(ac, master, t, 900, 1.2);
      tone(ac, master, 880, t + 0.05, 0.18, "triangle", 0.35);
      break;
    case "found":
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, master, f, t + i * 0.09, 0.35, "triangle", 0.4));
      break;
    case "end":
      [784, 659, 523].forEach((f, i) => tone(ac, master, f, t + i * 0.14, 0.45, "sine", 0.45));
      break;
    case "alert":
      tone(ac, master, 988, t, 0.12, "square", 0.12);
      tone(ac, master, 988, t + 0.16, 0.12, "square", 0.12);
      break;
    case "test":
      knock(ac, master, t, 900, 1.2);
      tone(ac, master, 659, t + 0.12, 0.3, "triangle", 0.35);
      break;
  }
}
