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
  { name: "Tổng quan", icon: "⌂" },
  { name: "Chơi cờ", icon: "♟" },
  { name: "Lịch sử đấu", icon: "◷" },
  { name: "Học viện", icon: "▤" },
  { name: "Giải đấu", icon: "♜" },
  { name: "Bảng xếp hạng", icon: "♛" },
  { name: "Bạn bè", icon: "♙" },
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
  const [activeMenu, setActiveMenu] = useState("Tổng quan");
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
  if (name === "Lịch sử đấu") {
    router.push("/history");
    return;
  }

  if (name === "Chơi cờ") {
    router.push("/play");
    return;
  }

  setActiveMenu(name);

  if (name !== "Tổng quan") {
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">♞</div>
          <div>
            <div className="brand-name">CHESS<span>VERSE</span></div>
            <div className="brand-caption">THE NEXT MOVE</div>
          </div>
        </div>

        <div className="sidebar-section-label">MENU CHÍNH</div>
        <nav className="nav-list">
          {menuItems.map((item) => (
            <button
              key={item.name}
              onClick={() => selectMenu(item.name)}
              className={`nav-item ${activeMenu === item.name ? "active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.name}</span>
              {item.name === "Giải đấu" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-section-label community-label">CỘNG ĐỒNG</div>
        <button className="nav-item" onClick={() => setNotice("Tính năng cộng đồng đang được phát triển.")}>
          <span className="nav-icon">◎</span>
          <span>Thảo luận</span>
        </button>
        <button className="nav-item" onClick={() => setNotice("Tính năng tin nhắn đang được phát triển.")}>
          <span className="nav-icon">✉</span>
          <span>Tin nhắn</span>
        </button>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">✦</div>
            <div className="upgrade-title">ChessVerse Pro</div>
            <p>Mở khóa trải nghiệm cờ vua cao cấp.</p>
            <button onClick={() => setNotice("Gói ChessVerse Pro sẽ được ra mắt trong tương lai.")}>
              Khám phá Pro <span>→</span>
            </button>
          </div>

          <button className="nav-item settings-item" onClick={() => setNotice("Cài đặt sẽ được phát triển sau.")}>
            <span className="nav-icon">⚙</span>
            <span>Cài đặt</span>
          </button>

          <div className="sidebar-version">CHESSVERSE WEB · VERSION 0.1</div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>ChessVerse</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{activeMenu}</strong>
          </div>

          <div className="topbar-actions">
            <button
              className="icon-button notification-button"
              aria-label="Thông báo"
              onClick={() => setNotice("Bạn chưa có thông báo mới.")}
            >
              ♧
              <span />
            </button>

      {/* Công tắc Dark Mode / Light Mode */}
      <button
      type="button"
      className={`theme-toggle ${theme}`}
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

    <div className="topbar-divider" />
            
        <div className="profile-menu-wrap">
          <button
            className="profile-mini"
            onClick={() => {
              if (user) {
                setProfileMenuOpen(!profileMenuOpen);
              } else {
                setAuthMode("login");
                setAuthOpen(true);
              }
            }}
          >
            <div className="avatar">
              {user ? user.displayName.charAt(0).toUpperCase() : "?"}
            </div>

            <div className="profile-mini-info">
              <strong>{user?.displayName ?? "Đăng nhập"}</strong>
              <span>
                <i /> {user ? `${user.elo} Elo` : "Khách"}
              </span>
            </div>

            <span className="profile-chevron">⌄</span>
          </button>

          {profileMenuOpen && user && (
            <div className="profile-dropdown">
              <strong>{user.displayName}</strong>
              <span>@{user.username}</span>
              <span>{user.email}</span>
              <span>{user.elo.toLocaleString("en-US")} Elo</span>

              <button onClick={handleLogout}>
                Đăng xuất
              </button>
            </div>
          )}
        </div>

          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow"><span /> CHÀO MỪNG TRỞ LẠI</div>
              <h1>
                  Xin chào, <span>{user?.displayName ?? "Khách"}.</span>
              </h1>
              <p className="welcome-subtitle">Một ngày mới, một ván cờ mới. Nước đi tiếp theo của bạn là gì?</p>
            </div>
            <div className="date-display">
              <span className="date-icon">◷</span>
              <div>
                <strong>CHESSVERSE SEASON 01</strong>
                <span>THE AWAKENING</span>
              </div>
            </div>
          </div>

          {notice && (
            <div className="notice">
              <span>ⓘ</span>
              <p>{notice}</p>
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}

          <section className="hero-card">
            <div className="hero-content">
              <div className="hero-tag"><span /> YOUR BATTLE BEGINS HERE</div>
              <h2>THINK.<br /><span>MOVE.</span> CONQUER.</h2>
              <p>Thử thách trí tuệ. Chinh phục thứ hạng.<br />Viết nên hành trình huyền thoại của riêng bạn.</p>
              <div className="hero-buttons">
                <button className="primary-button" onClick={() => setModal("play")}>
                  <span>♟</span> CHƠI NGAY <span className="button-arrow">→</span>
                </button>
                <button className="secondary-button" onClick={() => selectMenu("Học viện")}>
                  Khám phá học viện
                </button>
              </div>
              <div className="hero-footnote"><span className="live-dot" /> 1,284 NGƯỜI ĐANG THI ĐẤU</div>
            </div>
            <div className="hero-art">
              <div className="hero-circle circle-one" />
              <div className="hero-circle circle-two" />
              <div className="hero-chess-piece">♞</div>
              <div className="hero-art-label">STRATEGY IS<br /><strong>EVERYTHING.</strong></div>
              <div className="hero-art-number">01</div>
            </div>
            <div className="hero-season">S01 / 2026</div>
          </section>

      <section className="stats-grid">
        {/* Rating */}
        <div className="stat-card">
          <div className="stat-top">
            <span>RATING CỦA BẠN</span>
            <span className="stat-symbol">♛</span>
          </div>

          <div className="stat-value">
            {user ? user.elo.toLocaleString("en-US") : "—"}
          </div>

          <div className="stat-bottom">
            <span className="stat-bar">
              <i style={{ width: "62%" }} />
            </span>
            <span>Gold III</span>
          </div>
        </div>

        {/* Tổng số trận */}
        <div className="stat-card">
          <div className="stat-top">
            <span>TỔNG SỐ TRẬN</span>
            <span className="stat-symbol">⚔</span>
          </div>

          <div className="stat-value">{totalMatches}</div>

          <div className="stat-bottom">
            <span className="muted-text">Trận đã hoàn thành</span>
            <span>↗</span>
          </div>
        </div>

        {/* Tỷ lệ chiến thắng */}
        <div className="stat-card">
          <div className="stat-top">
            <span>TỶ LỆ CHIẾN THẮNG</span>
            <span className="stat-symbol">◉</span>
          </div>

          <div className="stat-value">
            {winRate}<span className="stat-percent">%</span>
          </div>

          <div className="stat-bottom">
            <span className="muted-text">
              {totalWins} thắng · {totalLosses} thua
            </span>
            <span className="positive-text">Thống kê</span>
          </div>
        </div>

        {/* Trận hòa */}
        <div className="stat-card">
          <div className="stat-top">
            <span>TRẬN HÒA</span>
            <span className="stat-symbol">♨</span>
          </div>

          <div className="stat-value">{totalDraws}</div>

          <div className="stat-bottom">
            <span className="muted-text">Tổng số trận hòa</span>
            <span className="streak-icon">✦</span>
          </div>
        </div>
      </section>

          <div className="content-grid">
            <section className="section-card season-card">
              <div className="section-heading">
                <div>
                  <div className="section-kicker">COMPETITIVE MODE</div>
                  <h3>Mùa giải hiện tại</h3>
                </div>
                <span className="season-badge">ĐANG DIỄN RA</span>
              </div>

              <div className="season-banner">
                <div className="season-banner-content">
                  <span className="season-number">SEASON 01</span>
                  <h4>THE<br /><span>AWAKENING</span></h4>
                  <p>Hành trình trở thành huyền thoại bắt đầu từ đây.</p>
                </div>
                <div className="season-emblem">♛</div>
              </div>

              <div className="season-progress-heading">
                <span>TIẾN ĐỘ MÙA GIẢI</span>
                <strong>Level 12 <span>/ 30</span></strong>
              </div>
              <div className="progress-track"><div /></div>
              <div className="season-reward-row">
                <div><span className="reward-icon">♜</span><span>Phần thưởng tiếp theo</span></div>
                <strong>Golden Knight Skin</strong>
              </div>
              <button className="text-link" onClick={() => setModal("season")}>Xem chi tiết mùa giải <span>→</span></button>
            </section>

            <section className="section-card tournament-card">
              <div className="section-heading">
                <div>
                  <div className="section-kicker">UPCOMING EVENT</div>
                  <h3>Giải đấu sắp tới</h3>
                </div>
                <span className="tournament-live">● OPEN</span>
              </div>

              <div className="tournament-visual">
                <div className="tournament-cup">♜</div>
                <div>
                  <span className="tournament-type">WEEKLY CHAMPIONSHIP</span>
                  <h4>THE ROYAL<br />CHALLENGE</h4>
                </div>
              </div>

              <div className="tournament-info">
                <div><span>◷</span><div><small>THỜI GIAN</small><strong>Chủ nhật · 20:00</strong></div></div>
                <div><span>♙</span><div><small>NGƯỜI THAM GIA</small><strong>64 / 128 người</strong></div></div>
                <div><span>✦</span><div><small>TỔNG GIẢI THƯỞNG</small><strong className="gold-text">5,000 CV Coins</strong></div></div>
              </div>
              <button className="outline-button" onClick={() => setNotice("Đăng ký giải đấu sẽ được kết nối sau khi hoàn thành hệ thống tài khoản.")}>Tìm hiểu giải đấu <span>→</span></button>
            </section>
          </div>

          <div className="bottom-grid">
            <section className="section-card leaderboard-card">
              <div className="section-heading">
                <div>
                  <div className="section-kicker">GLOBAL RANKING</div>
                  <h3>Bảng xếp hạng</h3>
                </div>
                <button className="text-link compact-link" onClick={() => selectMenu("Bảng xếp hạng")}>Xem tất cả →</button>
              </div>

              <div className="leaderboard-header">
                <span>HẠNG</span><span>NGƯỜI CHƠI</span><span>RATING</span><span>THAY ĐỔI</span>
              </div>
              {leaderboard.map((player) => (
                <div className="leaderboard-row" key={player.rank}>
                  <span className={`rank-number rank-${player.rank}`}>{String(player.rank).padStart(2, "0")}</span>
                  <div className="leader-player"><span className="leader-avatar">{player.name.charAt(0)}</span><strong>{player.country} {player.name}</strong></div>
                  <strong className="leader-rating">{player.rating.toLocaleString("en-US")}</strong>
                  <span className="leader-change">{player.change}</span>
                </div>
              ))}
            </section>

            <section className="section-card shop-card">
              <div className="section-heading">
                <div>
                  <div className="section-kicker">CUSTOMIZE YOUR GAME</div>
                  <h3>Cửa hàng vật phẩm</h3>
                </div>
                <span className="shop-currency">✦ 2,450</span>
              </div>
              <div className="shop-preview">
                <div className="shop-piece">♞</div>
                <div className="shop-item-info">
                  <span className="shop-category">LEGENDARY SKIN</span>
                  <h4>Golden Knight</h4>
                  <p>Biến quân mã của bạn thành biểu tượng quyền lực.</p>
                  <div className="shop-price">1,200 <span>CV COINS</span></div>
                </div>
              </div>
              <button className="outline-button shop-button" onClick={() => setModal("shop")}>Khám phá cửa hàng <span>→</span></button>
            </section>
          </div>

          <footer className="page-footer">
            <span>© 2026 CHESSVERSE. ALL RIGHTS RESERVED.</span>
            <span>BUILT FOR THE LOVE OF CHESS <strong>♟</strong></span>
          </footer>
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