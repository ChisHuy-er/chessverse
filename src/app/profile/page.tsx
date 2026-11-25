"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import { TIERS, getTier, tierLabel } from "../lib/rank";
import TierBadge from "../components/TierBadge";
import PlayerAvatar from "../components/PlayerAvatar";
import Flag, { countryName } from "../components/Flag";
import AppearanceEditor from "./AppearanceEditor";
import RenameBox from "./RenameBox";
import { USER_EVENT } from "../components/SettingsDialog";
import { APPEARANCE_EVENT, getCover, normalizeAppearance, type Appearance } from "../lib/appearance";
import "./appearance.css";

type ProfileData = {
  user: {
    id: string;
    displayName: string;
    username: string;
    elo: number;
    country?: string | null;
    createdAt: string;
  };
  stats: {
    total: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
  };
  rank: { position: number; totalPlayers: number };
  eloDelta: number;
  appearance?: Partial<Appearance>;
  recent: {
    id: string;
    mode: "RANKED" | "CASUAL";
    result: "WIN" | "LOSS" | "DRAW";
    opponent: string;
    opponentElo?: number | null;
    opponentAvatar?: string | null;
    opponentFrame?: string | null;
    opponentCountry?: string | null;
    eloChange: number;
    playedAt: string;
  }[];
};

const IMG = "/images/academy/pf";
const TIER_IMG = "/images/academy/tier";

// Chữ trong các ô vẽ bằng code → đổi ngôn ngữ chỉ cần đổi LANG.
const TEXT = {
  vi: { elo: "Elo Rating", rank: "Hạng hiện tại", win: "Tỷ lệ thắng", w: "Thắng", d: "Hòa", l: "Thua", recent: "Trận đấu gần đây", achv: "Thành tích & Huy hiệu", all: "Xem tất cả", none: "Bạn chưa có trận đấu nào.", ranked: "Xếp hạng", casual: "Giao hữu" },
  en: { elo: "Elo Rating", rank: "Current rank", win: "Win rate", w: "Wins", d: "Draws", l: "Losses", recent: "Recent matches", achv: "Achievements & Badges", all: "View all", none: "You have no matches yet.", ranked: "Ranked", casual: "Casual" },
} as const;
const LANG: keyof typeof TEXT = "vi";
const TX = TEXT[LANG];

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);

const TAG = { WIN: "tag-win", LOSS: "tag-loss", DRAW: "tag-draw" } as const;

// "2 phút trước", "3 giờ trước", "5 ngày trước"
function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);

  if (s < 60) return "Vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} ngày trước`;

  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const RESULT_ICON = {
  WIN: <path d="M7 4h10v4a5 5 0 01-10 0V4zM7 6H4v1.5A3.5 3.5 0 007.3 11M17 6h3v1.5A3.5 3.5 0 0116.7 11M12 13v4M8.5 20h7M10 17h4" />,
  LOSS: <path d="M7 4h10v4a5 5 0 01-10 0V4zM7 6H4v1.5A3.5 3.5 0 007.3 11M17 6h3v1.5A3.5 3.5 0 0116.7 11M12 13v4M8.5 20h7M10 17h4" />,
  DRAW: <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" />,
} as const;

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [state, setState] = useState<"loading" | "guest" | "error" | "ok">("loading");
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch("/api/online/profile", { cache: "no-store" });

        if (response.status === 401) {
          if (alive) setState("guest");
          return;
        }

        if (!response.ok) throw new Error("bad response");

        const json = (await response.json()) as ProfileData;

        if (alive) {
          setData(json);
          setState("ok");
        }

        // Tài khoản chưa có quốc gia: tự nhận diện theo múi giờ / ngôn ngữ máy
        if (!json.user.country) {
          const res = await fetch("/api/online/profile/country", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              locale: navigator.language,
            }),
          }).catch(() => null);
          const got = res?.ok ? ((await res.json()) as { country?: string | null }) : null;

          if (alive && got?.country) {
            setData((d) => (d ? { ...d, user: { ...d.user, country: got.country } } : d));
          }
        }
      } catch {
        if (alive) setState("error");
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <AcademyShell active="Hồ sơ">
      {() => {
        if (state !== "ok" || !data) {
          return (
            <div className="pf-page">
              <img className="pf-title" src={`${IMG}/title.png`} alt="Hồ sơ" />
              <div className="ac-panel pf-message">
                {state === "loading" && <p>Đang tải hồ sơ...</p>}
                {state === "error" && <p>Không thể tải hồ sơ. Vui lòng thử lại sau.</p>}
                {state === "guest" && (
                  <>
                    <p>Bạn cần đăng nhập để xem hồ sơ.</p>
                    <button className="ac-gold-button" onClick={() => router.push("/")}>
                      Về trang chủ để đăng nhập
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        }

        const { user, stats, rank, eloDelta, recent } = data;

        // Tỷ lệ thắng tự tính từ số ván Thắng / Hòa / Thua
        const games = stats.wins + stats.draws + stats.losses;
        const winRate = games ? Math.round((stats.wins / games) * 1000) / 10 : 0;
        const look = normalizeAppearance(data.appearance);
        const tier = getTier(user.elo);

        const achievements = [
          { key: "star", title: "Ván đầu tiên", ok: stats.total >= 1 },
          { key: "swords", title: "Chiến thắng đầu tiên", ok: stats.wins >= 1 },
          { key: "book", title: "Chăm chỉ: chơi 10 ván", ok: stats.total >= 10 },
          { key: "rook", title: "Vững như tường: thắng 10 ván", ok: stats.wins >= 10 },
          { key: "trophy", title: `Đạt ${TIERS[3].name} (${TIERS[3].min} Elo)`, ok: user.elo >= TIERS[3].min },
          { key: "crown", title: "Lọt top 3 toàn cầu", ok: stats.total >= 1 && rank.position <= 3 },
        ];

        return (
          <div className="pf-page">
            <img className="pf-title" src={`${IMG}/title.png`} alt="Hồ sơ" />

            <div className="pf-body">
              <div className="pf-main">
                <section
                  className="pf-cover"
                  style={{ backgroundImage: `url(${getCover(look.cover).src})` }}
                >
                  <div className="pf-avatar pf-avatar-custom">
                    <PlayerAvatar avatar={look.avatar} frame={look.frame} name={user.displayName} />
                  </div>

                  <button className="pf-edit" onClick={() => setEditing(true)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
                    </svg>
                    Tùy chỉnh
                  </button>

                  <div className="pf-who">
                    <div className="pf-name">
                      <h2>{user.displayName}</h2>
                      <Flag code={user.country} className="pf-flag" />
                      <button
                        className="pf-rename"
                        aria-label="Đổi tên hiển thị"
                        title="Đổi tên hiển thị"
                        onClick={() => setRenaming(true)}
                      >
                        <img src="/images/academy/club/i-pencil.png" alt="" />
                      </button>
                    </div>
                    <p className="pf-handle">
                      <span>@{user.username}</span>
                      {user.country && (
                        <span className="pf-country">
                          <Flag code={user.country} />
                          {countryName(user.country)}
                        </span>
                      )}
                    </p>

                    <div className="pf-progress">
                      <div className="pf-bar">
                        <b style={{ width: `${Math.round(tier.progress * 100)}%` }} />
                      </div>
                      <small>
                        {tier.nextName
                          ? `Còn ${tier.toNext} Elo để lên ${tier.nextName}`
                          : "Bạn đã đạt hạng cao nhất!"}
                      </small>
                    </div>
                  </div>
                </section>

                <div className="pf-stats">
                  <div className="pf-card pf-elo">
                    <span className="pf-ttl">{TX.elo}</span>
                    <img className="pf-knight" src={`${IMG}/icon-knight.png`} alt="" />
                    <strong>{user.elo.toLocaleString("en-US")}</strong>
                    <em className={eloDelta < 0 ? "down" : eloDelta > 0 ? "up" : ""}>
                      {eloDelta > 0 ? "▲ +" : eloDelta < 0 ? "▼ " : "• "}
                      {eloDelta}
                    </em>
                  </div>

                  <div className="pf-card pf-rank">
                    <span className="pf-ttl">
                      <img src={`${IMG}/icon-crown.png`} alt="" />
                      {TX.rank}
                    </span>
                    <TierBadge index={tier.index} text={false} />
                    <strong>{tier.name}</strong>
                  </div>

                  <div className="pf-card pf-win">
                    <span className="pf-ttl">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="13.5" r="8" />
                        <path d="M12 9.5v4.4l2.8 1.6M9.5 2.5h5M12 2.5v3M19 6l1.4-1.4" />
                      </svg>
                      {TX.win}
                    </span>
                    <div className="pf-ring" style={{ ["--p" as string]: winRate } as React.CSSProperties}>
                      <span>{winRate}%</span>
                      <small>
                        ({stats.wins} / {games})
                      </small>
                    </div>
                  </div>

                  <div className="pf-card pf-wld">
                    <div className="pf-row r1">
                      <img src={`${IMG}/icon-win.png`} alt="" />
                      <span>{TX.w}</span>
                      <b className="w">{stats.wins}</b>
                    </div>
                    <div className="pf-row r2">
                      <img src={`${IMG}/icon-draw.png`} alt="" />
                      <span>{TX.d}</span>
                      <b className="d">{stats.draws}</b>
                    </div>
                    <div className="pf-row r3">
                      <img src={`${IMG}/icon-loss.png`} alt="" />
                      <span>{TX.l}</span>
                      <b className="l">{stats.losses}</b>
                    </div>
                  </div>
                </div>

                <div className="pf-lists">
                  <div className="pf-card pf-recent">
                    <span className="pf-ttl pf-head">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5.2l3.4 2" />
                      </svg>
                      {TX.recent}
                    </span>
                    <Link href="/history" className="pf-all">
                      {TX.all}
                      <ArrowIcon />
                    </Link>

                    {recent.length === 0 && (
                      <p className="pf-empty">{TX.none}</p>
                    )}

                    <div className="pf-mlist">
                      {recent.map((match, i) => (
                        <div className="pf-match" key={match.id} style={{ ["--i" as string]: i } as React.CSSProperties}>
                          <PlayerAvatar
                            avatar={match.opponentAvatar}
                            frame={match.opponentFrame}
                            name={match.opponent}
                            className="pf-m-av"
                          />
                          <div className="pf-opp">
                            <b>
                              <Flag code={match.opponentCountry} />
                              <span>{match.opponent}</span>
                            </b>
                            <small>Elo {match.opponentElo != null ? match.opponentElo.toLocaleString("vi-VN") : "—"}</small>
                          </div>
                          <span className={`pf-tag ${TAG[match.result]}`}>
                            <svg viewBox="0 0 24 24" aria-hidden="true">{RESULT_ICON[match.result]}</svg>
                            {match.result === "WIN" ? TX.w : match.result === "LOSS" ? TX.l : TX.d}
                          </span>
                          <span className={`pf-delta ${match.eloChange > 0 ? "up" : match.eloChange < 0 ? "down" : ""}`}>
                            {match.mode === "RANKED" ? `${match.eloChange > 0 ? "+" : ""}${match.eloChange}` : "—"}
                          </span>
                          <span className="pf-mode">
                            <b>
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                {match.mode === "RANKED" ? <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /> : <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" />}
                              </svg>
                              {match.mode === "RANKED" ? TX.ranked : TX.casual}
                            </b>
                            <small>{timeAgo(match.playedAt)}</small>
                          </span>
                          <Link href={`/history/${match.id}`} className="pf-play" aria-label="Xem lại ván đấu">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11l8.5-5.5L9 6.5Z" /></svg>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pf-card pf-achv">
                    <span className="pf-ttl pf-head">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="4" y="5" width="16" height="15" rx="2.5" />
                        <path d="M8 3v4M16 3v4M9 13l2.2 2.2L15.5 11" />
                      </svg>
                      {TX.achv}
                    </span>
                    <Link href="/history" className="pf-all">
                      {TX.all}
                      <ArrowIcon />
                    </Link>
                    {achievements.map((a, i) => (
                      <img
                        key={a.key}
                        className={`pf-badge b${i}${a.ok ? "" : " locked"}`}
                        src={`${IMG}/b-${a.key}.png`}
                        alt={a.title}
                        title={`${a.title}${a.ok ? "" : " (chưa đạt)"}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <aside className="pf-side">
                <section className="ac-panel pf-global">
                  <img src={`${IMG}/crown.png`} alt="" />
                  <div>
                    <small>Hạng toàn cầu</small>
                    <strong>#{rank.position}</strong>
                    <p>trong {rank.totalPlayers.toLocaleString("en-US")} người chơi</p>
                  </div>
                </section>

                <section className="ac-panel pf-ladder">
                  <h3>Các cấp hạng</h3>
                  {TIERS.map((t, i) => {
                    const next = TIERS[i + 1];

                    return (
                      <div className={`pf-tier${t.index === tier.index ? " on" : ""}`} key={t.name}>
                        <TierBadge index={t.index} text={false} />
                        <span>
                          <b>{tierLabel(t).name}</b>
                          <small>
                            {t.min.toLocaleString("en-US")}
                            {next ? `–${(next.min - 1).toLocaleString("en-US")}` : "+"} Elo
                          </small>
                        </span>
                      </div>
                    );
                  })}
                </section>
              </aside>
            </div>

            {renaming && (
              <RenameBox
                current={user.displayName}
                onClose={() => setRenaming(false)}
                onSaved={(name) => {
                  setData({ ...data, user: { ...data.user, displayName: name } });
                  setRenaming(false);
                  window.dispatchEvent(new CustomEvent(USER_EVENT, { detail: { displayName: name } }));
                }}
              />
            )}

            {editing && (
              <AppearanceEditor
                initial={look}
                name={user.displayName}
                onClose={() => setEditing(false)}
                onSaved={(value) => {
                  setData({ ...data, appearance: value });
                  setEditing(false);
                  window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: value }));
                }}
              />
            )}
          </div>
        );
      }}
    </AcademyShell>
  );
}
