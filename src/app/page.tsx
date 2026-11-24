"use client";
import { useEffect, useState } from "react";
import OnlineMatchOverlay from "./components/OnlineMatchOverlay";
import AuthModal, { type UserProfile } from "./components/AuthModal";
import { useRouter } from "next/navigation";
import { useTheme } from "./components/ThemeProvider";

type DashboardHistoryMatch = {
  id: string;
  myResult: "WIN" | "LOSS" | "DRAW";
  myEloAfter: number | null;
};


const menuItems = [
  { name: "Trang chủ", icon: "home" },
  { name: "Khóa học", icon: "book" },
  { name: "Bài học", icon: "grad" },
  { name: "Thử thách", icon: "trophy" },
  { name: "Đấu luyện", icon: "swords" },
  { name: "Bảng xếp hạng", icon: "chart" },
  { name: "Hồ sơ", icon: "people" },
  { name: "Cài đặt", icon: "gear" },
];

const courses = [
  { name: "Khai cuộc", en: "Opening", image: "course1" },
  { name: "Trung cuộc", en: "Middlegame", image: "course2" },
  { name: "Tàn cuộc", en: "Endgame", image: "course3" },
  { name: "Chiến thuật", en: "Tactics", image: "course4" },
];

const missions = [
  { text: "Chơi 1 ván xếp hạng", done: false },
  { text: "Thắng 1 ván đấu", done: false },
  { text: "Chơi 1 ván với máy", done: false },
];

const leaderboard = [
  { rank: 1, name: "GrandMaster", rating: 2845, country: "🇻🇳", change: "+24" },
  { rank: 2, name: "KnightSlayer", rating: 2790, country: "🇺🇸", change: "+18" },
  { rank: 3, name: "ShadowKing", rating: 2756, country: "🇰🇷", change: "+12" },
  { rank: 4, name: "ChessMaster", rating: 2698, country: "🇯🇵", change: "+8" },
];

export default function Home() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [activeMenu, setActiveMenu] = useState("Trang chủ");
  const [modal, setModal] = useState<"play" | "season" | "shop" | null>(null);
  const [notice, setNotice] = useState("");
  const [welcomeToastId, setWelcomeToastId] = useState(0);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [historyMatches, setHistoryMatches] = useState<
      DashboardHistoryMatch[]
    >([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<
  "ranked" | "casual" | "ai" | null
  >(null);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineMode, setOnlineMode] = useState<"ranked" | "casual">("ranked");

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
    setProfileMenuOpen(false);
    setNotice("Bạn đã đăng xuất khỏi ChessVerse.");
  } catch (error) {
    console.error("Đăng xuất thất bại:", error);
    setNotice("Không thể đăng xuất. Vui lòng thử lại.");
  }
}

  function selectMenu(name: string) {
  if (name === "Đấu luyện") {
    setModal("play");
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
            <button
              className="ac-bell"
              aria-label="Thông báo"
              onClick={() => setNotice("Bạn chưa có thông báo mới.")}
            >
              <span className="ac-bell-icon" />
            </button>

            {/* Công tắc Dark Mode / Light Mode */}
            <button
              type="button"
              className={`theme-toggle ac-theme ${theme}`}
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? "Chuyển sang chế độ sáng"
                  : "Chuyển sang chế độ tối"
              }
              aria-pressed={theme === "light"}
              title={theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
            >
              {theme === "dark" ? (
                <span className="theme-icon moon-icon">☾</span>
              ) : (
                <span className="theme-icon sun-icon">☀</span>
              )}
            </button>

            <div className="profile-menu-wrap">
              <button
                className="ac-profile"
                onClick={() => {
                  if (user) {
                    setProfileMenuOpen(!profileMenuOpen);
                  } else {
                    setAuthMode("login");
                    setAuthOpen(true);
                  }
                }}
              >
                <span className="ac-avatar">
                  {user ? user.displayName.charAt(0).toUpperCase() : "?"}
                </span>
                <span className="ac-profile-info">
                  <strong>{user?.displayName ?? "Đăng nhập"}</strong>
                  <small>{user ? `${user.elo.toLocaleString("en-US")} Elo` : "Khách"}</small>
                </span>
                <span className="ac-chevron">⌄</span>
              </button>

              {profileMenuOpen && user && (
                <div className="profile-dropdown">
                  <strong>{user.displayName}</strong>
                  <span>@{user.username}</span>
                  <span>{user.email}</span>
                  <span>{user.elo.toLocaleString("en-US")} Elo</span>

                  <button
                    className="ac-dropdown-link"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      router.push("/history");
                    }}
                  >
                    Lịch sử đấu
                  </button>

                  <button onClick={handleLogout}>Đăng xuất</button>
                </div>
              )}
            </div>
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
            <section className="ac-hero">
              <div className="ac-hero-shade" />
              <div className="ac-hero-center">
                <h2>ChessVerse</h2>
                <div className="ac-hero-sub">Học viện cờ vua</div>
                <p>
                  Rèn luyện tư duy - Nâng tầm chiến thuật - Chinh phục đỉnh cao
                </p>
                <button className="ac-gold-button" onClick={() => setModal("play")}>
                  ▶ Chơi ngay
                </button>
              </div>
              <div className="ac-hero-dots" aria-hidden="true">
                <i />
                <i className="on" />
                <i />
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

            {/* THỐNG KÊ + BẢNG XẾP HẠNG */}
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

                {leaderboard.slice(0, 3).map((player) => (
                  <div className="ac-board-row" key={player.rank}>
                    <span className={`ac-rank rank-${player.rank}`}>
                      {player.rank}
                    </span>
                    <span className="ac-board-avatar">
                      {player.name.charAt(0)}
                    </span>
                    <strong>
                      {player.name} {player.country}
                    </strong>
                    <span className="ac-board-elo">
                      Elo {player.rating.toLocaleString("en-US")}
                    </span>
                  </div>
                ))}
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
                <span className="ac-chip">SẮP RA MẮT</span>
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
                  onClick={() =>
                    setNotice("Hệ thống nhiệm vụ sẽ được phát triển sau.")
                  }
                >
                  Nhận thưởng
                </button>
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