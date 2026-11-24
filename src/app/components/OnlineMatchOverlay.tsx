"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { io, type Socket } from "socket.io-client";


type OnlineMode = "ranked" | "casual";
type CapturedPiece = {
  color: "w" | "b";
  type: "p" | "n" | "b" | "r" | "q";
};

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

const PIECE_NAMES: Record<string, string> = {
  p: "Tốt",
  n: "Mã",
  b: "Tượng",
  r: "Xe",
  q: "Hậu",
};

/**
 * Xác định quân bị bắt trước khi thực hiện nước đi.
 * Hỗ trợ cả bắt quân qua đường.
 */
function getCapturedPiece(
  beforeFen: string,
  from: string,
  to: string,
): CapturedPiece | null {
  try {
    const game = new Chess(beforeFen);

    let captured = game.get(to as Square);

    // Bắt tốt qua đường: ô đích đang trống,
    // quân tốt bị bắt nằm cùng hàng với quân xuất phát.
    if (!captured && from[0] !== to[0]) {
      captured = game.get(`${to[0]}${from[1]}` as Square);
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

function getMaterialValue(pieces: CapturedPiece[]) {
  return pieces.reduce(
    (total, piece) => total + PIECE_VALUES[piece.type],
    0,
  );
}

/**
 * Dựng danh sách quân bị bắt tại một thời điểm trong Replay.
 * selectedPly = 0 là vị trí ban đầu.
 */
function getReviewCapturedPieces(
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
type ClockSnapshot = {
  whiteMs: number;
  blackMs: number;
  activeColor: "white" | "black";
};

type DrawOfferedData = {
  from: string;
  fromColor: "white" | "black";
};
interface PlayerProfile {
  id: string;
  username: string;
  displayName: string;
  elo: number;
}

interface MatchFoundData {
  matchId: string;
  fen: string;
  mode: OnlineMode;
  clock?: ClockSnapshot;
  players: {
    white: string;
    black: string;
    whiteProfile: PlayerProfile;
    blackProfile: PlayerProfile;
  };
}
interface MoveMadeData {
  move: {
    from: string;
    to: string;
    san: string;
    promotion?: string;
  };
  fen: string;
  turn: "w" | "b";
}

interface EloChange {
  before: number;
  change: number;
  after: number;
}

interface AnalysisMove {
  ply: number;
  color: "w" | "b";

  // SAN để hiển thị nước đi.
  move: string;

  // UCI và FEN do Backend gửi.
  uci?: string;
  bestMove: string;
  beforeFen?: string;
  afterFen?: string;

  scoreType: "cp" | "mate" | null;
  score: number | null;
  depth: number;
  pv: string[];
  centipawnLoss: number | null;
  label: string;
}

interface FinishedData {
  result: "win" | "draw";
  winner: string | null;
  reason: string;
  fen: string;
  clock?: ClockSnapshot;
  eloChanges: {
    white: EloChange;
    black: EloChange;
  } | null;
  analysisSummary?: {
    whiteAverageCpl: number | null;
    blackAverageCpl: number | null;
    moves: AnalysisMove[];
  };
}

interface ResumeData {
  matchId: string;
  mode: OnlineMode;
  fen: string;
  clock: ClockSnapshot;
  color: "white" | "black";
  players: MatchFoundData["players"];
  lastMove: { from: string; to: string } | null;
  moves: { from: string; to: string; beforeFen: string }[];
  drawOffer: DrawOfferedData | null;
  drawOfferSent: boolean;
  opponentDisconnected: boolean;
}

interface Props {
  mode: OnlineMode;
  onClose: () => void;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const pieceSymbols: Record<string, string> = {
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

const confettiPieces = Array.from({ length: 45 }, (_, index) => index);

const confettiColors = [
  "#facc15",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f97316",
];

function getReasonText(reason: string): string {
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

function getAnalysisColor(label: string): string {
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

function getAnalysisIcon(label: string): string {
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

function formatCpl(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "---";
  }

  return `${Math.round(value)} CPL`;
}

function formatClock(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getMoveTitle(item: AnalysisMove): string {
  const moveNumber = Math.ceil(item.ply / 2);

  return item.color === "w"
    ? `${moveNumber}. ${item.move}`
    : `${moveNumber}... ${item.move}`;
}

/**
 * Lấy chính xác FEN sau nước đi từ Backend.
 * Nếu Backend cũ chưa gửi afterFen thì dựng lại bằng SAN.
 */
function getReviewFen(
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
function getBestMoveSan(item: AnalysisMove): string {
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
function formatEvaluation(item: AnalysisMove): string {
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

export default function OnlineMatchOverlay({
  mode,
  onClose,
}: Props) {
  const [socket, setSocket] = useState<Socket | null>(null);
  // Đồng hồ do backend gửi về.
  const [clock, setClock] = useState<ClockSnapshot | null>(null);

  // Cập nhật giao diện đồng hồ liên tục giữa các lần nhận dữ liệu.
  const [clockNow, setClockNow] = useState(0);
  const [clockReceivedAt, setClockReceivedAt] = useState(0);

  // Đề nghị hòa đang chờ phản hồi.
  const [drawOffer, setDrawOffer] = useState<DrawOfferedData | null>(null);

  // Đang chờ đối thủ phản hồi đề nghị hòa của mình.
  const [drawOfferSent, setDrawOfferSent] = useState(false);

  // Hiện hộp thoại xác nhận đầu hàng.
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  
  const [status, setStatus] = useState("Đang kết nối...");
  const [message, setMessage] = useState(
    "Đang xác thực tài khoản...",
  );

  const [match, setMatch] =
    useState<MatchFoundData | null>(null);

  const [myColor, setMyColor] = useState<
    "white" | "black" | null
  >(null);

  const [fen, setFen] = useState(INITIAL_FEN);
  // FEN trước nước đi mới nhất, dùng để xác định quân bị bắt.
  const fenRef = useRef(INITIAL_FEN);

  // Danh sách quân đã bị bắt trong trận đấu trực tiếp.
  const [liveCapturedPieces, setLiveCapturedPieces] = useState<
    CapturedPiece[]
  >([]);

  const [selected, setSelected] = useState<Square | null>(
    null,
  );

  const [promotionChoice, setPromotionChoice] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  const [legalTargets, setLegalTargets] = useState<string[]>(
    [],
  );

  const [lastMove, setLastMove] = useState<{
    from: string;
    to: string;
  } | null>(null);

  const [finished, setFinished] =
    useState<FinishedData | null>(null);

  const [showResultOverlay, setShowResultOverlay] =
    useState(false);

  const [selectedReviewPly, setSelectedReviewPly] =
    useState<number | null>(null);

  const [opponentDisconnected, setOpponentDisconnected] =
    useState(false);

  const [claimingDraw, setClaimingDraw] = useState(false);

  // Đang tự kết nối lại sau khi rớt mạng.
  const [reconnecting, setReconnecting] = useState(false);

  // Không thể nối lại nữa (hết lượt thử, bị mở ở tab khác, ván đã kết thúc).
  const [connectionLost, setConnectionLost] = useState(false);

  
  const displayedClock = useMemo(() => {
    if (!clock) {
      return {
        whiteMs: 10 * 60 * 1000,
        blackMs: 10 * 60 * 1000,
      };
    }

    // Khi trận đã kết thúc, không trừ thời gian nữa.
    const elapsed = finished
      ? 0
      : Math.max(0, clockNow - clockReceivedAt);

    return {
      whiteMs: Math.max(
        0,
        clock.whiteMs -
          (clock.activeColor === "white" ? elapsed : 0),
      ),
      blackMs: Math.max(
        0,
        clock.blackMs -
          (clock.activeColor === "black" ? elapsed : 0),
      ),
    };
  }, [clock, clockNow, clockReceivedAt, finished]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockNow(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, []);

  // =========================================================
  // SOCKET VÀ TÌM TRẬN
  // =========================================================

  useEffect(() => {
    let activeSocket: Socket | null = null;
    let active = true;

    async function connectAndFind() {
      try {
        const response = await fetch(
          "/api/auth/socket-token",
          {
            method: "POST",
            credentials: "include",
          },
        );

        const data = await response.json();

        if (!response.ok || !data.token) {
          throw new Error(
            data.message || "Không thể xác thực tài khoản.",
          );
        }

        if (!active) return;

        // Token dùng cho lần kết nối đầu. Khi tự nối lại sẽ lấy token mới
        // vì token socket chỉ sống 2 phút.
        let firstToken: string | null = data.token;
        let inMatch = false;
        let gameOver = false;
        let replaced = false;
        let hasConnectedBefore = false;
        let resumeTimer: ReturnType<typeof setTimeout> | null = null;

        const newSocket = io(BACKEND_URL, {
          auth: (cb) => {
            if (firstToken) {
              const token = firstToken;
              firstToken = null;
              cb({ token });
              return;
            }

            fetch("/api/auth/socket-token", {
              method: "POST",
              credentials: "include",
            })
              .then((res) => res.json())
              .then((json) => cb({ token: json?.token ?? "" }))
              .catch(() => cb({ token: "" }));
          },
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 3000,
        });

        activeSocket = newSocket;
        setSocket(newSocket);

        newSocket.on("connect", () => {
          const isReconnect = hasConnectedBefore;
          hasConnectedBefore = true;

          // Nối lại giữa trận: máy chủ tự gửi lại ván (match:resume).
          // Nếu 4 giây không thấy thì ván đã kết thúc trong lúc mất kết nối.
          if (isReconnect && inMatch) {
            setStatus("Đang kết nối lại");
            setMessage("Đã kết nối lại, đang đồng bộ ván đấu...");

            resumeTimer = setTimeout(() => {
              setReconnecting(false);
              setConnectionLost(true);
              setMessage(
                "Ván đấu đã kết thúc trong lúc bạn mất kết nối. Hãy xem kết quả ở mục Lịch sử đấu.",
              );
            }, 4000);

            return;
          }

          setStatus("Đang tìm trận");

          setMessage(
            mode === "ranked"
              ? "Đang tìm đối thủ đấu hạng..."
              : "Đang tìm đối thủ đấu thường...",
          );

          newSocket.emit("match:find", { mode });
        });

        newSocket.on("connect_error", (error) => {
          setStatus("Kết nối thất bại");
          setMessage(error.message);
        });

        newSocket.on(
          "match:waiting",
          (data: { message: string }) => {
            setStatus("Đang tìm trận");
            setMessage(data.message);
          },
        );

        newSocket.on("match:found",
          (data: MatchFoundData) => {
            setFen(data.fen);
            fenRef.current = data.fen;
            setMatch(data);
            setLiveCapturedPieces([]);
            setClock(
              data.clock ?? {
                whiteMs: 10 * 60 * 1000,
                blackMs: 10 * 60 * 1000,
                activeColor: "white",
              },
            );
            setClockReceivedAt(Date.now());
            setDrawOffer(null);
            setShowResignConfirm(false);
            setDrawOfferSent(false);
            setFinished(null);
            setShowResultOverlay(false);
            setSelectedReviewPly(null);
            setLastMove(null);
            setOpponentDisconnected(false);
            setStatus("Đã ghép trận");
            setMessage("Đối thủ đã sẵn sàng!");
          },
        );

        newSocket.on("match:your-color",
          (data: { color: string }) => {
            if (
              data.color === "white" ||
              data.color === "black"
            ) {
              setMyColor(data.color);
            }
          },
        );

        newSocket.on("match:move-made", (data: MoveMadeData) => {
        const beforeFen = fenRef.current;

        const captured = getCapturedPiece(
          beforeFen,
          data.move.from,
          data.move.to,
        );

        if (captured) {
          setLiveCapturedPieces((previous) => [
            ...previous,
            captured,
          ]);
        }

        fenRef.current = data.fen;
        setFen(data.fen);

        setLastMove({
          from: data.move.from,
          to: data.move.to,
        });

        setSelected(null);
        setLegalTargets([]);
        setPromotionChoice(null);
        setClaimingDraw(false);

        setMessage("Nước đi đã được đồng bộ.");
      });

        newSocket.on("match:clock", (data: ClockSnapshot) => {
          setClock(data);
          setClockReceivedAt(Date.now());
        });

        newSocket.on("match:draw-offered", (data: DrawOfferedData) => {
          setDrawOffer(data);
          setMessage("Đối thủ đang đề nghị hòa.");
        });

        // Đối thủ đã từ chối đề nghị hòa.
        newSocket.on(
          "match:draw-declined",
          () => {
            setDrawOfferSent(false);
            setDrawOffer(null);
            setMessage("Đối thủ đã từ chối đề nghị hòa.");
          },
        );

        // Đề nghị hòa bị hủy khi có nước đi mới.
        newSocket.on(
          "match:draw-cancelled",
          () => {
            setDrawOfferSent(false);
            setDrawOffer(null);
            setMessage(
              "Đề nghị hòa đã hết hiệu lực vì có nước đi mới.",
            );
          },
        );

        newSocket.on("match:finished",
          (data: FinishedData) => {
            setFen(data.fen);
            fenRef.current = data.fen;
            // Nhận và giữ nguyên thời gian cuối cùng của trận.
            if (data.clock) {
              setClock(data.clock);
              setClockReceivedAt(Date.now());
            }

            setFinished(data);
            setDrawOffer(null);
            setShowResignConfirm(false);
            setDrawOfferSent(false);
            setShowResultOverlay(true);
            setSelectedReviewPly(null);
            setSelected(null);
            setLegalTargets([]);
            setPromotionChoice(null);
            setClaimingDraw(false);
            setStatus("Trận đấu kết thúc");
            setMessage(getReasonText(data.reason));
          },
        );

        newSocket.on(
          "match:opponent-disconnected",
          (data: { message: string }) => {
            setOpponentDisconnected(true);
            setMessage(data.message);
          },
        );

        newSocket.on("match:error",
          (data: { message: string }) => {
            setClaimingDraw(false);
            setDrawOfferSent(false);
            setMessage(data.message);
          },
        );

        newSocket.on("match:found", () => {
          inMatch = true;
        });

        // Nhận lại toàn bộ trạng thái ván khi nối lại hoặc mở lại trang.
        newSocket.on("match:resume", (data: ResumeData) => {
          inMatch = true;

          if (resumeTimer) {
            clearTimeout(resumeTimer);
            resumeTimer = null;
          }

          const captured: CapturedPiece[] = [];

          for (const item of data.moves) {
            const piece = getCapturedPiece(
              item.beforeFen,
              item.from,
              item.to,
            );

            if (piece) {
              captured.push(piece);
            }
          }

          setMatch({
            matchId: data.matchId,
            fen: data.fen,
            mode: data.mode,
            clock: data.clock,
            players: data.players,
          });
          setMyColor(data.color);
          setFen(data.fen);
          fenRef.current = data.fen;
          setLiveCapturedPieces(captured);
          setLastMove(data.lastMove);
          setClock(data.clock);
          setClockReceivedAt(Date.now());
          setDrawOffer(data.drawOffer);
          setDrawOfferSent(data.drawOfferSent);
          setShowResignConfirm(false);
          setFinished(null);
          setShowResultOverlay(false);
          setSelectedReviewPly(null);
          setSelected(null);
          setLegalTargets([]);
          setPromotionChoice(null);
          setOpponentDisconnected(data.opponentDisconnected);
          setReconnecting(false);
          setConnectionLost(false);
          setStatus("Đã vào lại trận");
          setMessage("Đã kết nối lại. Ván đấu tiếp tục!");
        });

        newSocket.on(
          "match:opponent-reconnected",
          (data: { message: string }) => {
            setOpponentDisconnected(false);
            setMessage(data.message);
          },
        );

        newSocket.on("match:replaced", () => {
          replaced = true;
        });

        // Ván kết thúc: không cần tự nối lại nữa.
        newSocket.on("match:finished", () => {
          gameOver = true;
          inMatch = false;
          newSocket.io.reconnection(false);

          if (resumeTimer) {
            clearTimeout(resumeTimer);
            resumeTimer = null;
          }
        });

        newSocket.on("disconnect", (reason) => {
          if (!active || gameOver) {
            return;
          }

          // Máy chủ chủ động ngắt (token sai, hoặc trận được mở ở tab khác):
          // không tự nối lại.
          if (reason === "io server disconnect") {
            setReconnecting(false);
            setConnectionLost(true);
            setStatus("Đã ngắt kết nối");
            setMessage(
              replaced
                ? "Trận đấu đã được mở ở một tab hoặc thiết bị khác."
                : "Máy chủ đã ngắt kết nối. Hãy đăng nhập lại.",
            );
            return;
          }

          // Mình chủ động đóng.
          if (reason === "io client disconnect") {
            setStatus("Đã ngắt kết nối");
            return;
          }

          // Rớt mạng: socket.io tự nối lại.
          setStatus("Mất kết nối");

          if (inMatch) {
            setReconnecting(true);
            setMessage(
              "Mất kết nối. Đang kết nối lại... Bạn có 30 giây trước khi bị xử thua.",
            );
          } else {
            setMessage("Mất kết nối. Đang kết nối lại...");
          }
        });

        newSocket.io.on("reconnect_failed", () => {
          if (!active || gameOver) {
            return;
          }

          setReconnecting(false);
          setConnectionLost(true);
          setStatus("Kết nối thất bại");
          setMessage("Không thể kết nối lại máy chủ.");
        });
      } catch (error) {
        if (!active) return;

        setStatus("Có lỗi xảy ra");

        setMessage(
          error instanceof Error
            ? error.message
            : "Không thể kết nối máy chủ.",
        );
      }
    }

    connectAndFind();

    return () => {
      active = false;
      activeSocket?.disconnect();
      setSocket(null);
    };
  }, [mode]);

  // =========================================================
  // DỮ LIỆU PHÂN TÍCH
  // =========================================================

  const allAnalysisMoves = useMemo(
    () =>
      finished?.analysisSummary?.moves
        ? [...finished.analysisSummary.moves].sort(
            (a, b) => a.ply - b.ply,
          )
        : [],
    [finished],
  );

  const selectedAnalysisMove = useMemo(
    () =>
      selectedReviewPly === null
        ? null
        : allAnalysisMoves.find(
            (item) => item.ply === selectedReviewPly,
          ) ?? null,
    [allAnalysisMoves, selectedReviewPly],
    );

    // Quân bị bắt khi xem lại trận đấu.
  const reviewCapturedPieces = useMemo(() => {
    if (!finished || allAnalysisMoves.length === 0) {
      return liveCapturedPieces;
    }

    const lastPly = Math.max(
      ...allAnalysisMoves.map((item) => item.ply),
    );

    return getReviewCapturedPieces(
      allAnalysisMoves,
      selectedReviewPly ?? lastPly,
    );
  }, [
    finished,
    allAnalysisMoves,
    selectedReviewPly,
    liveCapturedPieces,
  ]);

  // Khi trận đang diễn ra: dùng dữ liệu trực tiếp.
  // Khi trận kết thúc: dùng dữ liệu theo vị trí Replay.
  const capturedPieces = finished
    ? reviewCapturedPieces
    : liveCapturedPieces;

  // Quân Trắng bị bắt và quân Đen bị bắt.
  const whiteLostPieces = capturedPieces.filter(
    (piece) => piece.color === "w",
  );

  const blackLostPieces = capturedPieces.filter(
    (piece) => piece.color === "b",
  );

  // Giá trị quân mà mỗi bên đã bắt được.
  const whiteCapturedValue = getMaterialValue(blackLostPieces);
  const blackCapturedValue = getMaterialValue(whiteLostPieces);

  // Số dương nghĩa là Trắng đang có lợi thế vật chất.
  const whiteMaterialAdvantage =
    whiteCapturedValue - blackCapturedValue;

  const blackMaterialAdvantage =
    blackCapturedValue - whiteCapturedValue;

  // =========================================================
  // DỰNG BÀN CỜ
  // =========================================================

  const displayFen = useMemo(() => {
    if (
      finished &&
      selectedReviewPly !== null
    ) {
      return getReviewFen(
        allAnalysisMoves,
        selectedReviewPly,
        finished.fen,
      );
    }

    return fen;
  }, [
    fen,
    finished,
    selectedReviewPly,
    allAnalysisMoves,
  ]);

  const currentGame = useMemo(
    () => new Chess(displayFen),
    [displayFen],
  );

  const isMyTurn =
    !!myColor &&
    currentGame.turn() ===
      (myColor === "white" ? "w" : "b");

  const halfmoveClock = Number(fen.split(" ")[4] ?? 0);

  const canClaimDraw =
    !!match &&
    !finished &&
    !opponentDisconnected &&
    !!myColor &&
    isMyTurn &&
    (halfmoveClock >= 100 ||
      currentGame.isThreefoldRepetition());

  // =========================================================
  // THÔNG TIN NGƯỜI CHƠI
  // =========================================================

  const isWinner =
    !!finished &&
    !!match &&
    !!myColor &&
    finished.winner ===
      (myColor === "white"
        ? match.players.white
        : match.players.black);

  const opponentProfile =
    match && myColor
      ? myColor === "white"
        ? match.players.blackProfile
        : match.players.whiteProfile
      : null;

  const myProfile =
    match && myColor
      ? myColor === "white"
        ? match.players.whiteProfile
        : match.players.blackProfile
      : null;

  const myEloChange =
    finished?.eloChanges && myColor
      ? myColor === "white"
        ? finished.eloChanges.white
        : finished.eloChanges.black
      : null;

  const myAverageCpl =
    finished?.analysisSummary && myColor
      ? myColor === "white"
        ? finished.analysisSummary.whiteAverageCpl
        : finished.analysisSummary.blackAverageCpl
      : null;

  const bestMoveSan = selectedAnalysisMove
    ? getBestMoveSan(selectedAnalysisMove)
    : "---";

  const reviewLastMove = useMemo(() => {
    if (selectedAnalysisMove?.uci) {
      return {
        from: selectedAnalysisMove.uci.slice(0, 2),
        to: selectedAnalysisMove.uci.slice(2, 4),
      };
    }

    return selectedReviewPly === null ? lastMove : null;
  }, [selectedAnalysisMove, selectedReviewPly, lastMove]);

  // =========================================================
  // GỬI NƯỚC ĐI
  // =========================================================

  function sendMove(
    from: Square,
    to: Square,
    promotion?: "q" | "r" | "b" | "n",
  ) {
    if (!socket?.connected) {
      setMessage("Mất kết nối máy chủ.");
      return;
    }

    socket.emit("match:move", {
      from,
      to,
      promotion,
    });

    setSelected(null);
    setLegalTargets([]);
    setPromotionChoice(null);

    setMessage("Đang gửi nước đi...");
  }

  // =========================================================
  // CHỌN Ô TRÊN BÀN CỜ
  // =========================================================

  function handleSquareClick(square: Square) {
    if (
      !match ||
      !myColor ||
      finished
    ) {
      return;
    }

    const currentTurn = currentGame.turn();
    const myTurn = myColor === "white" ? "w" : "b";

    if (currentTurn !== myTurn) {
      setMessage("Chưa đến lượt bạn.");
      return;
    }

    const piece = currentGame.get(square);

    if (selected) {
      const moves = currentGame.moves({
        square: selected,
        verbose: true,
      });

      const selectedMove = moves.find(
        (move) => move.to === square,
      );

      if (selectedMove) {
        if (selectedMove.promotion) {
          setPromotionChoice({
            from: selected,
            to: square,
          });

          return;
        }

        sendMove(selected, square);
        return;
      }
    }

    if (piece && piece.color === myTurn) {
      const moves = currentGame.moves({
        square,
        verbose: true,
      });

      setSelected(square);
      setLegalTargets(moves.map((move) => move.to));

      setMessage("Hãy chọn ô muốn di chuyển.");
    } else {
      setSelected(null);
      setLegalTargets([]);
    }
  }

  // =========================================================
  // YÊU CẦU HÒA
  // =========================================================

  function offerDraw() {
    if (!socket?.connected) {
      setMessage("Mất kết nối máy chủ.");
      return;
    }

    if (!match || finished || drawOffer || drawOfferSent) {
      return;
    }

    setDrawOfferSent(true);

    socket.emit("match:offer-draw");

    setMessage(
      "Đã gửi đề nghị hòa. Đang chờ đối thủ phản hồi...",
    );
  }

  function respondToDraw(accepted: boolean) {
    if (!socket?.connected || !drawOffer) {
      return;
    }

    socket.emit("match:respond-draw", { accepted });
    setDrawOffer(null);
    setDrawOfferSent(false);
    setMessage(
      accepted
        ? "Bạn đã đồng ý hòa."
        : "Bạn đã từ chối đề nghị hòa.",
    );
  }

  function claimDraw() {
    if (!socket?.connected) {
      setMessage("Mất kết nối máy chủ.");
      return;
    }

    if (!canClaimDraw || claimingDraw) {
      return;
    }

    setClaimingDraw(true);
    socket.emit("match:claim-draw");
    setMessage("Đang yêu cầu hòa theo luật cờ vua...");
  }

  // =========================================================
  // ĐẦU HÀNG VÀ RỜI TRẬN
  // =========================================================

  function leaveMatch() {
    if (match && !finished && !connectionLost) {
      if (socket?.connected) {
        socket.emit("match:resign");

        setMessage(
          "Bạn đã rời trận. Đang xác nhận kết quả...",
        );
      } else {
        setMessage("Đang xác nhận kết quả trận đấu...");
      }

      return;
    }

    if (!match) {
      socket?.emit("match:cancel");
    }

    socket?.disconnect();
    setSocket(null);
    onClose();
  }

  function resign() {
  if (!socket?.connected) {
    setMessage("Mất kết nối máy chủ.");
    return;
  }

  setShowResignConfirm(true);
}

function confirmResign() {
  if (!socket?.connected) {
    setMessage("Mất kết nối máy chủ.");
    setShowResignConfirm(false);
    return;
  }

  socket.emit("match:resign");
  setShowResignConfirm(false);
  setMessage("Đang gửi yêu cầu đầu hàng...");
}

  // =========================================================
  // HƯỚNG BÀN CỜ
  // =========================================================

  const files =
    myColor === "black"
      ? ["h", "g", "f", "e", "d", "c", "b", "a"]
      : ["a", "b", "c", "d", "e", "f", "g", "h"];

  const ranks =
    myColor === "black"
      ? [1, 2, 3, 4, 5, 6, 7, 8]
      : [8, 7, 6, 5, 4, 3, 2, 1];

      
  function renderCapturedInfo(color: "w" | "b") {
  const lostPieces =
    color === "w" ? whiteLostPieces : blackLostPieces;

  const advantage =
    color === "w"
      ? whiteMaterialAdvantage
      : blackMaterialAdvantage;

  return (
    <div className="mt-2 flex min-h-7 flex-wrap items-center gap-1">
      {lostPieces.length > 0 ? (
        lostPieces.map((piece, index) => (
          <span
            key={`${piece.color}-${piece.type}-${index}`}
            title={`Đã mất ${PIECE_NAMES[piece.type]}`}
            className="text-lg leading-none opacity-70"
          >
            {pieceSymbols[
              `${piece.color}${piece.type.toUpperCase()}`
            ]}
          </span>
        ))
      ) : (
        <span className="text-xs text-gray-500">
          Chưa mất quân
        </span>
      )}

      {advantage > 0 && (
        <span className="ml-2 rounded-md bg-green-500/15 px-2 py-1 text-xs font-bold text-green-400">
          +{advantage}
        </span>
      )}

      {advantage < 0 && (
        <span className="ml-2 rounded-md bg-red-500/15 px-2 py-1 text-xs font-bold text-red-400">
          {advantage}
        </span>
      )}
    </div>
  );
}

  // =========================================================
  // GIAO DIỆN
  // =========================================================

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm">
      <div className="relative my-auto w-full max-w-5xl rounded-2xl border border-yellow-500/30 bg-[#17171d] p-4 text-white shadow-2xl md:p-7">

        {/* HEADER */}

        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold tracking-[0.25em] text-yellow-500">
              CHESSVERSE ONLINE
            </div>

            <h2 className="mt-1 text-xl font-bold md:text-2xl">
              {mode === "ranked"
                ? "Đấu xếp hạng"
                : "Đấu thường"}
            </h2>
          </div>

          <button
            onClick={leaveMatch}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10"
          >
            {match ? "Đóng trận" : "Hủy tìm trận"}
          </button>
        </div>

        {/* TRẠNG THÁI KẾT NỐI */}
        {(reconnecting || connectionLost) && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
            <span>{message}</span>
            {connectionLost && (
              <button
                onClick={onClose}
                className="shrink-0 rounded-lg border border-yellow-500/50 px-3 py-1 font-semibold transition hover:bg-yellow-500/10"
              >
                Đóng
              </button>
            )}
          </div>
        )}

        {/* WAITING */}

        {!match && (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
            <div className="mb-6 text-6xl text-yellow-400">
              ♞
            </div>

            <h3 className="text-2xl font-bold">{status}</h3>

            <p className="mt-3 text-sm text-gray-400">
              {message}
            </p>

            <div className="mt-7 h-2 w-48 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-yellow-500" />
            </div>
          </div>
        )}

        {/* MATCH */}

        {match && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">

            {/* CHESSBOARD */}

            <div className="mx-auto w-full max-w-[620px]">

              
            {/* OPPONENT */}
            <div className="mb-3 flex items-start justify-between rounded-xl bg-[#24242c] p-3">
              {/* THÔNG TIN ĐỐI THỦ */}
              <div className="min-w-0 text-left">
                <div className="text-xs text-gray-400">
                  ĐỐI THỦ
                </div>

                <div className="font-semibold">
                  {opponentProfile?.displayName?.trim() ||
                    opponentProfile?.username ||
                    "Đang tải thông tin..."}
                </div>

                <div className="mt-1 text-sm text-yellow-400">
                  {opponentProfile
                    ? `${opponentProfile.elo.toLocaleString("vi-VN")} Elo`
                    : "--- Elo"}
                </div>

                {renderCapturedInfo(myColor === "white" ? "b" : "w")}
              </div>

              {/* ĐỒNG HỒ ĐỐI THỦ Ở GÓC TRÊN BÊN PHẢI */}
              <div className="ml-3 flex shrink-0 flex-col items-end gap-2">
                <div
                  className={[
                    "rounded-lg px-3 py-1 font-mono text-xl font-bold tabular-nums",
                    !finished &&
                    clock?.activeColor ===
                      (myColor === "white" ? "black" : "white")
                      ? "bg-yellow-500 text-black"
                      : "bg-black/30 text-white",
                  ].join(" ")}
                >
                  {formatClock(
                    myColor === "white"
                      ? displayedClock.blackMs
                      : displayedClock.whiteMs,
                  )}
                </div>

                <div className="text-3xl">
                  {myColor === "white" ? "♚" : "♔"}
                </div>
              </div>
            </div>


              {/* REVIEW POSITION INFO */}

              {finished && selectedReviewPly !== null && (
                <div className="mb-2 flex items-center justify-between rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2">
                  <span className="text-sm text-yellow-300">
                    {selectedReviewPly === 0
                      ? "Vị trí bắt đầu"
                      : selectedAnalysisMove
                        ? `Đang xem: ${getMoveTitle(selectedAnalysisMove)}`
                        : "Đang xem lại ván cờ"}
                  </span>

                  <button
                    onClick={() => setSelectedReviewPly(null)}
                    className="text-xs text-yellow-400 hover:text-yellow-200"
                  >
                    Về cuối ván
                  </button>
                </div>
              )}

              {/* BOARD */}

              <div
                data-fen={displayFen}
                className="grid aspect-square grid-cols-8 overflow-visible rounded-lg border-2 border-[#b99b57]"
              >
                {ranks.map((rank) =>
                  files.map((file, fileIndex) => {
                    const square = `${file}${rank}` as Square;
                    const piece = currentGame.get(square);

                    const isPromotionSquare =
                      promotionChoice?.to === square;

                    const pieceKey = piece
                      ? `${piece.color}${piece.type.toUpperCase()}`
                      : "";

                    const isDark =
                      (fileIndex + rank) % 2 === 1;

                    const isSelected = selected === square;
                    const isLegal = legalTargets.includes(square);

                    const isLastMove =
                      reviewLastMove?.from === square ||
                      reviewLastMove?.to === square;

                    return (
                      <button
                        key={square}
                        onClick={() => handleSquareClick(square)}
                        disabled={
                          !isMyTurn ||
                          !!finished
                        }
                        className={[
                          "relative flex aspect-square items-center justify-center transition",
                          isDark ? "bg-[#779556]" : "bg-[#eeeed2]",
                          isSelected ? "bg-yellow-400" : "",
                          isLastMove && !isSelected
                            ? "after:absolute after:inset-0 after:bg-yellow-300/30"
                            : "",
                          "disabled:cursor-default",
                        ].join(" ")}
                      >
                        {piece && (
                          <span
                            className={[
                              "relative z-10 flex h-full w-full items-center justify-center text-[min(12vw,90px)] leading-none",
                              piece.color === "w"
                                ? "text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                                : "text-[#171717] drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)]",
                            ].join(" ")}
                          >
                            {pieceSymbols[pieceKey]}
                          </span>
                        )}

                        {/* PROMOTION */}

                        {isPromotionSquare &&
                          promotionChoice &&
                          myColor && (
                            <div
                              className={[
                                "absolute z-50 grid w-full grid-cols-1 overflow-hidden rounded-lg",
                                "bg-[#f0d9b5] shadow-[0_4px_18px_rgba(0,0,0,0.65)]",
                                myColor === "white"
                                  ? "top-0"
                                  : "bottom-0",
                              ].join(" ")}
                              onClick={(event) =>
                                event.stopPropagation()
                              }
                            >
                              {(
                                [
                                  { type: "q", name: "Hậu" },
                                  { type: "r", name: "Xe" },
                                  { type: "b", name: "Tượng" },
                                  { type: "n", name: "Mã" },
                                ] as const
                              ).map((item) => {
                                const color =
                                  myColor === "white" ? "w" : "b";

                                return (
                                  <div
                                    key={item.type}
                                    role="button"
                                    tabIndex={0}
                                    onClick={(event) => {
                                      event.stopPropagation();

                                      sendMove(
                                        promotionChoice.from,
                                        promotionChoice.to,
                                        item.type,
                                      );
                                    }}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        event.stopPropagation();

                                        sendMove(
                                          promotionChoice.from,
                                          promotionChoice.to,
                                          item.type,
                                        );
                                      }
                                    }}
                                    className="flex aspect-square w-full cursor-pointer items-center justify-center text-[min(10vw,58px)] leading-none text-[#171717] transition hover:bg-yellow-400"
                                    title={item.name}
                                  >
                                    {
                                      pieceSymbols[
                                        color + item.type.toUpperCase()
                                      ]
                                    }
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        {isLegal && !piece && (
                          <span className="absolute h-3 w-3 rounded-full bg-black/25 md:h-4 md:w-4" />
                        )}

                        {isLegal && piece && (
                          <span className="absolute inset-0 rounded-full border-4 border-black/25" />
                        )}
                      </button>
                    );
                  }),
                )}
              </div>

              {/* MY PROFILE */}
              <div className="mt-3 flex items-start justify-between rounded-xl bg-[#24242c] p-3">
                {/* THÔNG TIN CỦA BẠN */}
                <div className="min-w-0 text-left">
                  <div className="text-xs text-gray-400">
                    BẠN
                  </div>

                  <div className="font-semibold">
                    {myProfile?.displayName?.trim() ||
                      myProfile?.username ||
                      "Đang tải thông tin..."}
                  </div>

                  <div className="mt-1 text-sm text-yellow-400">
                    {myProfile
                      ? `${myProfile.elo.toLocaleString("vi-VN")} Elo`
                      : "--- Elo"}

                    {" · "}

                    {myColor === "white"
                      ? "Quân Trắng"
                      : "Quân Đen"}
                  </div>

                  {renderCapturedInfo(myColor === "white" ? "w" : "b")}
                </div>

                {/* ĐỒNG HỒ Ở GÓC TRÊN BÊN PHẢI */}
                <div className="ml-3 flex shrink-0 flex-col items-end gap-2">
                  <div
                    className={[
                      "rounded-lg px-3 py-1 font-mono text-xl font-bold tabular-nums",
                      !finished && clock?.activeColor === myColor
                        ? "bg-yellow-500 text-black"
                        : "bg-black/30 text-white",
                    ].join(" ")}
                  >
                    {formatClock(
                      myColor === "white"
                        ? displayedClock.whiteMs
                        : displayedClock.blackMs,
                    )}
                  </div>

                  <div className="text-3xl">
                    {myColor === "white" ? "♔" : "♚"}
                  </div>
                </div>
              </div>

            </div>

            {/* RIGHT PANEL */}

            <div className="flex min-h-[400px] flex-col gap-4">

              {/* AFTER FINISH */}

              {finished ? (
                <>
                  <div className="rounded-xl border border-yellow-500/30 bg-[#24242c] p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold tracking-wider text-yellow-400">
                        PHÂN TÍCH VÁN ĐẤU
                      </div>

                      <span className="rounded-full bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-400">
                        STOCKFISH
                      </span>
                    </div>

                    <div className="mt-3 text-lg font-bold text-white">
                      {finished.result === "draw"
                        ? "Ván cờ hòa"
                        : isWinner
                          ? "Bạn chiến thắng"
                          : "Bạn đã thua"}
                    </div>

                    <p className="mt-1 text-xs text-gray-400">
                      {getReasonText(finished.reason)}
                    </p>
                  </div>

                  {/* MY CPL */}

                  <div className="rounded-xl bg-[#24242c] p-4">
                    <div className="text-xs font-bold tracking-wider text-gray-400">
                      ĐÁNH GIÁ CỦA BẠN
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-300">
                        Trung bình CPL
                      </span>

                      <span className="text-xl font-bold text-yellow-400">
                        {formatCpl(myAverageCpl)}
                      </span>
                    </div>
                  </div>

                  {/* SELECTED MOVE ANALYSIS */}

                  <div className="rounded-xl border border-yellow-500/20 bg-[#24242c] p-4">
                    <div className="text-xs font-bold tracking-wider text-yellow-400">
                      PHÂN TÍCH NƯỚC ĐI ĐANG CHỌN
                    </div>

                    {selectedAnalysisMove ? (
                      <>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="text-lg font-bold">
                            {getMoveTitle(selectedAnalysisMove)}
                          </div>

                          <span
                            className={[
                              "text-sm font-bold",
                              getAnalysisColor(
                                selectedAnalysisMove.label,
                              ),
                            ].join(" ")}
                          >
                            {getAnalysisIcon(
                              selectedAnalysisMove.label,
                            )}{" "}
                            {selectedAnalysisMove.label}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-black/20 p-3">
                            <div className="text-[10px] text-gray-500">
                              MẤT LỢI THẾ
                            </div>

                            <div className="mt-1 font-bold text-white">
                              {formatCpl(
                                selectedAnalysisMove.centipawnLoss,
                              )}
                            </div>
                          </div>

                          <div className="rounded-lg bg-black/20 p-3">
                            <div className="text-[10px] text-gray-500">
                              ĐỘ SÂU
                            </div>

                            <div className="mt-1 font-bold text-white">
                              Depth {selectedAnalysisMove.depth}
                            </div>
                          </div>

                          <div className="rounded-lg bg-black/20 p-3">
                            <div className="text-[10px] text-gray-500">
                              ĐÁNH GIÁ STOCKFISH
                            </div>

                            <div className="mt-1 font-bold text-yellow-300">
                              {formatEvaluation(selectedAnalysisMove)}
                            </div>
                          </div>

                          <div className="rounded-lg bg-black/20 p-3">
                            <div className="text-[10px] text-gray-500">
                              NƯỚC TỐT NHẤT
                            </div>

                            <div className="mt-1 font-bold text-green-400">
                              {bestMoveSan}
                            </div>
                          </div>
                        </div>

                        {selectedAnalysisMove.pv.length > 0 && (
                          <div className="mt-3 rounded-lg bg-black/20 p-3">
                            <div className="text-[10px] text-gray-500">
                              BIẾN PHÂN TÍCH STOCKFISH (UCI)
                            </div>

                            <div className="mt-1 wrap-break-words text-xs leading-relaxed text-gray-300">
                              {selectedAnalysisMove.pv.join(" ")}
                            </div>
                          </div>
                        )}

                        <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
                          Điểm đánh giá Stockfish được tính theo góc nhìn
                          của bên tới lượt đi tại vị trí trước nước đi.
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-gray-400">
                        Chọn một nước đi trong danh sách bên dưới để xem
                        phân tích chi tiết.
                      </p>
                    )}
                  </div>

                  {/* ALL MOVES */}

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-[#24242c]">
                    <div className="flex items-center justify-between border-b border-white/10 p-4">
                      <div>
                        <div className="text-sm font-bold text-white">
                          DANH SÁCH NƯỚC ĐI
                        </div>

                        <div className="mt-1 text-xs text-gray-400">
                          {allAnalysisMoves.length} nước đã được phân tích
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedReviewPly(null)}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-white/10"
                      >
                        Vị trí cuối
                      </button>
                    </div>

                    <div className="border-b border-white/10 p-2">
                      <button
                        onClick={() => setSelectedReviewPly(0)}
                        className={[
                          "w-full rounded-lg px-3 py-2 text-left text-xs transition",
                          selectedReviewPly === 0
                            ? "bg-yellow-500/15 text-yellow-300"
                            : "text-gray-400 hover:bg-white/5",
                        ].join(" ")}
                      >
                        Xem vị trí bắt đầu
                      </button>
                    </div>

                    {allAnalysisMoves.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center p-5 text-center">
                        <div className="text-4xl text-gray-600">
                          ♞
                        </div>

                        <p className="mt-3 text-sm text-gray-400">
                          Chưa có dữ liệu phân tích nước đi.
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          Hãy kiểm tra dữ liệu Stockfish từ Backend.
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-[430px] flex-1 space-y-1 overflow-y-auto p-2">
                        {allAnalysisMoves.map((item) => {
                          const isSelected =
                            selectedReviewPly === item.ply;

                          return (
                            <button
                              key={item.ply}
                              onClick={() =>
                                setSelectedReviewPly(item.ply)
                              }
                              className={[
                                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left transition",
                                isSelected
                                  ? "border border-yellow-500/40 bg-yellow-500/15"
                                  : "border border-transparent bg-black/10 hover:bg-white/5",
                              ].join(" ")}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span
                                  className={[
                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                                    item.color === "w"
                                      ? "bg-gray-200 text-black"
                                      : "bg-gray-700 text-white",
                                  ].join(" ")}
                                >
                                  {item.color === "w" ? "T" : "Đ"}
                                </span>

                                <div className="min-w-0">
                                  <div className="font-semibold text-white">
                                    {getMoveTitle(item)}
                                  </div>

                                  <div className="mt-1 text-[11px] text-gray-500">
                                    Depth {item.depth}
                                    {" · "}
                                    {formatCpl(item.centipawnLoss)}
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <span
                                  className={[
                                    "text-sm font-black",
                                    getAnalysisColor(item.label),
                                  ].join(" ")}
                                >
                                  {getAnalysisIcon(item.label)}
                                </span>

                                <span
                                  className={[
                                    "text-xs font-bold",
                                    getAnalysisColor(item.label),
                                  ].join(" ")}
                                >
                                  {item.label}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="border-t border-white/10 p-3">
                      <p className="text-[10px] leading-relaxed text-gray-500">
                        Chọn một nước đi để xem lại bàn cờ tại thời điểm đó.
                        CPL là mức mất lợi thế tính bằng centipawn.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* STATUS */}

                  <div className="rounded-xl bg-[#24242c] p-4">
                    <div className="text-xs tracking-wider text-gray-400">
                      TRẠNG THÁI TRẬN ĐẤU
                    </div>

                    <div className="mt-2 text-lg font-bold text-yellow-400">
                      {opponentDisconnected
                        ? "Đối thủ mất kết nối"
                        : isMyTurn
                          ? "Đến lượt bạn"
                          : "Đang chờ đối thủ"}
                    </div>

                    <p className="mt-2 text-sm text-gray-400">
                      {message}
                    </p>
                  </div>

                  {/* TURN */}

                  <div className="rounded-xl bg-[#24242c] p-4">
                    <div className="text-xs tracking-wider text-gray-400">
                      LƯỢT ĐI HIỆN TẠI
                    </div>

                    <div className="mt-2 text-2xl font-bold">
                      {currentGame.turn() === "w"
                        ? "Trắng"
                        : "Đen"}
                    </div>

                    <p className="mt-1 text-xs text-gray-500">
                      {isMyTurn
                        ? "Bạn đang được đi."
                        : "Đối thủ đang được đi."}
                    </p>
                  </div>

                  {/* MATCH ID */}

                  <div className="rounded-xl bg-[#24242c] p-4">
                    <div className="text-xs tracking-wider text-gray-400">
                      MÃ TRẬN ĐẤU
                    </div>

                    <div className="mt-2 break-all text-xs text-gray-300">
                      {match.matchId}
                    </div>
                  </div>

                  {/* ĐỀ NGHỊ HÒA */}
                  {!opponentDisconnected && !drawOffer && (
                    <button
                      onClick={offerDraw}
                      disabled={drawOfferSent}
                      className="w-full rounded-xl border border-yellow-500/50 py-3 font-semibold text-yellow-400 transition hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {drawOfferSent
                        ? "ĐANG CHỜ ĐỐI THỦ..."
                        : "XIN HÒA"}
                    </button>
                  )}

                  {/* ĐỐI THỦ ĐỀ NGHỊ HÒA */}
                  {drawOffer && (
                    <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
                      <p className="text-sm font-semibold text-yellow-300">
                        Đối thủ đang đề nghị hòa.
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => respondToDraw(true)}
                          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white hover:bg-green-500"
                        >
                          Đồng ý
                        </button>

                        <button
                          onClick={() => respondToDraw(false)}
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-500"
                        >
                          Từ chối
                        </button>
                      </div>
                    </div>
                  )}

                  {/* HÒA THEO LUẬT CỜ VUA */}
                  {canClaimDraw && (
                    <button
                      onClick={claimDraw}
                      disabled={claimingDraw}
                      className="w-full rounded-xl border border-blue-500/50 py-3 font-semibold text-blue-400 transition hover:bg-blue-500/10 disabled:opacity-50"
                    >
                      {claimingDraw
                        ? "ĐANG KIỂM TRA..."
                        : "YÊU CẦU HÒA THEO LUẬT"}
                    </button>
                  )}

                  {/* RESIGN */}

                  {(
                    <button
                      onClick={resign}
                      className="w-full rounded-xl border border-red-500/50 py-3 font-semibold text-red-400 transition hover:bg-red-500/10"
                    >
                      ĐẦU HÀNG
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* XÁC NHẬN ĐẦU HÀNG */}
      {showResignConfirm && !finished && (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#1c1c25] p-6 text-center shadow-2xl">
            <div className="text-5xl">🏳️</div>

            <h3 className="mt-4 text-xl font-bold text-white">
              Xác nhận đầu hàng?
            </h3>

            <p className="mt-2 text-sm text-gray-400">
              Bạn sẽ thua ván đấu nếu xác nhận đầu hàng.
              Bạn có chắc chắn muốn tiếp tục?
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowResignConfirm(false)}
                className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-white/10"
              >
                Hủy
              </button>

              <button
                onClick={confirmResign}
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500"
              >
                Đầu hàng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================== */}
      {/* RESULT OVERLAY */}
      {/* =================================================== */}

      {finished && showResultOverlay && (
        <div className="fixed inset-0 z-200 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">

          {/* CONFETTI */}

          {isWinner && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {confettiPieces.map((piece) => (
                <span
                  key={piece}
                  className="confetti-piece"
                  style={{
                    left: `${(piece * 37) % 100}%`,
                    backgroundColor:
                      confettiColors[
                        piece % confettiColors.length
                      ],
                    animationDelay: `${
                      (piece % 8) * 0.12
                    }s`,
                    animationDuration: `${
                      2.8 + (piece % 5) * 0.3
                    }s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* RESULT CARD */}

          <div className="relative z-10 my-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-yellow-500/40 bg-[#1c1c25] p-6 text-center shadow-[0_0_60px_rgba(234,179,8,0.2)] md:p-7">

            {/* CLOSE X */}
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowResultOverlay(false);
              }}
              aria-label="Đóng bảng kết quả"
              title="Đóng bảng kết quả"
              className="absolute right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-xl text-gray-300 transition hover:border-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400"
            >
              ×
            </button>


            {/* RESULT TITLE */}

            {finished.result === "draw" ? (
              <>
                <div className="mb-4 text-7xl">🤝</div>

                <h2 className="text-3xl font-black text-gray-200">
                  VÁN CỜ HÒA!
                </h2>

                <p className="mt-3 text-gray-400">
                  Trận đấu đã kết thúc với kết quả hòa.
                </p>
              </>
            ) : isWinner ? (
              <>
                <div className="mb-4 animate-bounce text-7xl">
                  🏆
                </div>

                <div className="text-sm font-bold tracking-[0.3em] text-yellow-400">
                  CHESSVERSE
                </div>

                <h2 className="mt-3 text-3xl font-black text-yellow-400 md:text-4xl">
                  CHÚC MỪNG BẠN ĐÃ CHIẾN THẮNG!
                </h2>

                <p className="mt-4 text-sm text-gray-300">
                  {finished.reason === "checkmate"
                    ? "Bạn đã chiếu hết đối thủ."
                    : finished.reason === "resign"
                      ? "Đối thủ đã đầu hàng."
                      : finished.reason === "disconnect"
                        ? "Đối thủ đã rời trận hoặc mất kết nối."
                        : "Bạn đã giành chiến thắng."}
                </p>
              </>
            ) : (
              <>
                <div className="mb-4 text-7xl">♟️</div>

                <h2 className="text-3xl font-black text-red-400">
                  BẠN ĐÃ THUA!
                </h2>

                <p className="mt-3 text-gray-400">
                  {finished.reason === "resign"
                    ? "Bạn đã đầu hàng."
                    : finished.reason === "disconnect"
                      ? "Bạn đã mất kết nối hoặc rời trận."
                      : "Đối thủ đã giành chiến thắng."}
                </p>
              </>
            )}

            {/* ONLY MY ELO */}

            {mode === "ranked" && myEloChange && (
              <div className="mt-6 rounded-2xl border border-yellow-500/30 bg-[#272630] p-4 text-left">
                <div className="mb-4 text-center text-xs font-bold tracking-wider text-yellow-400">
                  ELO CỦA BẠN
                </div>

                <div className="grid grid-cols-3 items-center gap-2 text-center">
                  <div>
                    <div className="text-xs text-gray-400">
                      ELO CŨ
                    </div>

                    <div className="mt-1 text-xl font-bold">
                      {myEloChange.before}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400">
                      THAY ĐỔI
                    </div>

                    <div
                      className={[
                        "mt-1 text-2xl font-black",
                        myEloChange.change > 0
                          ? "text-green-400"
                          : myEloChange.change < 0
                            ? "text-red-400"
                            : "text-gray-300",
                      ].join(" ")}
                    >
                      {myEloChange.change > 0 ? "+" : ""}
                      {myEloChange.change}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400">
                      ELO MỚI
                    </div>

                    <div className="mt-1 text-xl font-bold text-yellow-400">
                      {myEloChange.after}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mode === "ranked" && !myEloChange && (
              <div className="mt-6 rounded-xl bg-[#272630] p-4">
                <p className="text-sm text-gray-300">
                  Chưa nhận được dữ liệu thay đổi Elo từ máy chủ.
                </p>
              </div>
            )}

            {mode === "casual" && (
              <div className="mt-6 rounded-xl bg-[#272630] p-4">
                <div className="text-sm font-semibold text-gray-200">
                  ĐẤU THƯỜNG
                </div>

                <p className="mt-2 text-xs text-gray-400">
                  Trận đấu này không làm thay đổi điểm Elo của bạn.
                </p>
              </div>
            )}

            {/* CLOSE MATCH */}

            <button
              onClick={leaveMatch}
              className="mt-6 w-full rounded-xl bg-yellow-500 px-6 py-3 font-bold text-black transition hover:bg-yellow-400"
            >
              ĐÓNG TRẬN
            </button>

            <p className="mt-3 text-xs text-gray-500">
              Nhấn × để xem lại bàn cờ và phân tích các nước đi.
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        .confetti-piece {
          position: absolute;
          top: -20px;
          width: 9px;
          height: 15px;
          border-radius: 2px;
          opacity: 0;
          animation-name: chessverse-confetti;
          animation-timing-function: ease-in;
          animation-fill-mode: forwards;
        }

        @keyframes chessverse-confetti {
          0% {
            transform: translateY(-5vh) rotate(0deg);
            opacity: 1;
          }

          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}