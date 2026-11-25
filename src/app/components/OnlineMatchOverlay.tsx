"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chess, type Square } from "chess.js";
import { io, type Socket } from "socket.io-client";

import {
  getCapturedPiece,
  getMaterialValue,
  getReviewCapturedPieces,
  getReasonText,
  formatClock,
  getMoveTitle,
  getReviewFen,
  getBestMoveSan,
} from "./online/helpers";
import { PIECE_NAMES, BACKEND_URL, INITIAL_FEN, pieceSymbols } from "./online/constants";
import type {
  OnlineMode,
  CapturedPiece,
  ClockSnapshot,
  DrawOfferedData,
  MatchFoundData,
  MoveMadeData,
  FinishedData,
  ResumeData,
} from "./online/types";
import AnalysisPanel from "./online/AnalysisPanel";
import ConnectionBanner from "./online/ConnectionBanner";
import ResignConfirmDialog from "./online/ResignConfirmDialog";
import ResultOverlay from "./online/ResultOverlay";
import WaitingScreen from "./online/WaitingScreen";
import { playSound } from "../lib/sound";
import { BOARD_THEMES, fetchWallet, pieceFx, pieceSkinPath, type FxSprite, type PieceFx } from "../lib/shop";
import { getTier } from "../lib/rank";
import { getCover } from "../lib/appearance";
import { useBoardView } from "../lib/boardView";
import PlayerAvatar from "./PlayerAvatar";
import Flag from "./Flag";
import TierBadge from "./TierBadge";
import SettingsMenu from "./SettingsMenu";
import "./online/match.css";

// Biểu cảm nhanh (mã gửi qua máy chủ → hình hiển thị)
const EMOTES = [
  { id: "smile", icon: "😀", label: "Vui" },
  { id: "like", icon: "👍", label: "Hay" },
  { id: "clap", icon: "👏", label: "Vỗ tay" },
  { id: "target", icon: "🎯", label: "Chuẩn xác" },
] as const;

// Hiệu ứng chuyển động: chạy lần lượt các khung hình trong một ảnh dải ngang
function Sprite({ s, kind, loop = false }: { s: FxSprite; kind: string; loop?: boolean }) {
  return (
    <span
      className={`mx-sprite ${kind}${loop ? " loop" : ""}`}
      style={
        {
          backgroundImage: `url(${s.src})`,
          aspectRatio: String(s.ratio),
          "--n": s.frames,
        } as CSSProperties
      }
    />
  );
}

const EMOTE_ICON: Record<string, string> = Object.fromEntries(EMOTES.map((e) => [e.id, e.icon]));

interface Props {
  mode: OnlineMode;
  onClose: () => void;
}


export default function OnlineMatchOverlay({
  mode,
  onClose,
}: Props) {
  const [socket, setSocket] = useState<Socket | null>(null);
  // Bàn cờ đang dùng (mua ở Cửa hàng)
  const [boardTheme, setBoardTheme] = useState("classic");
  const board = BOARD_THEMES[boardTheme] ?? BOARD_THEMES.classic;
  // Bộ quân cờ đang dùng (mua ở Cửa hàng); undefined = quân mặc định
  const [pieceSkin, setPieceSkin] = useState<string | undefined>(undefined);
  // Hiệu ứng đặc biệt đi kèm bộ quân (vd. Hắc Ám); undefined = không có
  const [fx, setFx] = useState<PieceFx | undefined>(undefined);
  // Kiểu bàn cờ 2D / 3D (lưu trên trình duyệt, dùng chung với trang Xem lại)
  const [boardView, setBoardView] = useBoardView();
  // Hiệu ứng vừa xảy ra trên bàn: đi quân / ăn quân
  const [fxEvent, setFxEvent] = useState<{ to: string; kind: "move" | "capture" | "promote"; id: number } | null>(null);

  useEffect(() => {
    fetchWallet().then((w) => {
      if (w?.boardTheme) setBoardTheme(w.boardTheme);
      setPieceSkin(pieceSkinPath(w?.pieceSet));
      setFx(pieceFx(w?.pieceSet));
    });
  }, []);

  // Vẽ một quân: ảnh của bộ skin nếu có, không thì ký tự cờ mặc định.
  function renderPiece(key: string, size: "board" | "small" = "board") {
    if (!pieceSkin) return pieceSymbols[key];

    return (
      <img
        src={`${pieceSkin}/${key}.webp`}
        alt=""
        draggable={false}
        className={
          size === "board"
            ? "pointer-events-none h-[92%] w-[92%] object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.55)]"
            : "inline-block h-[1.15em] w-[1.15em] object-contain align-middle"
        }
      />
    );
  }
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

  // Danh sách nước đi (SAN) để hiện bảng Lịch sử nước đi
  const [sanList, setSanList] = useState<string[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);

  // Tự cuộn xuống nước mới nhất
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sanList.length]);

  // Bong bóng biểu cảm / tin nhắn trên thẻ người chơi
  const [bubbles, setBubbles] = useState<{ me?: { id: number; text: string }; opp?: { id: number; text: string } }>({});
  const bubbleTimers = useRef<{ me?: ReturnType<typeof setTimeout>; opp?: ReturnType<typeof setTimeout> }>({});
  const [chatText, setChatText] = useState("");
  const lastChatAt = useRef(0);

  function showBubble(side: "me" | "opp", text: string) {
    const id = Date.now();

    setBubbles((b) => ({ ...b, [side]: { id, text } }));
    clearTimeout(bubbleTimers.current[side]);
    bubbleTimers.current[side] = setTimeout(
      () => setBubbles((b) => (b[side]?.id === id ? { ...b, [side]: undefined } : b)),
      4000,
    );
  }

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
            setSanList([]);
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
            playSound("found");
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

        // Âm thanh nước đi (tắt/bật trong Cài đặt → Âm thanh)
        playSound(
          /[+#]/.test(data.move.san) ? "check" : captured ? "capture" : "move",
        );

        fenRef.current = data.fen;
        setFen(data.fen);
        setSanList((list) => [...list, data.move.san]);

        setLastMove({
          from: data.move.from,
          to: data.move.to,
        });
        // Hiệu ứng tại ô đến: chỉ khi ăn quân hoặc phong cấp (đi thường thì không)
        if (captured || data.move.san.includes("=")) {
          setFxEvent({
            to: data.move.to,
            kind: data.move.san.includes("=") ? "promote" : "capture",
            id: Date.now(),
          });
        }

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
          playSound("alert");
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
            playSound("end");
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

        // Biểu cảm / tin nhắn của đối thủ
        newSocket.on("match:chat", (data: { kind: string; text: string }) => {
          showBubble("opp", data.kind === "emote" ? EMOTE_ICON[data.text] ?? "" : data.text);
        });

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
          const sans: string[] = [];

          for (const item of data.moves) {
            try {
              const g = new Chess(item.beforeFen);
              const mv = g.move({ from: item.from, to: item.to, promotion: "q" });
              sans.push(mv.san);
            } catch {
              sans.push(`${item.from}-${item.to}`);
            }

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
          setSanList(sans);
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

      
  // =========================================================
  // GIAO DIỆN
  // =========================================================

  // Đang tìm trận: màn hình chờ toàn màn hình.
  if (!match && !reconnecting && !connectionLost) {
    return (
      <WaitingScreen
        mode={mode}
        status={status}
        message={message}
        socket={socket}
        onCancel={leaveMatch}
      />
    );
  }

  // ---------- Dữ liệu cho giao diện trận đấu ----------

  const meChar: "w" | "b" = myColor === "black" ? "b" : "w";
  const oppChar: "w" | "b" = meChar === "w" ? "b" : "w";

  const myMs = myColor === "black" ? displayedClock.blackMs : displayedClock.whiteMs;
  const oppMs = myColor === "black" ? displayedClock.whiteMs : displayedClock.blackMs;

  const myClockOn = !finished && !!clock && clock.activeColor === myColor;
  const oppClockOn = !finished && !!clock && clock.activeColor !== myColor;

  const modeTitle = mode === "ranked" ? "Đấu Hạng" : "Đấu Thường";
  const myTier = myProfile ? getTier(myProfile.elo) : null;

  // Cặp nước đi theo lượt: [số lượt, nước Trắng, nước Đen]
  const movePairs: { no: number; w?: string; b?: string }[] = [];

  sanList.forEach((san, i) => {
    const no = Math.floor(i / 2) + 1;

    if (i % 2 === 0) movePairs.push({ no, w: san });
    else movePairs[movePairs.length - 1].b = san;
  });

  // Nước đang xem (khi xem lại sau trận) hoặc nước mới nhất
  const activePly = finished && selectedReviewPly !== null ? selectedReviewPly : sanList.length;

  function sendEmote(id: string) {
    if (!socket || Date.now() - lastChatAt.current < 1300) return;

    lastChatAt.current = Date.now();
    socket.emit("match:chat", { kind: "emote", text: id });
    showBubble("me", EMOTE_ICON[id] ?? "");
  }

  function sendChat() {
    const text = chatText.replace(/\s+/g, " ").trim().slice(0, 120);

    if (!text || !socket || Date.now() - lastChatAt.current < 1300) return;

    lastChatAt.current = Date.now();
    socket.emit("match:chat", { kind: "text", text });
    showBubble("me", text);
    setChatText("");
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => null);
    } else {
      document.documentElement.requestFullscreen?.().catch(() => null);
    }
  }

  // Quân mà một bên đã ăn được + lợi thế vật chất của bên đó
  function renderTaken(color: "w" | "b") {
    const taken = color === "w" ? blackLostPieces : whiteLostPieces;
    const advantage = color === "w" ? whiteMaterialAdvantage : blackMaterialAdvantage;

    // Gộp theo loại quân: các quân cùng loại xếp chồng lên nhau
    const groups = (["p", "n", "b", "r", "q"] as const)
      .map((type) => ({ type, list: taken.filter((piece) => piece.type === type) }))
      .filter((g) => g.list.length > 0);

    return (
      <div className="mx-taken">
        {groups.length === 0 ? (
          <span className="mx-taken-empty">Chưa ăn quân</span>
        ) : (
          groups.map((g) => (
            <span
              key={g.type}
              className="mx-taken-group"
              title={`${PIECE_NAMES[g.type]} × ${g.list.length}`}
            >
              {g.list.map((piece, index) => (
                <span key={index} className="mx-taken-piece">
                  {renderPiece(`${piece.color}${piece.type.toUpperCase()}`, "small")}
                </span>
              ))}
            </span>
          ))
        )}
        {advantage > 0 && <b className="mx-adv">+{advantage}</b>}
      </div>
    );
  }

  function renderPlayer(side: "me" | "opp") {
    const profile = side === "me" ? myProfile : opponentProfile;
    const char = side === "me" ? meChar : oppChar;
    const ms = side === "me" ? myMs : oppMs;
    const on = side === "me" ? myClockOn : oppClockOn;
    const name = profile?.displayName?.trim() || profile?.username || "Đang tải...";
    const tier = profile ? (side === "me" && myTier ? myTier : getTier(profile.elo)) : null;
    const bubble = bubbles[side];

    return (
      <section
        className={`mx-player ${side}`}
        style={{ backgroundImage: `url(${getCover(profile?.profileCover).src})` }}
      >
        <div className="mx-player-top">
          <PlayerAvatar avatar={profile?.avatarId} frame={profile?.avatarFrame} name={name} className="mx-pa" />

          <div className="mx-player-info">
            <strong title={name}>
              <Flag code={profile?.country} />{profile?.country ? " " : null}
              {name}
              {side === "me" && <em> (Bạn)</em>}
            </strong>
            <span className={`mx-side ${char}`}>{char === "w" ? "Quân Trắng" : "Quân Đen"}</span>

            {tier && profile && (
              <div className="mx-tier">
                <TierBadge index={tier.index} text={false} className="mx-tb" />
                <span>
                  {tier.name}
                  <small>{profile.elo.toLocaleString("vi-VN")} Elo</small>
                </span>
              </div>
            )}
          </div>

          {bubble && (
            <div key={bubble.id} className={`mx-bubble${bubble.text.length <= 2 ? " emo" : ""}`}>
              {bubble.text}
            </div>
          )}
        </div>

        <div className={`mx-clock${on ? " on" : ""}${on && ms < 30000 ? " low" : ""}`}>
          {/* Đồng hồ kim: kim giây quay khi đang tới lượt */}
          <span className="mx-dial" aria-hidden="true">
            <i className="mx-hand min" style={{ transform: `rotate(${Math.floor(ms / 60000) * 6}deg)` }} />
            <i className="mx-hand sec" style={{ transform: `rotate(${(Math.ceil(ms / 1000) % 60) * 6}deg)` }} />
          </span>
          <span className="mx-time">{formatClock(ms)}</span>
        </div>

        {renderTaken(char)}
      </section>
    );
  }

  // Ô của Vua đang bị chiếu (để đặt hiệu ứng Chiếu tướng / Chiếu hết)
  const isMate = currentGame.isCheckmate();

  // Ô Vua của người thắng (hiệu ứng Chiến thắng khi ván kết thúc)
  const winnerColor =
    finished?.winner && match ? (finished.winner === match.players.white ? "w" : "b") : null;
  const victorySquare: string | null = winnerColor
    ? (currentGame
        .board()
        .flat()
        .find((cell) => cell?.type === "k" && cell.color === winnerColor)?.square ?? null)
    : null;
  const checkSquare: string | null = currentGame.inCheck()
    ? (currentGame
        .board()
        .flat()
        .find((cell) => cell?.type === "k" && cell.color === currentGame.turn())?.square ?? null)
    : null;

  return (
    <div className={`mx-root${fx ? " fx" : ""}`}>
      {/* ---------- THANH TRÊN ---------- */}
      <header className="mx-top">
        <div className="mx-brand">
          <img src="/images/academy/logo.png" alt="" />
          <span>
            Chess
            <br />
            Verse
          </span>
        </div>

        <div className="mx-title">
          <div className="mx-title-main">
            <span>{modeTitle}</span>
            <i>◆</i>
            <span>Solo 1 vs 1</span>
          </div>
          <div className="mx-title-sub">
            {mode === "ranked" ? "Kết quả được tính vào Elo" : "Ván giao hữu · Không ảnh hưởng Elo"}
          </div>
        </div>

        <div className="mx-top-actions">
          <SettingsMenu />

          <button
            className="mx-icon-btn"
            title="Đầu hàng"
            aria-label="Đầu hàng"
            disabled={!match || !!finished}
            onClick={resign}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
            </svg>
          </button>

          <button
            className="mx-icon-btn mx-view-btn"
            title="Đổi kiểu bàn cờ 2D / 3D"
            aria-label="Đổi kiểu bàn cờ 2D / 3D"
            onClick={() => setBoardView(boardView === "3d" ? "2d" : "3d")}
          >
            {boardView === "3d" ? "2D" : "3D"}
          </button>

          <button className="mx-icon-btn" title="Toàn màn hình" aria-label="Toàn màn hình" onClick={toggleFullscreen}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>

          <button className="mx-icon-btn" title={finished ? "Rời trận" : "Đóng"} aria-label="Rời trận" onClick={leaveMatch}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      {/* TRẠNG THÁI KẾT NỐI */}
      {(reconnecting || connectionLost) && (
        <div className="mx-conn">
          <ConnectionBanner message={message} connectionLost={connectionLost} onClose={onClose} />
        </div>
      )}

      {!match && (
        <div className="mx-wait">
          <h3>{status}</h3>
          <p>{message}</p>
        </div>
      )}

      {match && (
        <div className="mx-body">
          {/* ---------- CỘT TRÁI: BẠN ---------- */}
          <aside className="mx-col left">
            {renderPlayer("me")}

            <section className="mx-panel mx-history">
              <header>
                <span>Lịch sử nước đi</span>
                <b>{sanList.length > 0 ? `${Math.ceil(sanList.length / 2)} lượt` : ""}</b>
              </header>

              <div className="mx-moves" ref={historyRef}>
                {movePairs.length === 0 && <p className="mx-muted">Chưa có nước đi nào.</p>}

                {movePairs.map((pair) => {
                  const wPly = pair.no * 2 - 1;
                  const bPly = pair.no * 2;

                  return (
                    <div className="mx-move" key={pair.no}>
                      <span className="mx-move-no">{pair.no}.</span>
                      <button
                        className={activePly === wPly ? "on" : ""}
                        disabled={!finished}
                        onClick={() => setSelectedReviewPly(wPly)}
                      >
                        {pair.w}
                      </button>
                      {pair.b ? (
                        <button
                          className={activePly === bPly ? "on" : ""}
                          disabled={!finished}
                          onClick={() => setSelectedReviewPly(bPly)}
                        >
                          {pair.b}
                        </button>
                      ) : (
                        <span className="mx-move-wait">…</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="mx-chat">
              <div className="mx-emotes">
                {EMOTES.map((e) => (
                  <button key={e.id} title={e.label} aria-label={e.label} onClick={() => sendEmote(e.id)}>
                    {e.icon}
                  </button>
                ))}
              </div>

              <form
                className="mx-input"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendChat();
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="mx-input-icon">
                  <path d="M4 5h16v11H9l-5 4z" />
                </svg>
                <input
                  value={chatText}
                  maxLength={120}
                  placeholder="Nhập tin nhắn..."
                  onChange={(event) => setChatText(event.target.value)}
                />
                <button type="submit" aria-label="Gửi" disabled={!chatText.trim()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 11l18-8-8 18-2-8z" />
                  </svg>
                </button>
              </form>
            </div>
          </aside>

          {/* ---------- GIỮA: BÀN CỜ ---------- */}
          <main className="mx-center">
            <div className={`mx-turn${isMyTurn && !finished ? " mine" : ""}`}>
              {finished
                ? selectedReviewPly !== null
                  ? selectedReviewPly === 0
                    ? "Vị trí bắt đầu"
                    : selectedAnalysisMove
                      ? `Đang xem: ${getMoveTitle(selectedAnalysisMove)}`
                      : "Đang xem lại ván cờ"
                  : "Ván đấu đã kết thúc"
                : opponentDisconnected
                  ? "Đối thủ mất kết nối"
                  : isMyTurn
                    ? "Đến lượt bạn"
                    : "Đang chờ đối thủ..."}

              {finished && selectedReviewPly !== null && (
                <button onClick={() => setSelectedReviewPly(null)}>Về cuối ván</button>
              )}
            </div>

            <div className={`mx-board-frame${boardView === "3d" ? " v3d" : ""}`}>
              {/* Tọa độ nằm ngoài mép bàn */}
              <div className="mx-ranks" aria-hidden="true">
                {ranks.map((rank) => (
                  <span key={rank}>{rank}</span>
                ))}
              </div>
              <div className="mx-files" aria-hidden="true">
                {files.map((file) => (
                  <span key={file}>{file}</span>
                ))}
              </div>

              <div className="mx-board" data-fen={displayFen}>
                {ranks.map((rank) =>
                  files.map((file, fileIndex) => {
                    const square = `${file}${rank}` as Square;
                    const piece = currentGame.get(square);
                    const isPromotionSquare = promotionChoice?.to === square;
                    const pieceKey = piece ? `${piece.color}${piece.type.toUpperCase()}` : "";
                    const isDark = (fileIndex + rank) % 2 === 1;
                    const isSelected = selected === square;
                    const isLegal = legalTargets.includes(square);
                    const isLastMove = reviewLastMove?.from === square || reviewLastMove?.to === square;

                    return (
                      <button
                        key={square}
                        onClick={() => handleSquareClick(square)}
                        disabled={!isMyTurn || !!finished}
                        style={{
                          backgroundColor: isDark ? board.dark : board.light,
                          ...(board.texture
                            ? {
                                backgroundImage: `url(${isDark ? board.texture.dark : board.texture.light})`,
                                backgroundSize: "100% 100%",
                              }
                            : {}),
                        }}
                        className={[
                          "mx-sq",
                          isSelected ? "sel" : "",
                          isLastMove ? (reviewLastMove?.to === square ? "last to" : "last from") : "",
                          isLegal ? (piece ? "target capture" : "target") : "",
                        ].join(" ")}
                      >
                        {piece && (
                          <span className={`mx-piece ${piece.color}${pieceSkin ? " skin" : ""}`}>
                            {renderPiece(pieceKey)}
                          </span>
                        )}

                        {isPromotionSquare && promotionChoice && myColor && (
                          <div
                            className={`mx-promo ${myColor === "white" ? "top" : "bottom"}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {(
                              [
                                { type: "q", name: "Hậu" },
                                { type: "r", name: "Xe" },
                                { type: "b", name: "Tượng" },
                                { type: "n", name: "Mã" },
                              ] as const
                            ).map((item) => {
                              const color = myColor === "white" ? "w" : "b";

                              return (
                                <div
                                  key={item.type}
                                  role="button"
                                  tabIndex={0}
                                  title={item.name}
                                  className={`mx-promo-item ${color}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    sendMove(promotionChoice.from, promotionChoice.to, item.type);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      sendMove(promotionChoice.from, promotionChoice.to, item.type);
                                    }
                                  }}
                                >
                                  {renderPiece(color + item.type.toUpperCase())}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isLegal && !piece && (fx ? <img className="mx-fx legal" src={fx.legal} alt="" /> : <span className="mx-dot" />)}
                        {isLegal && piece && <span className="mx-ring" />}

                        {/* Hiệu ứng chuyển động của bộ quân (chạy trong ô) */}
                        {fx && isSelected && (
                          <>
                            <img className="mx-fx sel" src={fx.selectTile} alt="" />
                            <Sprite s={fx.sprites.select} kind="select" loop />
                          </>
                        )}
                        {fx && fxEvent?.to === square && selectedReviewPly === null && (
                          <Sprite key={fxEvent.id} s={fx.sprites[fxEvent.kind]} kind={fxEvent.kind} />
                        )}
                        {fx && checkSquare === square && !isMate && <Sprite s={fx.sprites.check} kind="check" loop />}
                        {fx && victorySquare === square && <Sprite s={fx.sprites.victory} kind="victory" />}
                        {isLastMove && reviewLastMove?.from === square && !piece && !isLegal && (
                          <span className="mx-trail" />
                        )}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          </main>

          {/* ---------- CỘT PHẢI: ĐỐI THỦ + HÀNH ĐỘNG ---------- */}
          <aside className="mx-col right">
            {renderPlayer("opp")}

            {finished ? (
              <>
                <div className="mx-actions">
                  <button className="mx-act gold" onClick={() => setShowResultOverlay(true)}>
                    <span>🏆</span> Xem kết quả
                  </button>
                  <button className="mx-act" onClick={leaveMatch}>
                    <span>↩</span> Rời trận
                  </button>
                </div>

                <div className="mx-analysis">
                  <AnalysisPanel
                    finished={finished}
                    isWinner={isWinner}
                    myAverageCpl={myAverageCpl}
                    selectedAnalysisMove={selectedAnalysisMove}
                    bestMoveSan={bestMoveSan}
                    allAnalysisMoves={allAnalysisMoves}
                    selectedReviewPly={selectedReviewPly}
                    onSelectPly={setSelectedReviewPly}
                  />
                </div>
              </>
            ) : (
              <>
                {drawOffer && (
                  <div className="mx-panel mx-offer">
                    <p>Đối thủ đề nghị hòa.</p>
                    <div>
                      <button className="yes" onClick={() => respondToDraw(true)}>
                        Đồng ý
                      </button>
                      <button className="no" onClick={() => respondToDraw(false)}>
                        Từ chối
                      </button>
                    </div>
                  </div>
                )}

                <div className="mx-actions">
                  <button className="mx-act danger" onClick={resign}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
                    </svg>
                    Đầu hàng
                  </button>

                  {!opponentDisconnected && !drawOffer && (
                    <button className="mx-act" onClick={offerDraw} disabled={drawOfferSent}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2 12l4-4 4 2 3-2 4 1 5 3M6 8l-3 7M18 9l3 6M9 14l2 2M12 13l2 2M14 12l2 2" />
                      </svg>
                      {drawOfferSent ? "Đang chờ đối thủ..." : "Xin hòa"}
                    </button>
                  )}

                  {canClaimDraw && (
                    <button className="mx-act blue" onClick={claimDraw} disabled={claimingDraw}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 3v18M5 7h14M7 7l-3 7h6zM17 7l-3 7h6z" />
                      </svg>
                      {claimingDraw ? "Đang kiểm tra..." : "Hòa theo luật"}
                    </button>
                  )}

                  <button className="mx-act" disabled title="Có sau khi ván đấu kết thúc">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 20V12M10 20V6M15 20v-9M20 20V4" />
                    </svg>
                    Phân tích
                    <small>sau trận</small>
                  </button>
                </div>

                <p className="mx-message">{message}</p>
              </>
            )}
          </aside>
        </div>
      )}

      {/* XÁC NHẬN ĐẦU HÀNG */}
      {showResignConfirm && !finished && (
        <ResignConfirmDialog onCancel={() => setShowResignConfirm(false)} onConfirm={confirmResign} />
      )}

      {/* KẾT QUẢ */}
      {finished && showResultOverlay && (
        <ResultOverlay
          finished={finished}
          isWinner={isWinner}
          mode={mode}
          myEloChange={myEloChange}
          onDismiss={() => setShowResultOverlay(false)}
          onLeave={leaveMatch}
        />
      )}
    </div>
  );
}
