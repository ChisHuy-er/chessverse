// Các gói nạp kim cương. Giá (VND) chỉ được đọc ở backend — không tin giá gửi từ trình duyệt.
export interface TopupPackage {
  id: string;
  price: number; // VND
  gems: number;
  bonus: number;
  tag?: 'popular' | 'best';
}

export const TOPUP_PACKAGES: TopupPackage[] = [
  { id: 'g100', price: 20_000, gems: 100, bonus: 0 },
  { id: 'g250', price: 50_000, gems: 250, bonus: 25 },
  { id: 'g500', price: 100_000, gems: 500, bonus: 75, tag: 'popular' },
  { id: 'g1000', price: 200_000, gems: 1000, bonus: 200 },
  { id: 'g2500', price: 500_000, gems: 2500, bonus: 700 },
  { id: 'g5000', price: 1_000_000, gems: 5000, bonus: 1750, tag: 'best' },
];

export function findPackage(id: string): TopupPackage | undefined {
  return TOPUP_PACKAGES.find((p) => p.id === id);
}
