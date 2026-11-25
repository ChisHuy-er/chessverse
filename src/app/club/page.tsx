"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import PlayerAvatar from "../components/PlayerAvatar";
import Flag, { countryName } from "../components/Flag";
import "./club.css";

const IMG = "/images/academy/club";

type Role = "LEADER" | "OFFICER" | "MEMBER";

type Member = {
  id: string;
  displayName: string;
  elo: number;
  avatarId: string | null;
  avatarFrame: string | null;
  role: Role;
  joinedAt: string;
  online: boolean;
  lastSeenAt: string | null;
};

type Overview = {
  club: {
    id: string;
    name: string;
    description: string;
    announcement: string;
    banner: string;
    region?: string;
    createdAt: string;
    level: number;
    exp: number;
    expInLevel: number;
    expPerLevel: number;
    memberCount: number;
    maxMembers: number;
    leader: string;
    rank: number;
    totalClubs: number;
    score: number;
  };
  me: { userId: string; role: Role };
  members: Member[];
  ranking: { id: string; name: string; banner: string; score: number; rank: number; memberCount: number }[];
  tasks: { id: string; title: string; progress: number; target: number }[];
  resetAt: string;
};

type ClubListItem = {
  id: string;
  name: string;
  description: string;
  banner: string;
  region?: string;
  memberCount: number;
  maxMembers: number;
  score: number;
  rank: number;
};

type Tab = "overview" | "members" | "tasks" | "tournament";

const TABS: { id: Tab; label: string; soon?: boolean }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "members", label: "Thành viên" },
  { id: "tasks", label: "Nhiệm vụ" },
  { id: "tournament", label: "Giải đấu CLB", soon: true },
];

// Chữ dài tự chạy qua lại để đọc hết; người dùng cũng có thể kéo / lăn ngang để đọc
function Marquee({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = box.current;

    if (!el) return;

    let raf = 0;
    let dir = 1;
    let wait = 90; // dừng ~1.5 giây ở hai đầu
    let pausedUntil = 0;
    let drag: { x: number; left: number } | null = null;

    const step = () => {
      const max = el.scrollWidth - el.clientWidth;

      if (max > 2 && !drag && performance.now() > pausedUntil) {
        if (wait > 0) wait--;
        else {
          el.scrollLeft += dir * 0.6;

          if ((dir > 0 && el.scrollLeft >= max - 1) || (dir < 0 && el.scrollLeft <= 0)) {
            dir = -dir;
            wait = 90;
          }
        }
      }

      raf = requestAnimationFrame(step);
    };

    const hold = () => (pausedUntil = performance.now() + 2500);
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, left: el.scrollLeft };
      el.setPointerCapture(e.pointerId);
      hold();
    };
    const move = (e: PointerEvent) => {
      if (drag) el.scrollLeft = drag.left - (e.clientX - drag.x);
    };
    const up = () => {
      drag = null;
      hold();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", hold, { passive: true });
    el.addEventListener("mouseenter", hold);
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", hold);
      el.removeEventListener("mouseenter", hold);
    };
  }, [text]);

  return (
    <span className="cl-marquee" ref={box} title={text}>
      {text}
    </span>
  );
}

// Khu vực CLB (mã quốc gia)
const REGIONS = ["VN", "TH", "SG", "MY", "ID", "PH", "KH", "LA", "JP", "KR", "CN", "TW", "IN", "US", "CA", "BR", "AR", "MX", "GB", "FR", "DE", "ES", "IT", "RU", "AU"];

function RegionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="cl-region">
      <Flag code={value} />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {countryName(r)}
          </option>
        ))}
      </select>
    </div>
  );
}

// Mẫu cờ / huy hiệu CLB có thể chọn
const BANNERS = [
  "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8",
  "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10",
];

const flag = (id: string | undefined) => `${IMG}/flags/${BANNERS.includes(id ?? "") ? id : "b0"}.webp`;

function ago(iso: string | null) {
  if (!iso) return "";

  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (m < 60) return `${Math.max(1, m)} phút trước`;
  if (m < 1440) return `${Math.floor(m / 60)} giờ trước`;

  return `${Math.floor(m / 1440)} ngày trước`;
}

// Chọn mẫu cờ CLB
function BannerPicker({
  current,
  onSave,
  onClose,
}: {
  current: string;
  onSave: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [pick, setPick] = useState(BANNERS.includes(current) ? current : "b0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="cl-pop-backdrop" onMouseDown={onClose}>
      <div className="cl-pop cl-flags-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Chọn cờ câu lạc bộ">
        <h4>Chọn cờ câu lạc bộ</h4>
        <div className="cl-flags-body">
          <img className="cl-flags-preview" src={flag(pick)} alt="" />
          <div className="cl-flags-grid">
            {BANNERS.map((id) => (
              <button key={id} className={`cl-flag-item${pick === id ? " on" : ""}${id.startsWith("e") ? " round" : ""}`} onClick={() => setPick(id)}>
                <img src={flag(id)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
        <div className="cl-pop-foot">
          {error && <span className="cl-error">{error}</span>}
          <button className="cl-btn ghost" onClick={onClose}>Hủy</button>
          <button
            className="cl-btn gold"
            disabled={saving || pick === current}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                await onSave(pick);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Không thể lưu");
                setSaving(false);
              }
            }}
          >
            {saving ? "Đang lưu..." : "Dùng mẫu này"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<Role, string> = {
  LEADER: "Thủ lĩnh",
  OFFICER: "Phó thủ lĩnh",
  MEMBER: "Thành viên",
};

const TASK_ICON: Record<string, string> = { matches: "swords", wins: "trophy", active: "people" };

async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api/club${path}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message;

    throw Object.assign(new Error(message || "Có lỗi xảy ra, vui lòng thử lại."), { status: response.status });
  }

  return data as T;
}

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function countdown(iso: string) {
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");

  return `${d > 0 ? `${d} ngày ` : ""}${p(h)}:${p(m)}:${p(sec)}`;
}

function Panel({ title, icon, extra, className = "", children }: { title: string; icon?: string; extra?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`cl-panel ${className}`}>
      <header className="cl-panel-head">
        {icon && <img src={`${IMG}/i-${icon}.png`} alt="" />}
        <h3>{title}</h3>
        {extra && <div className="cl-panel-extra">{extra}</div>}
      </header>
      {children}
    </section>
  );
}

// Ô sửa nhỏ nổi lên (mô tả / thông báo)
function EditBox({
  title,
  value,
  max,
  onSave,
  onClose,
}: {
  title: string;
  value: string;
  max: number;
  onSave: (v: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="cl-pop-backdrop" onMouseDown={onClose}>
      <div className="cl-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <h4>{title}</h4>
        <textarea value={text} maxLength={max} rows={4} onChange={(e) => setText(e.target.value)} autoFocus />
        <div className="cl-pop-foot">
          <small>
            {text.length}/{max}
          </small>
          {error && <span className="cl-error">{error}</span>}
          <button className="cl-btn ghost" onClick={onClose}>
            Hủy
          </button>
          <button
            className="cl-btn gold"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                await onSave(text.trim());
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Không thể lưu");
                setSaving(false);
              }
            }}
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bar({ value, max, tone = "blue" }: { value: number; max: number; tone?: "blue" | "gold" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className={`cl-bar ${tone}`}>
      <b style={{ width: `${pct}%` }} />
    </div>
  );
}

// =========================================================
// CHƯA CÓ CLB: tạo hoặc tìm
// =========================================================
function NoClub({ onJoined }: { onJoined: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [region, setRegion] = useState("VN");
  const [query, setQuery] = useState("");
  const [clubs, setClubs] = useState<ClubListItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const search = useCallback(async (q: string) => {
    try {
      const data = await api<{ clubs: ClubListItem[] }>(`/list?q=${encodeURIComponent(q)}`);

      setClubs(data.clubs);
    } catch (e) {
      setClubs([]);
      setError(e instanceof Error ? e.message : "");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);

    return () => clearTimeout(t);
  }, [query, search]);

  async function create() {
    setBusy("create");
    setError("");

    try {
      await api("", { method: "POST", body: { name, description: desc, region } });
      onJoined();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
      setBusy(null);
    }
  }

  async function join(id: string) {
    setBusy(id);
    setError("");

    try {
      await api(`/${id}/join`, { method: "POST" });
      onJoined();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
      setBusy(null);
    }
  }

  return (
    <div className="cl-none">
      <div className="cl-none-hero">
        <img src={flag("b0")} alt="" />
        <div>
          <h2>Bạn chưa có câu lạc bộ</h2>
          <p>Tham gia một câu lạc bộ để cùng luyện tập, hoàn thành nhiệm vụ tuần và leo bảng xếp hạng CLB. Bạn cũng có thể tự lập CLB của riêng mình.</p>
        </div>
      </div>

      {error && <p className="cl-error block">{error}</p>}

      <div className="cl-none-grid">
        <Panel title="Lập câu lạc bộ" icon="shield">
          <label className="cl-field">
            <span>Tên câu lạc bộ (3–30 ký tự)</span>
            <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="VD: Kỵ Sĩ Sài Gòn" />
          </label>
          <label className="cl-field">
            <span>Khu vực của CLB</span>
            <RegionSelect value={region} onChange={setRegion} />
          </label>
          <label className="cl-field">
            <span>Giới thiệu ngắn</span>
            <textarea value={desc} maxLength={200} rows={3} onChange={(e) => setDesc(e.target.value)} placeholder="Nơi hội tụ những kỳ thủ đam mê..." />
          </label>
          <button className="cl-btn gold wide" disabled={busy !== null || name.trim().length < 3} onClick={create}>
            {busy === "create" ? "Đang tạo..." : "Lập câu lạc bộ"}
          </button>
        </Panel>

        <Panel title="Tìm câu lạc bộ" icon="target">
          <input className="cl-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nhập tên câu lạc bộ..." />
          <div className="cl-list">
            {clubs === null && <p className="cl-muted">Đang tải...</p>}
            {clubs?.length === 0 && <p className="cl-muted">Chưa có câu lạc bộ nào{query ? " khớp tên này" : ""}.</p>}
            {clubs?.map((c) => (
              <div className="cl-list-row" key={c.id}>
                <img className="cl-list-flag" src={flag(c.banner)} alt="" />
                <div>
                  <strong>
                    <Flag code={c.region ?? "VN"} /> {c.name}
                  </strong>
                  <small>
                    {countryName(c.region ?? "VN")} · Hạng #{c.rank} · {c.memberCount}/{c.maxMembers} thành viên · {fmt(c.score)} điểm
                  </small>
                </div>
                <button
                  className="cl-btn gold small"
                  disabled={busy !== null || c.memberCount >= c.maxMembers}
                  onClick={() => join(c.id)}
                >
                  {c.memberCount >= c.maxMembers ? "Đã đủ" : busy === c.id ? "..." : "Tham gia"}
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// =========================================================
// TRANG CHÍNH
// =========================================================
export default function ClubPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "guest" | "none" | "ok" | "error">("loading");
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<null | "description" | "announcement">(null);
  const [ranking, setRanking] = useState<ClubListItem[] | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [managing, setManaging] = useState(false);
  const [editingClub, setEditingClub] = useState(false);
  const [clubName, setClubName] = useState("");
  const [clubRegion, setClubRegion] = useState("VN");
  const [clubErr, setClubErr] = useState("");
  const [savingClub, setSavingClub] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);
  const [pickingFlag, setPickingFlag] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const result = await api<Overview | { club: null }>("/me");

      if (!result.club) {
        setState("none");
        setData(null);
        return;
      }

      setData(result as Overview);
      setState("ok");
    } catch (e) {
      setState((e as { status?: number }).status === 401 ? "guest" : "error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Đếm ngược làm mới nhiệm vụ
  useEffect(() => {
    // Đồng hồ đếm ngược làm mới nhiệm vụ chạy từng giây
    const t = setInterval(() => setTick((n) => n + 1), 1000);

    return () => clearInterval(t);
  }, []);

  function soon(name: string) {
    setNotice(`"${name}" đang được phát triển, sẽ sớm ra mắt!`);
  }

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Có lỗi xảy ra");
    }
  }

  async function openRanking() {
    setRanking([]);

    try {
      const result = await api<{ clubs: ClubListItem[] }>("/list");

      setRanking(result.clubs);
    } catch {
      setRanking(null);
    }
  }

  return (
    <AcademyShell active="Câu lạc bộ">
      {() => {
        if (state === "loading") return <div className="cl-page"><p className="cl-muted">Đang tải câu lạc bộ...</p></div>;

        if (state === "guest") {
          return (
            <div className="cl-page">
              <div className="cl-panel cl-center">
                <p>Bạn cần đăng nhập để tham gia câu lạc bộ.</p>
                <button className="cl-btn gold" onClick={() => router.push("/")}>
                  Về trang chủ để đăng nhập
                </button>
              </div>
            </div>
          );
        }

        if (state === "error") {
          return (
            <div className="cl-page">
              <div className="cl-panel cl-center">
                <p>Không thể tải câu lạc bộ. Hãy kiểm tra backend đã chạy và đã cập nhật cơ sở dữ liệu.</p>
                <button className="cl-btn gold" onClick={() => { setState("loading"); load(); }}>
                  Thử lại
                </button>
              </div>
            </div>
          );
        }

        const header = (
          <div className="cl-top">
            <div className="cl-title">
              <img src="/images/academy/practice/laurel-l.png" alt="" />
              <h1>Câu lạc bộ</h1>
              <img src="/images/academy/practice/laurel-r.png" alt="" />
            </div>
            {state === "ok" && (
              <nav className="cl-tabs">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`${tab === t.id ? "on" : ""}${t.soon ? " soon" : ""}`}
                    onClick={() => (t.soon ? soon(t.label) : setTab(t.id))}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
        );

        const noticeBox = notice && (
          <div className="ac-notice cl-notice">
            <span>ⓘ</span>
            <p>{notice}</p>
            <button onClick={() => setNotice("")}>×</button>
          </div>
        );

        if (state === "none" || !data) {
          return (
            <div className="cl-page">
              {header}
              {noticeBox}
              <NoClub onJoined={() => { setState("loading"); load(); }} />
            </div>
          );
        }

        const { club, me, members, tasks } = data;
        const canEdit = me.role !== "MEMBER";
        const editBtn = (field: "description" | "announcement") =>
          canEdit && (
            <button className="cl-pen" aria-label="Sửa" onClick={() => setEditing(field)}>
              <img src={`${IMG}/i-pencil.png`} alt="" />
            </button>
          );

        const memberRow = (m: Member, actions: boolean) => (
          <div className="cl-member" key={m.id}>
            <PlayerAvatar avatar={m.avatarId} frame={m.avatarFrame} name={m.displayName} />
            <div className="cl-member-name">
              <strong>
                {m.role === "LEADER" && <img src={`${IMG}/i-crown.png`} alt="" />}
                {m.displayName}
                {m.id === me.userId && <em> (bạn)</em>}
              </strong>
              <span className={`cl-role ${m.role.toLowerCase()}`}>{ROLE_LABEL[m.role]}</span>
            </div>
            <span className={`cl-status${m.online ? " on" : ""}`}>
              {m.online ? "Online" : m.lastSeenAt ? ago(m.lastSeenAt) : "Ngoại tuyến"}
            </span>
            <span className="cl-elo">
              <img src={`${IMG}/i-crown.png`} alt="" />
              {fmt(m.elo)}
            </span>
            {actions && m.id !== me.userId && (
              <span className="cl-member-actions">
                {me.role === "LEADER" && (
                  <button className="cl-btn ghost small" onClick={() => act(() => api(`/members/${m.id}/promote`, { method: "POST" }))}>
                    {m.role === "OFFICER" ? "Hạ chức" : "Phong phó"}
                  </button>
                )}
                {(me.role === "LEADER" || (me.role === "OFFICER" && m.role === "MEMBER")) && (
                  <button className="cl-btn danger small" onClick={() => act(() => api(`/members/${m.id}/kick`, { method: "POST" }))}>
                    Mời rời
                  </button>
                )}
              </span>
            )}
          </div>
        );

        const taskList = (
          <div className="cl-tasks">
            {tasks.map((t) => {
              const done = t.progress >= t.target;

              return (
                <div className={`cl-task${done ? " done" : ""}`} key={t.id}>
                  <span className="cl-task-icon">
                    <img src={`${IMG}/i-${TASK_ICON[t.id] ?? "target"}.png`} alt="" />
                  </span>
                  <div>
                    <strong><Marquee text={t.title} /></strong>
                    <Bar value={t.progress} max={t.target} />
                  </div>
                  <span className="cl-task-count">
                    {Math.min(t.progress, t.target)} / {t.target}
                  </span>
                  {done ? <img className="cl-task-check" src={`${IMG}/i-check.png`} alt="Hoàn thành" /> : <span className="cl-task-check" />}
                </div>
              );
            })}
          </div>
        );

        return (
          <div className="cl-page">
            {header}
            {noticeBox}

            {tab === "overview" && (
              <div className="cl-grid">
                <div className="cl-col">
                  <div className="cl-row1">
                    <button
                      className={`cl-banner${canEdit ? " editable" : ""}`}
                      onClick={() => (canEdit ? setPickingFlag(true) : undefined)}
                      title={canEdit ? "Đổi cờ câu lạc bộ" : club.name}
                      aria-label={canEdit ? "Đổi cờ câu lạc bộ" : club.name}
                    >
                      <img src={flag(club.banner)} alt="" />
                      {canEdit && <span>Đổi cờ</span>}
                    </button>
                    <section className="cl-panel cl-info">
                      <div className="cl-name-row">
                        <h2>{club.name}</h2>
                        {canEdit && (
                          <button
                            className="cl-pen small"
                            aria-label="Đổi tên và khu vực CLB"
                            title="Đổi tên và khu vực CLB"
                            onClick={() => {
                              setClubName(club.name);
                              setClubRegion(club.region ?? "VN");
                              setClubErr("");
                              setEditingClub(true);
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="cl-level">
                        <b>Lv. {club.level}</b>
                        <Bar value={club.expInLevel} max={club.expPerLevel} />
                        <small>
                          {fmt(club.expInLevel)} / {fmt(club.expPerLevel)} EXP
                        </small>
                      </div>
                      <ul className="cl-facts">
                        <li><img src={`${IMG}/i-crown.png`} alt="" />Thủ lĩnh: <b>{club.leader}</b></li>
                        <li><img src={`${IMG}/i-people.png`} alt="" />Thành viên: <b>{club.memberCount} / {club.maxMembers}</b></li>
                        <li><img src={`${IMG}/i-trophy.png`} alt="" />Xếp hạng CLB: <b>#{club.rank}</b></li>
                        <li className="cl-fact-region">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" /></svg>
                          Khu vực: <b><Flag code={club.region ?? "VN"} /> {countryName(club.region ?? "VN")}</b>
                        </li>
                        <li><img src={`${IMG}/i-gift.png`} alt="" />Ngày thành lập: <b>{new Date(club.createdAt).toLocaleDateString("vi-VN")}</b></li>
                      </ul>
                      <div className="cl-quote">
                        <p>{club.description ? `“${club.description}”` : <span className="cl-muted">Chưa có lời giới thiệu.</span>}</p>
                        {editBtn("description")}
                      </div>
                    </section>
                  </div>

                  <Panel
                    title={`Thành viên (${club.memberCount}/${club.maxMembers})`}
                    icon="crown"
                    className="cl-members-panel"
                    extra={<button className="cl-more" onClick={() => setTab("members")}>Xem tất cả ›</button>}
                  >
                    {members.slice(0, 4).map((m) => memberRow(m, false))}
                  </Panel>
                </div>

                <div className="cl-col">
                  <div className="cl-quick">
                    <button onClick={() => soon("Đóng góp")}>
                      <img src={`${IMG}/i-coins.png`} alt="" />
                      Đóng góp
                    </button>
                    <button
                      onClick={() =>
                        canEdit ? setManaging(true) : setNotice("Chỉ thủ lĩnh và phó thủ lĩnh mới quản lý được CLB.")
                      }
                    >
                      <img src={`${IMG}/i-shield.png`} alt="" />
                      Quản lý CLB
                    </button>
                    <button
                      onClick={() => {
                        const text = `Tham gia CLB "${club.name}" cùng mình trên ChessVerse! Vào mục Câu lạc bộ, tìm tên "${club.name}" để xin vào nhé.`;

                        navigator.clipboard
                          ?.writeText(text)
                          .then(() => setNotice("Đã sao chép lời mời. Dán gửi cho bạn bè để họ tìm và tham gia CLB."))
                          .catch(() => setNotice(text));
                      }}
                    >
                      <img src={`${IMG}/i-people.png`} alt="" />
                      Mời thành viên
                    </button>
                    <button
                      className="danger"
                      onClick={() => setConfirmLeave(true)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 8l-4 4 4 4M5 12h11" />
                      </svg>
                      Rời CLB
                    </button>
                  </div>


                  <Panel
                    title="Nhiệm vụ CLB"
                    icon="target"
                    className="cl-tasks-panel"
                    extra={<span className="cl-reset"><img src={`${IMG}/i-refresh.png`} alt="" />Làm mới sau: {countdown(data.resetAt)}</span>}
                  >
                    {taskList}
                  </Panel>
                </div>

                <div className="cl-side">
                  <section className="cl-panel cl-campaign cl-tourney" style={{ "--bg": `url(${IMG}/castle.jpg)` } as CSSProperties}>
                    <header className="cl-panel-head">
                      <img src={`${IMG}/i-swords.png`} alt="" />
                      <h3>Giải đấu CLB</h3>
                      <span className="cl-tag">Sắp ra mắt</span>
                    </header>
                    <p>Giải đấu giữa các CLB, tích điểm vinh danh!</p>
                    <button className="cl-btn gold small" onClick={() => soon("Giải đấu CLB")}>Tham gia ngay ›</button>
                  </section>

                  <Panel title="Xếp hạng CLB" icon="trophy">
                    <div className="cl-ranking">
                      {data.ranking.slice(0, 3).map((r) => (
                        <div className={`cl-rank-row${r.id === club.id ? " mine" : ""}`} key={r.id}>
                          <img src={`${IMG}/i-rank${r.rank}.png`} alt={`#${r.rank}`} />
                          <span className="cl-rank-name"><img src={flag(r.banner)} alt="" />{r.name}</span>
                          <b><img src={`${IMG}/i-crown.png`} alt="" />{fmt(r.score)}</b>
                        </div>
                      ))}
                      {club.rank > 3 && (
                        <div className="cl-rank-row mine">
                          <span className="cl-rank-no">#{club.rank}</span>
                          <span className="cl-rank-name"><img src={flag(club.banner)} alt="" />{club.name}</span>
                          <b><img src={`${IMG}/i-crown.png`} alt="" />{fmt(club.score)}</b>
                        </div>
                      )}
                    </div>
                    <button className="cl-more" onClick={openRanking}>Xem chi tiết ›</button>
                  </Panel>

                  <Panel title="Thông báo CLB" icon="megaphone" extra={editBtn("announcement")}>
                    <p className="cl-announce">{club.announcement || <span className="cl-muted">Chưa có thông báo nào.</span>}</p>
                  </Panel>
                </div>
              </div>
            )}

            {managing && (
              <div className="cl-pop-backdrop" onMouseDown={() => { setManaging(false); setKicking(null); }}>
                <div className="cl-pop cl-manage" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Quản lý CLB">
                  <header className="cl-manage-head">
                    <img src={`${IMG}/i-shield.png`} alt="" />
                    <h3>Quản lý CLB</h3>
                    <button className="cl-x" aria-label="Đóng" onClick={() => { setManaging(false); setKicking(null); }}>×</button>
                  </header>

                  <div className="cl-manage-tools">
                    <button className="cl-btn ghost small" onClick={() => setEditing("description")}>Sửa lời giới thiệu</button>
                    <button className="cl-btn ghost small" onClick={() => setEditing("announcement")}>Sửa thông báo</button>
                    <button className="cl-btn ghost small" onClick={() => setPickingFlag(true)}>Đổi cờ CLB</button>
                  </div>

                  <p className="cl-muted cl-manage-note">
                    {me.role === "LEADER"
                      ? "Thủ lĩnh có thể phong / hạ phó thủ lĩnh và mời thành viên rời CLB."
                      : "Phó thủ lĩnh có thể mời thành viên thường rời CLB."}
                  </p>

                  <div className="cl-manage-list">
                    {members.map((m) => {
                      const canPromote = me.role === "LEADER" && m.id !== me.userId && m.role !== "LEADER";
                      const canKick =
                        m.id !== me.userId && (me.role === "LEADER" || (me.role === "OFFICER" && m.role === "MEMBER"));

                      return (
                        <div className="cl-manage-row" key={m.id}>
                          <PlayerAvatar avatar={m.avatarId} frame={m.avatarFrame} name={m.displayName} />
                          <div className="cl-member-name">
                            <strong>
                              {m.displayName}
                              {m.id === me.userId && <em> (bạn)</em>}
                            </strong>
                            <span className={`cl-role ${m.role.toLowerCase()}`}>{ROLE_LABEL[m.role]}</span>
                          </div>
                          <span className="cl-elo">
                            <img src={`${IMG}/i-crown.png`} alt="" />
                            {fmt(m.elo)}
                          </span>
                          <span className="cl-member-actions">
                            {kicking === m.id ? (
                              <>
                                <small>Mời rời?</small>
                                <button className="cl-btn ghost small" onClick={() => setKicking(null)}>Hủy</button>
                                <button
                                  className="cl-btn danger small"
                                  onClick={() => {
                                    setKicking(null);
                                    act(() => api(`/members/${m.id}/kick`, { method: "POST" }));
                                  }}
                                >
                                  Xác nhận
                                </button>
                              </>
                            ) : (
                              <>
                                {canPromote && (
                                  <button
                                    className="cl-btn ghost small"
                                    onClick={() => act(() => api(`/members/${m.id}/promote`, { method: "POST" }))}
                                  >
                                    {m.role === "OFFICER" ? "Hạ chức" : "Phong phó thủ lĩnh"}
                                  </button>
                                )}
                                {canKick && (
                                  <button className="cl-btn danger small" onClick={() => setKicking(m.id)}>
                                    Mời rời
                                  </button>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === "members" && (
              <Panel title={`Thành viên (${club.memberCount}/${club.maxMembers})`} icon="people">
                {members.map((m) => memberRow(m, canEdit))}
              </Panel>
            )}

            {tab === "tasks" && (
              <Panel
                title="Nhiệm vụ tuần"
                icon="target"
                extra={<span className="cl-reset"><img src={`${IMG}/i-refresh.png`} alt="" />Làm mới sau: {countdown(data.resetAt)}</span>}
              >
                <p className="cl-muted">Tiến độ tính từ các ván đấu online hoàn thành của thành viên kể từ thứ Hai tuần này. Mỗi ván thành viên chơi xong cũng cộng 100 EXP cho CLB.</p>
                {taskList}
              </Panel>
            )}

            {confirmLeave && (
              <div className="cl-pop-backdrop" onMouseDown={() => setConfirmLeave(false)}>
                <div className="cl-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Rời câu lạc bộ">
                  <h4>Rời {club.name}?</h4>
                  <p className="cl-muted">
                    {me.role === "LEADER"
                      ? club.memberCount > 1
                        ? "Bạn là thủ lĩnh. Khi rời đi, vị trí thủ lĩnh sẽ được nhường cho phó thủ lĩnh (hoặc thành viên có Elo cao nhất)."
                        : "Bạn là thành viên cuối cùng. Rời đi sẽ giải tán câu lạc bộ."
                      : "Bạn có thể tham gia câu lạc bộ khác sau khi rời."}
                  </p>
                  <div className="cl-pop-foot">
                    <button className="cl-btn ghost" onClick={() => setConfirmLeave(false)}>Hủy</button>
                    <button
                      className="cl-btn danger"
                      onClick={() => {
                        setConfirmLeave(false);
                        setTab("overview");
                        act(() => api("/leave", { method: "POST" }));
                      }}
                    >
                      Rời CLB
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editingClub && (
              <div className="cl-pop-backdrop" onMouseDown={() => setEditingClub(false)}>
                <div className="cl-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Đổi tên và khu vực CLB">
                  <h4>Tên và khu vực CLB</h4>
                  <label className="cl-field">
                    <span>Tên câu lạc bộ (3–30 ký tự)</span>
                    <input value={clubName} maxLength={30} onChange={(e) => setClubName(e.target.value)} />
                  </label>
                  <label className="cl-field">
                    <span>Khu vực</span>
                    <RegionSelect value={clubRegion} onChange={setClubRegion} />
                  </label>
                  <div className="cl-pop-foot">
                    {clubErr && <span className="cl-error">{clubErr}</span>}
                    <button className="cl-btn ghost" onClick={() => setEditingClub(false)}>Hủy</button>
                    <button
                      className="cl-btn gold"
                      disabled={savingClub || clubName.trim().length < 3}
                      onClick={async () => {
                        setSavingClub(true);
                        setClubErr("");

                        try {
                          const body: Record<string, string> = { region: clubRegion };
                          if (clubName.trim() !== club.name) body.name = clubName.trim();
                          await api("", { method: "PATCH", body });
                          await load();
                          setEditingClub(false);
                        } catch (e) {
                          setClubErr(e instanceof Error ? e.message : "Không lưu được");
                        } finally {
                          setSavingClub(false);
                        }
                      }}
                    >
                      {savingClub ? "Đang lưu..." : "Lưu"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editing && (
              <EditBox
                title={editing === "description" ? "Sửa lời giới thiệu" : "Sửa thông báo CLB"}
                value={editing === "description" ? club.description : club.announcement}
                max={editing === "description" ? 200 : 300}
                onClose={() => setEditing(null)}
                onSave={async (v) => {
                  await api("", { method: "PATCH", body: { [editing]: v } });
                  await load();
                }}
              />
            )}

            {pickingFlag && (
              <BannerPicker
                current={club.banner}
                onClose={() => setPickingFlag(false)}
                onSave={async (id) => {
                  await api("", { method: "PATCH", body: { banner: id } });
                  await load();
                }}
              />
            )}

            {ranking && (
              <div className="cl-pop-backdrop" onMouseDown={() => setRanking(null)}>
                <div className="cl-pop wide" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Xếp hạng CLB">
                  <h4>Xếp hạng câu lạc bộ</h4>
                  <p className="cl-muted">Điểm CLB = tổng Elo của các thành viên.</p>
                  <div className="cl-list">
                    {ranking.length === 0 && <p className="cl-muted">Đang tải...</p>}
                    {ranking.map((r) => (
                      <div className={`cl-list-row${r.id === club.id ? " mine" : ""}`} key={r.id}>
                        {r.rank <= 3 ? <img className="cl-rank-img" src={`${IMG}/i-rank${r.rank}.png`} alt="" /> : <span className="cl-rank-no">#{r.rank}</span>}
                        <div className="cl-rank-name">
                          <img src={flag(r.banner)} alt="" />
                          <span>
                            <strong>{r.name}</strong>
                            <small>{r.memberCount}/{r.maxMembers} thành viên</small>
                          </span>
                        </div>
                        <b className="cl-elo"><img src={`${IMG}/i-crown.png`} alt="" />{fmt(r.score)}</b>
                      </div>
                    ))}
                  </div>
                  <div className="cl-pop-foot">
                    <button className="cl-btn gold" onClick={() => setRanking(null)}>Đóng</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </AcademyShell>
  );
}
