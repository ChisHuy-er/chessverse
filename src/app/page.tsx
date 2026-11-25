"use client";
import { useEffect, useState, type CSSProperties } from "react";
import OnlineMatchOverlay from "./components/OnlineMatchOverlay";
import AuthModal, { type UserProfile } from "./components/AuthModal";
import ProfileMenu from "./components/ProfileMenu";
import NotificationBell from "./components/NotificationBell";
import TopWallet from "./components/TopWallet";
import IdleLogout from "./components/IdleLogout";
import SettingsMenu from "./components/SettingsMenu";
import { USER_EVENT } from "./components/SettingsDialog";
import { useRouter } from "next/navigation";
import PlayerAvatar from "./components/PlayerAvatar";
import { getCover } from "./lib/appearance";
import { HeroSlides, HERO_SLIDE_COUNT, useHeroSlide } from "./components/HeroSlides";
import "./home-leaders.css";

type DashboardHistoryMatch = {
  id: string;
  myResult: "WIN" | "LOSS" | "DRAW";
  myEloAfter: number | null;
};


const menuItems = [
  { name: "Trang chủ", icon: "home" },
  { name: "Khóa học", icon: "book" },
  { name: "Thử thách", icon: "trophy" },
  { name: "Đấu luyện", icon: "swords" },
  { name: "Bảng xếp hạng", icon: "chart" },
  { name: "Câu lạc bộ", icon: "club" },
  { name: "Bạn bè", icon: "friends" },
  { name: "Cửa hàng", icon: "shop" },
];

const courses = [
  { name: "Khai cuộc", en: "Opening", image: "course1" },
  { name: "Trung cuộc", en: "Middlegame", image: "course2" },
  { name: "Tàn cuộc", en: "Endgame", image: "course3" },
  { name: "Chiến thuật", en: "Tactics", image: "course4" },
];

// Nhiệm vụ mặc định khi chưa đăng nhập
const GUEST_MISSIONS = [
  { text: "Chơi 3 trận đấu online", done: false },
  { text: "Thắng 1 trận đấu online", done: false },
  { text: "Giải 3 bài trên Bản đồ thử thách", done: false },
];

type Leader = {
  rank: number;
  id: string;
  name: string;
  elo: number;
  avatarId?: string | null;
  avatarFrame?: string | null;
  cover?: string | null;
};

export default function Home() {
  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState("Trang chủ");
  const [heroSlide, setHeroSlide] = useHeroSlide();
  const [modal, setModal] = useState<"play" | "season" | "shop" | null>(null);
  const [notice, setNotice] = useState("");
  const [missions, setMissions] = useState(GUEST_MISSIONS);

  // Bị tự đăng xuất vì treo máy quá lâu
  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.get("idle") === null) return;

    url.searchParams.delete("idle");
    window.history.replaceState(null, "", url.pathname + url.search);
    setNotice("Bạn đã được tự động đăng xuất vì không hoạt động quá 30 phút. Hãy đăng nhập lại để tiếp tục.");
  }, []);

  // Nhiệm vụ hôm nay lấy từ trang Thử thách
  useEffect(() => {
    fetch("/api/challenges", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { quests?: { scope: string; title: string; progress: number; target: number }[] } | null) => {
        const daily = d?.quests?.filter((q) => q.scope === "daily").slice(0, 3);

        if (daily?.length) {
          setMissions(daily.map((q) => ({ text: `${q.title} (${q.progress}/${q.target})`, done: q.progress >= q.target })));
        }
      })
      .catch(() => {});
  }, []);
  const [welcomeToastId, setWelcomeToastId] = useState(0);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [historyMatches, setHistoryMatches] = useState<
      DashboardHistoryMatch[]
    >([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [pendingMode, setPendingMode] = useState<
  "ranked" | "casual" | "ai" | null
  >(null);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineMode, setOnlineMode] = useState<"ranked" | "casual">("ranked");

  // Đổi tên hiển thị trong Cài đặt → Tài khoản: cập nhật ngay.
  useEffect(() => {
    function onUser(e: Event) {
      const { displayName } = (e as CustomEvent<{ displayName: string }>).detail;

      setUser((current) => (current ? { ...current, displayName } : current));
    }

    window.addEventListener(USER_EVENT, onUser);

    return () => window.removeEventListener(USER_EVENT, onUser);
  }, []);

// Tự động đóng thông báo chào mừng sau 4 giây
  useEffect(() => {
    if (welcomeToastId === 0) return;

    const timer = window.setTimeout(() => {
      setWelcomeToastId(0);
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [welcomeToastId]);

  useEffect(() => {
  let active = true;

  async function loadUser() {
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
      });

      if (!response.ok) return;

      const data = await response.json();

      if (active && data.user) {
        setUser(data.user);
      }
    } catch (error) {
      console.error("Không thể tải thông tin người dùng:", error);
    }
  }

  loadUser();

  return () => {
    active = false;
  };
  }, []);


  useEffect(() => {
    let active = true;

    async function loadLeaders() {
      try {
        const response = await fetch("/api/online/leaderboard", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();

        if (active && Array.isArray(data.leaders)) {
          setLeaders(data.leaders);
        }
      } catch (error) {
        console.error("Không thể tải bảng xếp hạng:", error);
      }
    }

    loadLeaders();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        const response = await fetch("/api/online/history", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();

        if (active && Array.isArray(data.matches)) {
          setHistoryMatches(data.matches);
        }
      } catch (error) {
        console.error("Không thể tải lịch sử đấu:", error);
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, []);


    function startMatch(mode: "ranked" | "casual" | "ai") {
        setModal(null);

        if (!user) {
          setPendingMode(mode);
          setAuthMode("login");
          setAuthOpen(true);
          setNotice("Bạn cần đăng nhập để bắt đầu trận đấu.");
          return;
        }

        if (mode === "ranked" || mode === "casual") {
          setOnlineMode(mode);
          setOnlineOpen(true);
        } else {
          router.push("/play");
        }
      }

      function handleAuthSuccess(profile: UserProfile) {
        setUser(profile);
        setAuthOpen(false);
        setNotice("");
        setWelcomeToastId((current) => current + 1);

        if (pendingMode) {
          const selectedMode = pendingMode;
          setPendingMode(null);

          if (selectedMode === "ranked" || selectedMode === "casual") {
            setOnlineMode(selectedMode);
            setOnlineOpen(true);
          } else {
            router.push("/play");
          }
        }
      }

      async function handleLogout() {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
      });

    setUser(null);
    setNotice("Bạn đã đăng xuất khỏi ChessVerse.");
  } catch (error) {
    console.error("Đăng xuất thất bại:", error);
    setNotice("Không thể đăng xuất. Vui lòng thử lại.");
  }
}

  function selectMenu(name: string) {
  if (name === "Đấu luyện") {
    router.push("/practice");
    return;
  }

  if (name === "Bảng xếp hạng") {
    router.push("/leaderboard");
    return;
  }

  if (name === "Thử thách") {
    router.push("/challenges");
    return;
  }

  if (name === "Hồ sơ") {
    router.push("/profile");
    return;
  }

  if (name === "Câu lạc bộ") {
    router.push("/club");
    return;
  }

  if (name === "Bạn bè") {
    router.push("/friends");
    return;
  }

  if (name === "Cửa hàng") {
    router.push("/shop");
    return;
  }

  if (name === "Khóa học") {
    router.push("/courses");
    return;
  }

  setActiveMenu(name);

  if (name !== "Trang chủ") {
    setNotice(`Khu vực "${name}" sẽ được phát triển trong các bước tiếp theo.`);
  } else {
    setNotice("");
  }
}

// Tính toán thống kê lịch sử đấu
const totalMatches = historyMatches.length;

const totalWins = historyMatches.filter(
  (match) => match.myResult === "WIN",
).length;

const totalLosses = historyMatches.filter(
  (match) => match.myResult === "LOSS",
).length;

const totalDraws = historyMatches.filter(
  (match) => match.myResult === "DRAW",
).length;

const winRate = totalMatches > 0
  ? Math.round((totalWins / totalMatches) * 100)
  : 0;

// Dữ liệu biểu đồ Elo từ lịch sử đấu thật.
const rawElo = historyMatches
  .map((match) => match.myEloAfter)
  .filter((value): value is number => typeof value === "number");

// Lịch sử thường xếp mới nhất trước: nếu phần tử đầu khớp Elo hiện tại thì đảo lại.
const eloSeries = (
  user && rawElo.length > 1 && rawElo[0] === user.elo ? [...rawElo].reverse() : rawElo
).slice(-12);

const eloMin = Math.min(...eloSeries);
const eloMax = Math.max(...eloSeries);
const eloRange = Math.max(1, eloMax - eloMin);

const chartPoints = eloSeries.map((value, index) => ({
  x: 20 + (index / Math.max(1, eloSeries.length - 1)) * 360,
  y: 100 - ((value - eloMin) / eloRange) * 80,
}));

const eloDelta =
  eloSeries.length > 1
    ? eloSeries[eloSeries.length - 1] - eloSeries[eloSeries.length - 2]
    : 0;

  return (
    <main className="ac-shell">
      <IdleLogout active={!!user} />
      <aside className="ac-sidebar">
        <div className="ac-logo">
          <div className="ac-logo-emblem" />
          <div className="ac-logo-name">ChessVerse</div>
          <div className="ac-logo-caption">Học viện cờ vua</div>
        </div>

        <nav className="ac-nav">
          {menuItems.map((item) => (
            <button
              key={item.name}
              onClick={() => selectMenu(item.name)}
              className={`ac-nav-item ${activeMenu === item.name ? "active" : ""}`}
            >
              <span
                className="ac-nav-icon"
                style={{
                  backgroundImage: `url(/images/academy/icon-${item.icon}.png)`,
                }}
              />
              <span className="ac-nav-text">{item.name}</span>
            </button>
          ))}
        </nav>

        <div className="ac-side-bottom">
          <p>
            “Học cờ hôm nay,
            <br />
            chiến thắng ngày mai”
          </p>
        </div>
      </aside>

      <section className="ac-main">
        <header className="ac-topbar">
          <div className="ac-greeting">
            <div className="ac-crown" />
            <div>
              <div className="ac-greeting-title">
                Xin chào, <span>{user?.displayName ?? "Kỳ thủ"}!</span>
              </div>
              <div className="ac-greeting-sub">
                Học tập chăm chỉ, từng nước đi sẽ đưa bạn đến đỉnh cao!
              </div>
            </div>
          </div>

          <div className="ac-top-actions">
            <TopWallet />
            <NotificationBell userId={user?.id} />
            <SettingsMenu />


            <ProfileMenu
              user={user}
              onGuestClick={() => {
                setAuthMode("login");
                setAuthOpen(true);
              }}
              onLogout={handleLogout}
            />
          </div>
        </header>

        {notice && (
          <div className="ac-notice">
            <span>ⓘ</span>
            <p>{notice}</p>
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}

        <div className="ac-grid">
          <div className="ac-col-main">
            {/* BANNER */}
            <section className={`ac-hero${heroSlide ? " hs-away" : ""}`}>
              <div className="ac-hero-shade" />
              <div className="ac-hero-center">
                <h2>ChessVerse</h2>
                <div className="ac-hero-sub">Học viện cờ vua</div>
                <p>
                  Rèn luyện tư duy - Nâng tầm chiến thuật - Chinh phục đỉnh cao
                </p>
                <button className="ac-gold-button" tabIndex={heroSlide ? -1 : 0} onClick={() => setModal("play")}>
                  ▶ Chơi ngay
                </button>
              </div>
              <HeroSlides slide={heroSlide} onShop={() => router.push("/shop")} onPlay={() => setModal("play")} />
              <div className="ac-hero-dots">
                {Array.from({ length: HERO_SLIDE_COUNT }, (_, i) => (
                  <button
                    key={i}
                    className={i === heroSlide ? "on" : ""}
                    aria-label={`Trang ${i + 1}`}
                    onClick={() => setHeroSlide(i)}
                  />
                ))}
              </div>
            </section>

            {/* KHÓA HỌC */}
            <section className="ac-panel">
              <div className="ac-panel-head">
                <h3>
                  <span className="ac-head-icon">▤</span> Khóa học nổi bật
                </h3>
                <button
                  className="ac-link"
                  onClick={() => selectMenu("Khóa học")}
                >
                  Xem tất cả →
                </button>
              </div>

              <div className="ac-courses">
                {courses.map((course) => (
                  <div className="ac-course" key={course.name}>
                    <div
                      className="ac-course-art"
                      style={{
                        backgroundImage: `url(/images/academy/${course.image}.jpg)`,
                      }}
                    />
                    <div className="ac-course-name">{course.name}</div>
                    <div className="ac-course-en">({course.en})</div>
                    <div className="ac-course-soon">SẮP RA MẮT</div>
                    <button
                      className="ac-gold-button small"
                      onClick={() => selectMenu("Khóa học")}
                    >
                      ▶ Bắt đầu học
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* THỐNG KÊ */}
            <div className="ac-bottom">
              <section className="ac-panel ac-stats">
                <div className="ac-panel-head">
                  <h3>
                    <span className="ac-head-icon">▥</span> Thống kê của bạn
                  </h3>
                  <span className="ac-chip">Các trận gần nhất</span>
                </div>

                <div className="ac-stats-body">
                  <div className="ac-elo-box">
                    <div className="ac-badge" />
                    <div>
                      <div className="ac-label">Elo Rating</div>
                      <div className="ac-elo-value">
                        {user ? user.elo.toLocaleString("en-US") : "—"}
                        {eloDelta !== 0 && (
                          <span className={eloDelta > 0 ? "up" : "down"}>
                            {eloDelta > 0 ? "↑ +" : "↓ "}
                            {eloDelta}
                          </span>
                        )}
                      </div>
                      <div className="ac-label">
                        {totalMatches} trận đã chơi
                      </div>
                    </div>
                  </div>

                  <div className="ac-chart">
                    {eloSeries.length > 1 ? (
                      <svg viewBox="0 0 400 120" preserveAspectRatio="none">
                        <polyline
                          fill="none"
                          stroke="#7aa8ff"
                          strokeWidth="2.5"
                          points={chartPoints
                            .map((p) => `${p.x},${p.y}`)
                            .join(" ")}
                        />
                        {chartPoints.map((p, index) => (
                          <circle
                            key={index}
                            cx={p.x}
                            cy={p.y}
                            r="4"
                            fill="#fff"
                          />
                        ))}
                      </svg>
                    ) : (
                      <div className="ac-chart-empty">
                        Chơi thêm vài ván xếp hạng để xem biểu đồ Elo.
                      </div>
                    )}
                  </div>
                </div>
              </section>

            </div>
          </div>

          <div className="ac-col-side">
            {/* TỔNG QUAN */}
            <section className="ac-panel">
              <div className="ac-panel-head">
                <h3>
                  <span className="ac-head-icon">▥</span> Tổng quan
                </h3>
              </div>

              <div className="ac-overview">
                <div className="ac-ring-wrap">
                  <div
                    className="win-ring big"
                    style={{ "--p": `${winRate}` } as React.CSSProperties}
                  >
                    <span>
                      {winRate}
                      <small>%</small>
                    </span>
                  </div>
                  <div className="ac-label center">Tỷ lệ thắng</div>
                </div>

                <div className="ac-overview-stats">
                  <div>
                    <div className="ac-label">Elo Rating</div>
                    <div className="ac-big-number">
                      {user ? user.elo.toLocaleString("en-US") : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="ac-label">Thắng · Thua · Hòa</div>
                    <div className="ac-big-number small">
                      {totalWins} · {totalLosses} · {totalDraws}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* NHIỆM VỤ */}
            <section className="ac-panel">
              <div className="ac-panel-head">
                <h3>
                  <span className="ac-head-icon">⚑</span> Nhiệm vụ hôm nay
                </h3>
                <span className="ac-chip">
                  {missions.filter((m) => m.done).length}/{missions.length}
                </span>
              </div>

              <div className="ac-missions">
                {missions.map((mission) => (
                  <div className="ac-mission" key={mission.text}>
                    <span
                      className="ac-check"
                      style={{
                        backgroundImage: `url(/images/academy/${
                          mission.done ? "check" : "radio"
                        }.png)`,
                      }}
                    />
                    <span>{mission.text}</span>
                  </div>
                ))}
              </div>

              <div className="ac-reward">
                <div className="ac-chest" />
                <button
                  className="ac-gold-button"
                  onClick={() => router.push("/challenges")}
                >
                  Nhận thưởng
                </button>
              </div>
            </section>

            {/* BẢNG XẾP HẠNG (top 3) */}
            <section className="ac-panel ac-board">
              <div className="ac-panel-head">
                <h3>
                  <span className="ac-head-icon">♕</span> Bảng xếp hạng
                </h3>
                <button
                  className="ac-link"
                  onClick={() => selectMenu("Bảng xếp hạng")}
                >
                  Xem thêm →
                </button>
              </div>

              {leaders.length === 0 && (
                <p className="ac-board-empty">Chưa có người chơi nào.</p>
              )}

              {/* Top 3 — cùng kiểu Bảng xếp hạng: ảnh nền hồ sơ, avatar + khung, khiên hạng */}
              <div className="hl-list">
                {leaders.slice(0, 3).map((player) => (
                  <button
                    className={`hl-row r${player.rank}${
                      player.id === (user as { id?: string } | null)?.id ? " me" : ""
                    }`}
                    key={player.id}
                    style={{ "--cover": `url(${getCover(player.cover).src})` } as CSSProperties}
                    onClick={() => selectMenu("Bảng xếp hạng")}
                  >
                    <img
                      className="hl-shield"
                      src={`/images/academy/lb/shield${player.rank}.png`}
                      alt={`Hạng ${player.rank}`}
                    />
                    <PlayerAvatar
                      avatar={player.avatarId}
                      frame={player.avatarFrame}
                      name={player.name}
                      className="hl-pa"
                    />
                    <strong>{player.name}</strong>
                    <span className="hl-elo">{player.elo.toLocaleString("en-US")} Elo</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
            {modal === "play" && (
              <>
                <div className="modal-kicker">CHOOSE YOUR BATTLE</div>
                <h2>Bạn muốn chơi chế độ nào?</h2>
                <p className="modal-description">Chọn cách bạn muốn bước vào bàn cờ.</p>
                <div className="mode-list">
                  <button onClick={() => startMatch("ranked")}>
                    <span>♛</span>
                    <div>
                      <strong>Đấu xếp hạng</strong>
                      <small>Thi đấu để tăng Elo và thăng rank</small>
                    </div>
                    <b>→</b>
                  </button>

                  <button onClick={() => startMatch("casual")}>
                    <span>♞</span>
                    <div>
                      <strong>Đấu thường</strong>
                      <small>Chơi giải trí, không ảnh hưởng Elo</small>
                    </div>
                    <b>→</b>
                  </button>

                  <button onClick={() => startMatch("ai")}>
                    <span>♟</span>
                    <div>
                      <strong>Đấu với máy</strong>
                      <small>Luyện tập cùng đối thủ AI</small>
                    </div>
                    <b>→</b>
                  </button>
                </div>
              </>
            )}
            {modal === "season" && (
              <>
                <div className="modal-kicker">SEASON 01 · THE AWAKENING</div>
                <h2>Hành trình mùa giải</h2>
                <p className="modal-description">Thi đấu, hoàn thành nhiệm vụ và mở khóa phần thưởng độc quyền.</p>
                <div className="modal-feature"><span>♜</span><div><strong>Golden Knight Skin</strong><small>Phần thưởng ở cấp độ 15</small></div></div>
                <div className="modal-feature"><span>♛</span><div><strong>Season Champion Frame</strong><small>Phần thưởng ở cấp độ 30</small></div></div>
                <button className="primary-button modal-action" onClick={() => { setModal(null); setNotice("Hệ thống nhiệm vụ mùa giải sẽ được phát triển sau."); }}>Đã hiểu</button>
              </>
            )}
            {modal === "shop" && (
              <>
                <div className="modal-kicker">CHESSVERSE MARKETPLACE</div>
                <h2>Cửa hàng vật phẩm</h2>
                <p className="modal-description">Tùy chỉnh trải nghiệm và thể hiện phong cách riêng trên bàn cờ.</p>
                <div className="modal-feature"><span>♞</span><div><strong>Golden Knight</strong><small>Skin quân mã · 1,200 CV Coins</small></div></div>
                <div className="modal-feature"><span>▦</span><div><strong>Royal Gold Board</strong><small>Skin bàn cờ · Sắp ra mắt</small></div></div>
                <button className="primary-button modal-action" onClick={() => { setModal(null); setNotice("Chức năng mua vật phẩm sẽ được phát triển sau."); }}>Đã hiểu</button>
              </>
            )}
          </div>
        </div>
            )}
          {welcomeToastId > 0 && (
      <div
        className="welcome-toast"
        role="status"
        aria-live="polite"
      >
        <div className="welcome-toast-icon">
          ♞
        </div>

        <div className="welcome-toast-content">
          <span className="welcome-toast-brand">
            CHESSVERSE
          </span>

          <strong>Đăng nhập thành công</strong>

          <p>
            Chào mừng bạn đến với CHESSVERSE!
          </p>

          <small>
            Rất vui khi bạn tham gia. Hãy sẵn sàng cho
            những trận đấu cờ vua đầy thử thách!
          </small>
        </div>

        <button
          type="button"
          aria-label="Đóng thông báo"
          onClick={() => setWelcomeToastId(0)}
        >
          ×
        </button>
      </div>
    )}
      {onlineOpen && (
      <OnlineMatchOverlay
        mode={onlineMode}
        onClose={() => setOnlineOpen(false)}
      />
      )}

    <AuthModal
      key={authMode}
      open={authOpen}
      initialMode={authMode}
      onClose={() => {
        setAuthOpen(false);
        setPendingMode(null);
      }}
      onSuccess={handleAuthSuccess}
    />
    </main>
  );
}