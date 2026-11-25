"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Chess, type Square } from "chess.js";
import PlayerAvatar from "../../components/PlayerAvatar";
import { BOARD_THEMES, fetchWallet, pieceSkinPath } from "../../lib/shop";
import { useBoardView } from "../../lib/boardView";
import "./review.css";

// ---------------------------------------------------------------------------
// Kiểu dữ liệu từ /api/online/history/:id
// ---------------------------------------------------------------------------

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
};

type Player = {
  id: string;
  username: string;
  displayName: string;
  avatarId?: string | null;
  avatarFrame?: string | null;
  elo?: number;
};

type EloInfo = { before: number | null; change: number; after: number | null };

type MatchDetail = {
  id: string;
  mode: "RANKED" | "CASUAL";
  result: string | null;
  myResult: "WIN" | "LOSS" | "DRAW";
  reason: string | null;
  myColor: "WHITE" | "BLACK";
  players: { white: Player; black: Player };
  elo: { white: EloInfo; black: EloInfo };
  pgn: string | null;
  finalFen: string | null;
  moves: MatchMove[];
  analysis: MatchAnalysis[] | null;
  startedAt: string;
  finishedAt: string | null;
};

// ---------------------------------------------------------------------------
// Phân loại nước đi (theo kiểu chess.com)
// ---------------------------------------------------------------------------

type Cls = "brilliant" | "great" | "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder" | "none";

const CLS: Record<Exclude<Cls, "none">, { label: string; icon: string; color: string }> = {
  brilliant: { label: "Brilliant", icon: "!!", color: "#26c2a3" },
  great: { label: "Tuyệt vời", icon: "!", color: "#749bbf" },
  best: { label: "Tốt nhất", icon: "★", color: "#81b64c" },
  excellent: { label: "Rất tốt", icon: "👍", color: "#96bc4b" },
  good: { label: "Tốt", icon: "✓", color: "#96af8b" },
  inaccuracy: { label: "Thiếu chính xác", icon: "?!", color: "#f7c631" },
  mistake: { label: "Sai lầm", icon: "?", color: "#e58f2a" },
  blunder: { label: "Sai lầm nghiêm trọng", icon: "??", color: "#ca3431" },
};

const CLS_ORDER = Object.keys(CLS) as Exclude<Cls, "none">[];

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PIECE_CHAR: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟︎",
};

const REASON: Record<string, string> = {
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

// Điểm (centipawn) theo góc nhìn người đi; chiếu hết quy về ±10000
function toCp(a: MatchAnalysis | undefined): number | null {
  if (!a || a.score === null || a.scoreType === null) return null;
  if (a.scoreType === "mate") return Math.sign(a.score || 1) * (10000 - Math.abs(a.score) * 10);

  return a.score;
}

// Xác suất thắng (%) từ centipawn — công thức Lichess
function winPct(cp: number) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-2000, Math.min(2000, cp)))) - 1);
}

// Nước đi có thí quân không (để xét Brilliant)
function isSacrifice(move: MatchMove) {
  try {
    const before = new Chess(move.beforeFen);
    const played = before.move({ from: move.from, to: move.to, promotion: "q" });
    const movedValue = PIECE_VALUE[played.piece];
    const gained = played.captured ? PIECE_VALUE[played.captured] : 0;

    if (played.piece === "p" || played.piece === "k" || movedValue - gained < 2) return false;

    const after = new Chess(move.afterFen);
    const takers = after
      .moves({ verbose: true })
      .filter((m) => m.to === move.to && m.captured)
      .map((m) => PIECE_VALUE[m.piece]);

    if (takers.length === 0) return false;

    const defended = after.isAttacked(move.to as Square, move.color);

    return Math.min(...takers) < movedValue || !defended;
  } catch {
    return false;
  }
}

function formatEval(cp: number | null) {
  if (cp === null) return "—";
  if (Math.abs(cp) >= 9000) return `${cp > 0 ? "" : "-"}M${Math.max(1, Math.round((10000 - Math.abs(cp)) / 10))}`;

  return `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(1)}`;
}

function uciToSan(fen: string, uci: string) {
  try {
    const g = new Chess(fen);
    return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" }).san;
  } catch {
    return uci;
  }
}

function dateText(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ClsIcon({ cls, size = 20 }: { cls: Cls; size?: number }) {
  if (cls === "none") return null;

  const c = CLS[cls];

  return (
    <span className="rv-cls" style={{ background: c.color, width: size, height: size, fontSize: size * 0.55 }} title={c.label}>
      {c.icon}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mũi tên trên bàn cờ (đơn vị = ô, gốc ở góc trên trái)
// ---------------------------------------------------------------------------

function Arrow({ from, to, flipped, color }: { from: string; to: string; flipped: boolean; color: string }) {
  const pos = (sq: string) => {
    const f = sq.charCodeAt(0) - 97;
    const r = Number(sq[1]) - 1;

    return flipped ? { x: 7 - f + 0.5, y: r + 0.5 } : { x: f + 0.5, y: 7 - r + 0.5 };
  };

  const a = pos(from);
  const b = pos(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // Mã đi hình chữ L: gãy góc một lần
  const knight = Math.abs(dx) * Math.abs(dy) === 2;
  const points = knight
    ? Math.abs(dx) > Math.abs(dy)
      ? [a, { x: b.x, y: a.y }, b]
      : [a, { x: a.x, y: b.y }, b]
    : [a, b];

  const last = points[points.length - 2];
  const ang = Math.atan2(b.y - last.y, b.x - last.x);
  const head = 0.42;
  const tip = { x: b.x - Math.cos(ang) * 0.12, y: b.y - Math.sin(ang) * 0.12 };
  const base = { x: tip.x - Math.cos(ang) * head, y: tip.y - Math.sin(ang) * head };
  const side = 0.24;
  const left = { x: base.x + Math.cos(ang + Math.PI / 2) * side, y: base.y + Math.sin(ang + Math.PI / 2) * side };
  const right = { x: base.x - Math.cos(ang + Math.PI / 2) * side, y: base.y - Math.sin(ang + Math.PI / 2) * side };
  const shaft = [...points.slice(0, -1), base].map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <g opacity={0.82}>
      <polyline points={shaft} fill="none" stroke={color} strokeWidth={0.2} strokeLinejoin="round" />
      <polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`} fill={color} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Trang
// ---------------------------------------------------------------------------

function ReviewContent() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [error, setError] = useState("");
  const [ply, setPly] = useState(0); // 0 = thế cờ ban đầu, n = sau nước thứ n
  const [playing, setPlaying] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [showBest, setShowBest] = useState(true);
  const [skin, setSkin] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState(BOARD_THEMES.classic);
  const [copied, setCopied] = useState("");
  const [view, setView] = useBoardView();

  useEffect(() => {
    fetchWallet().then((w) => {
      setSkin(pieceSkinPath(w?.pieceSet));
      if (w?.boardTheme && BOARD_THEMES[w.boardTheme]) setTheme(BOARD_THEMES[w.boardTheme]);
    });
  }, []);

  useEffect(() => {
    let active = true;

    fetch(`/api/online/history/${encodeURIComponent(matchId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.match) throw new Error(data.message || "Không thể tải ván đấu.");
        if (!active) return;

        const m = data.match as MatchDetail;

        setMatch(m);
        setFlipped(m.myColor === "BLACK");
        setPly(m.moves?.length ?? 0);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "Không thể tải ván đấu."));

    return () => {
      active = false;
    };
  }, [matchId]);

  const moves = useMemo(() => match?.moves ?? [], [match]);

  // Phân tích theo ply + phân loại + độ chính xác từng nước
  const review = useMemo(() => {
    const byPly = new Map((match?.analysis ?? []).map((a) => [a.ply, a]));

    const rows = moves.map((move, i) => {
      const a = byPly.get(move.ply);
      const beforeCp = toCp(a);
      const next = byPly.get(moves[i + 1]?.ply ?? -1);
      const nextCp = toCp(next);

      // Điểm sau nước đi (góc nhìn người đi)
      const afterCp =
        nextCp !== null ? -nextCp : beforeCp !== null && a?.centipawnLoss != null ? beforeCp - a.centipawnLoss : null;

      // Điểm theo góc nhìn quân Trắng (cho thanh đánh giá và biểu đồ)
      const whiteAfter = afterCp === null ? null : move.color === "w" ? afterCp : -afterCp;

      let accuracy: number | null = null;

      if (beforeCp !== null && afterCp !== null) {
        const drop = Math.max(0, winPct(beforeCp) - winPct(afterCp));
        accuracy = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
      }

      let cls: Cls = "none";
      const label = a?.label ?? "";

      if (label === "Best") cls = "best";
      else if (label === "Excellent") cls = "excellent";
      else if (label === "Good") cls = "good";
      else if (label === "Inaccuracy") cls = "inaccuracy";
      else if (label === "Mistake") cls = "mistake";
      else if (label === "Blunder") cls = "blunder";

      return { move, a, beforeCp, afterCp, whiteAfter, accuracy, cls };
    });

    // Nâng cấp: Brilliant (thí quân đúng) và Tuyệt vời (trừng phạt sai lầm của đối thủ)
    rows.forEach((row, i) => {
      if (row.cls !== "best") return;

      const prev = rows[i - 1];

      if (isSacrifice(row.move) && (row.afterCp ?? -1) >= -50) row.cls = "brilliant";
      else if (prev && (prev.cls === "mistake" || prev.cls === "blunder")) row.cls = "great";
    });

    const side = (color: "w" | "b") => {
      const own = rows.filter((r) => r.move.color === color);
      const scored = own.filter((r) => r.accuracy !== null);
      const counts = Object.fromEntries(CLS_ORDER.map((k) => [k, own.filter((r) => r.cls === k).length])) as Record<
        Exclude<Cls, "none">,
        number
      >;

      return {
        accuracy: scored.length ? scored.reduce((s, r) => s + (r.accuracy ?? 0), 0) / scored.length : null,
        counts,
      };
    };

    return { rows, white: side("w"), black: side("b"), analysed: byPly.size > 0 };
  }, [match, moves]);

  const go = useCallback(
    (n: number) => {
      setPlaying(false);
      setPly(Math.max(0, Math.min(moves.length, n)));
    },
    [moves.length],
  );

  // Phím ← → để chuyển nước
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") go(ply - 1);
      if (e.key === "ArrowRight") go(ply + 1);
      if (e.key === "Home") go(0);
      if (e.key === "End") go(moves.length);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, ply, moves.length]);

  // Tự phát
  useEffect(() => {
    if (!playing) return;

    if (ply >= moves.length) {
      setPlaying(false);
      return;
    }

    const t = setTimeout(() => setPly((p) => p + 1), 900);
    return () => clearTimeout(t);
  }, [playing, ply, moves.length]);

  if (error) {
    return (
      <main className="rv-page">
        <Link href="/history" className="rv-back">
          ← Lịch sử đấu
        </Link>
        <div className="rv-msg">{error}</div>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="rv-page">
        <div className="rv-msg">Đang tải ván đấu...</div>
      </main>
    );
  }

  const current = ply > 0 ? review.rows[ply - 1] : null;
  const fen = ply > 0 ? moves[ply - 1].afterFen : moves[0]?.beforeFen ?? match.finalFen ?? new Chess().fen();
  const board = new Chess(fen).board();

  // Nước tốt nhất cho thế cờ trước nước vừa đi (để so sánh)
  const bestUci = current?.a?.bestMove ?? "";
  const playedIsBest = !!current && current.move.uci === bestUci;
  const bestSan = current && bestUci ? uciToSan(current.move.beforeFen, bestUci) : "";

  // Thanh đánh giá: điểm Trắng tại thế cờ đang xem
  const evalWhite = ply === 0 ? 0 : current?.whiteAfter ?? null;
  const whiteShare = evalWhite === null ? 50 : Math.max(4, Math.min(96, winPct(evalWhite)));

  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];

  const topColor: "white" | "black" = flipped ? "white" : "black";
  const bottomColor: "white" | "black" = flipped ? "black" : "white";

  const playerStrip = (color: "white" | "black") => {
    const p = match.players[color];
    const elo = match.elo[color];
    const won = (color === "white" && match.result === "WHITE_WIN") || (color === "black" && match.result === "BLACK_WIN");

    return (
      <div className="rv-strip">
        <PlayerAvatar avatar={p.avatarId} frame={p.avatarFrame} name={p.displayName} className="rv-pa" />
        <div>
          <b>{p.displayName}</b>
          <span>
            {elo.before ?? p.elo ?? "—"}
            {match.mode === "RANKED" && elo.change !== 0 && (
              <em className={elo.change > 0 ? "up" : "down"}>
                {" "}
                ({elo.change > 0 ? "+" : ""}
                {elo.change})
              </em>
            )}
          </span>
        </div>
        {won && <i className="rv-win">Thắng</i>}
      </div>
    );
  };

  // Biểu đồ đánh giá
  const graph = review.rows.map((r) => r.whiteAfter);
  const gW = 600;
  const gH = 90;
  const gy = (cp: number | null) => gH - (winPct(cp ?? 0) / 100) * gH;
  const gx = (i: number) => (graph.length <= 1 ? 0 : (i / (graph.length - 1)) * gW);
  const areaPath = graph.length
    ? `M0,${gH} ` + graph.map((cp, i) => `L${gx(i)},${gy(cp)}`).join(" ") + ` L${gW},${gH} Z`
    : "";

  const resultText =
    match.result === "DRAW" ? "Hòa" : match.result === "WHITE_WIN" ? "Trắng thắng" : match.result === "BLACK_WIN" ? "Đen thắng" : "—";

  const pairs: { no: number; w?: number; b?: number }[] = [];
  moves.forEach((m, i) => {
    if (m.color === "w" || pairs.length === 0) pairs.push({ no: pairs.length + 1, [m.color]: i + 1 });
    else pairs[pairs.length - 1].b = i + 1;
  });

  async function copyPgn() {
    if (!match?.pgn) return;

    try {
      await navigator.clipboard.writeText(match.pgn);
      setCopied("Đã sao chép PGN");
    } catch {
      setCopied("Không sao chép được");
    }

    setTimeout(() => setCopied(""), 1800);
  }

  return (
    <main className="rv-page">
      <div className="rv-wrap">
      <header className="rv-top">
        <Link href="/history" className="rv-back">
          ← Lịch sử đấu
        </Link>
        <div className="rv-title">
          <img src="/images/academy/practice/laurel-l.png" alt="" />
          <h1>Xem Lại Ván Đấu</h1>
          <img src="/images/academy/practice/laurel-r.png" alt="" />
        </div>
      </header>

      <div className="rv-layout">
        {/* ---------- CỘT TRÁI: THÔNG TIN + TỔNG QUAN ---------- */}
        <aside className="rv-left">
          <section className="rv-card">
            <h2>Thông tin ván đấu</h2>
            <ul className="rv-info">
              <li>
                Chế độ<b>{match.mode === "RANKED" ? "Đấu Hạng" : "Đấu Thường"}</b>
              </li>
              <li>
                Kết quả<b>{resultText}</b>
              </li>
              <li>
                Kết thúc<b>{match.reason ? REASON[match.reason] ?? match.reason : "—"}</b>
              </li>
              <li>
                Số lượt<b>{Math.ceil(moves.length / 2)}</b>
              </li>
              <li>
                Ngày đấu<b>{dateText(match.finishedAt ?? match.startedAt)}</b>
              </li>
            </ul>
          </section>

          {/* Tổng quan */}
          <section className="rv-card">
            <h2>Tổng quan ván đấu</h2>

            {!review.analysed ? (
              <p className="rv-muted">Ván này chưa có dữ liệu phân tích.</p>
            ) : (
              <>
                <div className="rv-acc">
                  <div>
                    <small>{match.players.white.displayName}</small>
                    <b className="w">{review.white.accuracy === null ? "—" : review.white.accuracy.toFixed(1)}</b>
                  </div>
                  <span>Độ chính xác</span>
                  <div>
                    <small>{match.players.black.displayName}</small>
                    <b className="b">{review.black.accuracy === null ? "—" : review.black.accuracy.toFixed(1)}</b>
                  </div>
                </div>

                <table className="rv-counts">
                  <tbody>
                    {CLS_ORDER.map((k) => (
                      <tr key={k} style={{ color: CLS[k].color }}>
                        <td className="n">{review.white.counts[k]}</td>
                        <td className="l">
                          <ClsIcon cls={k} size={18} />
                          {CLS[k].label}
                        </td>
                        <td className="n">{review.black.counts[k]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </aside>

        {/* ---------- BÀN CỜ ---------- */}
        <section className="rv-board-col">
          {playerStrip(topColor)}

          <div className="rv-board-row">
            <div className="rv-evalbar" title={formatEval(evalWhite)}>
              <div className={`rv-eval-fill${flipped ? " flipped" : ""}`} style={{ height: `${whiteShare}%` }} />
              <span className={`rv-eval-num ${(evalWhite ?? 0) >= 0 ? "w" : "b"}${flipped ? " flipped" : ""}`}>
                {formatEval(evalWhite).replace("+", "")}
              </span>
            </div>

            <div className={`rv-frame${view === "3d" ? " v3d" : ""}`}>
            <div className="rv-ranks" aria-hidden="true">
              {ranks.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </div>
            <div className="rv-files" aria-hidden="true">
              {files.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
            <div className="rv-board">
              {ranks.map((rank) =>
                files.map((file) => {
                  const sq = `${file}${rank}`;
                  const piece = board[8 - rank][file.charCodeAt(0) - 97];
                  const dark = (file.charCodeAt(0) - 97 + rank) % 2 === 1;
                  const isFrom = current?.move.from === sq;
                  const isTo = current?.move.to === sq;
                  const tint = current && current.cls !== "none" ? CLS[current.cls].color : "#f6f669";

                  return (
                    <div
                      key={sq}
                      className="rv-sq"
                      style={{
                        backgroundColor: dark ? theme.dark : theme.light,
                        ...(theme.texture
                          ? {
                              backgroundImage: `url(${dark ? theme.texture.dark : theme.texture.light})`,
                              backgroundSize: "100% 100%",
                            }
                          : {}),
                      }}
                    >
                      {(isFrom || isTo) && <span className="rv-hl" style={{ background: tint }} />}
                      {piece && (
                        <span className={`rv-piece ${piece.color}`}>
                          {skin ? (
                            <img src={`${skin}/${piece.color}${piece.type.toUpperCase()}.webp`} alt="" draggable={false} />
                          ) : (
                            PIECE_CHAR[`${piece.color}${piece.type.toUpperCase()}`]
                          )}
                        </span>
                      )}
                      {isTo && current && <span className="rv-badge"><ClsIcon cls={current.cls} size={22} /></span>}
                    </div>
                  );
                }),
              )}

              <svg className="rv-arrows" viewBox="0 0 8 8" aria-hidden="true">
                {showBest && current && bestUci && !playedIsBest && (
                  <Arrow from={bestUci.slice(0, 2)} to={bestUci.slice(2, 4)} flipped={flipped} color="#81b64c" />
                )}
              </svg>
            </div>
            </div>
          </div>

          {playerStrip(bottomColor)}

          <div className="rv-controls">
            <button onClick={() => go(0)} aria-label="Về đầu">⏮</button>
            <button onClick={() => go(ply - 1)} aria-label="Nước trước">◀</button>
            <button
              className="main"
              onClick={() => {
                if (ply >= moves.length) setPly(0);
                setPlaying((p) => !p);
              }}
              aria-label={playing ? "Tạm dừng" : "Tự phát"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button onClick={() => go(ply + 1)} aria-label="Nước sau">▶</button>
            <button onClick={() => go(moves.length)} aria-label="Về cuối">⏭</button>
            <span className="rv-sep" />
            <button onClick={() => setFlipped((f) => !f)} title="Xoay bàn cờ" aria-label="Xoay bàn cờ">⇅</button>
            <button
              className={showBest ? "on" : ""}
              onClick={() => setShowBest((s) => !s)}
              title="Hiện mũi tên nước tốt nhất"
              aria-label="Hiện mũi tên nước tốt nhất"
            >
              ➚
            </button>
            <button
              className="rv-view"
              onClick={() => setView(view === "3d" ? "2d" : "3d")}
              title="Đổi kiểu bàn cờ 2D / 3D"
            >
              {view === "3d" ? "2D" : "3D"}
            </button>
          </div>

        </section>

        {/* ---------- BẢNG BÊN PHẢI ---------- */}
        <aside className="rv-side">
          {/* Nước đang xem */}
          <section className="rv-card rv-now">
            {current ? (
              <>
                <div className="rv-now-head">
                  <ClsIcon cls={current.cls} size={26} />
                  <p>
                    <b>{current.move.san}</b>{" "}
                    {current.cls === "none" ? "chưa được đánh giá" : `là nước ${CLS[current.cls].label.toLowerCase()}`}
                  </p>
                  <span className="rv-eval-chip">{formatEval(current.whiteAfter)}</span>
                </div>

                {!playedIsBest && bestSan && (
                  <p className="rv-best">
                    Nước tốt nhất: <b>{bestSan}</b>
                    {!showBest && (
                      <button onClick={() => setShowBest(true)}>Hiện mũi tên</button>
                    )}
                  </p>
                )}
              </>
            ) : (
              <p className="rv-muted">Thế cờ ban đầu. Bấm ▶ hoặc phím → để xem từng nước.</p>
            )}
          </section>

          {/* Danh sách nước đi */}
          <section className="rv-card rv-moves-card">
            <div className="rv-moves">
              {pairs.map((p) => (
                <div className="rv-move-row" key={p.no}>
                  <span className="no">{p.no}.</span>
                  {[p.w, p.b].map((idx, k) =>
                    idx ? (
                      <button key={k} className={ply === idx ? "on" : ""} onClick={() => go(idx)}>
                        <ClsIcon cls={review.rows[idx - 1].cls} size={15} />
                        {moves[idx - 1].san}
                      </button>
                    ) : (
                      <span key={k} />
                    ),
                  )}
                </div>
              ))}
            </div>
          </section>


          {/* Biểu đồ đánh giá */}
          {review.analysed && (
            <section className="rv-card rv-graph-card">
              <svg
                className="rv-graph"
                viewBox={`0 0 ${gW} ${gH}`}
                preserveAspectRatio="none"
                onClick={(e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  const i = Math.round(((e.clientX - box.left) / box.width) * (graph.length - 1));
                  go(i + 1);
                }}
              >
                <rect width={gW} height={gH} fill="#2b2b33" />
                <path d={areaPath} fill="#e9e9ee" />
                <line x1="0" y1={gH / 2} x2={gW} y2={gH / 2} stroke="#888" strokeWidth="1" strokeDasharray="4 4" />
                {review.rows.map((r, i) =>
                  ["blunder", "mistake", "brilliant", "great"].includes(r.cls) ? (
                    <circle key={i} cx={gx(i)} cy={gy(r.whiteAfter)} r="4" fill={CLS[r.cls as Exclude<Cls, "none">].color} />
                  ) : null,
                )}
                {ply > 0 && <line x1={gx(ply - 1)} y1="0" x2={gx(ply - 1)} y2={gH} stroke="#81b64c" strokeWidth="2" />}
              </svg>
            </section>
          )}

          <div className="rv-actions">
            <button onClick={copyPgn} disabled={!match.pgn}>
              {copied || "Sao chép PGN"}
            </button>
          </div>
        </aside>
      </div>
      </div>
    </main>
  );
}

export default function MatchReviewPage() {
  return (
    <Suspense fallback={<main className="rv-page"><div className="rv-msg">Đang tải...</div></main>}>
      <ReviewContent />
    </Suspense>
  );
}
