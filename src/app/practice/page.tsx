"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import AuthModal, { type UserProfile } from "../components/AuthModal";
import OnlineMatchOverlay from "../components/OnlineMatchOverlay";
import TierBadge from "../components/TierBadge";
import type { OnlineMode } from "../components/online/types";
import { getTier } from "../lib/rank";
import "./practice.css";

const IMG = "/images/academy/practice";

// Đổi thành true khi trang /play (đấu với máy) đã có lại trong dự án.
const AI_READY = false;

type ModeId = "ranked" | "casual" | "ai" | "friend" | "tournament";

type ProfileData = {
  user: { displayName: string; elo: number };
  stats: { total: number; wins: number; losses: number; draws: number; winRate: number };
  rank: { position: number; totalPlayers: number };
};

// Chữ vẽ bằng code → đổi ngôn ngữ chỉ cần đổi LANG.
const TEXT = {
  vi: {
    title: "Đấu Luyện",
    sub: "Thi đấu, rèn luyện kỹ năng và nâng cao Elo.",
    play: "Vào trận",
    soon: "Sắp ra mắt",
    elo: "Elo hiện tại",
    toNext: (n: number, name: string) => `Còn ${n} Elo để lên ${name}`,
    top: "Hạng cao nhất!",
    winRate: "Tỷ lệ thắng",
    games: "Số ván đã chơi",
    global: "Xếp hạng toàn cầu",
    w: "Thắng",
    d: "Hòa",
    l: "Thua",
    guestTitle: "Bạn chưa đăng nhập",
    guestText: "Đăng nhập để thi đấu, lưu Elo và theo dõi tiến bộ.",
    login: "Đăng nhập",
    needLogin: "Bạn cần đăng nhập để bắt đầu trận đấu.",
    soonNotice: (name: string) => `Chế độ "${name}" đang được phát triển, sẽ sớm ra mắt!`,
    modes: {
      ranked: { name: "Đấu xếp hạng", desc: "Ghép trận nhanh, thắng thua tính Elo.", tag: "± Elo" },
      casual: { name: "Đấu thường", desc: "Thi đấu có đồng hồ, không ảnh hưởng Elo.", tag: "Giao hữu" },
      ai: { name: "Đấu với máy", desc: "Luyện tập cùng Stockfish theo nhiều cấp độ.", tag: "Luyện tập" },
      friend: { name: "Đấu với bạn", desc: "Tạo phòng riêng và mời bạn bè cùng chơi.", tag: "Phòng riêng" },
      tournament: { name: "Giải đấu", desc: "Tranh tài theo mùa, nhận cúp và phần thưởng.", tag: "Mùa giải" },
    },
    links: {
      stats: "Thống kê",
      history: "Lịch sử đấu",
      quests: "Nhiệm vụ",
      replay: "Xem lại ván",
      courses: "Khóa học",
    },
  },
  en: {
    title: "Battle Arena",
    sub: "Compete, sharpen your skills and climb the Elo ladder.",
    play: "Play",
    soon: "Coming soon",
    elo: "Current Elo",
    toNext: (n: number, name: string) => `${n} Elo to ${name}`,
    top: "Top tier reached!",
    winRate: "Win rate",
    games: "Games played",
    global: "Global ranking",
    w: "Wins",
    d: "Draws",
    l: "Losses",
    guestTitle: "You are not signed in",
    guestText: "Sign in to play, save your Elo and track progress.",
    login: "Sign in",
    needLogin: "Please sign in to start a match.",
    soonNotice: (name: string) => `"${name}" is in development — coming soon!`,
    modes: {
      ranked: { name: "Ranked", desc: "Fast matchmaking, Elo on the line.", tag: "± Elo" },
      casual: { name: "Casual", desc: "Timed games without Elo changes.", tag: "Friendly" },
      ai: { name: "Vs Computer", desc: "Train against Stockfish at any level.", tag: "Training" },
      friend: { name: "Play a Friend", desc: "Create a private room and invite friends.", tag: "Private" },
      tournament: { name: "Tournaments", desc: "Seasonal events with trophies and rewards.", tag: "Season" },
    },
    links: {
      stats: "Statistics",
      history: "Match history",
      quests: "Quests",
      replay: "Replays",
      courses: "Courses",
    },
  },
} as const;
const LANG: keyof typeof TEXT = "vi";
const TX = TEXT[LANG];

const MODES: { id: ModeId; art: string; icon: string; accent: string; ready: boolean }[] = [
  { id: "ranked", art: "mode-ranked", icon: "icon-lightning", accent: "#5aa8ff", ready: true },
  { id: "casual", art: "mode-casual", icon: "icon-stopwatch", accent: "#f0c35a", ready: true },
  { id: "ai", art: "mode-ai", icon: "icon-target", accent: "#6fc3ff", ready: AI_READY },
  { id: "friend", art: "mode-friend", icon: "icon-handshake", accent: "#8fb6ff", ready: false },
  { id: "tournament", art: "mode-tournament", icon: "icon-trophy", accent: "#ffcf5a", ready: false },
];

const LINKS: { key: keyof typeof TX.links; icon: string; href: string | null }[] = [
  { key: "stats", icon: "icon-stats", href: "/profile" },
  { key: "history", icon: "icon-swords", href: "/history" },
  { key: "quests", icon: "icon-clipboard", href: null },
  { key: "replay", icon: "icon-video", href: "/history" },
  { key: "courses", icon: "icon-book", href: "/courses" },
];

export default function PracticePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, setPending] = useState<ModeId | null>(null);
  const [online, setOnline] = useState<OnlineMode | null>(null);
  const [notice, setNotice] = useState("");

  async function loadProfile() {
    try {
      const response = await fetch("/api/online/profile", { cache: "no-store" });

      if (response.status === 401) {
        setLoggedIn(false);
        return;
      }

      if (!response.ok) throw new Error("bad response");

      setProfile((await response.json()) as ProfileData);
      setLoggedIn(true);
    } catch {
      // Backend lỗi: vẫn cho vào trang, chỉ thiếu số liệu.
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  function launch(id: ModeId) {
    const mode = MODES.find((m) => m.id === id)!;

    if (!mode.ready) {
      setNotice(TX.soonNotice(TX.modes[id].name));
      return;
    }

    if (loggedIn === false) {
      setPending(id);
      setNotice(TX.needLogin);
      setAuthOpen(true);
      return;
    }

    setNotice("");

    if (id === "ranked" || id === "casual") setOnline(id);
    else if (id === "ai") router.push("/play");
  }

  function handleAuthSuccess(user: UserProfile) {
    setAuthOpen(false);
    setLoggedIn(true);
    setProfile((current) =>
      current ?? {
        user: { displayName: user.displayName, elo: user.elo },
        stats: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
        rank: { position: 0, totalPlayers: 0 },
      },
    );
    loadProfile();

    if (pending) {
      const id = pending;

      setPending(null);
      setNotice("");

      if (id === "ranked" || id === "casual") setOnline(id);
      else if (id === "ai") router.push("/play");
    }
  }

  return (
    <AcademyShell active="Đấu luyện">
      {(shellUser) => {
        const elo = profile?.user.elo ?? shellUser?.elo ?? null;
        const tier = elo !== null ? getTier(elo, LANG) : null;
        const stats = profile?.stats;
        const rank = profile?.rank;
        const topPercent =
          rank && rank.totalPlayers > 0
            ? Math.max(1, Math.round((rank.position / rank.totalPlayers) * 100))
            : null;

        return (
          <div className="pb-page">
            <div className="pb-main">
              <section className="pb-hero">
                <div className="pb-hero-title">
                  <img src={`${IMG}/laurel-l.png`} alt="" />
                  <h1>{TX.title}</h1>
                  <img src={`${IMG}/laurel-r.png`} alt="" />
                </div>
                <p>{TX.sub}</p>
              </section>

              {notice && (
                <div className="ac-notice pb-notice">
                  <span>ⓘ</span>
                  <p>{notice}</p>
                  <button onClick={() => setNotice("")}>×</button>
                </div>
              )}

              <div className="pb-modes">
                {MODES.map((mode, i) => {
                  const t = TX.modes[mode.id];

                  return (
                    <article
                      key={mode.id}
                      className={`pb-mode${mode.ready ? "" : " soon"}`}
                      style={{ "--i": i, "--accent": mode.accent } as CSSProperties}
                      onClick={() => launch(mode.id)}
                    >
                      <div className="pb-art">
                        <img src={`${IMG}/${mode.art}.png`} alt="" />
                        <span className="pb-tag">{mode.ready ? t.tag : TX.soon}</span>
                      </div>

                      <div className="pb-mode-body">
                        <h2>
                          <img src={`${IMG}/${mode.icon}.png`} alt="" />
                          {t.name}
                        </h2>
                        <p>{t.desc}</p>
                      </div>

                      <button
                        className="pb-play"
                        disabled={!mode.ready}
                        aria-label={`${TX.play}: ${t.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          launch(mode.id);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
                        </svg>
                        <span>{mode.ready ? TX.play : TX.soon}</span>
                      </button>
                    </article>
                  );
                })}
              </div>

              <nav className="pb-dock">
                {LINKS.map((link) => (
                  <button
                    key={link.key}
                    onClick={() =>
                      link.href
                        ? router.push(link.href)
                        : setNotice(TX.soonNotice(TX.links[link.key]))
                    }
                  >
                    <img src={`${IMG}/${link.icon}.png`} alt="" />
                    <span>{TX.links[link.key]}</span>
                  </button>
                ))}
              </nav>
            </div>

            <aside className="pb-side">
              {loggedIn === false && !shellUser ? (
                <div className="pb-guest">
                  <TierBadge index={1} text={false} className="pb-badge" />
                  <h3>{TX.guestTitle}</h3>
                  <p>{TX.guestText}</p>
                  <button className="pb-login" onClick={() => setAuthOpen(true)}>
                    {TX.login}
                  </button>
                </div>
              ) : (
                <>
                  <div className="pb-emblem">
                    {tier ? <TierBadge index={tier.index} lang={LANG} className="pb-badge" /> : <span className="pb-badge-ph" />}
                  </div>

                  <div className="pb-tierbar">
                    <div className="pb-bar">
                      <b style={{ width: `${Math.round((tier?.progress ?? 0) * 100)}%` }} />
                    </div>
                    <small>
                      {tier
                        ? tier.nextName
                          ? TX.toNext(tier.toNext, tier.nextName)
                          : TX.top
                        : "…"}
                    </small>
                  </div>

                  <div className="pb-elo">
                    <span>{TX.elo}</span>
                    <div>
                      <img src={`${IMG}/laurel-l.png`} alt="" />
                      <strong>{elo !== null ? elo.toLocaleString("en-US") : "—"}</strong>
                      <img src={`${IMG}/laurel-r.png`} alt="" />
                    </div>
                  </div>

                  <ul className="pb-stats">
                    <li>
                      <img src={`${IMG}/icon-target.png`} alt="" />
                      <div>
                        <span>
                          {TX.winRate}
                          <b>{stats ? `${stats.winRate}%` : "—"}</b>
                        </span>
                        <div className="pb-bar">
                          <b style={{ width: `${stats?.winRate ?? 0}%` }} />
                        </div>
                      </div>
                    </li>
                    <li>
                      <img src={`${IMG}/icon-pawn.png`} alt="" />
                      <div>
                        <span>
                          {TX.games}
                          <b>{stats ? stats.total : "—"}</b>
                        </span>
                        <div className="pb-bar">
                          {/* Thanh đầy dần đến mốc 100 ván */}
                          <b style={{ width: `${Math.min(100, stats?.total ?? 0)}%` }} />
                        </div>
                      </div>
                    </li>
                    <li>
                      <img src={`${IMG}/icon-crown.png`} alt="" />
                      <div>
                        <span>
                          {TX.global}
                          <b>{rank && rank.position > 0 ? `#${rank.position}` : "—"}</b>
                        </span>
                        <div className="pb-bar">
                          <b style={{ width: `${topPercent ? 101 - topPercent : 0}%` }} />
                        </div>
                      </div>
                    </li>
                  </ul>

                  <div className="pb-wld">
                    <div className="w">
                      <strong>{stats?.wins ?? "—"}</strong>
                      <small>{TX.w}</small>
                    </div>
                    <div className="d">
                      <strong>{stats?.draws ?? "—"}</strong>
                      <small>{TX.d}</small>
                    </div>
                    <div className="l">
                      <strong>{stats?.losses ?? "—"}</strong>
                      <small>{TX.l}</small>
                    </div>
                  </div>
                </>
              )}
            </aside>

            <AuthModal
              open={authOpen}
              initialMode="login"
              onClose={() => {
                setAuthOpen(false);
                setPending(null);
              }}
              onSuccess={handleAuthSuccess}
            />

            {online && (
              <OnlineMatchOverlay
                mode={online}
                onClose={() => {
                  setOnline(null);
                  loadProfile();
                }}
              />
            )}
          </div>
        );
      }}
    </AcademyShell>
  );
}
