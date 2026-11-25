"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import LessonBoard from "../courses/[id]/LessonBoard";
import { fetchWallet, pieceSkinPath } from "../lib/shop";
import { movesFrom, parsePosition, type Marks } from "../lib/lessons";
import "../courses/[id]/lesson.css";
import "./challenges.css";

// ===================== Kiểu dữ liệu từ máy chủ =====================

type Reward = { coins: number; gems: number; exp: number };

type Quest = {
  id: string;
  scope: "daily" | "weekly" | "achievement" | "event";
  title: string;
  icon: IconName;
  link: string;
  target: number;
  progress: number;
  reward: Reward;
  claimed: boolean;
  locked: boolean;
};

type Puzzle = { id: string; index: number; fen: string; stars: number; solved: boolean; attempts: number };

type Chapter = {
  id: string;
  title: string;
  sub: string;
  unlocked: boolean;
  stars: number;
  maxStars: number;
  puzzles: Puzzle[];
  chests: { at: number; coins: number; gems: number; claimed: boolean }[];
};

type Overview = {
  today: string;
  wallet: { coins: number; gems: number } | null;
  quests: Quest[];
  streak: { days: number; reward: { coins: number; gems: number }; claimable: boolean; claimed: boolean };
  pass: {
    season: string;
    title: string;
    exp: number;
    level: number;
    levelExp: number;
    expPerLevel: number;
    premium: boolean;
    levels: { level: number; free: { coins: number; gems: number; chest: boolean }; reached: boolean; claimed: boolean }[];
  };
  map: { chapters: Chapter[] };
  event: { id: string; title: string; start: string; end: string; state: "upcoming" | "active" | "ended" };
};

type Tab = "path" | "pass" | "map" | "event";
type QuestTab = "daily" | "weekly" | "achievement" | "event";

// ===================== Biểu tượng =====================

type IconName = "swords" | "puzzle" | "crown" | "book" | "trophy" | "star" | "calendar" | "gift";

const ICON_PATHS: Record<IconName | "lock" | "check" | "arrow" | "map" | "pass" | "route" | "snow" | "play", ReactNode> = {
  swords: <path d="m4 4 9 9M4 4v3M4 4h3M20 4l-9 9M20 4v3M20 4h-3M8 14l-3 3 2 2 3-3M16 14l3 3-2 2-3-3" />,
  puzzle: <path d="M9 3h4v2.5a1.5 1.5 0 1 0 3 0V3h3v6h-2.5a1.5 1.5 0 1 0 0 3H19v7h-6v-2.5a1.5 1.5 0 1 0-3 0V19H5v-6h2.5a1.5 1.5 0 1 0 0-3H5V3h4Z" />,
  crown: <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8ZM5 21h14" />,
  book: <path d="M3 5.5c3-1.4 6-1.4 9 0v14c-3-1.4-6-1.4-9 0v-14Zm9 0c3-1.4 6-1.4 9 0v14c-3-1.4-6-1.4-9 0" />,
  trophy: <path d="M7 4h10v4a5 5 0 01-10 0V4zM7 6H4v1.5A3.5 3.5 0 007.3 11M17 6h3v1.5A3.5 3.5 0 0116.7 11M12 13v4M8.5 20h7M10 17h4" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  calendar: <path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3v3H8z" />,
  gift: <path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5-1s5 1 5 1Zm0 0c2-4 6-3 5-1s-5 1-5 1Z" />,
  lock: <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  arrow: <path d="m9 6 6 6-6 6" />,
  map: <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14" />,
  pass: <path d="M4 5h16v14H4zM8 5v14M12 9h5M12 13h5" />,
  route: <path d="M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a3 3 0 0 1 3-3h4M18 9v6a3 3 0 0 1-3 3h-4" />,
  snow: <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />,
  play: <path d="M8 5v14l11-7L8 5Z" />,
};

function Icon({ name, className = "" }: { name: keyof typeof ICON_PATHS; className?: string }) {
  return (
    <svg className={`ch-ico ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

const GEM = "/images/academy/shop/gem.svg";
const COIN = "/images/academy/shop/coin.svg";

// Rương báu vẽ bằng SVG
function Chest({ open = false, tone = "blue", className = "" }: { open?: boolean; tone?: "blue" | "gold"; className?: string }) {
  const body = tone === "gold" ? ["#ffd86b", "#b9771a"] : ["#3f7bff", "#13308c"];

  return (
    <svg className={`ch-chest${open ? " open" : ""} ${className}`} viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <linearGradient id={`cb-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={body[0]} />
          <stop offset="1" stopColor={body[1]} />
        </linearGradient>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset="1" stopColor="#d99a1c" />
        </linearGradient>
        <radialGradient id="cl">
          <stop offset="0" stopColor="#fff6c8" stopOpacity=".95" />
          <stop offset="1" stopColor="#ffd86b" stopOpacity="0" />
        </radialGradient>
      </defs>
      {open && <ellipse cx="60" cy="40" rx="50" ry="34" fill="url(#cl)" />}
      <ellipse cx="60" cy="92" rx="48" ry="6" fill="#000" opacity=".35" />
      <rect x="14" y="44" width="92" height="46" rx="6" fill={`url(#cb-${tone})`} stroke="url(#cg)" strokeWidth="4" />
      <path
        d={open ? "M16 40 30 8h60l14 32Z" : "M14 46c0-20 14-32 46-32s46 12 46 32Z"}
        fill={`url(#cb-${tone})`}
        stroke="url(#cg)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <rect x="52" y={open ? 10 : 14} width="16" height={open ? 30 : 32} fill="url(#cg)" />
      <rect x="52" y="44" width="16" height="46" fill="url(#cg)" />
      <rect x="49" y="48" width="22" height="18" rx="3" fill="#7a4a06" stroke="url(#cg)" strokeWidth="3" />
      <circle cx="60" cy="57" r="3" fill="#ffe08a" />
      {open && (
        <g fill="#8fd8ff" stroke="#e9fbff" strokeWidth="1">
          <path d="m38 34 6-8 6 8-6 6Z" />
          <path d="m66 30 7-9 7 9-7 7Z" />
          <path d="m56 38 4-5 4 5-4 4Z" />
        </g>
      )}
    </svg>
  );
}

function Stars({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className="ch-stars">
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < n ? "on" : ""} aria-hidden="true">
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
        </svg>
      ))}
    </span>
  );
}

function RewardChips({ coins, gems, exp }: { coins: number; gems: number; exp?: number }) {
  return (
    <span className="ch-rewards">
      {coins > 0 && (
        <span className="ch-rw">
          <img src={COIN} alt="xu" />
          <b>+{coins.toLocaleString("en-US")}</b>
        </span>
      )}
      {gems > 0 && (
        <span className="ch-rw">
          <img src={GEM} alt="kim cương" />
          <b>+{gems.toLocaleString("en-US")}</b>
        </span>
      )}
      {!!exp && (
        <span className="ch-rw exp">
          <i>EXP</i>
          <b>+{exp}</b>
        </span>
      )}
    </span>
  );
}

const TABS: { id: Tab; label: string; icon: keyof typeof ICON_PATHS }[] = [
  { id: "path", label: "Lộ Trình", icon: "route" },
  { id: "pass", label: "Thẻ Thử Thách", icon: "pass" },
  { id: "map", label: "Bản Đồ", icon: "map" },
  { id: "event", label: "Sự Kiện", icon: "gift" },
];

const QUEST_TABS: { id: QuestTab; label: string }[] = [
  { id: "daily", label: "Hàng ngày" },
  { id: "weekly", label: "Hàng tuần" },
  { id: "achievement", label: "Thành tựu" },
  { id: "event", label: "Sự kiện" },
];

const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// Vị trí 5 bài trên bản đồ (theo % khung)
const NODE_POS = [
  { x: 14, y: 70 },
  { x: 33, y: 42 },
  { x: 52, y: 64 },
  { x: 70, y: 34 },
  { x: 88, y: 52 },
];

// ===================== Trang =====================

export default function ChallengesPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "guest" | "error" | "ok">("loading");
  const [tab, setTab] = useState<Tab>("path");
  const [questTab, setQuestTab] = useState<QuestTab>("daily");
  const [eventTab, setEventTab] = useState<"quests" | "rewards" | "shop">("quests");
  const [chapterId, setChapterId] = useState("c1");
  const [passStart, setPassStart] = useState(0);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ text: string; reward?: { coins: number; gems: number } } | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [skin, setSkin] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/challenges", { cache: "no-store" });

      if (res.status === 401) {
        setState("guest");
        return;
      }
      if (!res.ok) throw new Error();

      const json = (await res.json()) as Overview;

      setData(json);
      setState("ok");
      return json;
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);

    load().then((json) => {
      if (!json) return;
      // Chọn sẵn chương đang làm dở, cấp thẻ gần cấp hiện tại
      const ch = json.map.chapters.filter((c) => c.unlocked).pop();
      if (ch) setChapterId(ch.id);
      setPassStart(Math.max(0, Math.min(json.pass.levels.length - 8, json.pass.level - 3)));
    });
    fetchWallet().then((w) => setSkin(pieceSkinPath(w?.pieceSet)));
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  async function claim(body: Record<string, unknown>, key: string) {
    setBusy(key);

    try {
      const res = await fetch("/api/challenges/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json?.message || "Không nhận được phần thưởng");

      setToast({ text: "Đã nhận phần thưởng!", reward: json.reward });
      window.dispatchEvent(new Event("cv-wallet"));
      await load();
    } catch (e) {
      setToast({ text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  return (
    <AcademyShell active="Thử thách">
      {() => (
        <div className="ch-page">
          <header className="ch-head">
            <div className="ch-title">
              <h1>
                <img src="/images/academy/practice/laurel-l.png" alt="" />
                <span>Thử Thách</span>
                <img src="/images/academy/practice/laurel-r.png" alt="" />
              </h1>
              <p>Hoàn thành nhiệm vụ để nhận phần thưởng và nâng cấp kỹ năng cờ vua.</p>
            </div>
          </header>

          <nav className="ch-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} />
                {t.label}
              </button>
            ))}
          </nav>

          {state !== "ok" || !data ? (
            <div className="ch-panel ch-msg">
              {state === "loading" && <p>Đang tải thử thách...</p>}
              {state === "error" && <p>Không tải được thử thách. Hãy kiểm tra backend rồi thử lại.</p>}
              {state === "guest" && (
                <>
                  <p>Đăng nhập để nhận nhiệm vụ và phần thưởng.</p>
                  <button className="ch-gold" onClick={() => router.push("/")}>Về trang chủ để đăng nhập</button>
                </>
              )}
            </div>
          ) : (
            <>
              {tab === "path" && <PathView data={data} questTab={questTab} setQuestTab={setQuestTab} busy={busy} claim={claim} router={router} />}
              {tab === "pass" && <PassView data={data} start={passStart} setStart={setPassStart} busy={busy} claim={claim} />}
              {tab === "map" && (
                <MapView data={data} chapterId={chapterId} setChapterId={setChapterId} busy={busy} claim={claim} open={setPuzzle} />
              )}
              {tab === "event" && (
                <EventView data={data} eventTab={eventTab} setEventTab={setEventTab} busy={busy} claim={claim} router={router} />
              )}
            </>
          )}

          {puzzle && data && (
            <PuzzleModal
              puzzle={puzzle}
              chapter={data.map.chapters.find((c) => c.puzzles.some((p) => p.id === puzzle.id))!}
              skin={skin}
              onClose={() => setPuzzle(null)}
              onSolved={async () => {
                const json = await load();
                return json?.map.chapters.flatMap((c) => c.puzzles).find((p) => p.id === puzzle.id) ?? null;
              }}
              onNext={(next) => setPuzzle(next)}
            />
          )}

          {toast && (
            <div className="ch-toast" role="status">
              <b>{toast.text}</b>
              {toast.reward && <RewardChips coins={toast.reward.coins} gems={toast.reward.gems} />}
            </div>
          )}
        </div>
      )}
    </AcademyShell>
  );
}

// ===================== Dòng nhiệm vụ =====================

type ClaimFn = (body: Record<string, unknown>, key: string) => Promise<void>;
type Router = ReturnType<typeof useRouter>;

function QuestRow({ q, busy, claim, router }: { q: Quest; busy: string; claim: ClaimFn; router: Router }) {
  const done = q.progress >= q.target;
  const pct = Math.round((q.progress / q.target) * 100);

  return (
    <div className={`ch-quest${q.claimed ? " claimed" : ""}${done && !q.claimed ? " ready" : ""}`}>
      <span className="ch-q-icon">
        <Icon name={q.icon} />
      </span>
      <div className="ch-q-main">
        <b>{q.title}</b>
        <div className="ch-q-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="ch-q-count">
        {q.target >= 1000 ? `${q.progress.toLocaleString("en-US")}` : `${q.progress} / ${q.target}`}
      </span>
      <RewardChips coins={q.reward.coins} gems={q.reward.gems} />
      {q.claimed ? (
        <span className="ch-q-done">
          <Icon name="check" />
          Đã nhận
        </span>
      ) : q.locked ? (
        <span className="ch-q-done locked">
          <Icon name="lock" />
          Chưa mở
        </span>
      ) : done ? (
        <button className="ch-gold sm" disabled={busy === q.id} onClick={() => claim({ kind: "quest", id: q.id }, q.id)}>
          <Icon name="gift" />
          Nhận
        </button>
      ) : (
        <button className="ch-go" onClick={() => router.push(q.link)}>
          Đến ngay
          <Icon name="arrow" />
        </button>
      )}
    </div>
  );
}

// ===================== 1. Lộ trình =====================

function PathView({
  data,
  questTab,
  setQuestTab,
  busy,
  claim,
  router,
}: {
  data: Overview;
  questTab: QuestTab;
  setQuestTab: (t: QuestTab) => void;
  busy: string;
  claim: ClaimFn;
  router: Router;
}) {
  const list = data.quests.filter((q) => q.scope === questTab);
  const ready = (s: QuestTab) => data.quests.some((q) => q.scope === s && !q.claimed && !q.locked && q.progress >= q.target);
  const days = data.streak.days;
  const shown = Math.min(7, days % 7 === 0 && days > 0 ? 7 : days % 7);

  return (
    <div className="ch-path">
      <section className="ch-panel ch-quests">
        <div className="ch-subtabs">
          {QUEST_TABS.map((t) => (
            <button key={t.id} className={questTab === t.id ? "on" : ""} onClick={() => setQuestTab(t.id)}>
              {t.label}
              {ready(t.id) && <i className="ch-dot" />}
            </button>
          ))}
        </div>

        {questTab === "event" && data.event.state !== "active" && (
          <p className="ch-note">
            {data.event.state === "upcoming"
              ? `Sự kiện Giáng Sinh bắt đầu từ ${ddmm(data.event.start)}. Nhiệm vụ sẽ mở khi sự kiện diễn ra.`
              : "Sự kiện đã kết thúc."}
          </p>
        )}

        <div className="ch-qlist">
          {list.map((q) => (
            <QuestRow key={q.id} q={q} busy={busy} claim={claim} router={router} />
          ))}
        </div>

        <p className="ch-foot-note">
          {questTab === "daily"
            ? "Nhiệm vụ hàng ngày làm mới lúc 0:00 (giờ Việt Nam)."
            : questTab === "weekly"
              ? "Nhiệm vụ hàng tuần làm mới vào 0:00 thứ Hai."
              : questTab === "achievement"
                ? "Thành tựu chỉ nhận một lần."
                : `Sự kiện diễn ra từ ${ddmm(data.event.start)} đến ${ddmm(data.event.end)}.`}
          {" "}Mỗi nhiệm vụ còn cộng EXP cho Thẻ Thử Thách.
        </p>
      </section>

      <aside className="ch-panel ch-streak">
        <h3>Chuỗi Hoàn Thành</h3>
        <div className="ch-streak-num">
          <img src="/images/academy/practice/laurel-l.png" alt="" />
          <span>
            <b>{days}</b>
            <small>Ngày liên tiếp</small>
          </span>
          <img src="/images/academy/practice/laurel-r.png" alt="" />
        </div>
        <Chest open={data.streak.claimed} tone="blue" className="ch-streak-chest" />
        <div className="ch-checks">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={i < shown ? "on" : ""}>
              {i < shown && <Icon name="check" />}
            </span>
          ))}
        </div>
        {data.streak.claimable ? (
          <button className="ch-gold" disabled={busy === "streak"} onClick={() => claim({ kind: "streak" }, "streak")}>
            Mở rương
          </button>
        ) : (
          <p className="ch-streak-tip">
            {data.streak.claimed
              ? "Đã nhận rương tuần này!"
              : `Vào game 7 ngày liên tiếp để mở rương: +${data.streak.reward.coins} xu, +${data.streak.reward.gems} kim cương.`}
          </p>
        )}
      </aside>
    </div>
  );
}

// ===================== 2. Thẻ thử thách =====================

function PassView({
  data,
  start,
  setStart,
  busy,
  claim,
}: {
  data: Overview;
  start: number;
  setStart: (n: number) => void;
  busy: string;
  claim: ClaimFn;
}) {
  const { pass } = data;
  const view = pass.levels.slice(start, start + 8);
  const maxStart = Math.max(0, pass.levels.length - 8);

  return (
    <section className="ch-panel ch-pass">
      <div className="ch-pass-top">
        <div className="ch-shield">
          <small>Cấp</small>
          <b>{pass.level}</b>
        </div>
        <div className="ch-pass-exp">
          <div>
            <b>EXP {pass.levelExp.toLocaleString("en-US")} / {pass.expPerLevel.toLocaleString("en-US")}</b>
            <span>{pass.title} · Tổng {pass.exp.toLocaleString("en-US")} EXP</span>
          </div>
          <div className="ch-bar">
            <i style={{ width: `${(pass.levelExp / pass.expPerLevel) * 100}%` }} />
          </div>
        </div>
        <button className="ch-gold" title="Sắp ra mắt" disabled>
          <Icon name="crown" />
          Nâng cấp thẻ
        </button>
      </div>

      <div className="ch-track-wrap">
        <button className="ch-arrow" disabled={start === 0} onClick={() => setStart(Math.max(0, start - 4))} aria-label="Lùi">
          <Icon name="arrow" className="flip" />
        </button>

        <div className="ch-track" style={{ "--cols": view.length } as CSSProperties}>
          <span className="ch-lane-label free">
            <Icon name="crown" />
            Miễn Phí
          </span>
          <span className="ch-lane-label premium">
            <Icon name="crown" />
            Cao Cấp
          </span>

          <div className="ch-levels">
            {view.map((l) => (
              <span key={l.level} className={`ch-lv${l.reached ? " on" : ""}${l.level === pass.level ? " now" : ""}`}>
                <b>{l.level}</b>
              </span>
            ))}
          </div>

          <div className="ch-row free">
            {view.map((l) => {
              const can = l.reached && !l.claimed;

              return (
                <button
                  key={l.level}
                  className={`ch-cell${l.claimed ? " claimed" : ""}${can ? " can" : ""}${l.reached ? "" : " locked"}`}
                  disabled={!can || busy === `pass${l.level}`}
                  onClick={() => claim({ kind: "pass", level: l.level }, `pass${l.level}`)}
                  title={can ? "Bấm để nhận" : l.claimed ? "Đã nhận" : "Chưa đạt cấp"}
                >
                  {l.free.chest ? (
                    <Chest open={l.claimed} tone="gold" />
                  ) : l.free.gems > 0 ? (
                    <img src={GEM} alt="" />
                  ) : (
                    <img src={COIN} alt="" />
                  )}
                  <small>
                    {l.free.chest
                      ? `x${l.free.coins}`
                      : l.free.gems > 0
                        ? `x${l.free.gems}`
                        : `x${l.free.coins}`}
                  </small>
                  {l.claimed && (
                    <i className="ch-tick">
                      <Icon name="check" />
                    </i>
                  )}
                </button>
              );
            })}
          </div>

          <div className="ch-row premium">
            {view.map((l) => (
              <div key={l.level} className="ch-cell locked prem">
                {l.level % 5 === 0 ? <Chest tone="gold" /> : <img src={l.level % 2 ? COIN : GEM} alt="" />}
                <small>{l.level % 5 === 0 ? "Rương lớn" : l.level % 2 ? `x${80 + l.level * 6}` : `x${4 + Math.floor(l.level / 5)}`}</small>
                <i className="ch-lock">
                  <Icon name="lock" />
                </i>
              </div>
            ))}
          </div>
        </div>

        <button className="ch-arrow" disabled={start >= maxStart} onClick={() => setStart(Math.min(maxStart, start + 4))} aria-label="Tiếp">
          <Icon name="arrow" />
        </button>
      </div>

      <p className="ch-foot-note">
        Hoàn thành nhiệm vụ để nhận EXP. Mỗi {pass.expPerLevel.toLocaleString("en-US")} EXP lên 1 cấp, mở phần thưởng ở hàng Miễn Phí. Hàng Cao Cấp sẽ mở bán sau.
      </p>
    </section>
  );
}

// ===================== 3. Bản đồ thử thách =====================

function MapView({
  data,
  chapterId,
  setChapterId,
  busy,
  claim,
  open,
}: {
  data: Overview;
  chapterId: string;
  setChapterId: (id: string) => void;
  busy: string;
  claim: ClaimFn;
  open: (p: Puzzle) => void;
}) {
  const chapters = data.map.chapters;
  const ch = chapters.find((c) => c.id === chapterId) ?? chapters[0];
  const idx = chapters.indexOf(ch);
  const nextUnsolved = ch.puzzles.find((p) => !p.solved);

  // Đường đi nối các bài
  const path = NODE_POS.map((p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = NODE_POS[i - 1];
    const mx = (prev.x + p.x) / 2;
    return `C ${mx} ${prev.y}, ${mx} ${p.y}, ${p.x} ${p.y}`;
  }).join(" ");

  return (
    <div className="ch-map">
      <aside className="ch-chapters">
        {chapters.map((c, i) => (
          <button
            key={c.id}
            className={`ch-chap${c.id === ch.id ? " on" : ""}${c.unlocked ? "" : " locked"}`}
            onClick={() => c.unlocked && setChapterId(c.id)}
            title={c.unlocked ? "" : "Giải hết chương trước để mở"}
          >
            <span className="ch-chap-ico">{c.unlocked ? <Icon name="swords" /> : <Icon name="lock" />}</span>
            <span>
              <b>Chương {i + 1}</b>
              <small>{c.title}</small>
            </span>
            {c.unlocked && (
              <em>
                {c.stars}/{c.maxStars}★
              </em>
            )}
          </button>
        ))}
      </aside>

      <section className="ch-panel ch-world">
        <div className={`ch-land l${idx + 1}`}>
          <svg className="ch-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={path} />
          </svg>
          <div className="ch-castle" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <path d="M8 58V30h8v-8h6v8h6V16l4-8 4 8v14h6v-8h6v8h8v28Z" />
              <path d="M28 58V46a4 4 0 0 1 8 0v12" className="door" />
            </svg>
          </div>

          {ch.puzzles.map((p, i) => {
            const prevSolved = i === 0 || ch.puzzles[i - 1].solved;
            const can = ch.unlocked && prevSolved;

            return (
              <button
                key={p.id}
                className={`ch-node${p.solved ? " solved" : ""}${can && !p.solved ? " current" : ""}${can ? "" : " locked"}`}
                style={{ left: `${NODE_POS[i].x}%`, top: `${NODE_POS[i].y}%` }}
                disabled={!can}
                onClick={() => open(p)}
                aria-label={`Bài ${p.index}`}
              >
                <span className="ch-node-badge">{can ? p.index : <Icon name="lock" />}</span>
                <Stars n={p.stars} />
              </button>
            );
          })}
        </div>

        <div className="ch-map-bar">
          <div className="ch-map-info">
            <b>
              Chương {idx + 1}: {ch.title}
            </b>
            <span>
              <Icon name="star" className="gold" />
              {ch.stars} / {ch.maxStars}
            </span>
            <div className="ch-bar">
              <i style={{ width: `${(ch.stars / ch.maxStars) * 100}%` }} />
            </div>
          </div>

          <div className="ch-map-chests">
            {ch.chests.map((c) => {
              const can = ch.stars >= c.at && !c.claimed;

              return (
                <button
                  key={c.at}
                  className={`ch-mchest${can ? " can" : ""}${c.claimed ? " claimed" : ""}`}
                  disabled={!can || busy === `chest${c.at}`}
                  onClick={() => claim({ kind: "chest", chapter: ch.id, at: c.at }, `chest${c.at}`)}
                  title={`${c.at} sao: +${c.coins} xu, +${c.gems} kim cương`}
                >
                  <Chest open={c.claimed} tone={c.at === 15 ? "gold" : "blue"} />
                  <small>
                    {c.at}
                    <Icon name="star" className="gold" />
                  </small>
                </button>
              );
            })}
          </div>

          <button className="ch-gold" disabled={!nextUnsolved || !ch.unlocked} onClick={() => nextUnsolved && open(nextUnsolved)}>
            {nextUnsolved ? "Tiếp tục" : "Đã hoàn thành"}
          </button>
        </div>
      </section>
    </div>
  );
}

// ===================== Giải một bài =====================

function PuzzleModal({
  puzzle,
  chapter,
  skin,
  onClose,
  onSolved,
  onNext,
}: {
  puzzle: Puzzle;
  chapter: Chapter;
  skin?: string;
  onClose: () => void;
  onSolved: () => Promise<Puzzle | null>;
  onNext: (p: Puzzle) => void;
}) {
  const start = useMemo(() => parsePosition(puzzle.fen), [puzzle.fen]);
  const [pos, setPos] = useState(start);
  const [sel, setSel] = useState<string | null>(null);
  const [result, setResult] = useState<null | { correct: boolean; stars: number }>(
    puzzle.solved ? { correct: true, stars: puzzle.stars } : null,
  );
  const [wrong, setWrong] = useState(0);
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState<[string, string] | null>(null);

  useEffect(() => {
    setPos(parsePosition(puzzle.fen));
    setSel(null);
    setResult(puzzle.solved ? { correct: true, stars: puzzle.stars } : null);
    setWrong(0);
    setLast(null);
  }, [puzzle]);

  const marks: Marks = {};

  if (sel) {
    const m = movesFrom(pos, sel);
    marks.move = m.filter((s) => !pos[s]);
    marks.capture = m.filter((s) => pos[s]);
  }
  if (result?.correct) {
    const king = Object.keys(pos).find((s) => pos[s].color === "b" && pos[s].type === "K");
    if (king) marks.check = [king];
  }
  if (last && !result?.correct) marks.bad = [last[1]];

  async function tryMove(from: string, to: string) {
    setSending(true);
    setLast([from, to]);

    try {
      const res = await fetch(`/api/challenges/puzzles/${puzzle.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json?.message);

      if (json.correct) {
        const next = { ...pos, [to]: pos[from] };
        delete next[from];
        setPos(next);
        setResult({ correct: true, stars: json.stars });
        await onSolved();
      } else {
        setWrong((n) => n + 1);
        setResult({ correct: false, stars: 0 });
      }
    } catch {
      setResult({ correct: false, stars: 0 });
    } finally {
      setSending(false);
      setSel(null);
    }
  }

  function onSquare(sq: string) {
    if (sending || result?.correct) return;

    if (sel && sel !== sq && movesFrom(pos, sel).includes(sq)) {
      tryMove(sel, sq);
      return;
    }

    setResult(null);
    setSel(pos[sq]?.color === "w" ? (sel === sq ? null : sq) : null);
  }

  const i = chapter.puzzles.findIndex((p) => p.id === puzzle.id);
  const next = chapter.puzzles[i + 1];

  return (
    <div className="ch-modal" onClick={onClose}>
      <div className="ch-modal-box" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <small>
              {chapter.title} · Bài {puzzle.index}/{chapter.puzzles.length}
            </small>
            <h2>Trắng đi: chiếu hết trong 1 nước</h2>
          </div>
          <button className="ch-x" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </header>

        <div className="ch-modal-body">
          <LessonBoard className="ch-pboard" coords skin={skin} position={pos} marks={marks} selected={sel} onSquare={onSquare} />

          <div className="ch-modal-side">
            {result?.correct ? (
              <div className="ch-solved">
                <b>Chiếu hết!</b>
                <Stars n={result.stars} />
                <p>{result.stars === 3 ? "Hoàn hảo, đúng ngay lần đầu!" : "Đã giải xong bài này."}</p>
              </div>
            ) : result && !result.correct ? (
              <div className="ch-wrong">
                <b>Chưa phải chiếu hết</b>
                <p>Thử lại nhé! Giải đúng càng sớm càng nhiều sao.</p>
              </div>
            ) : (
              <p className="ch-tip">
                Bấm vào quân trắng rồi bấm ô muốn đi. Đúng lần 1: 3 sao · lần 2: 2 sao · sau đó: 1 sao.
              </p>
            )}

            {wrong > 0 && !result?.correct && <p className="ch-tip">Số lần thử sai: {wrong}</p>}

            <div className="ch-modal-actions">
              {!result?.correct && (
                <button
                  className="ch-ghost"
                  onClick={() => {
                    setPos(start);
                    setSel(null);
                    setResult(null);
                    setLast(null);
                  }}
                >
                  Đặt lại
                </button>
              )}
              {result?.correct && next && (
                <button className="ch-gold" onClick={() => onNext({ ...next })}>
                  Bài tiếp →
                </button>
              )}
              {result?.correct && !next && (
                <button className="ch-gold" onClick={onClose}>
                  Xong
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================== 4. Sự kiện Giáng Sinh =====================

function EventView({
  data,
  eventTab,
  setEventTab,
  busy,
  claim,
  router,
}: {
  data: Overview;
  eventTab: "quests" | "rewards" | "shop";
  setEventTab: (t: "quests" | "rewards" | "shop") => void;
  busy: string;
  claim: ClaimFn;
  router: Router;
}) {
  const quests = data.quests.filter((q) => q.scope === "event");
  const ev = data.event;

  return (
    <div className="ch-event">
      <section className="ch-xmas">
        <div className="ch-snowfall" aria-hidden="true">
          {Array.from({ length: 30 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                animationDelay: `${-((i * 1.3) % 8)}s`,
                animationDuration: `${6 + ((i * 7) % 6)}s`,
              }}
            />
          ))}
        </div>
        <Chest tone="gold" open className="ch-xmas-chest" />
        <div className="ch-xmas-text">
          <span>✦ Sự Kiện ✦</span>
          <h2>Giáng Sinh</h2>
          <em>
            Thời gian: {ddmm(ev.start)} - {ddmm(ev.end)}
          </em>
        </div>
        <div className="ch-xmas-badge">
          {ev.state === "active" ? "Đang diễn ra" : ev.state === "upcoming" ? "Sắp diễn ra" : "Đã kết thúc"}
        </div>
      </section>

      <div className="ch-subtabs">
        <button className={eventTab === "quests" ? "on" : ""} onClick={() => setEventTab("quests")}>
          Nhiệm vụ Sự Kiện
        </button>
        <button className={eventTab === "rewards" ? "on" : ""} onClick={() => setEventTab("rewards")}>
          Phần thưởng
        </button>
        <button className={eventTab === "shop" ? "on" : ""} onClick={() => setEventTab("shop")}>
          Cửa hàng Sự Kiện
        </button>
      </div>

      <section className="ch-panel ch-event-body">
        {eventTab === "quests" && (
          <>
            {ev.state === "upcoming" && (
              <p className="ch-note">Sự kiện bắt đầu từ {ddmm(ev.start)}. Tiến độ chỉ tính trong thời gian sự kiện.</p>
            )}
            <div className="ch-qlist">
              {quests.map((q) => (
                <QuestRow key={q.id} q={q} busy={busy} claim={claim} router={router} />
              ))}
            </div>
          </>
        )}

        {eventTab === "rewards" && (
          <div className="ch-ev-rewards">
            {quests.map((q) => (
              <div key={q.id} className="ch-ev-reward">
                <Chest tone="gold" open={q.claimed} />
                <b>{q.title}</b>
                <RewardChips coins={q.reward.coins} gems={q.reward.gems} exp={q.reward.exp} />
              </div>
            ))}
          </div>
        )}

        {eventTab === "shop" && (
          <div className="ch-ev-shop">
            <Icon name="gift" />
            <b>Cửa hàng Sự Kiện sắp mở</b>
            <p>Các skin và khung avatar chủ đề Giáng Sinh sẽ được bán tại đây trong thời gian sự kiện.</p>
          </div>
        )}
      </section>
    </div>
  );
}
