"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import PlayerAvatar from "./PlayerAvatar";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "../lib/settings";
import { playSound } from "../lib/sound";
import { TIERS } from "../lib/rank";
import "./settings-dialog.css";

const ICON = "/images/academy/settings";

// Đổi tên hiển thị (ở trang Hồ sơ) → báo cho thanh trên cùng cập nhật.
export const USER_EVENT = "cv:user";

type Tab = "general" | "sound" | "account" | "support";

type Me = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  elo: number;
  createdAt?: string;
  avatarId?: string | null;
  avatarFrame?: string | null;
  playerCode?: string | null;
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "general", label: "Chung", icon: "monitor" },
  { id: "sound", label: "Âm thanh", icon: "sound" },
  { id: "account", label: "Tài khoản", icon: "user" },
  { id: "support", label: "Hỗ trợ", icon: "support" },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`sd-toggle${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  );
}

function Row({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="sd-row">
      <span className="sd-row-icon">{icon}</span>
      <span className="sd-row-text">
        {title}
        {hint && <small>{hint}</small>}
      </span>
      <span className="sd-row-control">{children}</span>
    </div>
  );
}

// Icon nét mảnh cho từng dòng (đồng bộ màu với chữ)
const Line = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

const FAQ = [
  {
    q: "Elo của tôi thay đổi khi nào?",
    a: "Chỉ các ván Đấu xếp hạng mới làm Elo tăng hoặc giảm. Đấu thường và đấu với máy không ảnh hưởng Elo.",
  },
  {
    q: "Các cấp hạng được chia thế nào?",
    a: TIERS.map((t, i) => {
      const next = TIERS[i + 1];

      return `${t.name}: ${t.min}${next ? `–${next.min - 1}` : "+"}`;
    }).join(" · "),
  },
  {
    q: "Nếu tôi bị mất kết nối giữa ván?",
    a: "Trò chơi tự kết nối lại và đưa bạn về đúng ván đang chơi. Đồng hồ vẫn chạy trong lúc mất kết nối, nên hãy quay lại sớm nhất có thể.",
  },
  {
    q: "Xem lại và phân tích ván đã chơi ở đâu?",
    a: "Mở Lịch sử đấu (từ Hồ sơ hoặc thanh lối tắt ở trang Đấu luyện), chọn một ván để xem lại từng nước kèm phân tích của Stockfish.",
  },
  {
    q: "Đổi ảnh đại diện, khung và ảnh nền thế nào?",
    a: "Vào Hồ sơ và bấm nút Tùy chỉnh ở góc ảnh bìa. Lựa chọn được lưu vào tài khoản của bạn.",
  },
  {
    q: "Cài đặt được lưu ở đâu?",
    a: "Các mục ở tab Chung và Âm thanh được lưu trên trình duyệt đang dùng. Tên hiển thị và ảnh đại diện được lưu vào tài khoản.",
  },
];

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("general");
  const [draft, setDraft] = useState<Settings>(() => loadSettings());
  const [themeDraft, setThemeDraft] = useState<"dark" | "light">(theme);
  const [saved, setSaved] = useState(false);

  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        setMe(data?.user ?? null);
      })
      .catch(() => alive && setMe(null));

    return () => {
      alive = false;
    };
  }, []);

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(loadSettings()) || themeDraft !== theme;

  function patch(part: Partial<Settings>) {
    setDraft((d) => ({ ...d, ...part }));
    setSaved(false);
  }

  function patchSound(part: Partial<Settings["sound"]>) {
    setDraft((d) => ({ ...d, sound: { ...d.sound, ...part } }));
    setSaved(false);
  }

  function save() {
    saveSettings(draft);
    if (themeDraft !== theme) toggleTheme();
    setSaved(true);
  }

  function reset() {
    setDraft(DEFAULT_SETTINGS);
    setThemeDraft("dark");
    setSaved(false);
  }


  async function copyId(code: string) {
    try {
      await navigator.clipboard.writeText(`#${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* trình duyệt chặn clipboard */
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div className="sd-backdrop" onMouseDown={onClose}>
      <div className="sd-dialog" role="dialog" aria-modal="true" aria-label="Cài đặt" onMouseDown={(e) => e.stopPropagation()}>
        <header className="sd-head">
          <img src={`${ICON}/gear.png`} alt="" />
          <div>
            <h2>Cài đặt</h2>
            <p>Tùy chỉnh trải nghiệm ChessVerse theo phong cách của bạn.</p>
          </div>
          <button className="sd-x" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </header>

        <div className="sd-body">
          <nav className="sd-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                <img src={`${ICON}/${t.icon}.png`} alt="" />
                {t.label}
              </button>
            ))}
          </nav>

          <section className="sd-panel">
            {tab === "general" && (
              <>
                <Row icon={<Line d="M3 5h18v11H3zM8 20h8M12 16v4" />} title="Ngôn ngữ">
                  <select
                    className="sd-select"
                    value={draft.lang}
                    onChange={(e) => patch({ lang: e.target.value as Settings["lang"] })}
                  >
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="en" disabled>
                      🇬🇧 English (sắp có)
                    </option>
                  </select>
                </Row>

                <Row icon={<Line d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" />} title="Giao diện" hint="Nền tối hoặc nền sáng">
                  <div className="sd-seg" role="radiogroup" aria-label="Giao diện">
                    <button
                      role="radio"
                      aria-checked={themeDraft === "dark"}
                      className={themeDraft === "dark" ? "on" : ""}
                      onClick={() => {
                        setThemeDraft("dark");
                        setSaved(false);
                      }}
                    >
                      ☾ Tối
                    </button>
                    <button
                      role="radio"
                      aria-checked={themeDraft === "light"}
                      className={themeDraft === "light" ? "on" : ""}
                      onClick={() => {
                        setThemeDraft("light");
                        setSaved(false);
                      }}
                    >
                      ☀ Sáng
                    </button>
                  </div>
                </Row>

                <Row
                  icon={<Line d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2ZM10 21h4" />}
                  title="Nhận thông báo trong game"
                  hint="Chuông góc phải báo kết quả các trận"
                >
                  <Toggle on={draft.notifyInGame} onChange={(v) => patch({ notifyInGame: v })} label="Nhận thông báo trong game" />
                </Row>

                <Row
                  icon={<Line d="M4 12h4l3-7 4 14 3-7h2" />}
                  title="Giảm hiệu ứng chuyển động"
                  hint="Tắt bớt hoạt ảnh, phù hợp máy yếu"
                >
                  <Toggle on={draft.reduceMotion} onChange={(v) => patch({ reduceMotion: v })} label="Giảm hiệu ứng chuyển động" />
                </Row>
              </>
            )}

            {tab === "sound" && (
              <>
                <Row icon={<Line d="M4 9v6h4l5 4V5L8 9H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />} title="Bật âm thanh">
                  <Toggle on={draft.sound.enabled} onChange={(v) => patchSound({ enabled: v })} label="Bật âm thanh" />
                </Row>

                <Row icon={<Line d="M4 12h3M10 12h10M7 9v6" />} title="Âm lượng" hint={`${draft.sound.volume}%`}>
                  <div className="sd-volume">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={draft.sound.volume}
                      disabled={!draft.sound.enabled}
                      onChange={(e) => patchSound({ volume: Number(e.target.value) })}
                      style={{ "--v": `${draft.sound.volume}%` } as React.CSSProperties}
                      aria-label="Âm lượng"
                    />
                    <button
                      className="sd-mini"
                      disabled={!draft.sound.enabled}
                      onClick={() => playSound("test", { ...draft, sound: { ...draft.sound } })}
                    >
                      Nghe thử
                    </button>
                  </div>
                </Row>

                <div className={`sd-group${draft.sound.enabled ? "" : " off"}`}>
                  <Row icon={<Line d="M9 20h6M10 20l1-6-3-3 4-6 4 6-3 3 1 6" />} title="Nước đi & ăn quân" hint="Tiếng quân cờ, tiếng chiếu tướng">
                    <Toggle on={draft.sound.moves} onChange={(v) => patchSound({ moves: v })} label="Âm thanh nước đi" />
                  </Row>

                  <Row icon={<Line d="M5 4l14 16M19 4 5 20" />} title="Tìm thấy trận & kết thúc trận">
                    <Toggle on={draft.sound.match} onChange={(v) => patchSound({ match: v })} label="Âm thanh trận đấu" />
                  </Row>

                  <Row icon={<Line d="M12 8v5M12 16h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />} title="Âm báo" hint="Khi đối thủ mời hòa">
                    <Toggle on={draft.sound.alerts} onChange={(v) => patchSound({ alerts: v })} label="Âm báo" />
                  </Row>
                </div>
              </>
            )}

            {tab === "account" && (
              <>
                {me === undefined && <p className="sd-muted">Đang tải thông tin tài khoản...</p>}

                {me === null && (
                  <div className="sd-guest">
                    <p>Bạn chưa đăng nhập.</p>
                    <button className="sd-gold" onClick={() => go("/")}>
                      Về trang chủ để đăng nhập
                    </button>
                  </div>
                )}

                {me && (
                  <>
                    <div className="sd-card">
                      <PlayerAvatar avatar={me.avatarId} frame={me.avatarFrame} name={me.displayName} />
                      <div>
                        <strong>{me.displayName}</strong>
                        <small>
                          @{me.username} · {me.elo.toLocaleString("en-US")} Elo
                        </small>
                      </div>
                    </div>


                    <Row icon={<Line d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />} title="ID người chơi" hint="Gửi ID này cho bạn bè để họ tìm bạn">
                      <span className="sd-id">
                        <b>{me.playerCode ? `#${me.playerCode}` : "—"}</b>
                        {me.playerCode && (
                          <button className="sd-mini" onClick={() => copyId(me.playerCode!)}>
                            {copied ? "Đã chép ✓" : "Sao chép"}
                          </button>
                        )}
                      </span>
                    </Row>

                    <Row icon={<Line d="M4 6h16v12H4zM4 7l8 6 8-6" />} title="Email">
                      <span className="sd-value">{me.email}</span>
                    </Row>

                    <Row icon={<Line d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />} title="Tên đăng nhập">
                      <span className="sd-value">@{me.username}</span>
                    </Row>

                    {me.createdAt && (
                      <Row icon={<Line d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />} title="Ngày tham gia">
                        <span className="sd-value">{new Date(me.createdAt).toLocaleDateString("vi-VN")}</span>
                      </Row>
                    )}

                    <button className="sd-logout" onClick={logout}>
                      Đăng xuất
                    </button>
                  </>
                )}
              </>
            )}

            {tab === "support" && (
              <>
                <div className="sd-faq">
                  {FAQ.map((item) => (
                    <details key={item.q}>
                      <summary>{item.q}</summary>
                      <p>{item.a}</p>
                    </details>
                  ))}
                </div>

                <div className="sd-links">
                  <button onClick={() => go("/courses")}>
                    <img src={`${ICON}/globe.png`} alt="" />
                    Học luật chơi cơ bản
                  </button>
                  <button onClick={() => go("/history")}>
                    <img src={`${ICON}/game.png`} alt="" />
                    Lịch sử & phân tích ván đấu
                  </button>
                </div>

                <p className="sd-version">ChessVerse · phiên bản thử nghiệm</p>
              </>
            )}

            {(tab === "general" || tab === "sound") && (
              <footer className="sd-foot">
                <button className="sd-reset" onClick={reset}>
                  ↺ Khôi phục mặc định
                </button>
                <span className="sd-saved" aria-live="polite">
                  {saved ? "Đã lưu ✓" : ""}
                </span>
                <button className="sd-gold" onClick={save} disabled={!dirty}>
                  Lưu thay đổi
                </button>
              </footer>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
