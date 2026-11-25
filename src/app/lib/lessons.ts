// Nội dung bài học + bộ sinh nước đi đơn giản cho bàn cờ minh họa.
// Mỗi bài gồm các bước (lời giảng + thế cờ + ô đánh dấu + mũi tên) và bài tập.

import { loadProgress, saveProgress } from "./courses";

// ===================== Thế cờ =====================

export type Color = "w" | "b";
export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";
export type Piece = { color: Color; type: PieceType };
export type Position = Record<string, Piece>; // "e4" → quân

export const FILES = "abcdefgh";

// "wNe4 bPd5" hoặc FEN (phần xếp quân)
export function parsePosition(text: string): Position {
  const pos: Position = {};

  if (text.includes("/")) {
    const rows = text.split(" ")[0].split("/");

    rows.forEach((row, r) => {
      let f = 0;

      for (const ch of row) {
        if (/\d/.test(ch)) {
          f += Number(ch);
          continue;
        }

        const color: Color = ch === ch.toUpperCase() ? "w" : "b";
        pos[`${FILES[f]}${8 - r}`] = { color, type: ch.toUpperCase() as PieceType };
        f++;
      }
    });

    return pos;
  }

  for (const token of text.split(/\s+/).filter(Boolean)) {
    pos[token.slice(2)] = { color: token[0] as Color, type: token[1] as PieceType };
  }

  return pos;
}

export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

function at(f: number, r: number) {
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? `${FILES[f]}${r + 1}` : null;
}

// Các ô quân ở `sq` đi tới được (bỏ qua luật chiếu, nhập thành, bắt tốt qua đường)
export function movesFrom(pos: Position, sq: string): string[] {
  const piece = pos[sq];

  if (!piece) return [];

  const f0 = FILES.indexOf(sq[0]);
  const r0 = Number(sq[1]) - 1;
  const out: string[] = [];
  const free = (s: string | null) => !!s && !pos[s];
  const enemy = (s: string | null) => !!s && !!pos[s] && pos[s].color !== piece.color;

  const slide = (dirs: number[][], far: boolean) => {
    for (const [df, dr] of dirs) {
      let f = f0 + df;
      let r = r0 + dr;

      while (true) {
        const s = at(f, r);

        if (!s) break;
        if (free(s)) out.push(s);
        else {
          if (enemy(s)) out.push(s);
          break;
        }
        if (!far) break;
        f += df;
        r += dr;
      }
    }
  };

  const straight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  switch (piece.type) {
    case "K":
      slide([...straight, ...diag], false);
      break;
    case "Q":
      slide([...straight, ...diag], true);
      break;
    case "R":
      slide(straight, true);
      break;
    case "B":
      slide(diag, true);
      break;
    case "N":
      slide([[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]], false);
      break;
    case "P": {
      const dir = piece.color === "w" ? 1 : -1;
      const one = at(f0, r0 + dir);

      if (free(one)) {
        out.push(one!);
        const two = at(f0, r0 + 2 * dir);
        if ((piece.color === "w" ? r0 === 1 : r0 === 6) && free(two)) out.push(two!);
      }

      for (const df of [-1, 1]) {
        const s = at(f0 + df, r0 + dir);
        if (enemy(s)) out.push(s!);
      }
      break;
    }
  }

  return out;
}

// ===================== Kiểu dữ liệu bài học =====================

export type MarkKind = "move" | "capture" | "target" | "check" | "good" | "bad";
export type Marks = Partial<Record<MarkKind, string[]>>;
export type Arrow = [string, string] | [string, string, "good" | "bad"];

export type Example = {
  pieces: string;
  arrows?: Arrow[];
  marks?: Marks;
  ok: boolean;
  caption: string;
};

export type Info = {
  title: string;
  glyph?: string; // "wN" → hiện hình quân cạnh tiêu đề
  bullets: string[];
  examples?: Example[];
};

export type Step = {
  say: string;
  pieces?: string; // bỏ trống = giữ thế cờ của bước trước
  marks?: Marks;
  arrows?: Arrow[];
  show?: string; // tự đánh dấu mọi ô quân ở ô này đi tới
  info?: Info; // đổi thẻ thông tin bên phải từ bước này
};

export type Quiz =
  | { kind: "choice"; prompt: string; options: string[]; answer: number; pieces?: string; marks?: Marks; arrows?: Arrow[] }
  | { kind: "squares"; prompt: string; pieces: string; answer?: string[]; from?: string; marks?: Marks }
  | { kind: "move"; prompt: string; pieces: string; answer: [string, string]; hint?: string };

export type Lesson = {
  id: string;
  title: string;
  icon: LessonIcon;
  info: Info;
  steps: Step[];
  quiz: Quiz[];
  explore?: boolean; // cho bấm thử quân trên bàn
};

export type LessonIcon = "book" | "board" | "knight" | "scale" | "swords" | "crown" | "crown2" | "target" | "flag";

export type Chapter = { id: string; title: string; lessons: Lesson[]; soon?: string[] };

// Đáp án ô của bài tập "squares": tự tính khi không ghi sẵn
export function quizSquares(q: Extract<Quiz, { kind: "squares" }>): string[] {
  if (q.answer) return q.answer;

  return q.from ? movesFrom(parsePosition(q.pieces), q.from) : [];
}

// ===================== Thẻ thông tin từng quân =====================

const PIECE_INFO: Record<PieceType, Info> = {
  K: {
    title: "Quân Vua",
    glyph: "wK",
    bullets: ["Đi 1 ô theo mọi hướng: ngang, dọc, chéo.", "Không được đi vào ô đang bị tấn công.", "Mất Vua là thua – hãy bảo vệ cẩn thận!"],
    examples: [
      { pieces: "wKd4", arrows: [["d4", "e5", "good"]], ok: true, caption: "Đi chéo 1 ô" },
      { pieces: "wKd4", arrows: [["d4", "d6", "bad"]], ok: false, caption: "Không đi 2 ô" },
    ],
  },
  Q: {
    title: "Quân Hậu",
    glyph: "wQ",
    bullets: ["Đi ngang, dọc hoặc chéo.", "Đi bao nhiêu ô cũng được.", "Không nhảy qua quân khác."],
    examples: [
      { pieces: "wQb2", arrows: [["b2", "e5", "good"]], ok: true, caption: "Đi chéo xa" },
      { pieces: "wQb2 wPb4", arrows: [["b2", "b6", "bad"]], ok: false, caption: "Không nhảy qua quân" },
    ],
  },
  R: {
    title: "Quân Xe",
    glyph: "wR",
    bullets: ["Đi theo hàng ngang hoặc cột dọc.", "Đi bao nhiêu ô tùy ý.", "Không nhảy qua quân khác."],
    examples: [
      { pieces: "wRa1", arrows: [["a1", "a4", "good"]], ok: true, caption: "Đi thẳng theo cột" },
      { pieces: "wRa1", arrows: [["a1", "c3", "bad"]], ok: false, caption: "Xe không đi chéo" },
    ],
  },
  B: {
    title: "Quân Tượng",
    glyph: "wB",
    bullets: ["Chỉ đi theo đường chéo.", "Đi bao nhiêu ô tùy ý.", "Luôn đứng trên ô cùng một màu."],
    examples: [
      { pieces: "wBa1", arrows: [["a1", "d4", "good"]], ok: true, caption: "Đi chéo" },
      { pieces: "wBa1", arrows: [["a1", "a4", "bad"]], ok: false, caption: "Tượng không đi thẳng" },
    ],
  },
  N: {
    title: "Quân Mã",
    glyph: "wN",
    bullets: ["Di chuyển theo hình chữ L.", "Đi 2 ô theo một hướng, sau đó rẽ 1 ô vuông góc.", "Có thể nhảy qua các quân khác."],
    examples: [
      { pieces: "wNb1 wPb2 wPc2", arrows: [["b1", "c3", "good"]], ok: true, caption: "Nhảy qua quân" },
      { pieces: "wNb1", arrows: [["b1", "b3", "bad"]], ok: false, caption: "Không đi thẳng" },
    ],
  },
  P: {
    title: "Quân Tốt",
    glyph: "wP",
    bullets: ["Đi thẳng 1 ô; nước đầu có thể đi 2 ô.", "Ăn quân theo đường chéo phía trước.", "Đến hàng cuối được phong cấp (thường là Hậu)."],
    examples: [
      { pieces: "wPc2", arrows: [["c2", "c4", "good"]], ok: true, caption: "Nước đầu đi 2 ô" },
      { pieces: "wPc3", arrows: [["c3", "c2", "bad"]], ok: false, caption: "Không đi lùi" },
    ],
  },
};

// ===================== Khóa "Nhập môn Cờ Vua" =====================

const INTRO_CH1: Lesson[] = [
  {
    id: "l1",
    title: "Giới thiệu cờ vua",
    icon: "book",
    info: {
      title: "Cờ vua là gì?",
      glyph: "wK",
      bullets: ["Trò chơi trí tuệ cho 2 người: Trắng và Đen.", "Mỗi bên 16 quân, đi luân phiên, Trắng đi trước.", "Mục tiêu: chiếu hết Vua đối phương."],
      examples: [
        { pieces: "wQd1 wKe1 wBc1 wBf1", marks: { good: ["d1"] }, ok: true, caption: "Hậu trắng ở ô trắng d1" },
        { pieces: "wKd1 wQe1 wBc1 wBf1", marks: { bad: ["e1"] }, ok: false, caption: "Hậu đứng sai ô" },
      ],
    },
    steps: [
      { say: "Chào mừng bạn đến với cờ vua! Đây là thế cờ ban đầu: 16 quân Trắng ở dưới, 16 quân Đen ở trên.", pieces: START },
      { say: "Bên Trắng luôn đi trước, sau đó hai bên lần lượt mỗi người đi một nước.", marks: { move: ["a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1", "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2"] } },
      { say: "Quân quan trọng nhất là Vua. Ai chiếu hết được Vua đối phương sẽ thắng ván cờ.", marks: { target: ["e1", "e8"] } },
      { say: "Mẹo xếp quân: Hậu luôn đứng ở ô cùng màu với mình – Hậu trắng ở d1 (ô trắng), Hậu đen ở d8 (ô đen).", marks: { good: ["d1", "d8"] } },
      { say: "Ván cờ cũng có thể hòa: hết nước đi hợp lệ, lặp lại thế cờ 3 lần, hoặc hai bên đồng ý hòa.", marks: {} },
    ],
    quiz: [
      { kind: "choice", prompt: "Bên nào được đi nước đầu tiên?", options: ["Trắng", "Đen", "Tùy hai người chọn"], answer: 0 },
      { kind: "choice", prompt: "Mục tiêu của ván cờ là gì?", options: ["Ăn hết quân đối phương", "Chiếu hết Vua đối phương", "Đưa Tốt về cuối bàn"], answer: 1 },
      { kind: "choice", prompt: "Lúc bắt đầu, mỗi bên có bao nhiêu quân?", options: ["8 quân", "16 quân", "32 quân"], answer: 1 },
    ],
  },
  {
    id: "l2",
    title: "Bàn cờ và ký hiệu",
    icon: "board",
    info: {
      title: "Bàn cờ 8 × 8",
      bullets: ["64 ô xen kẽ sáng – tối.", "Cột đặt tên a → h, hàng đánh số 1 → 8.", "Tên ô = cột + hàng, ví dụ e4."],
      examples: [
        { pieces: "", marks: { good: ["h1"] }, ok: true, caption: "Góc phải (h1) là ô sáng" },
        { pieces: "", marks: { bad: ["a1"] }, ok: false, caption: "a1 là ô tối, không phải ô sáng" },
      ],
    },
    steps: [
      { say: "Bàn cờ có 64 ô, gồm 8 cột và 8 hàng. Khi đặt bàn, ô góc dưới bên phải của bạn luôn là ô sáng.", pieces: "", marks: { target: ["h1"] } },
      { say: "Các cột dọc được gọi bằng chữ cái từ a đến h. Đây là cột e.", marks: { move: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"] } },
      { say: "Các hàng ngang được đánh số từ 1 đến 8. Đây là hàng 4.", marks: { move: ["a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4"] } },
      { say: "Cột e gặp hàng 4 tại ô e4. Mỗi ô đều có tên như vậy, giúp ta ghi lại mọi nước đi.", marks: { target: ["e4"] } },
      { say: "Các ô cùng màu nối chéo nhau tạo thành đường chéo, ví dụ đường chéo dài a1 – h8.", marks: { move: ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"] } },
      { say: "Ký hiệu quân khi ghi nước đi: K = Vua, Q = Hậu, R = Xe, B = Tượng, N = Mã. Tốt không có chữ. Ví dụ Nf3 nghĩa là Mã đi đến f3.", pieces: "wNg1", arrows: [["g1", "f3"]], marks: { target: ["f3"] } },
    ],
    quiz: [
      { kind: "squares", prompt: "Bấm vào ô e4.", pieces: "", answer: ["e4"] },
      { kind: "squares", prompt: "Bấm vào ô c6.", pieces: "", answer: ["c6"] },
      { kind: "choice", prompt: "Nước đi “Nf3” nghĩa là gì?", options: ["Tốt đi đến f3", "Mã đi đến f3", "Hậu đi đến f3"], answer: 1 },
    ],
  },
  {
    id: "l3",
    title: "Cách di chuyển quân",
    icon: "knight",
    explore: true,
    info: PIECE_INFO.K,
    steps: [
      { say: "Vua đi 1 ô theo bất kỳ hướng nào. Các ô sáng xanh là nơi Vua có thể đến.", pieces: "wKe4", show: "e4", info: PIECE_INFO.K },
      { say: "Hậu là quân mạnh nhất: đi ngang, dọc, chéo, bao nhiêu ô cũng được.", pieces: "wQd4", show: "d4", info: PIECE_INFO.Q },
      { say: "Xe đi theo hàng ngang hoặc cột dọc, không giới hạn số ô.", pieces: "wRd4", show: "d4", info: PIECE_INFO.R },
      { say: "Tượng chỉ đi chéo, nên luôn đứng trên ô cùng màu suốt ván cờ.", pieces: "wBd4", show: "d4", info: PIECE_INFO.B },
      { say: "Mã đi theo hình chữ L: 2 ô thẳng rồi rẽ 1 ô. Mã là quân duy nhất nhảy qua được quân khác.", pieces: "wNe4", show: "e4", info: PIECE_INFO.N },
      { say: "Ngay cả khi bị vây quanh, Mã vẫn nhảy ra được!", pieces: "wNe4 wPd4 wPf4 wPe5 wPe3 wPd5 wPf5 wPd3 wPf3", show: "e4", info: PIECE_INFO.N },
      { say: "Tốt đi thẳng 1 ô; ở nước đầu tiên có thể đi 2 ô. Tốt không bao giờ đi lùi.", pieces: "wPe2", show: "e2", info: PIECE_INFO.P },
      { say: "Tốt ăn quân theo đường chéo phía trước. Giờ hãy bấm vào một quân trên bàn để tự thử!", pieces: "wPe4 bPd5 bNf5 bBe5", show: "e4", info: PIECE_INFO.P },
    ],
    quiz: [
      { kind: "squares", prompt: "Bấm vào tất cả các ô mà Mã ở d4 có thể đi tới.", pieces: "wNd4", from: "d4" },
      { kind: "squares", prompt: "Bấm vào tất cả các ô Tượng ở c1 có thể đi tới.", pieces: "wBc1 wPd2", from: "c1" },
      { kind: "squares", prompt: "Bấm vào tất cả các ô Xe ở a1 có thể đi tới.", pieces: "wRa1 wPa4 wKe1", from: "a1" },
    ],
  },
  {
    id: "l4",
    title: "Giá trị các quân cờ",
    icon: "scale",
    info: {
      title: "Bảng giá trị",
      bullets: ["Tốt = 1 · Mã = 3 · Tượng = 3", "Xe = 5 · Hậu = 9", "Vua là vô giá: mất Vua là thua."],
      examples: [
        { pieces: "wNc3 bRd5", arrows: [["c3", "d5", "good"]], marks: { capture: ["d5"] }, ok: true, caption: "Mã (3) ăn Xe (5): lời" },
        { pieces: "wQd1 bPd5 bPe6", arrows: [["d1", "d5", "bad"]], marks: { capture: ["d5"] }, ok: false, caption: "Hậu ăn Tốt được bảo vệ" },
      ],
    },
    steps: [
      { say: "Mỗi quân có một giá trị điểm để so sánh sức mạnh. Tốt là quân yếu nhất: 1 điểm.", pieces: "wPb4 wNc4 wBd4 wRe4 wQf4 wKg4", marks: { target: ["b4"] } },
      { say: "Mã và Tượng đều có giá trị 3 điểm – tương đương 3 Tốt.", marks: { target: ["c4", "d4"] } },
      { say: "Xe đáng 5 điểm, mạnh hơn Mã và Tượng.", marks: { target: ["e4"] } },
      { say: "Hậu mạnh nhất với 9 điểm.", marks: { target: ["f4"] } },
      { say: "Vua không tính điểm vì không thể đổi: mất Vua là thua ván.", marks: { check: ["g4"] } },
      { say: "Khi đổi quân, hãy cộng điểm hai bên. Mã ăn Xe là lời 2 điểm!", pieces: "wNc3 bRd5", arrows: [["c3", "d5"]], marks: { capture: ["d5"] } },
    ],
    quiz: [
      { kind: "choice", prompt: "Quân nào có giá trị cao nhất (không tính Vua)?", options: ["Xe", "Hậu", "Mã"], answer: 1 },
      { kind: "choice", prompt: "Mã có giá trị bằng quân nào?", options: ["Tốt", "Tượng", "Xe"], answer: 1 },
      { kind: "choice", prompt: "Bạn đổi Xe của mình lấy Tượng của đối phương. Kết quả là:", options: ["Lời 2 điểm", "Lỗ 2 điểm", "Hòa vốn"], answer: 1 },
    ],
  },
  {
    id: "l5",
    title: "Ăn quân",
    icon: "swords",
    explore: true,
    info: {
      title: "Ăn quân",
      bullets: ["Đi vào ô có quân đối phương để ăn quân đó.", "Quân bị ăn bị loại khỏi bàn cờ.", "Không ăn quân mình, không ăn được Vua."],
      examples: [
        { pieces: "wPe4 bPd5", arrows: [["e4", "d5", "good"]], marks: { capture: ["d5"] }, ok: true, caption: "Tốt ăn chéo" },
        { pieces: "wPe4 bPe5", arrows: [["e4", "e5", "bad"]], ok: false, caption: "Tốt không ăn thẳng" },
      ],
    },
    steps: [
      { say: "Xe trắng ở d1 có thể ăn Mã đen ở d6 vì không có quân nào chắn giữa.", pieces: "wRd1 bNd6 wBb2 bQg7 wKh1 bKa8", arrows: [["d1", "d6"]], marks: { capture: ["d6"] } },
      { say: "Xe đi vào ô d6, Mã đen bị loại khỏi bàn cờ.", pieces: "wRd6 wBb2 bQg7 wKh1 bKa8", marks: { target: ["d6"] } },
      { say: "Tượng ở b2 ăn Hậu đen ở g7 theo đường chéo – một nước ăn quân rất giá trị!", arrows: [["b2", "g7"]], marks: { capture: ["g7"] } },
      { say: "Tốt thì khác: chỉ ăn chéo. Tốt e4 ăn được d5 hoặc f5, nhưng không ăn được quân đứng ngay trước mặt.", pieces: "wPe4 bPd5 bNf5 bBe5", marks: { capture: ["d5", "f5"], bad: ["e5"] } },
      { say: "Bấm thử vào quân trắng để xem quân nào có thể bị ăn.", pieces: "wNe4 bRf6 bPe6 bQd2 bBe2 wKa1 bKh8", show: "e4" },
    ],
    quiz: [
      { kind: "squares", prompt: "Bấm vào các quân đen mà Mã e4 ăn được.", pieces: "wNe4 bRf6 bPe6 bQd2 bBe2", answer: ["f6", "d2"] },
      { kind: "choice", prompt: "Tốt ăn quân theo hướng nào?", options: ["Thẳng phía trước", "Chéo phía trước", "Mọi hướng"], answer: 1 },
      { kind: "squares", prompt: "Xe ở a1 ăn được quân đen nào? Bấm vào quân đó.", pieces: "wRa1 wPa3 bNa6 bBe1 bPc3", answer: ["e1"] },
    ],
  },
  {
    id: "l6",
    title: "Chiếu tướng",
    icon: "crown",
    info: {
      title: "Chiếu tướng",
      glyph: "wK",
      bullets: ["Chiếu = Vua đang bị quân đối phương tấn công.", "Bên bị chiếu buộc phải thoát chiếu ngay.", "3 cách: chạy Vua, chặn đường, ăn quân chiếu."],
      examples: [
        { pieces: "bKe8 wRe1 bBc5", arrows: [["c5", "e7", "good"]], marks: { check: ["e8"] }, ok: true, caption: "Chặn chiếu bằng Tượng" },
        { pieces: "bKe8 wRd1", arrows: [["e8", "d8", "bad"]], ok: false, caption: "Vua đi vào ô bị tấn công" },
      ],
    },
    steps: [
      { say: "Xe trắng ở e1 đang tấn công Vua đen ở e8. Đây gọi là CHIẾU.", pieces: "bKe8 wRe1 wKg1", arrows: [["e1", "e8"]], marks: { check: ["e8"] } },
      { say: "Cách 1 – chạy Vua: Vua đen sang ô an toàn d8, d7, f7 hoặc f8 (không đứng trên cột e).", marks: { check: ["e8"], move: ["d8", "d7", "f7", "f8"], bad: ["e7"] } },
      { say: "Cách 2 – chặn đường: đưa một quân vào giữa, ví dụ Tượng c5 về e7.", pieces: "bKe8 wRe1 wKg1 bBc5", arrows: [["c5", "e7"]], marks: { check: ["e8"], target: ["e7"] } },
      { say: "Cách 3 – ăn quân đang chiếu: Hậu đen ở a5 ăn luôn Xe e1.", pieces: "bKe8 wRe1 wKg1 bQa5", arrows: [["a5", "e1"]], marks: { check: ["e8"], capture: ["e1"] } },
      { say: "Lưu ý: bạn không bao giờ được tự đưa Vua của mình vào ô đang bị tấn công.", pieces: "bKe8 wRd1 wKg1", marks: { bad: ["d8", "d7"] } },
    ],
    quiz: [
      { kind: "choice", prompt: "Khi Vua của bạn bị chiếu, bạn phải:", options: ["Đi quân khác cũng được", "Thoát chiếu ngay lập tức", "Xin hòa"], answer: 1 },
      { kind: "squares", prompt: "Vua đen đang bị chiếu. Bấm vào tất cả các ô Vua có thể chạy tới.", pieces: "bKe8 wRe1 wKg1", answer: ["d8", "d7", "f7", "f8"], marks: { check: ["e8"] } },
      { kind: "choice", prompt: "Đâu KHÔNG phải cách thoát chiếu?", options: ["Chạy Vua", "Chặn đường chiếu", "Đi thêm một nước Tốt"], answer: 2 },
    ],
  },
  {
    id: "l7",
    title: "Chiếu hết",
    icon: "crown2",
    explore: true,
    info: {
      title: "Chiếu hết",
      glyph: "wQ",
      bullets: ["Bị chiếu và không còn cách nào thoát.", "Ván cờ kết thúc ngay, bên chiếu hết thắng.", "Mẫu quen thuộc: chiếu hết hàng cuối."],
      examples: [
        { pieces: "bKg8 bPf7 bPg7 bPh7 wRa8", marks: { check: ["g8"] }, ok: true, caption: "Chiếu hết hàng cuối" },
        { pieces: "bKg8 bPf7 bPg7 bPh6 wRa8", marks: { check: ["g8"], good: ["h7"] }, ok: false, caption: "Vua còn ô h7 để thoát" },
      ],
    },
    steps: [
      { say: "Vua đen ở g8 đang bị chính các Tốt của mình chặn đường thoát.", pieces: "bKg8 bPf7 bPg7 bPh7 wRa1 wKg1 wPf2 wPg2 wPh2", marks: { target: ["f7", "g7", "h7"] } },
      { say: "Xe trắng đi từ a1 lên a8: Chiếu!", arrows: [["a1", "a8"]], marks: { target: ["a8"] } },
      { say: "Vua không chạy được, không có quân nào chặn hay ăn được Xe. Đó là CHIẾU HẾT – Trắng thắng!", pieces: "bKg8 bPf7 bPg7 bPh7 wRa8 wKg1 wPf2 wPg2 wPh2", marks: { check: ["g8"] } },
      { say: "Một mẫu khác: Hậu chiếu hết với sự hỗ trợ của Vua. Hậu g7 được Vua f6 bảo vệ nên Vua đen không ăn được.", pieces: "bKg8 wQg7 wKf6", marks: { check: ["g8"], good: ["f6"] } },
      { say: "Đến lượt bạn: hãy bấm Xe trắng và tìm nước chiếu hết!", pieces: "bKh8 bPg7 bPh7 wRe1 wKg1", show: "e1" },
    ],
    quiz: [
      { kind: "move", prompt: "Trắng đi: tìm nước chiếu hết bằng Xe.", pieces: "6k1/5ppp/8/8/8/8/5PPP/R5K1", answer: ["a1", "a8"], hint: "Hàng cuối của Đen không có ai canh giữ." },
      { kind: "move", prompt: "Trắng đi: tìm nước chiếu hết bằng Hậu.", pieces: "6k1/8/6K1/8/8/8/8/3Q4", answer: ["d1", "d8"], hint: "Vua trắng đã khóa các ô f7, g7, h7." },
      { kind: "choice", prompt: "Chiếu hết khác chiếu tướng ở điểm nào?", options: ["Không còn cách thoát chiếu", "Quân chiếu luôn là Hậu", "Vua phải ở góc bàn"], answer: 0 },
    ],
  },
];

export const CHAPTERS: Record<string, Chapter[]> = {
  intro: [
    { id: "c1", title: "Nhập Môn Cờ Vua", lessons: INTRO_CH1 },
    { id: "c2", title: "Nền Tảng Chiến Thuật", lessons: [], soon: ["Đòn chĩa đôi", "Đòn ghim", "Đòn xiên", "Tấn công phát hiện"] },
    { id: "c3", title: "Khai Cuộc Cơ Bản", lessons: [], soon: ["Kiểm soát trung tâm", "Phát triển quân", "Nhập thành"] },
    { id: "c4", title: "Trung Cuộc", lessons: [], soon: ["Lập kế hoạch", "Cấu trúc Tốt", "Tấn công Vua"] },
    { id: "c5", title: "Tàn Cuộc", lessons: [], soon: ["Vua và Tốt", "Chiếu hết bằng Xe", "Chiếu hết bằng Hậu"] },
  ],
};

// Thử thách: chiếu hết trong 1 nước (Trắng đi)
export const CHALLENGES: Extract<Quiz, { kind: "move" }>[] = [
  { kind: "move", prompt: "Chiếu hết trong 1 nước: Xe tấn công hàng cuối.", pieces: "7k/6pp/8/8/8/8/8/4R1K1", answer: ["e1", "e8"], hint: "Vua đen bị chính Tốt g7, h7 chặn." },
  { kind: "move", prompt: "Chiếu hết trong 1 nước: “Chiếu ngạt” bằng Mã.", pieces: "6rk/6pp/8/6N1/8/8/8/K7", answer: ["g5", "f7"], hint: "Vua đen bị quân của mình vây kín." },
  { kind: "move", prompt: "Chiếu hết trong 1 nước: nước chiếu hết “4 nước” nổi tiếng.", pieces: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR", answer: ["h5", "f7"], hint: "Ô f7 chỉ có Vua đen bảo vệ." },
];

export function allLessons(courseId: string): Lesson[] {
  return (CHAPTERS[courseId] ?? []).flatMap((c) => c.lessons);
}

// ===================== Tiến độ (lưu trên trình duyệt) =====================

const DONE_KEY = "cv-lessons-done";

export function loadDone(courseId: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Record<string, string[]>;
    return Array.isArray(all[courseId]) ? all[courseId] : [];
  } catch {
    return [];
  }
}

export function markDone(courseId: string, lessonId: string): string[] {
  const done = Array.from(new Set([...loadDone(courseId), lessonId]));

  try {
    const all = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Record<string, string[]>;

    all[courseId] = done;
    localStorage.setItem(DONE_KEY, JSON.stringify(all));
  } catch {
    /* bỏ qua */
  }

  // Gửi lên máy chủ (nhiệm vụ "Học 1 bài trong Khóa học"); khách chưa đăng nhập thì bỏ qua
  fetch("/api/challenges/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId, lessonId }),
  }).catch(() => {});

  // Đồng bộ với tiến độ ở trang danh sách khóa học
  const progress = loadProgress();
  progress[courseId] = Math.max(progress[courseId] ?? 0, done.length);
  saveProgress(progress);

  return done;
}
