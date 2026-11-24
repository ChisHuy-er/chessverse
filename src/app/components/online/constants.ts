export const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

export const PIECE_NAMES: Record<string, string> = {
  p: "Tốt",
  n: "Mã",
  b: "Tượng",
  r: "Xe",
  q: "Hậu",
};

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";

export const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const pieceSymbols: Record<string, string> = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
};

export const confettiPieces = Array.from({ length: 45 }, (_, index) => index);

export const confettiColors = [
  "#facc15",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f97316",
];
