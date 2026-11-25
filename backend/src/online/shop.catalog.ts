// Danh mục cửa hàng — phải khớp với src/app/lib/shop.ts ở web.
// Mã vật phẩm: "<loại>:<mã>", vd. "frame:f08", "board:ocean".

export type Currency = 'coins' | 'gems';

export type ShopItem = {
  id: string;
  price: number;
  currency: Currency;
  available: boolean; // false = "sắp ra mắt", chưa bán
};

// Vật phẩm miễn phí: ai cũng có sẵn.
export const FREE_ITEMS = new Set([
  'frame:f01',
  'frame:f02',
  'frame:f03',
  'frame:f05',
  'frame:f11',
  'cover:academy',
  'cover:castle',
  'cover:moon',
  'board:classic',
  'board:wood',
  'piece:set1',
]);

export const SHOP_ITEMS: ShopItem[] = [
  // Khung ảnh đại diện
  { id: 'frame:f04', price: 800, currency: 'coins', available: true },
  { id: 'frame:f06', price: 1200, currency: 'coins', available: true },
  { id: 'frame:f07', price: 1200, currency: 'coins', available: true },
  { id: 'frame:f10', price: 900, currency: 'coins', available: true },
  { id: 'frame:f12', price: 1000, currency: 'coins', available: true },
  { id: 'frame:f14', price: 1000, currency: 'coins', available: true },
  { id: 'frame:f08', price: 120, currency: 'gems', available: true },
  { id: 'frame:f09', price: 100, currency: 'gems', available: true },
  { id: 'frame:f13', price: 150, currency: 'gems', available: true },
  { id: 'frame:f15', price: 150, currency: 'gems', available: true },

  // Ảnh nền hồ sơ
  { id: 'cover:aurora', price: 600, currency: 'coins', available: true },
  { id: 'cover:winter', price: 600, currency: 'coins', available: true },
  { id: 'cover:sakura', price: 800, currency: 'coins', available: true },
  { id: 'cover:autumn', price: 800, currency: 'coins', available: true },
  { id: 'cover:beach', price: 50, currency: 'gems', available: true },

  // Bàn cờ
  { id: 'board:ocean', price: 600, currency: 'coins', available: true },
  { id: 'board:emerald', price: 600, currency: 'coins', available: true },
  { id: 'board:royal', price: 900, currency: 'coins', available: true },
  { id: 'board:ruby', price: 900, currency: 'coins', available: true },
  { id: 'board:ice', price: 80, currency: 'gems', available: true },
  { id: 'board:midnight', price: 80, currency: 'gems', available: true },

  // Bộ quân cờ — chỉ bộ đã có đủ hình 12 quân mới mở bán (available: true)
  { id: 'piece:set2', price: 299, currency: 'gems', available: true },
  { id: 'piece:set3', price: 299, currency: 'gems', available: false },
  { id: 'piece:set4', price: 299, currency: 'gems', available: true },
  { id: 'piece:set5', price: 399, currency: 'gems', available: false },
  { id: 'piece:set6', price: 399, currency: 'gems', available: false },
  { id: 'piece:set7', price: 399, currency: 'gems', available: false },
  { id: 'piece:set8', price: 499, currency: 'gems', available: false },
];

export const BOARD_THEMES = [
  'classic',
  'wood',
  'ocean',
  'emerald',
  'royal',
  'ruby',
  'ice',
  'midnight',
  'samurai',
  'hacam',
];

// Bộ quân dùng được trong trận (set1 = quân cờ mặc định)
export const PIECE_SETS = ['set1', 'set2', 'set4'];

export function findItem(id: string) {
  return SHOP_ITEMS.find((item) => item.id === id);
}

// Vật phẩm tặng kèm: có bộ quân thì có luôn bàn cờ cùng chủ đề
export const BUNDLED: Record<string, string> = {
  'board:samurai': 'piece:set4',
  'board:hacam': 'piece:set2',
};

export function hasItem(id: string, owned: Set<string>) {
  return FREE_ITEMS.has(id) || owned.has(id) || (BUNDLED[id] !== undefined && owned.has(BUNDLED[id]));
}

// Bàn cờ đi cùng bộ quân (tự chọn khi bấm "Sử dụng" bộ quân)
export const MATCHING_BOARD: Record<string, string> = {
  set2: 'hacam',
  set4: 'samurai',
};

// Phần thưởng xu sau mỗi ván online đủ dài
export const COIN_REWARD = { win: 30, draw: 15, loss: 10 };
