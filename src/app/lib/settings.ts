// Cài đặt người dùng lưu trên trình duyệt (localStorage).
// Giao diện Sáng/Tối vẫn do ThemeProvider giữ riêng.

export type Settings = {
  lang: "vi" | "en";
  notifyInGame: boolean; // chấm đỏ + danh sách ở chuông thông báo
  reduceMotion: boolean; // tắt bớt hiệu ứng chuyển động
  sound: {
    enabled: boolean;
    volume: number; // 0–100
    moves: boolean; // nước đi, ăn quân, chiếu
    match: boolean; // tìm thấy trận, kết thúc trận
    alerts: boolean; // lời mời hòa, sắp hết giờ
  };
};

export const DEFAULT_SETTINGS: Settings = {
  lang: "vi",
  notifyInGame: true,
  reduceMotion: false,
  sound: { enabled: true, volume: 70, moves: true, match: true, alerts: true },
};

const KEY = "cv-settings";
export const SETTINGS_EVENT = "cv:settings";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;

    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      sound: { ...DEFAULT_SETTINGS.sound, ...(raw.sound ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(value: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* bỏ qua */
  }

  applySettings(value);
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: value }));
}

// Áp dụng những cài đặt ảnh hưởng toàn trang.
export function applySettings(value: Settings) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.motion = value.reduceMotion ? "reduce" : "full";
}
