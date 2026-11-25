import { Chess, type Square } from "chess.js";

import { INITIAL_FEN, PIECE_VALUES } from "./constants";
import type { AnalysisMove, CapturedPiece } from "./types";

/**
 * Xác định quân bị bắt trước khi thực hiện nước đi.
 * Hỗ trợ cả bắt quân qua đường.
 */
export function getCapturedPiece(
  beforeFen: string,
  from: string,
  to: string,
): CapturedPiece | null {
  try {
    const game = new Chess(beforeFen);

    let captured = game.get(to as Square);
    const mover = game.get(from as Square);

    // Bắt tốt qua đường: chỉ khi quân đi là Tốt, đi chéo vào ô trống
    // và đúng ô bắt qua đường của thế cờ (không nhầm với Mã/Tượng đi chéo).
    if (!captured && mover?.type === "p" && from[0] !== to[0] && game.fen().split(" ")[3] === to) {
      const victim = game.get(`${to[0]}${from[1]}` as Square);
      if (victim?.type === "p" && victim.color !== mover.color) captured = victim;
    }

    if (!captured || captured.type === "k") {
      return null;
    }

    return {
      color: captured.color,
      type: captured.type as CapturedPiece["type"],
    };
  } catch {
    return null;
  }
}

export function getMaterialValue(pieces: CapturedPiece[]) {
  return pieces.reduce(
    (total, piece) => total + PIECE_VALUES[piece.type],
    0,
  );
}

/**
 * Dựng danh sách quân bị bắt tại một thời điểm trong Replay.
 * selectedPly = 0 là vị trí ban đầu.
 */
export function getReviewCapturedPieces(
  moves: AnalysisMove[],
  selectedPly: number,
): CapturedPiece[] {
  const game = new Chess(INITIAL_FEN);
  const capturedPieces: CapturedPiece[] = [];

  const sortedMoves = [...moves]
    .filter((item) => item.ply <= selectedPly)
    .sort((a, b) => a.ply - b.ply);

  for (const item of sortedMoves) {
    try {
      let from: string | undefined;
      let to: string | undefined;

      if (
        item.uci &&
        /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(item.uci)
      ) {
        from = item.uci.slice(0, 2);
        to = item.uci.slice(2, 4);
      } else {
        const matchingMove = game.moves({ verbose: true }).find(
          (move) => move.san === item.move,
        );

        from = matchingMove?.from;
        to = matchingMove?.to;
      }

      if (from && to) {
        const beforeFen = item.beforeFen || game.fen();
        const captured = getCapturedPiece(beforeFen, from, to);

        if (captured) {
          capturedPieces.push(captured);
        }
      }

      // Luôn tiến game để xử lý các nước tiếp theo.
      game.move(item.move);
    } catch {
      // Bỏ qua nước không hợp lệ, không làm hỏng toàn bộ Replay.
      continue;
    }
  }

  return capturedPieces;
}

export function getReasonText(reason: string): string {
  const reasons: Record<string, string> = {
    checkmate: "Chiếu hết",
    resign: "Đối thủ đã đầu hàng",
    disconnect: "Đối thủ đã mất kết nối hoặc rời trận",
    timeout: "Hết giờ",
    stalemate: "Hòa do hết nước đi hợp lệ",
    insufficient_material: "Hòa do không đủ quân chiếu hết",
    threefold_repetition: "Hòa do lặp lại thế cờ ba lần",
    fifty_move_rule: "Hòa theo luật 50 nước",
    seventy_five_move_rule: "Hòa theo luật 75 nước",
    draw_agreement: "Hai người chơi đồng ý hòa",
  };

  return reasons[reason] || "Ván đấu đã kết thúc";
}

export function getAnalysisColor(label: string): string {
  switch (label) {
    case "Best":
      return "text-green-400";
    case "Brilliant":
      return "text-cyan-400";
    case "Excellent":
      return "text-emerald-400";
    case "Good":
      return "text-green-300";
    case "Inaccuracy":
      return "text-yellow-400";
    case "Mistake":
      return "text-orange-400";
    case "Blunder":
      return "text-red-400";
    default:
      return "text-gray-400";
  }
}

export function getAnalysisIcon(label: string): string {
  switch (label) {
    case "Brilliant":
      return "!!";
    case "Best":
      return "★";
    case "Excellent":
      return "✓";
    case "Good":
      return "✓";
    case "Inaccuracy":
      return "?!";
    case "Mistake":
      return "?";
    case "Blunder":
      return "??";
    default:
      return "·";
  }
}

export function formatCpl(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "---";
  }

  return `${Math.round(value)} CPL`;
}

export function formatClock(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getMoveTitle(item: AnalysisMove): string {
  const moveNumber = Math.ceil(item.ply / 2);

  return item.color === "w"
    ? `${moveNumber}. ${item.move}`
    : `${moveNumber}... ${item.move}`;
}

/**
 * Lấy chính xác FEN sau nước đi từ Backend.
 * Nếu Backend cũ chưa gửi afterFen thì dựng lại bằng SAN.
 */
export function getReviewFen(
  moves: AnalysisMove[],
  selectedPly: number,
  finalFen: string,
): string {
  if (selectedPly === 0) {
    return INITIAL_FEN;
  }

  const sortedMoves = [...moves].sort(
    (a, b) => a.ply - b.ply,
  );

  const selectedMove = sortedMoves.find(
    (item) => item.ply === selectedPly,
  );

  if (selectedMove?.afterFen) {
    return selectedMove.afterFen;
  }

  try {
    const game = new Chess(INITIAL_FEN);

    for (const item of sortedMoves) {
      if (item.ply > selectedPly) break;
      game.move(item.move);
    }

    return game.fen();
  } catch (error) {
    console.error("Không thể dựng lại vị trí:", error);
    return finalFen;
  }
}

/**
 * Chuyển UCI của Stockfish thành SAN để người chơi dễ đọc.
 * Ví dụ: g1f3 -> Nf3.
 */
export function getBestMoveSan(item: AnalysisMove): string {
  if (!item.bestMove) return "---";

  if (!item.beforeFen) {
    return item.bestMove;
  }

  try {
    const game = new Chess(item.beforeFen);

    const uci = item.bestMove.trim();

    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      return uci;
    }

    const result = game.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci[4] as "q" | "r" | "b" | "n" | undefined,
    });

    return result.san;
  } catch {
    return item.bestMove;
  }
}

/**
 * Điểm Stockfish trong Backend đang theo góc nhìn
 * của bên tới lượt đi tại beforeFen.
 */
export function formatEvaluation(item: AnalysisMove): string {
  if (item.scoreType === null || item.score === null) {
    return "Chưa có đánh giá";
  }

  if (item.scoreType === "mate") {
    return item.score > 0
      ? `Chiếu hết trong ${item.score} nước`
      : `Có thể bị chiếu hết trong ${Math.abs(item.score)} nước`;
  }

  const pawns = item.score / 100;

  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}
