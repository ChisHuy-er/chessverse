
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Chess, type Square } from "chess.js";
import Link from "next/link";
import { useRouter } from "next/navigation";

const files = "abcdefgh";

const pieceSymbols: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

const difficultySettings = {
  easy: { label: "Dễ", moveTime: 300 },
  medium: { label: "Trung bình", moveTime: 900 },
  hard: { label: "Khó", moveTime: 1800 },
};

type Difficulty = keyof typeof difficultySettings;
type ChessColor = "w" | "b";
type ClockSide = "white" | "black";

const timeControls = {
  "1+0": { label: "Bullet · 1 phút", initialMs: 60_000, incrementMs: 0 },
  "3+0": { label: "Blitz · 3 phút", initialMs: 180_000, incrementMs: 0 },
  "5+0": { label: "Blitz · 5 phút", initialMs: 300_000, incrementMs: 0 },
  "10+0": { label: "Rapid · 10 phút", initialMs: 600_000, incrementMs: 0 },
  "15+10": {
    label: "Rapid · 15 phút + 10 giây",
    initialMs: 900_000,
    incrementMs: 10_000,
  },
};

type TimeControl = keyof typeof timeControls;
type GameResult = "win" | "loss" | "draw";
type ResultReason = "timeout" | "resign" | "agreement";
type PlayerProfile = {
  username?: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string | null;
  elo?: number;
};

function createGameView(game: Chess) {
  return {
    board: game.board(),
    history: game.history(),
    verboseHistory: game.history({ verbose: true }),
    turn: game.turn(),
    isGameOver: game.isGameOver(),
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isThreefoldRepetition: game.isThreefoldRepetition(),
    isDrawByFiftyMoves: game.isDrawByFiftyMoves(),
    isInsufficientMaterial: game.isInsufficientMaterial(),
    isDraw: game.isDraw(),
  };
}

function formatClock(milliseconds: number) {
  const safeMs = Math.max(0, milliseconds);

  if (safeMs < 10_000) {
    const seconds = Math.floor(safeMs / 1000);
    const tenths = Math.floor((safeMs % 1000) / 100);
    return `${seconds}.${tenths}`;
  }

  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function colorToClock(color: ChessColor): ClockSide {
  return color === "w" ? "white" : "black";
}

function colorName(color: ChessColor) {
  return color === "w" ? "Trắng" : "Đen";
}

function getMaterialBalance(game: Chess) {
  const values: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  };

  let score = 0;

  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;

      const value = values[piece.type] ?? 0;
      score += piece.color === "w" ? value : -value;
    }
  }

  return score;
}

export default function PlayPage() {
  const router = useRouter();
  const gameRef = useRef(new Chess());
  const [view, setView] = useState(() => createGameView(new Chess()));
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);

  // Màu quân của người chơi và AI.
  const [playerColor, setPlayerColor] = useState<ChessColor>("w");
  const playerColorRef = useRef<ChessColor>("w");
  const aiColor: ChessColor = playerColor === "w" ? "b" : "w";

  // Người cầm Đen nhìn bàn cờ từ phía Đen.
  const flipped = playerColor === "b";

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [engineReady, setEngineReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState("");


  const [timeControl, setTimeControl] = useState<TimeControl>("10+0");
  const [clocks, setClocks] = useState({
    white: timeControls["10+0"].initialMs,
    black: timeControls["10+0"].initialMs,
  });

  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [playerProfile, setPlayerProfile] =
  useState<PlayerProfile | null>(null);
  const [resultReason, setResultReason] = useState<ResultReason | null>(null);

  const [drawOfferPending, setDrawOfferPending] = useState(false);
  const [drawMessage, setDrawMessage] = useState("");
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const pendingFenRef = useRef<string | null>(null);
  const difficultyRef = useRef<Difficulty>("medium");
  const timeControlRef = useRef<TimeControl>("10+0");
  const ignoreBestMoveRef = useRef(false);
  const isFinishedRef = useRef(false);

  const engineAskRef = useRef<(position: string) => void>(() => {});

  const updatePosition = useCallback((nextGame: Chess) => {
    setView(createGameView(nextGame));
  }, []);

  const finishGame = useCallback(
    (result: GameResult, reason: ResultReason) => {
      if (isFinishedRef.current) return;

      isFinishedRef.current = true;
      pendingFenRef.current = null;
      ignoreBestMoveRef.current = true;

      workerRef.current?.postMessage("stop");

      setThinking(false);
      setGameResult(result);
      setResultReason(reason);
      setDrawOfferPending(false);
      setShowResignConfirm(false);
    },
    [],
  );

// Lấy thông tin tài khoản đang đăng nhập
  useEffect(() => {
    let cancelled = false;

    async function loadPlayerProfile() {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      if (!response.ok) {
        if (!cancelled) {
          setPlayerProfile(null);
          router.replace("/");
        }
        return;
      }

      const data = await response.json();
      const profile = data.user ?? data.data?.user ?? data.profile ?? data;

      if (!cancelled) {
        setPlayerProfile(profile);
      }
     } catch (error) {
      console.error("Không thể lấy thông tin người chơi:", error);
        if (!cancelled) {
          setPlayerProfile(null);
          router.replace("/");
        }
      }
   }

    loadPlayerProfile();

   return () => {
    cancelled = true;
    };
  }, [router]);

  // Gửi vị trí hiện tại cho Stockfish.
  const requestEngine = useCallback((position: string) => {
    if (isFinishedRef.current) return;

    setThinking(true);

    if (!readyRef.current) {
      pendingFenRef.current = position;
      return;
    }

    engineAskRef.current(position);
  }, []);

  // Khởi tạo Stockfish.
  useEffect(() => {
    const worker = new Worker("/engine/stockfish.js");
    workerRef.current = worker;

    function askEngine(position: string) {
      if (isFinishedRef.current) return;

      worker.postMessage(`position fen ${position}`);
      worker.postMessage(
        `go movetime ${difficultySettings[difficultyRef.current].moveTime}`,
      );
    }

    engineAskRef.current = askEngine;

    worker.onmessage = (event: MessageEvent<string>) => {
      const message = String(event.data).trim();

      if (message === "uciok") {
        worker.postMessage("isready");
        return;
      }

      if (message === "readyok") {
        readyRef.current = true;
        setEngineReady(true);
        setEngineError("");

        if (pendingFenRef.current && !isFinishedRef.current) {
          const pendingFen = pendingFenRef.current;
          pendingFenRef.current = null;
          setThinking(true);
          askEngine(pendingFen);
        }

        return;
      }

      if (message.startsWith("bestmove")) {
        // Bỏ qua kết quả của lượt tính cũ khi người chơi bắt đầu ván mới.
        if (ignoreBestMoveRef.current || isFinishedRef.current) {
          ignoreBestMoveRef.current = false;
          setThinking(false);
          return;
        }

        const match = message.match(
          /^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/,
        );

        if (!match) {
          setThinking(false);
          return;
        }

        const [, from, to, promotion] = match;
        const currentGame = gameRef.current;

        try {
          const move = currentGame.move({
            from,
            to,
            ...(promotion ? { promotion } : {}),
          });

          if (move) {
            const aiClock = colorToClock(
                 playerColorRef.current === "w" ? "b" : "w",
            );
            const increment =
              timeControls[timeControlRef.current].incrementMs;

            setClocks((previous) => ({
              ...previous,
              [aiClock]: previous[aiClock] + increment,
            }));

            updatePosition(currentGame);

            if (currentGame.isGameOver()) {
              isFinishedRef.current = true;
            }
          }
        } catch {
          setEngineError("Máy không thể thực hiện nước đi vừa tính.");
        }

        setThinking(false);
      }
    };

    worker.onerror = () => {
      setEngineError("Không thể tải Stockfish. Hãy kiểm tra file engine.");
      setEngineReady(false);
      readyRef.current = false;
      setThinking(false);
    };

    worker.postMessage("uci");

    return () => {
      worker.terminate();
      workerRef.current = null;
      readyRef.current = false;
    };
  }, [updatePosition]);

  // Random màu quân sau khi component được mount.
    useEffect(() => {
         pendingFenRef.current = null;

        const frameId = window.requestAnimationFrame(() => {
            const randomColor: ChessColor =
             Math.random() < 0.5 ? "w" : "b";

         playerColorRef.current = randomColor;
            setPlayerColor(randomColor);

    // Nếu người chơi cầm Đen, Stockfish đi trước.
    if (randomColor === "b") {
      requestEngine(gameRef.current.fen());
    }
  });

     return () => {
        window.cancelAnimationFrame(frameId);
     };
}, [requestEngine]);

  const isPlayerTurn = view.turn === playerColor;
  const playerClockSide = colorToClock(playerColor);
  const aiClockSide = colorToClock(aiColor);

  // Đồng hồ chạy theo lượt hiện tại.
  const gameFinished = view.isGameOver || gameResult !== null;

  useEffect(() => {
    if (gameFinished) return;

    const timer = window.setInterval(() => {
      setClocks((previous) => {
        const side = colorToClock(view.turn);

        return {
          ...previous,
          [side]: Math.max(0, previous[side] - 100),
        };
      });
    }, 100);

    return () => window.clearInterval(timer);
  }, [view.turn, gameFinished]);

  // Xử lý khi một bên hết thời gian.
    useEffect(() => {
         if (gameFinished) return;

     const currentClock = clocks[colorToClock(view.turn)];

        if (currentClock > 0) return;
         finishGame(
            view.turn === playerColor ? "loss" : "win",
        "timeout",
         );
    }, [
        clocks,
        view.turn,
        playerColor,
        gameFinished,
        finishGame,
    ]);

  // Stockfish phản hồi đề nghị hòa.
  useEffect(() => {
    if (!drawOfferPending || gameFinished) return;

    const timer = window.setTimeout(() => {
      const currentGame = gameRef.current;
      const materialBalance = getMaterialBalance(currentGame);

      // Xác định AI đang thua quân hay không, bất kể AI cầm màu nào.
      const aiIsLosing =
        (aiColor === "b" && materialBalance >= 3) ||
        (aiColor === "w" && materialBalance <= -3);

      const shouldAccept =
        aiIsLosing ||
        currentGame.isThreefoldRepetition() ||
        currentGame.isDrawByFiftyMoves();

      setDrawOfferPending(false);

      if (shouldAccept) {
        finishGame("draw", "agreement");
        setDrawMessage("Stockfish đã chấp nhận đề nghị hòa.");
      } else {
        setDrawMessage("Stockfish từ chối đề nghị hòa.");
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [drawOfferPending, gameFinished, finishGame, aiColor]);

  function makeHumanMove(from: Square, to: Square) {
    const currentGame = gameRef.current;

    if (
      isFinishedRef.current ||
      currentGame.isGameOver() ||
      currentGame.turn() !== playerColorRef.current ||
      thinking ||
      drawOfferPending
    ) {
      return;
    }

    try {
      const move = currentGame.move({
        from,
        to,
        promotion: "q",
      });

      if (!move) return;

      const playerClock = colorToClock(playerColorRef.current);
      const increment = timeControls[timeControlRef.current].incrementMs;

      setClocks((previous) => ({
        ...previous,
        [playerClock]: previous[playerClock] + increment,
      }));

      updatePosition(currentGame);
      setSelected(null);
      setLegalTargets([]);

      if (currentGame.isGameOver()) {
        isFinishedRef.current = true;
      } else {
        requestEngine(currentGame.fen());
      }
    } catch {
      setSelected(null);
      setLegalTargets([]);
    }
  }

  function handleSquareClick(square: Square) {
    const currentGame = gameRef.current;

    if (
      isFinishedRef.current ||
      thinking ||
      drawOfferPending ||
      currentGame.turn() !== playerColorRef.current ||
      currentGame.isGameOver()
    ) {
      return;
    }

    if (selected === square) {
      setSelected(null);
      setLegalTargets([]);
      return;
    }

    if (selected && legalTargets.includes(square)) {
      makeHumanMove(selected, square);
      return;
    }

    const piece = currentGame.get(square);

    if (piece && piece.color === playerColorRef.current) {
      setSelected(square);

      const targets = currentGame
        .moves({ square, verbose: true })
        .map((move) => move.to);

      setLegalTargets(targets);
    } else {
      setSelected(null);
      setLegalTargets([]);
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, target: Square) {
    event.preventDefault();

    const currentGame = gameRef.current;

    if (
      isFinishedRef.current ||
      thinking ||
      drawOfferPending ||
      currentGame.turn() !== playerColorRef.current ||
      currentGame.isGameOver()
    ) {
      return;
    }

    const from = event.dataTransfer.getData("text/plain") as Square;

    if (
      from &&
      currentGame.get(from)?.color === playerColorRef.current
    ) {
      makeHumanMove(from, target);
    }
  }

  function handleUndo() {
    const currentGame = gameRef.current;

    if (
      view.history.length === 0 ||
      thinking ||
      gameResult !== null
    ) {
      return;
    }

    pendingFenRef.current = null;
    ignoreBestMoveRef.current = false;
    isFinishedRef.current = false;

    // Hoàn tác đến lượt của người chơi.
    // Nếu vừa đến lượt người chơi thì hoàn tác cả nước AI và nước người chơi.
    // Nếu đang đến lượt AI thì chỉ hoàn tác nước người chơi.
    while (currentGame.history().length > 0) {
      currentGame.undo();

      if (currentGame.turn() === playerColorRef.current) {
        break;
      }
    }

    updatePosition(currentGame);
    setSelected(null);
    setLegalTargets([]);
    setThinking(false);
    setEngineError("");
    setDrawMessage("");

    // Trường hợp vừa hoàn tác nước mở màn của AI khi người chơi cầm Đen.
    // AI cần đi lại nước đầu tiên.
    if (
      currentGame.turn() !== playerColorRef.current &&
      !currentGame.isGameOver()
    ) {
      requestEngine(currentGame.fen());
    }
  }

  function handleNewGame() {
    const wasThinking = thinking && readyRef.current;

    if (wasThinking) {
      ignoreBestMoveRef.current = true;
      workerRef.current?.postMessage("stop");
    } else {
      ignoreBestMoveRef.current = false;
    }

    pendingFenRef.current = null;
    isFinishedRef.current = false;

    const newGame = new Chess();
    gameRef.current = newGame;

    // Bốc ngẫu nhiên màu quân cho người chơi.
    const randomColor: ChessColor =
      Math.random() < 0.5 ? "w" : "b";

    playerColorRef.current = randomColor;
    setPlayerColor(randomColor);

    const initialTime = timeControls[timeControl].initialMs;

    setClocks({
      white: initialTime,
      black: initialTime,
    });

    setGameResult(null);
    setResultReason(null);
    setDrawOfferPending(false);
    setDrawMessage("");
    setShowResignConfirm(false);

    updatePosition(newGame);
    setSelected(null);
    setLegalTargets([]);
    setThinking(false);
    setEngineError("");

    // Người chơi cầm Đen: Stockfish tự đi nước đầu tiên.
    if (randomColor === "b") {
      requestEngine(newGame.fen());
    }
  }

  function handleDifficultyChange(value: Difficulty) {
    setDifficulty(value);
    difficultyRef.current = value;
  }

  function handleTimeControlChange(value: TimeControl) {
    if (view.history.length > 0 || thinking || gameResult) return;

    setTimeControl(value);
    timeControlRef.current = value;

    const initialTime = timeControls[value].initialMs;

    setClocks({
      white: initialTime,
      black: initialTime,
    });
  }

  function handleOfferDraw() {
    if (
      gameFinished ||
      thinking ||
      !isPlayerTurn ||
      drawOfferPending
    ) {
      return;
    }

    setDrawMessage("");
    setDrawOfferPending(true);
  }

  function handleResign() {
    finishGame("loss", "resign");
  }

  const lastMove = view.verboseHistory.at(-1);

  let status =
    isPlayerTurn
      ? `Lượt của bạn · Quân ${colorName(playerColor)}`
      : `Lượt của Stockfish · Quân ${colorName(aiColor)}`;

  if (gameResult === "win") {
    status = "Bạn chiến thắng!";
  } else if (gameResult === "loss") {
    status = "Bạn đã thất bại.";
  } else if (gameResult === "draw") {
    status = "Ván đấu hòa.";
  } else if (view.isCheckmate) {
    status = isPlayerTurn
      ? "Chiếu hết! Stockfish chiến thắng"
      : "Chiếu hết! Bạn chiến thắng";
  } else if (view.isStalemate) {
    status = "Hòa do bí nước";
  } else if (view.isThreefoldRepetition) {
    status = "Hòa do lặp lại thế cờ 3 lần";
  } else if (view.isDrawByFiftyMoves) {
    status = "Hòa do luật 50 nước";
  } else if (view.isInsufficientMaterial) {
    status = "Hòa do không đủ quân chiếu hết";
  } else if (view.isDraw) {
    status = "Ván cờ hòa";
  } else if (drawOfferPending) {
    status = "Stockfish đang xem xét đề nghị hòa...";
  } else if (thinking) {
    status = "Stockfish đang suy nghĩ...";
  } else if (view.isCheck) {
    status += " · Đang bị chiếu!";
  }

  let resultMessage = "";

  if (gameResult === "win") {
    resultMessage =
      resultReason === "timeout"
        ? "Bạn chiến thắng! Stockfish đã hết thời gian."
        : "Chúc mừng! Bạn đã chiến thắng.";
  } else if (gameResult === "loss") {
    resultMessage =
      resultReason === "timeout"
        ? "Bạn đã hết thời gian. Stockfish chiến thắng!"
        : "Bạn đã đầu hàng. Stockfish chiến thắng!";
  } else if (gameResult === "draw") {
    resultMessage = "Hai bên đã đồng ý hòa cờ.";
  } else if (view.isCheckmate) {
    resultMessage = isPlayerTurn
      ? "Bạn đã bị chiếu hết. Stockfish chiến thắng!"
      : "Chúc mừng! Bạn đã đánh bại Stockfish.";
  } else if (view.isStalemate) {
    resultMessage = "Hòa cờ: Người chơi đến lượt không còn nước đi hợp lệ.";
  } else if (view.isThreefoldRepetition) {
    resultMessage = "Hòa cờ: Một thế cờ đã xuất hiện 3 lần.";
  } else if (view.isDrawByFiftyMoves) {
    resultMessage =
      "Hòa cờ: Đã đủ 50 nước mỗi bên mà không có nước tốt hoặc ăn quân.";
  } else if (view.isInsufficientMaterial) {
    resultMessage = "Hòa cờ: Không còn đủ quân để tạo ra thế chiếu hết.";
  } else if (view.isDraw) {
    resultMessage = "Ván đấu đã kết thúc với kết quả hòa.";
  }

  const playerClockActive =
    !gameFinished && view.turn === playerColor;

  const aiClockActive =
    !gameFinished && view.turn === aiColor;

  const playerClock = clocks[playerClockSide];
  const aiClock = clocks[aiClockSide];

  const aiPieceSymbol = aiColor === "w" ? "♙" : "♟";
  const playerPieceSymbol = playerColor === "w" ? "♙" : "♟";

  return (
    <main className="play-page">
      <header className="play-header">
        <Link href="/" className="play-brand">
          <span>♞</span>
          CHESS<span className="brand-gold">VERSE</span>
        </Link>

        <div className="play-header-center">
          <span className="play-live-dot" />
          CHESSVERSE AI ARENA
        </div>

        <Link href="/" className="back-home">
          ← Trang chủ
        </Link>
      </header>

      <div className="play-layout">
        <section className="board-section">
          <div className="game-heading">
            <div>
              <div className="game-eyebrow">
                PLAYER VS STOCKFISH · AI MATCH
              </div>
              <h1>Thử thách trí tuệ</h1>
              <p>
                Bạn cầm quân {colorName(playerColor)}.
                {" "}Stockfish cầm quân {colorName(aiColor)}.
              </p>
            </div>

            <div className="game-status">
              <span className={gameFinished ? "status-finished" : ""} />
              {gameFinished ? "KẾT THÚC" : "ĐANG CHƠI"}
            </div>
          </div>

          {/* Đối thủ Stockfish */}
          <div className="opponent-bar">
            <div className="player-avatar opponent-avatar">
              {aiPieceSymbol}
            </div>
            <div className="game-player-info">
              <strong>Stockfish AI</strong>
              <span>{colorName(aiColor)} · Đối thủ máy tính</span>
            </div>
            <div className="player-rating">AI</div>
          </div>

          {/* Đồng hồ Stockfish */}
          <div
            className="clock-box"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              marginBottom: "10px",
              borderRadius: "12px",
              background: aiClockActive ? "#253b32" : "#202832",
              border: aiClockActive
                ? "2px solid #65c18c"
                : "2px solid transparent",
              color: "#fff",
            }}
          >
            <div>
              <strong>♟ Stockfish AI</strong>
              <div style={{ fontSize: "12px", opacity: 0.7 }}>
                Quân {colorName(aiColor)}
              </div>
            </div>
            <strong
              style={{
                fontSize: "30px",
                fontVariantNumeric: "tabular-nums",
                color: aiClock < 10_000 ? "#ff7777" : "#fff",
              }}
            >
              {formatClock(aiClock)}
            </strong>
          </div>

          <div className="chess-board-frame">
            <div className="board-coordinates">
              <div className="rank-coordinates">
                {(flipped
                  ? [1, 2, 3, 4, 5, 6, 7, 8]
                  : [8, 7, 6, 5, 4, 3, 2, 1]
                ).map((rank) => (
                  <span key={rank}>{rank}</span>
                ))}
              </div>

              <div className="board-main">
                <div className="chess-board">
                  {Array.from({ length: 8 }, (_, rowIndex) => {
                    const rank = flipped ? rowIndex + 1 : 8 - rowIndex;

                    return Array.from({ length: 8 }, (_, colIndex) => {
                      const fileIndex = flipped
                        ? 7 - colIndex
                        : colIndex;

                      const file = files[fileIndex];
                      const square = `${file}${rank}` as Square;
                      const piece = view.board[8 - rank][fileIndex];

                      const isLight = (fileIndex + rank) % 2 === 1;
                      const isSelected = selected === square;
                      const isTarget = legalTargets.includes(square);
                      const isLastMove =
                        lastMove?.from === square ||
                        lastMove?.to === square;

                      const pieceKey = piece
                        ? `${piece.color}${piece.type.toUpperCase()}`
                        : "";

                      return (
                        <button
                          key={square}
                          type="button"
                          className={[
                            "chess-square",
                            isLight ? "square-light" : "square-dark",
                            isSelected ? "square-selected" : "",
                            isTarget ? "square-target" : "",
                            isLastMove ? "square-last-move" : "",
                          ].join(" ")}
                          onClick={() => handleSquareClick(square)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleDrop(event, square)}
                          aria-label={`Ô ${square}`}
                          disabled={
                            thinking ||
                            drawOfferPending ||
                            !isPlayerTurn ||
                            gameFinished
                          }
                        >
                          {piece && (
                            <span
                              className={`chess-piece ${
                                piece.color === "w"
                                  ? "white-piece"
                                  : "black-piece"
                              }`}
                              draggable={
                                !thinking &&
                                !drawOfferPending &&
                                !gameFinished &&
                                piece.color === playerColor &&
                                isPlayerTurn
                              }
                              onDragStart={(event) => {
                                event.dataTransfer.setData(
                                  "text/plain",
                                  square,
                                );

                                setSelected(square);

                                const currentGame = gameRef.current;
                                const targets = currentGame
                                  .moves({ square, verbose: true })
                                  .map((move) => move.to);

                                setLegalTargets(targets);
                              }}
                            >
                              {pieceSymbols[pieceKey]}
                            </span>
                          )}

                          {isTarget && !piece && (
                            <span className="legal-dot" />
                          )}

                          {isTarget && piece && (
                            <span className="legal-capture" />
                          )}
                        </button>
                      );
                    });
                  })}
                </div>

                <div className="file-coordinates">
                  {(flipped
                    ? ["h", "g", "f", "e", "d", "c", "b", "a"]
                    : ["a", "b", "c", "d", "e", "f", "g", "h"]
                  ).map((file) => (
                    <span key={file}>{file}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Đồng hồ người chơi */}
          <div
            className="clock-box"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              marginTop: "10px",
              borderRadius: "12px",
              background: playerClockActive ? "#253b32" : "#202832",
              border: playerClockActive
                ? "2px solid #65c18c"
                : "2px solid transparent",
              color: "#fff",
            }}
          >
            <div>
              <strong>
                {playerPieceSymbol}{" "}
                {playerProfile?.displayName ||
                  playerProfile?.username ||
                  "Khách"} (Bạn)
              </strong>

              <div style={{ fontSize: "12px", opacity: 0.7 }}>
                Quân {colorName(playerColor)} ·{" "}
                {typeof playerProfile?.elo === "number"
                  ? `${playerProfile.elo.toLocaleString("vi-VN")} Elo`
                  : "Chưa có Elo"}
              </div>
            </div>
            <strong
              style={{
                fontSize: "30px",
                fontVariantNumeric: "tabular-nums",
                color: playerClock < 10_000 ? "#ff7777" : "#fff",
              }}
            >
              {formatClock(playerClock)}
            </strong>
          </div>

          <div className="board-status">
            <span
              className={
                view.isCheck ? "check-indicator" : "turn-indicator"
              }
            />
            <strong>{status}</strong>
          </div>

          {drawMessage && !gameFinished && (
            <div className="game-result">{drawMessage}</div>
          )}

          {gameFinished && (
            <div className="game-result">
              <strong>{resultMessage}</strong>
              <div style={{ marginTop: "12px" }}>
                <button
                  className="game-action-button"
                  onClick={handleNewGame}
                >
                  ⟳ Chơi ván mới
                </button>
              </div>
            </div>
          )}

          {engineError && (
            <div className="game-result">{engineError}</div>
          )}
        </section>

        <aside className="game-sidebar">
          <section className="game-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">
                  ARTIFICIAL INTELLIGENCE
                </span>
                <h2>Đối thủ Stockfish</h2>
              </div>
              <span className="panel-chess-icon">♜</span>
            </div>

            <div className="engine-status">
              <span
                className={
                  engineReady ? "engine-online" : "engine-loading"
                }
              />
              <div>
                <strong>
                  {engineReady ? "ENGINE ONLINE" : "ĐANG TẢI ENGINE"}
                </strong>
                <small>
                  {engineReady
                    ? "Stockfish đã sẵn sàng"
                    : "Đang khởi tạo WebAssembly"}
                </small>
              </div>
            </div>

            <div className="difficulty-control">
              <label htmlFor="time-control">THỜI GIAN MỖI VÁN</label>
              <select
                id="time-control"
                value={timeControl}
                onChange={(event) =>
                  handleTimeControlChange(event.target.value as TimeControl)
                }
                disabled={view.history.length > 0 || thinking || !!gameResult}
              >
                {Object.entries(timeControls).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
              <small>
                {timeControls[timeControl].incrementMs > 0
                  ? "Mỗi nước đi được cộng thêm 10 giây."
                  : "Mỗi bên có thời gian cố định, không cộng thêm."}
              </small>
            </div>

            <div className="difficulty-control">
              <label htmlFor="difficulty">ĐỘ KHÓ CỦA ĐỐI THỦ</label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(event) =>
                  handleDifficultyChange(event.target.value as Difficulty)
                }
                disabled={thinking}
              >
                <option value="easy">Dễ</option>
                <option value="medium">Trung bình</option>
                <option value="hard">Khó</option>
              </select>
              <small>
                Mức khó điều chỉnh thời gian máy suy nghĩ, không phải Elo cố định.
              </small>
            </div>

            <div className="turn-card">
              <span>LƯỢT ĐI HIỆN TẠI</span>
              <strong>{colorName(view.turn).toUpperCase()}</strong>
              <small>
                {drawOfferPending
                  ? "Đang chờ phản hồi đề nghị hòa..."
                  : thinking
                    ? "Stockfish đang tính toán..."
                    : status}
              </small>
            </div>

            <div className="game-actions">
              <button
                className="game-action-button"
                onClick={handleUndo}
                disabled={
                  view.history.length === 0 ||
                  thinking ||
                  gameResult !== null
                }
              >
                <span>↶</span>
                <div>
                  <strong>Đi lại</strong>
                  <small>Hoàn tác lượt đấu gần nhất</small>
                </div>
              </button>

              <button
                className="game-action-button"
                onClick={handleNewGame}
              >
                <span>⟳</span>
                <div>
                  <strong>Ván mới</strong>
                  <small>Bốc thăm màu quân và bắt đầu lại</small>
                </div>
              </button>

              <button
                className="game-action-button"
                onClick={handleOfferDraw}
                disabled={
                  gameFinished ||
                  thinking ||
                  !isPlayerTurn ||
                  drawOfferPending
                }
              >
                <span>🤝</span>
                <div>
                  <strong>Đề nghị hòa</strong>
                  <small>Yêu cầu Stockfish hòa cờ</small>
                </div>
              </button>

              <button
                className="game-action-button"
                onClick={() => setShowResignConfirm(true)}
                disabled={gameFinished}
                style={{ color: "#e87979" }}
              >
                <span>⚑</span>
                <div>
                  <strong>Đầu hàng</strong>
                  <small>Chấp nhận thất bại</small>
                </div>
              </button>
            </div>

            {drawOfferPending && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(220, 180, 80, 0.12)",
                }}
              >
                <strong>Đang đề nghị hòa</strong>
                <p style={{ fontSize: "13px", marginTop: "5px" }}>
                  Stockfish đang xem xét thế cờ của hai bên.
                </p>
              </div>
            )}

            <div className="panel-divider" />

            <div className="history-heading">
              <div>
                <span className="panel-kicker">MOVE RECORD</span>
                <h2>Lịch sử nước đi</h2>
              </div>
              <span className="move-count">
                {view.history.length} NƯỚC
              </span>
            </div>

            <div className="move-history">
              {view.history.length === 0 ? (
                <div className="empty-history">
                  <span>♟</span>
                  <p>Chưa có nước đi nào.</p>
                  <small>
                    {playerColor === "w"
                      ? "Bạn cầm Trắng. Hãy chọn một quân để bắt đầu."
                      : "Bạn cầm Đen. Stockfish đang chuẩn bị đi trước."}
                  </small>
                </div>
              ) : (
                <div className="move-list">
                  {Array.from(
                    { length: Math.ceil(view.history.length / 2) },
                    (_, index) => (
                      <div className="move-row" key={index}>
                        <span className="move-number">{index + 1}.</span>
                        <strong>{view.history[index * 2]}</strong>
                        <strong>
                          {view.history[index * 2 + 1] ?? "..."}
                        </strong>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="game-tip">
            <span>✦ CHESS TIP</span>
            <p>
              Hãy kiểm soát trung tâm và phát triển các quân nhẹ trước khi đưa
              hậu vào tấn công.
            </p>
          </section>

          <Link href="/" className="exit-game">
            ← Quay về trang chủ ChessVerse
          </Link>
        </aside>
      </div>

      {showResignConfirm && !gameFinished && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resign-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(0, 0, 0, 0.72)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "24px",
              borderRadius: "16px",
              background: "#202832",
              color: "#fff",
              boxShadow: "0 20px 60px rgba(0,0,0,.4)",
            }}
          >
            <h2 id="resign-title">Bạn muốn đầu hàng?</h2>
            <p style={{ margin: "12px 0 20px", opacity: 0.8 }}>
              Nếu xác nhận, bạn sẽ thua ván đấu hiện tại. Hành động này không
              thể hoàn tác.
            </p>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="game-action-button"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setShowResignConfirm(false)}
              >
                Tiếp tục chơi
              </button>

              <button
                type="button"
                className="game-action-button"
                style={{
                  flex: 1,
                  justifyContent: "center",
                  background: "#a83d43",
                  color: "#fff",
                }}
                onClick={handleResign}
              >
                Xác nhận thua
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="play-footer">
        <span>CHESSVERSE ARENA · AI VERSION 0.6</span>
        <span>
          THINK BEFORE YOU MOVE <b>♞</b>
        </span>
      </footer>
    </main>
  );
}
