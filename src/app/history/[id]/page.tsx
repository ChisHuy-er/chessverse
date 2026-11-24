"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Chess } from "chess.js";
import styles from "./detail.module.css";

type MatchMove = {
  ply: number;
  san: string;
  uci: string;
  from: string;
  to: string;
  color: "w" | "b";
  beforeFen: string;
  afterFen: string;
};

type MatchAnalysis = {
  ply: number;
  uci: string;
  move: string;
  color: "w" | "b";
  depth: number;
  label: string;
  score: number | null;
  scoreType: "cp" | "mate" | null;
  centipawnLoss: number | null;
  bestMove: string;
  pv: string[];
  evaluationAfter?: number | null;
};

type Player = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type EloInfo = {
  before: number | null;
  change: number;
  after: number | null;
};

type MatchDetail = {
  id: string;
  mode: "RANKED" | "CASUAL";
  status: string;
  result: string | null;
  myResult: "WIN" | "LOSS" | "DRAW";
  reason: string | null;
  myColor: "WHITE" | "BLACK";
  players: {
    white: Player;
    black: Player;
  };
  elo: {
    white: EloInfo;
    black: EloInfo;
  };
  pgn: string | null;
  finalFen: string | null;
  moves: MatchMove[];
  analysis: MatchAnalysis[] | null;
  startedAt: string;
  finishedAt: string | null;
};

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
  bP: "♟︎",
};

const reasonLabels: Record<string, string> = {
  CHECKMATE: "Chiếu hết",
  RESIGN: "Đầu hàng",
  DISCONNECT: "Mất kết nối",
  TIMEOUT: "Hết giờ",
  STALEMATE: "Hết nước đi",
  INSUFFICIENT_MATERIAL: "Không đủ quân",
  THREEFOLD_REPETITION: "Lặp lại 3 lần",
  FIFTY_MOVE_RULE: "Luật 50 nước",
  SEVENTY_FIVE_MOVE_RULE: "Luật 75 nước",
  DRAW_AGREEMENT: "Hai bên đồng ý hòa",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatElo(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function formatScore(
  score: number | null,
  scoreType: "cp" | "mate" | null,
) {
  if (score === null || scoreType === null) {
    return "Chưa có đánh giá";
  }

  if (scoreType === "mate") {
    return `Mate ${score > 0 ? "+" : ""}${score}`;
  }

  return `${score > 0 ? "+" : ""}${(score / 100).toFixed(2)}`;
}

function getResultLabel(result: string | null) {
  if (result === "WHITE_WIN") return "Trắng chiến thắng";
  if (result === "BLACK_WIN") return "Đen chiến thắng";
  if (result === "DRAW") return "Hòa";
  return "Chưa xác định";
}

function MatchDetailContent() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPly, setSelectedPly] = useState(-1);
  const [copyMessage, setCopyMessage] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "moves" | "chart" | "mistakes" | "stockfish" | "pgn"
  >("overview");

  useEffect(() => {
    let active = true;

    async function loadMatch() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `/api/online/history/${encodeURIComponent(matchId)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const responseText = await response.text();
          let data;
          try {
            data = JSON.parse(responseText);
          } catch {
            throw new Error(
              `API không trả về JSON. HTTP ${response.status}`,
            );
          }

        if (!response.ok) {
          throw new Error(
            data.message || "Không thể tải chi tiết trận đấu.",
          );
        }

        if (!data.match) {
          throw new Error("API không trả về dữ liệu trận đấu.");
        }

        if (active) {
          const matchData = data.match as MatchDetail;

          setMatch(matchData);

          // Mặc định hiển thị vị trí sau nước đi cuối cùng.
          setSelectedPly(
            matchData.moves?.length
              ? matchData.moves.length - 1
              : -1,
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Đã xảy ra lỗi khi tải trận đấu.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (matchId) loadMatch();

    return () => {
      active = false;
    };
  }, [matchId]);

  const moves = useMemo(
    () => match?.moves ?? [],
    [match?.moves],
    );

  const currentFen = useMemo(() => {
    if (!match) return null;

    if (selectedPly === -1) {
      return moves[0]?.beforeFen ?? match.finalFen;
    }

    return moves[selectedPly]?.afterFen ?? match.finalFen;
  }, [match, moves, selectedPly]);

  const board = useMemo(() => {
    if (!currentFen) return null;

    try {
      return new Chess(currentFen).board();
    } catch {
      return null;
    }
  }, [currentFen]);

  const currentMove = selectedPly >= 0
    ? moves[selectedPly]
    : null;

  const currentAnalysis = useMemo(() => {
    if (!match || selectedPly < 0) return null;

    return match.analysis?.find(
      (item) => item.ply === moves[selectedPly]?.ply,
    ) ?? null;
      }, [match, moves, selectedPly]);

    const analysisStats = useMemo(() => {
    const analysis = match?.analysis ?? [];

    const getAccuracy = (items: MatchAnalysis[]) => {
      const validItems = items.filter(
        (item) =>
          typeof item.centipawnLoss === "number" &&
          Number.isFinite(item.centipawnLoss),
      );

      if (validItems.length === 0) return null;

      const averageCpl =
        validItems.reduce(
          (sum, item) => sum + Math.max(0, item.centipawnLoss ?? 0),
          0,
        ) / validItems.length;

      return Math.max(
        0,
        Math.min(100, 100 * Math.exp(-averageCpl / 120)),
      );
    };

    const count = (label: string) =>
      analysis.filter(
        (item) => item.label?.toLowerCase() === label.toLowerCase(),
      ).length;

    return {
      whiteAccuracy: getAccuracy(
        analysis.filter((item) => item.color === "w"),
      ),
      blackAccuracy: getAccuracy(
        analysis.filter((item) => item.color === "b"),
      ),
      brilliant: count("Brilliant"),
      best: count("Best"),
      excellent: count("Excellent"),
      good: count("Good"),
      inaccuracy: count("Inaccuracy"),
      mistake: count("Mistake"),
      blunder: count("Blunder"),
      total: analysis.length,
      mistakes: analysis.filter((item) =>
        ["Inaccuracy", "Mistake", "Blunder"].includes(item.label),
      ),
    };
  }, [match?.analysis]);

  const goToMove = useCallback((index: number) => {
    if (index < -1 || index >= moves.length) return;

    // Khi người dùng chọn nước đi thủ công thì dừng phát lại.
    setIsPlaying(false);
    setSelectedPly(index);
  }, [moves.length]);

  const goFirst = () => goToMove(-1);
  const goPrevious = () => goToMove(selectedPly - 1);
  const goNext = () => goToMove(
    Math.min(selectedPly + 1, moves.length - 1),
  );
  const goLast = () => goToMove(moves.length - 1);

  
// Tự động chuyển nước đi và dừng khi đến cuối trận.
  useEffect(() => {
    if (!isPlaying || moves.length === 0) return;

    const lastPly = moves.length - 1;

    const timer = window.setInterval(() => {
      const nextPly = selectedPly + 1;

      if (nextPly >= lastPly) {
        setSelectedPly(lastPly);
        setIsPlaying(false);
        return;
      }

      setSelectedPly(nextPly);
    }, 800);

    return () => window.clearInterval(timer);
  }, [isPlaying, selectedPly, moves.length]);


  // Bắt đầu hoặc tạm dừng Replay.
  const toggleReplay = () => {
    if (moves.length === 0) return;

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    // Nếu đang ở cuối trận thì phát lại từ đầu.
    if (selectedPly >= moves.length - 1) {
      setSelectedPly(-1);
    }

    setIsPlaying(true);
  };

  async function copyPgn() {
    if (!match?.pgn) return;

    try {
      await navigator.clipboard.writeText(match.pgn);
      setCopyMessage("Đã sao chép PGN!");
    } catch {
      setCopyMessage("Không thể sao chép PGN.");
    }

    window.setTimeout(() => setCopyMessage(""), 2000);
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.message}>Đang tải chi tiết trận đấu...</div>
      </main>
    );
  }

  if (error || !match) {
    return (
      <main className={styles.page}>
        <Link href="/history" className={styles.backLink}>
          ← Quay lại lịch sử
        </Link>
        <div className={styles.error}>
          {error || "Không tìm thấy trận đấu."}
        </div>
      </main>
    );
  }

  const whiteWon = match.result === "WHITE_WIN";
  const blackWon = match.result === "BLACK_WIN";
  const isDraw = match.result === "DRAW";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>CHESSVERSE / MATCH</div>
          <h1>Chi tiết trận đấu</h1>
          <p>
            Xem lại từng nước đi và phân tích hiệu suất thi đấu.
          </p>
        </div>

        <Link href="/history" className={styles.backButton}>
          ← Lịch sử đấu
        </Link>
      </header>

      <section className={styles.resultPanel}>
        <div className={styles.player}>
          <div className={styles.avatar}>
            {match.players.white.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <strong>{match.players.white.displayName}</strong>
            <small>@{match.players.white.username}</small>
            <small>Quân trắng</small>
          </div>
        </div>

        <div className={styles.resultCenter}>
          <span className={styles.resultText}>
            {getResultLabel(match.result)}
          </span>
          <strong className={styles.score}>
            {whiteWon ? "1 - 0" : blackWon ? "0 - 1" : isDraw ? "½ - ½" : "—"}
          </strong>
          <small>
            {match.reason
              ? reasonLabels[match.reason] || match.reason
              : "Trận đấu đã hoàn thành"}
          </small>
        </div>

        <div className={`${styles.player} ${styles.playerRight}`}>
          <div className={styles.avatar}>
            {match.players.black.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <strong>{match.players.black.displayName}</strong>
            <small>@{match.players.black.username}</small>
            <small>Quân đen</small>
          </div>
        </div>
      </section>

      <section className={styles.eloGrid}>
        <article className={styles.eloCard}>
          <span>ELO QUÂN TRẮNG</span>
          <strong>{formatElo(match.elo.white.after)}</strong>
          <small>
            {formatElo(match.elo.white.before)}
            {" → "}
            {formatElo(match.elo.white.after)}
            {" · "}
            <b className={match.elo.white.change >= 0 ? styles.positive : styles.negative}>
              {match.elo.white.change > 0 ? "+" : ""}
              {match.elo.white.change}
            </b>
          </small>
        </article>

        <article className={styles.eloCard}>
          <span>ELO QUÂN ĐEN</span>
          <strong>{formatElo(match.elo.black.after)}</strong>
          <small>
            {formatElo(match.elo.black.before)}
            {" → "}
            {formatElo(match.elo.black.after)}
            {" · "}
            <b className={match.elo.black.change >= 0 ? styles.positive : styles.negative}>
              {match.elo.black.change > 0 ? "+" : ""}
              {match.elo.black.change}
            </b>
          </small>
        </article>
      </section>

      <section className={styles.gameLayout}>
        <div className={styles.boardPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>GAME REPLAY</span>
              <h2>Bàn cờ</h2>
            </div>
            <span className={styles.moveCounter}>
              {selectedPly < 0
                ? "Vị trí ban đầu"
                : `Nước ${selectedPly + 1}/${moves.length}`}
            </span>
          </div>

          {board ? (
            <div className={styles.board}>
              {board.map((row, rowIndex) =>
                row.map((piece, colIndex) => {
                  const square = `${"abcdefgh"[colIndex]}${8 - rowIndex}`;
                  const isLight = (rowIndex + colIndex) % 2 === 0;

                  const isLastMove =
                    currentMove?.from === square ||
                    currentMove?.to === square;

                  const symbol = piece
                    ? pieceSymbols[`${piece.color}${piece.type.toUpperCase()}`]
                    : "";

                  return (
                    <div
                      key={square}
                      className={[
                        styles.square,
                        isLight ? styles.lightSquare : styles.darkSquare,
                        isLastMove ? styles.lastMove : "",
                      ].join(" ")}
                    >
                      {piece && (
                        <span
                          className={
                            piece.color === "w"
                              ? styles.whitePiece
                              : styles.blackPiece
                          }
                        >
                          {symbol}
                        </span>
                      )}

                      {colIndex === 0 && (
                        <small className={styles.rankLabel}>
                          {8 - rowIndex}
                        </small>
                      )}

                      {rowIndex === 7 && (
                        <small className={styles.fileLabel}>
                          {"abcdefgh"[colIndex]}
                        </small>
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          ) : (
            <div className={styles.error}>
              Không thể hiển thị vị trí bàn cờ.
            </div>
          )}

          <div className={styles.navigation}>
            <button onClick={goFirst} disabled={selectedPly === -1}>
              |◀
            </button>
            <button
              className={styles.playButton}
              onClick={toggleReplay}
              disabled={moves.length === 0}
            >
              {isPlaying ? "Ⅱ Tạm dừng" : "▶ Phát lại"}
            </button>
            <button onClick={goPrevious} disabled={selectedPly === -1}>
              ◀
            </button>
            <button
              onClick={goNext}
              disabled={selectedPly >= moves.length - 1}
            >
              ▶
            </button>
            <button
              onClick={goLast}
              disabled={selectedPly >= moves.length - 1 || moves.length === 0}
            >
              ▶|
            </button>
          </div>

          <div className={styles.navigationHint}>
            {currentMove
              ? `${currentMove.san} · ${currentMove.color === "w" ? "Trắng" : "Đen"}`
              : "Đang ở vị trí bắt đầu"}
          </div>
        </div>

        <aside className={styles.analysisDashboard}>
          <div className={styles.dashboardHeader}>
            <div>
              <span className={styles.eyebrow}>CHESSVERSE ANALYSIS</span>
              <h2>Phân tích trận đấu</h2>
            </div>
            <span className={styles.moveCounter}>
              {analysisStats.total} nước đã phân tích
            </span>
          </div>

          <div className={styles.analysisTabs}>
            {[
              { id: "overview", label: "Tổng quan" },
              { id: "moves", label: "Nước đi" },
              { id: "chart", label: "Biểu đồ" },
              { id: "mistakes", label: "Sai lầm" },
              { id: "stockfish", label: "Stockfish" },
              { id: "pgn", label: "PGN" },
            ].map((tab) => (
              <button
                key={tab.id}
                className={
                  activeTab === tab.id
                    ? styles.activeTab
                    : styles.analysisTab
                }
                onClick={() =>
                  setActiveTab(
                    tab.id as
                      | "overview"
                      | "moves"
                      | "chart"
                      | "mistakes"
                      | "stockfish"
                      | "pgn",
                  )
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.dashboardContent}>
            {activeTab === "overview" && (
              <div className={styles.overviewContent}>
                <h3>Tổng quan trận đấu</h3>

                <div className={styles.accuracyGrid}>
                  <div className={styles.accuracyCard}>
                    <span>ĐỘ CHÍNH XÁC TRẮNG</span>
                    <strong>
                      {analysisStats.whiteAccuracy === null
                        ? "—"
                        : `${analysisStats.whiteAccuracy.toFixed(1)}%`}
                    </strong>
                    <small>
                      {match.players.white.displayName}
                    </small>
                  </div>

                  <div className={styles.accuracyCard}>
                    <span>ĐỘ CHÍNH XÁC ĐEN</span>
                    <strong>
                      {analysisStats.blackAccuracy === null
                        ? "—"
                        : `${analysisStats.blackAccuracy.toFixed(1)}%`}
                    </strong>
                    <small>
                      {match.players.black.displayName}
                    </small>
                  </div>
                </div>

                <h3>Thống kê chất lượng nước đi</h3>

                <div className={styles.analysisStatsGrid}>
                  {[
                    { label: "Brilliant", value: analysisStats.brilliant },
                    { label: "Best", value: analysisStats.best },
                    { label: "Excellent", value: analysisStats.excellent },
                    { label: "Good", value: analysisStats.good },
                    { label: "Inaccuracy", value: analysisStats.inaccuracy },
                    { label: "Mistake", value: analysisStats.mistake },
                    { label: "Blunder", value: analysisStats.blunder },
                  ].map((item) => (
                    <div className={styles.analysisStatItem} key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className={styles.overviewNote}>
                  Đã có {analysisStats.total}/{moves.length} nước đi có dữ liệu
                  phân tích Stockfish.
                </div>
              </div>
            )}

            {activeTab === "moves" && (
              <div className={styles.tabSection}>
                <div className={styles.tabSectionHeading}>
                  <h3>Danh sách nước đi</h3>
                  <span>{moves.length} ply</span>
                </div>

                {moves.length === 0 ? (
                  <div className={styles.empty}>
                    Trận đấu chưa có nước đi được lưu.
                  </div>
                ) : (
                  <div className={styles.moveList}>
                    {Array.from(
                      { length: Math.ceil(moves.length / 2) },
                      (_, index) => {
                        const whiteIndex = index * 2;
                        const blackIndex = whiteIndex + 1;
                        const whiteMove = moves[whiteIndex];
                        const blackMove = moves[blackIndex];

                        const whiteAnalysis = match.analysis?.find(
                          (item) => item.ply === whiteMove.ply,
                        );

                        const blackAnalysis = blackMove
                          ? match.analysis?.find(
                              (item) => item.ply === blackMove.ply,
                            )
                          : null;

                        return (
                          <div className={styles.moveRow} key={index}>
                            <span className={styles.moveNumber}>
                              {index + 1}.
                            </span>

                            <button
                              className={
                                selectedPly === whiteIndex
                                  ? styles.activeMove
                                  : styles.moveButton
                              }
                              onClick={() => goToMove(whiteIndex)}
                            >
                              <span>{whiteMove.san}</span>
                              {whiteAnalysis && (
                                <small className={styles.moveAnalysisLabel}>
                                  {whiteAnalysis.label}
                                </small>
                              )}
                            </button>

                            {blackMove ? (
                              <button
                                className={
                                  selectedPly === blackIndex
                                    ? styles.activeMove
                                    : styles.moveButton
                                }
                                onClick={() => goToMove(blackIndex)}
                              >
                                <span>{blackMove.san}</span>
                                {blackAnalysis && (
                                  <small className={styles.moveAnalysisLabel}>
                                    {blackAnalysis.label}
                                  </small>
                                )}
                              </button>
                            ) : (
                              <span />
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "chart" && (
              <div className={styles.tabSection}>
                <h3>Biểu đồ đánh giá thế trận</h3>
                <div className={styles.chartPlaceholder}>
                  <span>◒</span>
                  <strong>Chưa đủ dữ liệu để vẽ biểu đồ chính xác</strong>
                  <p>
                    ChessVerse cần lưu điểm đánh giá sau mỗi nước đi theo
                    góc nhìn quân Trắng để xây dựng biểu đồ thế trận.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "mistakes" && (
              <div className={styles.tabSection}>
                <h3>Các nước đi cần chú ý</h3>

                {analysisStats.mistakes.length === 0 ? (
                  <div className={styles.empty}>
                    Chưa có dữ liệu sai lầm hoặc chưa phân tích trận đấu.
                  </div>
                ) : (
                  <div className={styles.mistakeList}>
                    {analysisStats.mistakes.map((item) => {
                      const moveIndex = moves.findIndex(
                        (move) => move.ply === item.ply,
                      );

                      return (
                        <button
                          key={item.ply}
                          className={styles.mistakeItem}
                          onClick={() => goToMove(moveIndex)}
                          disabled={moveIndex < 0}
                        >
                          <div>
                            <strong>
                              {item.color === "w" ? "Trắng" : "Đen"} · {item.move}
                            </strong>
                            <small>
                              Nước đi số {item.ply} · CPL:{" "}
                              {item.centipawnLoss ?? "—"}
                            </small>
                          </div>
                          <span className={styles.moveAnalysisLabel}>
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "stockfish" && (
              <div className={styles.tabSection}>
                <h3>Phân tích Stockfish</h3>

                {currentAnalysis ? (
                  <div className={styles.stockfishContent}>
                    <div className={styles.stockfishSummary}>
                      <strong>{currentAnalysis.label}</strong>
                      <span>
                        Đánh giá:{" "}
                        {formatScore(
                          currentAnalysis.score,
                          currentAnalysis.scoreType,
                        )}
                      </span>
                      <span>Depth {currentAnalysis.depth}</span>
                    </div>

                    <div className={styles.analysisDetails}>
                      <div>
                        <small>Nước tốt nhất</small>
                        <strong>{currentAnalysis.bestMove}</strong>
                      </div>
                      <div>
                        <small>Centipawn loss</small>
                        <strong>
                          {currentAnalysis.centipawnLoss ?? "—"}
                        </strong>
                      </div>
                      <div>
                        <small>Nước đang xem</small>
                        <strong>{currentAnalysis.move}</strong>
                      </div>
                    </div>

                    {currentAnalysis.pv?.length > 0 && (
                      <div className={styles.variation}>
                        <small>Biến tốt nhất (UCI)</small>
                        <p>{currentAnalysis.pv.join(" ")}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    {selectedPly < 0
                      ? "Chọn một nước đi trên bàn cờ hoặc trong tab Nước đi."
                      : "Không có dữ liệu Stockfish cho nước đi này."}
                  </div>
                )}
              </div>
            )}

            {activeTab === "pgn" && (
              <div className={styles.tabSection}>
                <div className={styles.tabSectionHeading}>
                  <h3>Portable Game Notation</h3>
                  <button
                    className={styles.copyButton}
                    onClick={copyPgn}
                    disabled={!match.pgn}
                  >
                    Sao chép PGN
                  </button>
                </div>

                {copyMessage && (
                  <span className={styles.copyMessage}>
                    {copyMessage}
                  </span>
                )}

                <pre className={styles.pgnContent}>
                  {match.pgn || "Trận đấu chưa có PGN."}
                </pre>
              </div>
            )}
          </div>
        </aside>

      </section>
      <footer className={styles.footer}>
        <span>
          {match.mode === "RANKED" ? "Đấu xếp hạng" : "Đấu thường"}
        </span>
        <span>{formatDate(match.startedAt)}</span>
        <span>© 2026 CHESSVERSE</span>
      </footer>
    </main>
  );
}

export default function MatchDetailPage() {
  return (
    <Suspense fallback={<div>Đang tải thông tin trận đấu...</div>}>
      <MatchDetailContent />
    </Suspense>
  );
}
