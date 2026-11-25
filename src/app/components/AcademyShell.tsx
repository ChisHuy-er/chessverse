"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./NotificationBell";
import TopWallet from "./TopWallet";
import IdleLogout from "./IdleLogout";
import SettingsMenu from "./SettingsMenu";
import { USER_EVENT } from "./SettingsDialog";
import { APPEARANCE_EVENT, type Appearance } from "../lib/appearance";

type ShellUser = {
  id?: string;
  displayName: string;
  elo: number;
  avatarId?: string | null;
  avatarFrame?: string | null;
};

const menuItems = [
  { name: "Trang chủ", icon: "home", href: "/" },
  { name: "Khóa học", icon: "book", href: "/courses" },
  { name: "Thử thách", icon: "trophy", href: "/challenges" },
  { name: "Đấu luyện", icon: "swords", href: "/practice" },
  { name: "Bảng xếp hạng", icon: "chart", href: "/leaderboard" },
  { name: "Câu lạc bộ", icon: "club", href: "/club" },
  { name: "Bạn bè", icon: "friends", href: "/friends" },
  { name: "Cửa hàng", icon: "shop", href: "/shop" },
];

type Props = {
  active: string;
  title?: string;
  subtitle?: string;
  children: (user: ShellUser | null) => ReactNode;
};

// Khung chung (thanh bên + thanh trên) cho các trang phụ của giao diện Academy.
export default function AcademyShell({ active, title, subtitle, children }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<ShellUser | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });

        if (!response.ok) return;

        const data = await response.json();

        if (alive && data.user) setUser(data.user);
      } catch (error) {
        console.error("Không thể tải thông tin người dùng:", error);
      }
    }

    loadUser();

    // Trang Hồ sơ lưu ảnh đại diện mới → cập nhật ngay góc phải.
    function onAppearance(e: Event) {
      const value = (e as CustomEvent<Appearance>).detail;

      setUser((current) =>
        current ? { ...current, avatarId: value.avatar, avatarFrame: value.frame } : current,
      );
    }

    // Đổi tên hiển thị trong Cài đặt → Tài khoản
    function onUser(e: Event) {
      const { displayName } = (e as CustomEvent<{ displayName: string }>).detail;

      setUser((current) => (current ? { ...current, displayName } : current));
    }

    window.addEventListener(APPEARANCE_EVENT, onAppearance);
    window.addEventListener(USER_EVENT, onUser);

    return () => {
      alive = false;
      window.removeEventListener(APPEARANCE_EVENT, onAppearance);
      window.removeEventListener(USER_EVENT, onUser);
    };
  }, []);

  function selectMenu(item: (typeof menuItems)[number]) {
    if (item.href) {
      router.push(item.href);
      return;
    }

    setNotice(`Khu vực "${item.name}" sẽ được phát triển trong các bước tiếp theo.`);
  }

  return (
    <main className="ac-shell">
      <IdleLogout active={!!user} />
      <aside className="ac-sidebar">
        <button className="ac-logo" onClick={() => router.push("/")} title="Về Trang chủ" aria-label="Về Trang chủ">
          <div className="ac-logo-emblem" />
          <div className="ac-logo-name">ChessVerse</div>
          <div className="ac-logo-caption">Học viện cờ vua</div>
        </button>

        <nav className="ac-nav">
          {menuItems.map((item) => (
            <button
              key={item.name}
              onClick={() => selectMenu(item)}
              className={`ac-nav-item ${active === item.name ? "active" : ""}`}
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
        {/* Lời chào chỉ hiện ở Trang chủ; các trang khác chỉ giữ thanh nút gọn */}
        <header className={`ac-topbar${title ? "" : " ac-topbar-slim"}`}>
          {title && (
            <div className="ac-greeting">
              <div>
                <div className="ac-greeting-title"><span>{title}</span></div>
                {subtitle && <div className="ac-greeting-sub">{subtitle}</div>}
              </div>
            </div>
          )}

          <div className="ac-top-actions">
            <TopWallet />
            <NotificationBell userId={user?.id} />
            <SettingsMenu />

            <ProfileMenu user={user} onGuestClick={() => router.push("/")} />
          </div>
        </header>

        {notice && (
          <div className="ac-notice">
            <span>ⓘ</span>
            <p>{notice}</p>
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}

        {children(user)}
      </section>
    </main>
  );
}
