// Danh mục Thử thách: nhiệm vụ, thẻ thử thách (battle pass), bản đồ bài cờ, sự kiện.
// Mọi phần thưởng và điều kiện được kiểm tra ở backend.

export type QuestMetric =
  | 'games'
  | 'wins'
  | 'rankedWins'
  | 'puzzles'
  | 'lessons'
  | 'totalGames'
  | 'totalWins'
  | 'elo'
  | 'totalLessons'
  | 'totalPuzzles'
  | 'eventDays';

export type QuestScope = 'daily' | 'weekly' | 'achievement' | 'event';

export interface QuestDef {
  id: string;
  scope: QuestScope;
  title: string;
  icon: 'swords' | 'puzzle' | 'crown' | 'book' | 'trophy' | 'star' | 'calendar' | 'gift';
  metric: QuestMetric;
  target: number;
  coins: number;
  gems: number;
  exp: number;
  link: string; // trang để làm nhiệm vụ
}

export const QUESTS: QuestDef[] = [
  // Hàng ngày
  { id: 'd_play3', scope: 'daily', title: 'Chơi 3 trận đấu online', icon: 'swords', metric: 'games', target: 3, coins: 30, gems: 2, exp: 120, link: '/play/online' },
  { id: 'd_win1', scope: 'daily', title: 'Thắng 1 trận đấu online', icon: 'crown', metric: 'wins', target: 1, coins: 25, gems: 1, exp: 100, link: '/play/online' },
  { id: 'd_puzzle3', scope: 'daily', title: 'Giải 3 bài trên Bản đồ thử thách', icon: 'puzzle', metric: 'puzzles', target: 3, coins: 25, gems: 1, exp: 100, link: '/challenges?tab=map' },
  { id: 'd_lesson1', scope: 'daily', title: 'Học 1 bài trong Khóa học', icon: 'book', metric: 'lessons', target: 1, coins: 20, gems: 1, exp: 80, link: '/courses' },

  // Hàng tuần
  { id: 'w_play15', scope: 'weekly', title: 'Chơi 15 trận đấu online', icon: 'swords', metric: 'games', target: 15, coins: 120, gems: 8, exp: 400, link: '/play/online' },
  { id: 'w_ranked5', scope: 'weekly', title: 'Thắng 5 trận đấu xếp hạng', icon: 'crown', metric: 'rankedWins', target: 5, coins: 150, gems: 10, exp: 400, link: '/play/online' },
  { id: 'w_puzzle12', scope: 'weekly', title: 'Giải 12 bài trên Bản đồ thử thách', icon: 'puzzle', metric: 'puzzles', target: 12, coins: 100, gems: 6, exp: 300, link: '/challenges?tab=map' },
  { id: 'w_lesson3', scope: 'weekly', title: 'Học 3 bài trong Khóa học', icon: 'book', metric: 'lessons', target: 3, coins: 60, gems: 4, exp: 250, link: '/courses' },

  // Thành tựu (một lần)
  { id: 'a_first_win', scope: 'achievement', title: 'Chiến thắng đầu tiên', icon: 'trophy', metric: 'totalWins', target: 1, coins: 50, gems: 3, exp: 100, link: '/play/online' },
  { id: 'a_games50', scope: 'achievement', title: 'Chơi tổng cộng 50 trận', icon: 'swords', metric: 'totalGames', target: 50, coins: 150, gems: 10, exp: 300, link: '/play/online' },
  { id: 'a_elo1400', scope: 'achievement', title: 'Đạt 1.400 Elo', icon: 'star', metric: 'elo', target: 1400, coins: 100, gems: 8, exp: 300, link: '/play/online' },
  { id: 'a_lessons7', scope: 'achievement', title: 'Hoàn thành chương Nhập Môn Cờ Vua', icon: 'book', metric: 'totalLessons', target: 7, coins: 100, gems: 8, exp: 300, link: '/courses/intro' },
  { id: 'a_puzzles25', scope: 'achievement', title: 'Giải hết 25 bài trên Bản đồ', icon: 'puzzle', metric: 'totalPuzzles', target: 25, coins: 200, gems: 15, exp: 500, link: '/challenges?tab=map' },

  // Sự kiện Giáng Sinh
  { id: 'e_play5', scope: 'event', title: 'Chơi 5 trận trong sự kiện', icon: 'swords', metric: 'games', target: 5, coins: 120, gems: 10, exp: 300, link: '/play/online' },
  { id: 'e_puzzle10', scope: 'event', title: 'Giải 10 bài thử thách trong sự kiện', icon: 'puzzle', metric: 'puzzles', target: 10, coins: 150, gems: 12, exp: 300, link: '/challenges?tab=map' },
  { id: 'e_login7', scope: 'event', title: 'Vào game 7 ngày trong sự kiện', icon: 'calendar', metric: 'eventDays', target: 7, coins: 100, gems: 15, exp: 300, link: '/' },
];

// Sự kiện Giáng Sinh (giờ Việt Nam)
export const EVENT = {
  id: 'xmas2026',
  title: 'Sự Kiện Giáng Sinh',
  start: '2026-12-01',
  end: '2026-12-31',
};

// ---------- Thẻ thử thách ----------

export const PASS = {
  season: 'S1',
  title: 'Mùa 1',
  start: '2026-11-01',
  expPerLevel: 1000,
  maxLevel: 30,
};

// Phần thưởng miễn phí theo cấp: cứ 5 cấp là một rương lớn
export function passReward(level: number): { coins: number; gems: number; chest: boolean } {
  if (level % 5 === 0) return { coins: 100 + level * 5, gems: 5 + Math.floor(level / 5), chest: true };
  if (level % 2 === 0) return { coins: 0, gems: 2 + Math.floor(level / 10), chest: false };
  return { coins: 40 + level * 3, gems: 0, chest: false };
}

// ---------- Chuỗi đăng nhập ----------

export const STREAK_REWARD = { coins: 100, gems: 8 };

// ---------- Bản đồ thử thách ----------

export interface PuzzleDef {
  id: string;
  fen: string; // chỉ phần xếp quân; luôn Trắng đi
}

export interface ChapterDef {
  id: string;
  title: string;
  sub: string;
  puzzles: PuzzleDef[];
}

export const CHEST_STEPS = [
  { at: 5, coins: 30, gems: 2 },
  { at: 10, coins: 60, gems: 3 },
  { at: 15, coins: 100, gems: 5 },
];

// Mỗi chương 5 bài "chiếu hết trong 1 nước" (đã kiểm tra bằng chess.js: đúng 1 nước chiếu hết)
export const CHAPTERS: ChapterDef[] = [
  {
    id: 'c1',
    title: 'Nền Tảng',
    sub: 'Chiếu hết hàng cuối',
    puzzles: [
      { id: 'c1p1', fen: '7k/6pp/8/8/4R3/8/7K/8' },
      { id: 'c1p2', fen: 'k7/p7/8/8/8/8/1K6/2Q5' },
      { id: 'c1p3', fen: '8/7R/1k6/8/1K6/6R1/8/8' },
      { id: 'c1p4', fen: 'k7/p7/8/8/6K1/1p6/8/2Q5' },
      { id: 'c1p5', fen: 'k7/pp1R3p/8/8/8/8/8/1K6' },
    ],
  },
  {
    id: 'c2',
    title: 'Chiến Thuật',
    sub: 'Phối hợp hai quân',
    puzzles: [
      { id: 'c2p1', fen: 'k7/1p6/2N5/6R1/4K3/5r2/8/8' },
      { id: 'c2p2', fen: '7k/8/8/4p3/p7/K7/2Q5/1B6' },
      { id: 'c2p3', fen: 'N1k5/2b5/8/8/8/p5Q1/8/K7' },
      { id: 'c2p4', fen: '1k6/2p5/8/8/8/R4Bn1/1K6/8' },
      { id: 'c2p5', fen: '3r1k2/8/7N/8/2Qp4/8/7K/8' },
    ],
  },
  {
    id: 'c3',
    title: 'Tấn Công',
    sub: 'Đột phá phòng tuyến',
    puzzles: [
      { id: 'c3p1', fen: '5k2/3R3p/r7/2p5/1Q6/8/8/3K4' },
      { id: 'c3p2', fen: '2R2Bk1/4R3/8/8/4p3/4qp2/2K5/8' },
      { id: 'c3p3', fen: '8/2r1p2p/2Bk4/7N/8/8/Q6K/8' },
      { id: 'c3p4', fen: '3r1B2/1p6/kp6/8/1R1N4/3K3b/8/8' },
      { id: 'c3p5', fen: '6RQ/3n2p1/5k2/3P1p2/8/8/5K2/8' },
    ],
  },
  {
    id: 'c4',
    title: 'Phòng Thủ',
    sub: 'Tìm nước quyết định',
    puzzles: [
      { id: 'c4p1', fen: '6k1/1N1R4/p1r5/3q4/4p3/2Q5/4K3/8' },
      { id: 'c4p2', fen: '5k2/p3N2R/8/4r1b1/2R5/3K1p1p/8/8' },
      { id: 'c4p3', fen: '4B1rk/6p1/8/3P4/8/PK2np2/Q7/8' },
      { id: 'c4p4', fen: '8/p3r2p/p2k4/4N3/3P4/2K2Qb1/8/8' },
      { id: 'c4p5', fen: '3q4/1pR4r/6Bk/7P/5K2/7p/8/1N6' },
    ],
  },
  {
    id: 'c5',
    title: 'Bậc Thầy',
    sub: 'Thế cờ phức tạp',
    puzzles: [
      { id: 'c5p1', fen: '3k3n/q1R1r3/3p3Q/1N3B2/1pp5/8/3K4/8' },
      { id: 'c5p2', fen: '2k5/1p3R1Q/4P3/5P2/Rb1pq1p1/4r3/5K2/8' },
      { id: 'c5p3', fen: '7B/7k/1pp5/7p/7r/2KPr1Qn/1P6/5N2' },
      { id: 'c5p4', fen: 'k5N1/p2p4/qR6/r1p2b2/8/3P4/7K/BR6' },
      { id: 'c5p5', fen: 'knr5/2R5/1pq5/2P5/B3P1p1/QKP2p1p/8/8' },
    ],
  },
];
