// Danh sách mã hợp lệ — phải khớp với src/app/lib/appearance.ts ở web.
export const AVATAR_IDS = Array.from(
  { length: 12 },
  (_, i) => `a${String(i + 1).padStart(2, '0')}`,
);

export const FRAME_IDS = Array.from(
  { length: 15 },
  (_, i) => `f${String(i + 1).padStart(2, '0')}`,
);

export const COVER_IDS = [
  'academy',
  'castle',
  'moon',
  'aurora',
  'winter',
  'sakura',
  'autumn',
  'beach',
];

export type AppearanceInput = {
  avatar?: unknown;
  frame?: unknown;
  cover?: unknown;
};

// Trả về dữ liệu đã kiểm tra, hoặc null nếu có giá trị không hợp lệ.
export function parseAppearance(body: AppearanceInput | null | undefined) {
  const avatar = body?.avatar ?? null;
  const frame = body?.frame;
  const cover = body?.cover;

  if (avatar !== null && !AVATAR_IDS.includes(avatar as string)) return null;
  if (typeof frame !== 'string' || !FRAME_IDS.includes(frame)) return null;
  if (typeof cover !== 'string' || !COVER_IDS.includes(cover)) return null;

  return {
    avatarId: avatar as string | null,
    avatarFrame: frame,
    profileCover: cover,
  };
}
