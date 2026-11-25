// Danh mục Cửa hàng phía web — giá và mã phải khớp backend/src/online/shop.catalog.ts.
import { COVERS, FRAMES } from "./appearance";

export type Currency = "coins" | "gems";
export type Category = "piece" | "board" | "effect" | "frame" | "title" | "bundle";

export type ShopEntry = {
  id: string;
  category: Category;
  name: string;
  tag: string;
  price: number;
  currency: Currency;
  free?: boolean;
  available: boolean;
  image?: string;
  // Bàn cờ: màu ô sáng / ô tối
  board?: { light: string; dark: string };
  // Tặng kèm khi sở hữu vật phẩm này (không bán riêng)
  bundledWith?: string;
  // Hiệu ứng: thuộc bộ quân nào (bật khi dùng bộ quân đó)
  effectFor?: string;
  // Hiệu ứng dạng chuỗi khung hình (để xem trước có chuyển động)
  sprite?: FxSprite;
  // Khung/nền: mã dùng trong Hồ sơ
  frameId?: string;
  coverId?: string;
};

export type Wallet = {
  coins: number;
  gems: number;
  boardTheme: string;
  pieceSet?: string;
  owned: string[];
};

const SHOP = "/images/academy/shop";

// Bộ quân đã có hình trong game: thư mục chứa wK.webp, bQ.webp...
// Bộ không có trong danh sách này (vd. set1 Cổ điển) dùng quân cờ mặc định.
// Có bộ quân thì có luôn bàn cờ cùng chủ đề — khớp backend BUNDLED
export const BUNDLED: Record<string, string> = {
  "board:samurai": "piece:set4",
  "board:hacam": "piece:set2",
  "effect:hacam-select": "piece:set2",
  "effect:hacam-move": "piece:set2",
  "effect:hacam-capture": "piece:set2",
  "effect:hacam-promote": "piece:set2",
  "effect:hacam-check": "piece:set2",
  "effect:hacam-victory": "piece:set2",
};

export const PIECE_SKINS: Record<string, string> = {
  set2: "/images/academy/pieces/hacam",
  set4: "/images/academy/pieces/samurai",
};

export function pieceSkinPath(set: string | undefined) {
  return set ? PIECE_SKINS[set] : undefined;
}

// Hiệu ứng chuyển động: ảnh dải ngang gồm `frames` khung hình, mỗi khung tỉ lệ rộng/cao = `ratio`
export type FxSprite = { src: string; frames: number; ratio: number };

export type FxKind = "select" | "move" | "capture" | "promote" | "check" | "victory";

export type PieceFx = {
  selectTile: string; // khung sáng phủ ô đang chọn
  legal: string; // dấu ô đi được
  sprites: Record<FxKind, FxSprite>;
};

const FX = "/images/academy/fx/hacam";

// Hiệu ứng đặc biệt đi kèm bộ quân
export const PIECE_FX: Record<string, PieceFx> = {
  set2: {
    selectTile: `${FX}/select.webp`,
    legal: `${FX}/legal.webp`,
    sprites: {
      select: { src: `${FX}/select-strip.webp`, frames: 5, ratio: 130 / 80 },
      move: { src: `${FX}/move-strip.webp`, frames: 4, ratio: 131 / 84 },
      capture: { src: `${FX}/capture-strip.webp`, frames: 6, ratio: 107 / 84 },
      promote: { src: `${FX}/promote-strip.webp`, frames: 6, ratio: 99 / 98 },
      check: { src: `${FX}/check-strip.webp`, frames: 6, ratio: 114 / 90 },
      victory: { src: `${FX}/victory-strip.webp`, frames: 5, ratio: 168 / 126 },
    },
  },
};

export function pieceFx(set: string | undefined) {
  return set ? PIECE_FX[set] : undefined;
}

// Lời giới thiệu quà tặng kèm của từng bộ quân
export const SET_BONUS: Record<string, string> = {
  set2: "Tặng kèm Bàn cờ Hắc Ám (chọn riêng ở tab Bàn Cờ) và 6 hiệu ứng chuyển động tự bật khi dùng bộ quân.",
  set4: "Tặng kèm Bàn cờ Samurai — chọn riêng ở tab Bàn Cờ.",
};

const HACAM = PIECE_FX.set2.sprites;

const EFFECTS: { key: string; name: string; sprite: FxSprite; desc: string }[] = [
  { key: "hacam-select", name: "Chọn quân Hắc Ám", sprite: HACAM.select, desc: "Vòng phép tím xoay quanh chân quân đang chọn, ô đi được hiện vòng kim cương." },
  { key: "hacam-move", name: "Di chuyển Hắc Ám", sprite: HACAM.move, desc: "Cột sáng tím bừng lên tại ô quân vừa đến." },
  { key: "hacam-capture", name: "Ăn quân Hắc Ám", sprite: HACAM.capture, desc: "Pha lê tím vỡ tung tại ô quân bị ăn." },
  { key: "hacam-promote", name: "Thăng cấp Hắc Ám", sprite: HACAM.promote, desc: "Tốt hóa thành Hậu có cánh khi phong cấp." },
  { key: "hacam-check", name: "Chiếu tướng Hắc Ám", sprite: HACAM.check, desc: "Vương miện đỏ lớn dần trên đầu Vua bị chiếu." },
  { key: "hacam-victory", name: "Chiến thắng Hắc Ám", sprite: HACAM.victory, desc: "Đôi cánh tím dang rộng trên Vua của người thắng." },
];

export function effectInfo(id: string) {
  return EFFECTS.find((e) => `effect:${e.key}` === id);
}

export type BoardTheme = {
  name: string;
  light: string;
  dark: string;
  // Ô có vân (ảnh), phủ lên màu nền
  texture?: { light: string; dark: string };
};

export const BOARD_THEMES: Record<string, BoardTheme> = {
  classic: { name: "Cổ điển", light: "#eeeed2", dark: "#779556" },
  wood: { name: "Gỗ sồi", light: "#f0d9b5", dark: "#b58863" },
  ocean: { name: "Đại dương", light: "#dee9f5", dark: "#4b7bb0" },
  emerald: { name: "Ngọc lục bảo", light: "#e4f2df", dark: "#2f8a5b" },
  royal: { name: "Hoàng gia tím", light: "#ece4f7", dark: "#7a52b3" },
  ruby: { name: "Hồng ngọc", light: "#f7e3dc", dark: "#b0443b" },
  ice: { name: "Băng giá", light: "#f2f8ff", dark: "#8fb8de" },
  midnight: { name: "Nửa đêm vàng", light: "#d9c48f", dark: "#1d2547" },
  samurai: { name: "Samurai", light: "#ecd8b2", dark: "#8e2f27" },
  hacam: {
    name: "Hắc Ám",
    light: "#8f80b4",
    dark: "#3a2a63",
    texture: { light: "/images/academy/fx/hacam/tile-light.webp", dark: "/images/academy/fx/hacam/tile-dark.webp" },
  },
};

const FREE = new Set([
  "frame:f01",
  "frame:f02",
  "frame:f03",
  "frame:f05",
  "frame:f11",
  "cover:academy",
  "cover:castle",
  "cover:moon",
  "board:classic",
  "board:wood",
  "piece:set1",
]);

const PRICES: Record<string, [number, Currency]> = {
  "frame:f04": [800, "coins"],
  "frame:f06": [1200, "coins"],
  "frame:f07": [1200, "coins"],
  "frame:f10": [900, "coins"],
  "frame:f12": [1000, "coins"],
  "frame:f14": [1000, "coins"],
  "frame:f08": [120, "gems"],
  "frame:f09": [100, "gems"],
  "frame:f13": [150, "gems"],
  "frame:f15": [150, "gems"],
  "cover:aurora": [600, "coins"],
  "cover:winter": [600, "coins"],
  "cover:sakura": [800, "coins"],
  "cover:autumn": [800, "coins"],
  "cover:beach": [50, "gems"],
  "board:ocean": [600, "coins"],
  "board:emerald": [600, "coins"],
  "board:royal": [900, "coins"],
  "board:ruby": [900, "coins"],
  "board:ice": [80, "gems"],
  "board:midnight": [80, "gems"],
};

function priced(id: string): Pick<ShopEntry, "price" | "currency" | "free"> {
  if (FREE.has(id)) return { price: 0, currency: "coins", free: true };

  const [price, currency] = PRICES[id] ?? [0, "coins"];

  return { price, currency };
}

const PIECE_SETS: [string, string, number][] = [
  ["Bộ Cờ Cổ Điển", "set1", 0],
  ["Bộ Cờ Hắc Ám", "set2", 299],
  ["Bộ Cờ Thiên Thần", "set3", 299],
  ["Bộ Cờ Samurai", "set4", 299],
  ["Bộ Cờ Rồng Thần", "set5", 399],
  ["Bộ Cờ Băng Giá", "set6", 399],
  ["Bộ Cờ Ma Pháp", "set7", 399],
  ["Bộ Cờ Vũ Trụ", "set8", 499],
];

export const SHOP_ENTRIES: ShopEntry[] = [
  ...PIECE_SETS.map(([name, key, price], i) => ({
    id: `piece:${key}`,
    category: "piece" as const,
    name,
    tag: "Quân Cờ",
    price,
    currency: "gems" as const,
    free: i === 0,
    // Chỉ mở bán bộ đã có đủ hình 12 quân (xem PIECE_SKINS)
    available: i === 0 || Boolean(PIECE_SKINS[key]),
    image: `${SHOP}/${key}.jpg`,
  })),
  ...Object.entries(BOARD_THEMES).map(([key, t]) => ({
    id: `board:${key}`,
    category: "board" as const,
    name: `Bàn cờ ${t.name}`,
    tag: "Bàn Cờ",
    ...priced(`board:${key}`),
    available: true,
    board: { light: t.light, dark: t.dark },
    bundledWith: BUNDLED[`board:${key}`],
  })),
  ...EFFECTS.map((e) => ({
    id: `effect:${e.key}`,
    category: "effect" as const,
    name: e.name,
    tag: "Hiệu Ứng",
    price: 0,
    currency: "gems" as const,
    available: true,
    image: e.sprite.src,
    sprite: e.sprite,
    bundledWith: BUNDLED[`effect:${e.key}`],
    effectFor: "set2",
  })),
  ...FRAMES.map((f) => ({
    id: `frame:${f.id}`,
    category: "frame" as const,
    name: `Khung ${f.vi}`,
    tag: "Khung Avatar",
    ...priced(`frame:${f.id}`),
    available: true,
    image: f.src,
    frameId: f.id,
  })),
  ...COVERS.map((c) => ({
    id: `cover:${c.id}`,
    category: "frame" as const,
    name: `Ảnh nền ${c.vi}`,
    tag: "Ảnh nền hồ sơ",
    ...priced(`cover:${c.id}`),
    available: true,
    image: c.src,
    coverId: c.id,
  })),
];

export function owns(wallet: Wallet | null, id: string) {
  return (
    FREE.has(id) ||
    Boolean(wallet?.owned.includes(id)) ||
    Boolean(BUNDLED[id] && wallet?.owned.includes(BUNDLED[id]))
  );
}

export function isFree(id: string) {
  return FREE.has(id);
}

export function entry(id: string) {
  return SHOP_ENTRIES.find((e) => e.id === id);
}

export async function fetchWallet(): Promise<Wallet | null> {
  try {
    const response = await fetch("/api/shop/me", { cache: "no-store" });

    if (!response.ok) return null;

    return (await response.json()) as Wallet;
  } catch {
    return null;
  }
}
