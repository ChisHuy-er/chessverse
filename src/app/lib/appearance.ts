// Ảnh đại diện, khung và nền hồ sơ người chơi có thể chọn.
// Mã (id) được lưu ở backend; danh sách hợp lệ phải khớp với backend/src/online/appearance.ts.

export type Lang = "vi" | "en";

export type Appearance = {
  avatar: string | null; // null = dùng chữ cái đầu của tên
  frame: string;
  cover: string;
};

export const DEFAULT_APPEARANCE: Appearance = {
  avatar: null,
  frame: "f02",
  cover: "academy",
};

export const AVATARS = Array.from({ length: 12 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");

  return { id: `a${n}`, src: `/images/academy/avatars/avatar-${n}.webp` };
});

// cx, cy: tâm lỗ tròn của khung (% chiều rộng / % chiều cao ảnh khung)
// r: bán kính lỗ tròn (% chiều rộng). ar: tỉ lệ cao / rộng của ảnh khung.
// Các số này được đo tự động từ ảnh để ảnh đại diện nằm vừa khít trong khung.
const FRAME_GEOMETRY: Record<string, { cx: number; cy: number; r: number; ar: number; vi: string; en: string }> = {
  "01": { cx: 53.82, cy: 45.71, r: 32.14, ar: 1.1483, vi: "Xa Thạch Sapphire", en: "Sapphire Rook" },
  "02": { cx: 54.43, cy: 47.84, r: 31.59, ar: 1.0912, vi: "Hoàng Kim", en: "Royal Gold" },
  "03": { cx: 52.88, cy: 44.95, r: 31.73, ar: 1.0717, vi: "Mã Băng", en: "Ice Knight" },
  "04": { cx: 51.06, cy: 49.01, r: 32.31, ar: 1.0879, vi: "Vương Miện", en: "Golden Crown" },
  "05": { cx: 49.25, cy: 47.04, r: 33.04, ar: 1.09, vi: "Tượng Bạc", en: "Silver Bishop" },
  "06": { cx: 55.61, cy: 42.18, r: 31.58, ar: 1.1107, vi: "Ngân Hà", en: "Galaxy Pawn" },
  "07": { cx: 53.97, cy: 44.3, r: 31.35, ar: 1.1107, vi: "Pha Lê Tuyết", en: "Frost Crystal" },
  "08": { cx: 50.9, cy: 43.98, r: 33.33, ar: 1.1107, vi: "Kim Long", en: "Golden Dragon" },
  "09": { cx: 52.82, cy: 40.73, r: 30.29, ar: 1.1107, vi: "Hỏa Tím", en: "Violet Flame" },
  "10": { cx: 48.15, cy: 43.32, r: 32.96, ar: 1.1107, vi: "Lá Ngọc", en: "Emerald Leaf" },
  "11": { cx: 53.2, cy: 41.03, r: 32.66, ar: 0.9868, vi: "Cánh Thiên Thần", en: "Winged Sapphire" },
  "12": { cx: 52.66, cy: 43.53, r: 30.55, ar: 0.9707, vi: "Thành Trì", en: "Fortress" },
  "13": { cx: 51.97, cy: 38.78, r: 32.44, ar: 0.9772, vi: "Lâu Đài Xanh", en: "Blue Castle" },
  "14": { cx: 51.11, cy: 41.25, r: 32.18, ar: 0.9609, vi: "Thư Viện", en: "Golden Book" },
  "15": { cx: 49.4, cy: 41.84, r: 33.46, ar: 0.9835, vi: "Đấu Trường", en: "Chess Arena" },
};

export const FRAMES = Object.entries(FRAME_GEOMETRY).map(([n, g]) => ({
  id: `f${n}`,
  src: `/images/academy/frames/frame-${n}.webp`,
  ...g,
}));

export const COVERS: { id: string; src: string; vi: string; en: string }[] = [
  { id: "academy", src: "/images/academy/pf/cover.jpg", vi: "Học viện", en: "Academy" },
  { id: "castle", src: "/images/academy/covers/cover-castle.jpg", vi: "Lâu đài cờ vua", en: "Chess Castle" },
  { id: "moon", src: "/images/academy/covers/cover-moon.jpg", vi: "Đêm trăng", en: "Moonlit Night" },
  { id: "aurora", src: "/images/academy/covers/cover-aurora.jpg", vi: "Cực quang", en: "Aurora" },
  { id: "winter", src: "/images/academy/covers/cover-winter.jpg", vi: "Giáng sinh", en: "Winter Village" },
  { id: "sakura", src: "/images/academy/covers/cover-sakura.jpg", vi: "Hoa anh đào", en: "Sakura" },
  { id: "autumn", src: "/images/academy/covers/cover-autumn.jpg", vi: "Mùa thu", en: "Autumn" },
  { id: "beach", src: "/images/academy/covers/cover-beach.jpg", vi: "Biển xanh", en: "Ocean" },
];

export function getFrame(id: string | null | undefined) {
  return FRAMES.find((f) => f.id === id) ?? FRAMES.find((f) => f.id === DEFAULT_APPEARANCE.frame)!;
}

export function getAvatar(id: string | null | undefined) {
  return AVATARS.find((a) => a.id === id) ?? null;
}

export function getCover(id: string | null | undefined) {
  return COVERS.find((c) => c.id === id) ?? COVERS[0];
}

export function normalizeAppearance(raw: Partial<Appearance> | null | undefined): Appearance {
  return {
    avatar: getAvatar(raw?.avatar)?.id ?? null,
    frame: getFrame(raw?.frame).id,
    cover: getCover(raw?.cover).id,
  };
}

// Sự kiện báo cho thanh trên cùng biết người dùng vừa đổi ảnh đại diện/khung.
export const APPEARANCE_EVENT = "cv:appearance";
