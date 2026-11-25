// Hệ thống hạng theo thang Elo cờ vua (có thể chỉnh các mốc ở đây).
// Người chơi dưới 1000 Elo thuộc hạng "Tân Thủ" (người mới bắt đầu ở 500).
export const TIERS = [
  { index: 1, name: "Tân Thủ", short: "Tân Thủ", min: 0, note: "Dưới hạng E", en: { name: "Newbie", short: "Newbie" } },
  { index: 2, name: "Hạng E", short: "Hạng E", min: 1000, note: "Người chơi hạng E", en: { name: "Class E", short: "Class E" } },
  { index: 3, name: "Hạng D", short: "Hạng D", min: 1200, note: "Người chơi hạng D", en: { name: "Class D", short: "Class D" } },
  { index: 4, name: "Hạng C", short: "Hạng C", min: 1400, note: "Người chơi hạng C", en: { name: "Class C", short: "Class C" } },
  { index: 5, name: "Hạng B", short: "Hạng B", min: 1600, note: "Cầu thủ hạng B", en: { name: "Class B", short: "Class B" } },
  { index: 6, name: "Hạng A", short: "Hạng A", min: 1800, note: "Cầu thủ hạng A", en: { name: "Class A", short: "Class A" } },
  { index: 7, name: "Chuyên gia", short: "Chuyên gia", min: 2000, note: "Ứng viên Thạc sĩ QG", en: { name: "Expert", short: "Expert" } },
  { index: 8, name: "Kiện tướng Quốc gia", short: "CM", min: 2200, note: "Candidate Master", en: { name: "National Master", short: "CM" } },
  { index: 9, name: "Kiện tướng FIDE", short: "FM", min: 2300, note: "FIDE Master", en: { name: "FIDE Master", short: "FM" } },
  { index: 10, name: "Thạc sĩ Quốc tế", short: "IM", min: 2400, note: "International Master", en: { name: "International Master", short: "IM" } },
  { index: 11, name: "Đại Kiện Tướng", short: "GM", min: 2500, note: "Grandmaster", en: { name: "Grandmaster", short: "GM" } },
  { index: 12, name: "Siêu Đại Kiện Tướng", short: "Siêu GM", min: 2700, note: "Super Grandmaster", en: { name: "Super Grandmaster", short: "Super GM" } },
] as const;

export type Lang = "vi" | "en";

// Chữ trên huy hiệu được vẽ bằng code (huy hiệu để trống) nên đổi ngôn ngữ chỉ cần đổi `lang`.
export function tierLabel(t: (typeof TIERS)[number], lang: Lang = "vi") {
  return lang === "en" ? t.en : { name: t.name, short: t.short };
}

export type TierInfo = {
  index: number;
  name: string;
  short: string;
  nextName: string | null;
  toNext: number;
  progress: number;
};

export function getTier(elo: number, lang: Lang = "vi"): TierInfo {
  let i = 0;

  for (let k = 0; k < TIERS.length; k++) {
    if (elo >= TIERS[k].min) i = k;
  }

  const tier = TIERS[i];
  const next = TIERS[i + 1];
  const L = tierLabel(tier, lang);
  const N = next ? tierLabel(next, lang) : null;

  if (!next) {
    return {
      index: tier.index,
      name: L.name,
      short: L.short,
      nextName: null,
      toNext: 0,
      progress: 1,
    };
  }

  return {
    index: tier.index,
    name: L.name,
    short: L.short,
    nextName: N!.name,
    toNext: Math.max(1, next.min - elo),
    progress: Math.max(0, Math.min(1, (elo - tier.min) / (next.min - tier.min))),
  };
}
