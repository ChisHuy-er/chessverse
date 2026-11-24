
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./history.module.css";

type MatchResult = "WIN" | "LOSS" | "DRAW";
type MatchMode = "RANKED" | "CASUAL";

type HistoryMatch = {
  id: string;
  mode: MatchMode;
  result: string | null;
  myResult: MatchResult;
  reason: string | null;
  myColor: "WHITE" | "BLACK";
  opponent: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  myEloBefore: number | null;
  myEloChange: number;
  myEloAfter: number | null;
  opponentEloBefore: number | null;
  opponentEloChange: number;
  opponentEloAfter: number | null;
  startedAt: string;
  finishedAt: string | null;
};

type HistoryResponse = {
  message?: string;
  total: number;
  matches: HistoryMatch[];
};

const resultLabels: Record<MatchResult, string> = {
  WIN: "Chiến thắng",
  LOSS: "Thất bại",
  DRAW: "Hòa",
};

const reasonLabels: Record<string, string> = {
  CHECKMATE: "Chiếu hết",
  RESIGN: "Đối thủ đầu hàng",
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

export default function HistoryPage() {
  const [matches, setMatches] = useState<HistoryMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modeFilter, setModeFilter] = useState<
    "ALL" | MatchMode
  >("ALL");
  const [resultFilter, setResultFilter] = useState<
    "ALL" | MatchResult
  >("ALL");

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/online/history", {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Không thể tải lịch sử đấu.",
          );
        }

        if (active) {
          const history = data as HistoryResponse;
          setMatches(
            Array.isArray(history.matches) ? history.matches : [],
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Đã xảy ra lỗi khi tải lịch sử.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const wins = matches.filter(
      (match) => match.myResult === "WIN",
    ).length;

    const losses = matches.filter(
      (match) => match.myResult === "LOSS",
    ).length;

    const draws = matches.filter(
      (match) => match.myResult === "DRAW",
    ).length;

    const total = matches.length;

    return {
      total,
      wins,
      losses,
      draws,
      winRate: total > 0
        ? Math.round((wins / total) * 100)
        : 0,
    };
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      const matchMode = modeFilter === "ALL" ||
        match.mode === modeFilter;

      const matchResult = resultFilter === "ALL" ||
        match.myResult === resultFilter;

      return matchMode && matchResult;
    });
  }, [matches, modeFilter, resultFilter]);

  const currentElo = matches[0]?.myEloAfter ?? null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            CHESSVERSE / PLAYER
          </div>
          <h1>Lịch sử đấu</h1>
          <p>
            Theo dõi hành trình thi đấu và những thay đổi Elo
            của bạn.
          </p>
        </div>

        <Link href="/" className={styles.backButton}>
          ← Dashboard
        </Link>
      </header>

      {error && (
        <div className={styles.error}>
          {error}
          {error.includes("đăng nhập") && (
            <span> Vui lòng quay lại Dashboard và đăng nhập.</span>
          )}
        </div>
      )}

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span>TỔNG SỐ TRẬN</span>
          <strong>{loading ? "—" : stats.total}</strong>
          <small>Trận đã hoàn thành</small>
        </article>

        <article className={styles.statCard}>
          <span>CHIẾN THẮNG</span>
          <strong className={styles.win}>
            {loading ? "—" : stats.wins}
          </strong>
          <small>Trận thắng</small>
        </article>

        <article className={styles.statCard}>
          <span>THẤT BẠI</span>
          <strong className={styles.loss}>
            {loading ? "—" : stats.losses}
          </strong>
          <small>Trận thua</small>
        </article>

        <article className={styles.statCard}>
          <span>TỶ LỆ THẮNG</span>
          <strong>
            {loading ? "—" : `${stats.winRate}%`}
          </strong>
          <small>
            {loading ? "Đang tải..." : `${stats.draws} trận hòa`}
          </small>
        </article>
      </section>

      <section className={styles.eloPanel}>
        <div>
          <span className={styles.eyebrow}>CURRENT RATING</span>
          <h2>{loading ? "—" : formatElo(currentElo)}</h2>
          <p>Elo gần nhất được ghi nhận trong lịch sử đấu</p>
        </div>
        <div className={styles.eloIcon}>♛</div>
      </section>

      <section className={styles.historyPanel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>MATCH RECORDS</span>
            <h2>Các trận đấu gần đây</h2>
          </div>
          <span className={styles.matchCount}>
            {loading ? "..." : `${filteredMatches.length} trận`}
          </span>
        </div>

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <span>Chế độ</span>
            <select
              value={modeFilter}
              onChange={(event) =>
                setModeFilter(event.target.value as
                  "ALL" | MatchMode)
              }
            >
              <option value="ALL">Tất cả</option>
              <option value="RANKED">Đấu xếp hạng</option>
              <option value="CASUAL">Đấu thường</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <span>Kết quả</span>
            <select
              value={resultFilter}
              onChange={(event) =>
                setResultFilter(event.target.value as
                  "ALL" | MatchResult)
              }
            >
              <option value="ALL">Tất cả</option>
              <option value="WIN">Chiến thắng</option>
              <option value="LOSS">Thất bại</option>
              <option value="DRAW">Hòa</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className={styles.empty}>
            Đang tải lịch sử đấu...
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className={styles.empty}>
            {matches.length === 0
              ? "Bạn chưa có trận đấu nào được lưu."
              : "Không tìm thấy trận đấu phù hợp với bộ lọc."}
          </div>
        ) : (
          <div className={styles.matchList}>
            {filteredMatches.map((match) => {
              const resultClass =
                match.myResult === "WIN"
                  ? styles.winBadge
                  : match.myResult === "LOSS"
                    ? styles.lossBadge
                    : styles.drawBadge;

              const eloChange = match.myEloChange;
              const eloClass =
                eloChange > 0
                  ? styles.win
                  : eloChange < 0
                    ? styles.loss
                    : "";

              return (
                <article
                  className={styles.matchRow}
                  key={match.id}
                >
                  <div className={styles.opponent}>
                    <div className={styles.avatar}>
                      {match.opponent.displayName
                        ?.charAt(0)
                        .toUpperCase() || "?"}
                    </div>
                    <div>
                      <strong>
                        {match.opponent.displayName}
                      </strong>
                      <small>
                        @{match.opponent.username}
                      </small>
                    </div>
                  </div>

                  <div className={styles.matchInfo}>
                    <span className={resultClass}>
                      {resultLabels[match.myResult]}
                    </span>
                    <small>
                      {match.mode === "RANKED"
                        ? "Đấu xếp hạng"
                        : "Đấu thường"}
                      {" · "}
                      {match.myColor === "WHITE"
                        ? "Quân trắng"
                        : "Quân đen"}
                    </small>
                  </div>

                  <div className={styles.eloChange}>
                    <strong className={eloClass}>
                      {eloChange > 0 ? "+" : ""}
                      {eloChange}
                    </strong>
                    <small>
                      {formatElo(match.myEloBefore)}
                      {" → "}
                      {formatElo(match.myEloAfter)}
                    </small>
                  </div>
        
          <div className={styles.matchDate}>
            <div className={styles.matchDateInfo}>
              <strong>
                {match.finishedAt
                  ? formatDate(match.finishedAt)
                  : formatDate(match.startedAt)}
              </strong>

              <small>
                {match.reason
                  ? reasonLabels[match.reason] || match.reason
                  : "Đã hoàn thành"}
              </small>
            </div>

            <Link
              href={`/history/${match.id}`}
              className={styles.detailLink}
            >
              Xem trận
            </Link>
          </div>
         </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        © 2026 CHESSVERSE · THE NEXT MOVE
      </footer>
    </main>
  );
}
