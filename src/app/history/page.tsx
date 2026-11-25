"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import PlayerAvatar from "../components/PlayerAvatar";
import TierBadge from "../components/TierBadge";
import { getTier } from "../lib/rank";
import "./history.css";

type MatchResult = "WIN" | "LOSS" | "DRAW";
type MatchMode = "RANKED" | "CASUAL";

type Player = {
  id: string;
  username: string;
  displayName: string;
  avatarId: string | null;
  avatarFrame: string | null;
  elo: number;
};

type HistoryMatch = {
  id: string;
  mode: MatchMode;
  myResult: MatchResult;
  reason: string | null;
  myColor: "WHITE" | "BLACK";
  opponent: Player;
  myEloBefore: number | null;
  myEloChange: number;
  myEloAfter: number | null;
  opponentEloBefore: number | null;
  opponentEloChange: number;
  opponentEloAfter: number | null;
  durationSec: number | null;
  moveCount: number;
  startedAt: string;
  finishedAt: string | null;
};

type HistoryResponse = {
  total: number;
  page: number;
  pages: number;
  me: Player | null;
  matches: HistoryMatch[];
};

const PAGE_SIZE = 5;
const IMG = "/images/academy/history";

const RESULT_TEXT: Record<MatchResult, string> = { WIN: "Thắng", LOSS: "Thua", DRAW: "Hòa" };
const RESULT_KEY: Record<MatchResult, string> = { WIN: "win", LOSS: "loss", DRAW: "draw" };

const REASON_TEXT: Record<string, string> = {
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

const FILTERS: { id: "ALL" | MatchMode | "TEAM"; label: string; icon: string; soon?: boolean }[] = [
  { id: "ALL", label: "Tất cả", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  {
    id: "RANKED",
    label: "Đấu Hạng",
    icon: "M4 4l9 9M4 4v4M4 4h4M20 4l-9 9M20 4v4M20 4h-4M7 14l-3 3 3 3 3-3M17 14l3 3-3 3-3-3",
  },
  { id: "CASUAL", label: "Đấu Thường", icon: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" },
  {
    id: "TEAM",
    label: "Đấu Đội",
    icon: "M9 11a3 3 0 100-6 3 3 0 000 6zM17 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5.5",
    soon: true,
  },
];

function duration(sec: number | null) {
  if (sec === null) return "—";

  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");

  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function dateText(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function timeText(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eloDelta(m: HistoryMatch) {
  if (m.mode !== "RANKED") return "Giao hữu";
  if (m.myEloChange > 0) return `+${m.myEloChange}`;
  if (m.myEloChange < 0) return String(m.myEloChange);

  return "±0";
}

function ModeIcon({ mode }: { mode: MatchMode }) {
  return mode === "RANKED" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4l9 9M4 4v4M4 4h4M20 4l-9 9M20 4v4M20 4h-4M7 14l-3 3 3 3 3-3M17 14l3 3-3 3-3-3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "guest" | "error">("loading");
  const [mode, setMode] = useState<"ALL" | MatchMode>("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async (nextPage: number, nextMode: "ALL" | MatchMode) => {
    const qs = new URLSearchParams({ page: String(nextPage), size: String(PAGE_SIZE) });
    if (nextMode !== "ALL") qs.set("mode", nextMode);

    try {
      const response = await fetch(`/api/online/history?${qs}`, { cache: "no-store" });

      if (response.status === 401) {
        setState("guest");
        return;
      }

      if (!response.ok) throw new Error();

      const json = (await response.json()) as HistoryResponse;

      setData(json);
      setPage(json.page ?? 1);
      setSelectedId((current) =>
        json.matches.some((m) => m.id === current) ? current : json.matches[0]?.id ?? null,
      );
      setState("ok");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load(page, mode);
  }, [load, page, mode]);

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(""), 2200);
  }

  async function share(id: string) {
    const url = `${window.location.origin}/history/${id}`;

    try {
      await navigator.clipboard.writeText(url);
      flash("Đã sao chép liên kết ván đấu.");
    } catch {
      flash(url);
    }
  }

  return (
    <AcademyShell active="Lịch sử đấu">
      {(user) => {
        // Avatar + khung của bạn: lấy từ tài khoản đang đăng nhập (luôn mới nhất)
        const me = data?.me
          ? {
              ...data.me,
              avatarId: user?.avatarId ?? data.me.avatarId,
              avatarFrame: user?.avatarFrame ?? data.me.avatarFrame,
            }
          : user
            ? {
                id: "",
                username: "",
                displayName: user.displayName ?? "Bạn",
                avatarId: user.avatarId ?? null,
                avatarFrame: user.avatarFrame ?? null,
                elo: 0,
              }
            : null;
        const matches = data?.matches ?? [];
        const pages = data?.pages ?? 1;
        const selected = matches.find((m) => m.id === selectedId) ?? null;

        const myElo = (m: HistoryMatch) => m.myEloAfter ?? m.myEloBefore ?? me?.elo ?? 0;
        const oppElo = (m: HistoryMatch) => m.opponentEloAfter ?? m.opponentEloBefore ?? m.opponent.elo;

        const pageButtons = Array.from({ length: pages }, (_, i) => i + 1).filter(
          (n) => pages <= 5 || Math.abs(n - page) <= 2 || (page <= 3 && n <= 5) || (page >= pages - 2 && n > pages - 5),
        );

        return (
          <div className="hs-page">
            <header className="hs-head">
              <img src="/images/academy/practice/laurel-l.png" alt="" />
              <h1>Lịch Sử Đấu</h1>
              <img src="/images/academy/practice/laurel-r.png" alt="" />
            </header>

            <nav className="hs-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`${mode === f.id ? "on" : ""}${f.soon ? " soon" : ""}`}
                  onClick={() => {
                    if (f.soon) {
                      flash("Đấu Đội 2 vs 2 sắp ra mắt.");
                      return;
                    }

                    setMode(f.id as "ALL" | MatchMode);
                    setPage(1);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={f.icon} />
                  </svg>
                  {f.label}
                  {f.soon && <small>Sắp có</small>}
                </button>
              ))}

            </nav>

            {toast && <div className="hs-toast">{toast}</div>}

            {state === "loading" && <p className="hs-muted">Đang tải lịch sử đấu...</p>}

            {state === "guest" && (
              <div className="hs-empty">
                <p>Bạn cần đăng nhập để xem lịch sử đấu.</p>
                <button className="hs-gold" onClick={() => router.push("/")}>
                  Về trang chủ để đăng nhập
                </button>
              </div>
            )}

            {state === "error" && (
              <div className="hs-empty">
                <p>Không tải được lịch sử đấu.</p>
                <button className="hs-gold" onClick={() => load(page, mode)}>
                  Thử lại
                </button>
              </div>
            )}

            {state === "ok" && matches.length === 0 && (
              <div className="hs-empty">
                <p>{mode === "ALL" ? "Bạn chưa có ván đấu nào." : "Chưa có ván nào ở chế độ này."}</p>
                <button className="hs-gold" onClick={() => router.push("/practice")}>
                  Vào Đấu luyện
                </button>
              </div>
            )}

            {state === "ok" && matches.length > 0 && (
              <div className="hs-body">
                {/* ---------- DANH SÁCH ---------- */}
                <section className="hs-list">
                  <div className="hs-rows">
                    {matches.map((m) => {
                      const key = RESULT_KEY[m.myResult];
                      const mine = getTier(myElo(m));
                      const theirs = getTier(oppElo(m));

                      return (
                        <div
                          key={m.id}
                          role="button"
                          tabIndex={0}
                          className={`hs-row ${key}${selectedId === m.id ? " on" : ""}`}
                          onClick={() => setSelectedId(m.id)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(m.id)}
                        >
                          <div className="hs-res">
                            <img src={`${IMG}/ico-${key}.png`} alt="" />
                            <div>
                              <b>{RESULT_TEXT[m.myResult]}</b>
                              <span>{eloDelta(m)}</span>
                            </div>
                          </div>

                          <div className="hs-vs">
                            <div className="hs-side">
                              <PlayerAvatar
                                avatar={me?.avatarId}
                                frame={me?.avatarFrame}
                                name={me?.displayName ?? "B"}
                                className="hs-pa"
                              />
                              <TierBadge index={mine.index} text={false} className="hs-tb" />
                            </div>

                            <i>VS</i>

                            <div className="hs-side">
                              <PlayerAvatar
                                avatar={m.opponent.avatarId}
                                frame={m.opponent.avatarFrame}
                                name={m.opponent.displayName}
                                className="hs-pa"
                              />
                              <TierBadge index={theirs.index} text={false} className="hs-tb" />
                            </div>
                          </div>

                          <div className="hs-meta">
                            <span className="hs-opp" title={m.opponent.displayName}>
                              {m.opponent.displayName}
                            </span>
                            <span>
                              <ModeIcon mode={m.mode} />
                              {m.mode === "RANKED" ? "Đấu Hạng" : "Đấu Thường"}
                            </span>
                            <span>
                              <ClockIcon />
                              {duration(m.durationSec)}
                            </span>
                          </div>

                          <Link
                            href={`/history/${m.id}`}
                            className="hs-play"
                            aria-label="Xem lại ván đấu"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <PlayIcon />
                          </Link>
                        </div>
                      );
                    })}
                  </div>

                  {pages > 1 && (
                    <div className="hs-pager">
                      <button className="hs-arrow" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước">
                        ‹
                      </button>
                      <div className="hs-nums">
                        {pageButtons.map((n) => (
                          <button key={n} className={n === page ? "on" : ""} onClick={() => setPage(n)}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <button className="hs-arrow" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Trang sau">
                        ›
                      </button>
                    </div>
                  )}
                </section>

                {/* ---------- CHI TIẾT ---------- */}
                {selected && (
                  <aside className="hs-detail">
                    <div className={`hs-banner ${RESULT_KEY[selected.myResult]}`}>
                      <img src={`${IMG}/res-${RESULT_KEY[selected.myResult]}.png`} alt="" />
                      <b>{RESULT_TEXT[selected.myResult]}</b>
                    </div>

                    <div className="hs-duel">
                      <div>
                        <PlayerAvatar
                          avatar={me?.avatarId}
                          frame={me?.avatarFrame}
                          name={me?.displayName ?? "B"}
                          className="hs-big-pa"
                        />
                        <strong title={me?.displayName}>{me?.displayName ?? "Bạn"}</strong>
                        <span>{myElo(selected).toLocaleString("vi-VN")} Elo</span>
                      </div>

                      <i>VS</i>

                      <div>
                        <PlayerAvatar
                          avatar={selected.opponent.avatarId}
                          frame={selected.opponent.avatarFrame}
                          name={selected.opponent.displayName}
                          className="hs-big-pa"
                        />
                        <strong title={selected.opponent.displayName}>{selected.opponent.displayName}</strong>
                        <span>{oppElo(selected).toLocaleString("vi-VN")} Elo</span>
                      </div>
                    </div>

                    <ul className="hs-facts">
                      <li>
                        <ModeIcon mode={selected.mode} />
                        Chế độ
                        <b>{selected.mode === "RANKED" ? "Đấu Hạng" : "Đấu Thường"}</b>
                      </li>
                      <li>
                        <ClockIcon />
                        Thời gian
                        <b>{duration(selected.durationSec)}</b>
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="4" y="5" width="16" height="15" rx="2" />
                          <path d="M4 10h16M8 3v4M16 3v4" />
                        </svg>
                        Ngày đấu
                        <b>
                          {dateText(selected.finishedAt ?? selected.startedAt)}
                          <small> {timeText(selected.finishedAt ?? selected.startedAt)}</small>
                        </b>
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 20h12M8 20l1-5h6l1 5M9 15c-1-2-2-3-2-6a5 5 0 0110 0c0 3-1 4-2 6" />
                        </svg>
                        Kết thúc
                        <b>
                          {REASON_TEXT[selected.reason ?? ""] ?? "—"}
                          <small> · {Math.ceil(selected.moveCount / 2)} lượt</small>
                        </b>
                      </li>
                      <li>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M5 20V12M10 20V6M15 20v-9M20 20V4" />
                        </svg>
                        Biến động Elo
                        <b
                          className={
                            selected.mode !== "RANKED"
                              ? ""
                              : selected.myEloChange > 0
                                ? "up"
                                : selected.myEloChange < 0
                                  ? "down"
                                  : ""
                          }
                        >
                          {eloDelta(selected)}
                        </b>
                      </li>
                    </ul>

                    <div className="hs-detail-actions">
                      <Link href={`/history/${selected.id}`} className="hs-replay">
                        <PlayIcon />
                        Xem Lại Ván Đấu
                      </Link>
                      <button className="hs-share" onClick={() => share(selected.id)} aria-label="Chia sẻ">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="18" cy="5.5" r="2.5" />
                          <circle cx="6" cy="12" r="2.5" />
                          <circle cx="18" cy="18.5" r="2.5" />
                          <path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4" />
                        </svg>
                      </button>
                    </div>
                  </aside>
                )}
              </div>
            )}
          </div>
        );
      }}
    </AcademyShell>
  );
}
