// Danh sách khóa học + tiến độ học (tạm lưu trên trình duyệt).
// Khi có backend: thay loadProgress/saveProgress bằng API, giữ nguyên kiểu dữ liệu.

export type Lang = "vi" | "en";
export type Level = "basic" | "intermediate" | "advanced";
export type Topic = "tactics" | "opening" | "endgame";

export type Course = {
  id: string;
  art: string;
  level: Level;
  topic?: Topic;
  lessons: number;
  minutes: number;
  title: Record<Lang, string>;
  desc: Record<Lang, string>;
};

export const COURSES: Course[] = [
  {
    id: "intro",
    art: "art-pawn",
    level: "basic",
    lessons: 7,
    minutes: 45,
    title: { vi: "Nhập môn Cờ Vua", en: "Chess Fundamentals" },
    desc: {
      vi: "Làm quen bàn cờ, quân cờ và luật chơi cơ bản.",
      en: "Meet the board, the pieces and the basic rules.",
    },
  },
  {
    id: "opening-basics",
    art: "art-knight",
    level: "basic",
    topic: "opening",
    lessons: 12,
    minutes: 120,
    title: { vi: "Khai cuộc căn bản", en: "Opening Basics" },
    desc: {
      vi: "Nắm vững nguyên tắc khai cuộc và các hệ thống phổ biến.",
      en: "Opening principles and the most popular systems.",
    },
  },
  {
    id: "tactics",
    art: "art-rook",
    level: "intermediate",
    topic: "tactics",
    lessons: 14,
    minutes: 150,
    title: { vi: "Chiến thuật & Đòn thế", en: "Tactics & Combinations" },
    desc: {
      vi: "Nhận biết, tính toán và vận dụng các đòn chiến thuật hiệu quả.",
      en: "Spot, calculate and play winning combinations.",
    },
  },
  {
    id: "endgame-basics",
    art: "art-king",
    level: "intermediate",
    topic: "endgame",
    lessons: 10,
    minutes: 90,
    title: { vi: "Tàn cuộc cơ bản", en: "Endgame Essentials" },
    desc: {
      vi: "Kỹ thuật chuyển hóa lợi thế và các thế tàn phổ biến.",
      en: "Convert advantages and master key endgames.",
    },
  },
  {
    id: "strategy",
    art: "art-book-gold",
    level: "intermediate",
    lessons: 12,
    minutes: 120,
    title: { vi: "Tư duy chiến lược", en: "Strategic Thinking" },
    desc: {
      vi: "Phát triển kế hoạch, đánh giá thế trận và tư duy dài hạn.",
      en: "Make plans, evaluate positions, think long-term.",
    },
  },
  {
    id: "analysis",
    art: "art-book-blue",
    level: "advanced",
    lessons: 10,
    minutes: 100,
    title: { vi: "Phân tích ván đấu", en: "Game Analysis" },
    desc: {
      vi: "Học cách phân tích, rút kinh nghiệm từ các ván cờ kinh điển.",
      en: "Learn from classic games and your own.",
    },
  },
  {
    id: "elo-boost",
    art: "art-crown",
    level: "advanced",
    topic: "tactics",
    lessons: 16,
    minutes: 180,
    title: { vi: "Nâng cao Elo", en: "Climb the Ladder" },
    desc: {
      vi: "Tổng hợp kỹ năng, luyện tập thực chiến và lộ trình tăng Elo.",
      en: "Practical training and a roadmap to higher Elo.",
    },
  },
  {
    id: "masterclass",
    art: "art-mentor",
    level: "advanced",
    topic: "endgame",
    lessons: 20,
    minutes: 240,
    title: { vi: "Khóa học Chuyên sâu", en: "Masterclass" },
    desc: {
      vi: "Dành cho người chơi trình độ cao, hướng tới cấp độ kiện tướng.",
      en: "For strong players aiming at master level.",
    },
  },
];

// Khóa sau mở khi khóa trước đạt tỉ lệ này.
export const UNLOCK_AT = 0.3;

// Số bài đã học xong của mỗi khóa: { [courseId]: number }
export type Progress = Record<string, number>;

const PROGRESS_KEY = "cv-course-progress";
const STREAK_KEY = "cv-course-streak";

export function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as Progress;
  } catch {
    return {};
  }
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* bỏ qua: chế độ ẩn danh, hết dung lượng... */
  }
}

export function percentOf(course: Course, progress: Progress) {
  const done = Math.min(progress[course.id] ?? 0, course.lessons);

  return Math.round((done / course.lessons) * 100);
}

export function isUnlocked(index: number, progress: Progress) {
  if (index === 0) return true;

  const prev = COURSES[index - 1];

  return percentOf(prev, progress) >= UNLOCK_AT * 100;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Chuỗi ngày học liên tiếp. Gọi touchStreak() mỗi khi người dùng học.
export function readStreak(): number {
  try {
    const { last, count } = JSON.parse(localStorage.getItem(STREAK_KEY) ?? "{}");
    const today = new Date();
    const yesterday = new Date(today);

    yesterday.setDate(today.getDate() - 1);

    if (last === dayKey(today) || last === dayKey(yesterday)) return count ?? 0;

    return 0;
  } catch {
    return 0;
  }
}

export function touchStreak(): number {
  try {
    const today = new Date();
    const yesterday = new Date(today);

    yesterday.setDate(today.getDate() - 1);

    const saved = JSON.parse(localStorage.getItem(STREAK_KEY) ?? "{}");
    let count = 1;

    if (saved.last === dayKey(today)) count = saved.count ?? 1;
    else if (saved.last === dayKey(yesterday)) count = (saved.count ?? 0) + 1;

    localStorage.setItem(STREAK_KEY, JSON.stringify({ last: dayKey(today), count }));

    return count;
  } catch {
    return 0;
  }
}
