"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

interface Props {
  mode: OnlineMode;
  onClose: () => void;
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
          <ConnectionBanner
            message={message}
            connectionLost={connectionLost}
            onClose={onClose}
          />
        )}

        {/* WAITING */}

        {!match && (
          <WaitingScreen status={status} message={message} />
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
        <ResignConfirmDialog
          onCancel={() => setShowResignConfirm(false)}
          onConfirm={confirmResign}
        />
      )}

      {/* =================================================== */}
      {/* RESULT OVERLAY */}
      {/* =================================================== */}

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
