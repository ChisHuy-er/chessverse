"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PlayerAvatar from "./PlayerAvatar";
import "./top-actions.css";

type MenuUser = {
  displayName: string;
  elo: number;
  username?: string;
  avatarId?: string | null;
  avatarFrame?: string | null;
};

// Nút ảnh đại diện ở góc phải + menu: Hồ sơ, Lịch sử đấu, Đăng xuất.
export default function ProfileMenu({
  user,
  onGuestClick,
  onLogout,
}: {
  user: MenuUser | null;
  onGuestClick: () => void;
  onLogout?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Báo "đang online" mỗi phút khi đã đăng nhập (dùng cho trạng thái ở Câu lạc bộ).
  const loggedIn = Boolean(user);

  useEffect(() => {
    if (!loggedIn) return;

    function ping() {
      if (document.visibilityState === "visible") {
        fetch("/api/presence", { method: "POST" }).catch(() => null);
      }
    }

    ping();
    const timer = setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [loggedIn]);

  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function logout() {
    setOpen(false);

    if (onLogout) {
      await onLogout();
      return;
    }

    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  return (
    <div className="ta-wrap" ref={wrapRef}>
      <button
        className="ac-profile"
        aria-haspopup={user ? "menu" : undefined}
        aria-expanded={user ? open : undefined}
        onClick={() => (user ? setOpen(!open) : onGuestClick())}
      >
        {user ? (
          <PlayerAvatar avatar={user.avatarId} frame={user.avatarFrame} name={user.displayName} className="ac-pa" />
        ) : (
          <span className="ac-avatar">?</span>
        )}
        <span className="ac-profile-info">
          <strong>{user?.displayName ?? "Đăng nhập"}</strong>
          <small>{user ? `${user.elo.toLocaleString("en-US")} Elo` : "Khách"}</small>
        </span>
        {user && <span className={`ac-chevron ta-chevron${open ? " up" : ""}`}>⌄</span>}
      </button>

      {open && user && (
        <div className="ta-panel ta-profile" role="menu">
          <div className="ta-who">
            <strong>{user.displayName}</strong>
            {user.username && <small>@{user.username}</small>}
          </div>

          <button role="menuitem" className="ta-menu-item" onClick={() => go("/profile")}>
            <img src="/images/academy/settings/user.png" alt="" />
            Hồ sơ
          </button>
          <button role="menuitem" className="ta-menu-item" onClick={() => go("/collection")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" />
            </svg>
            Bộ sưu tập
          </button>
          <button role="menuitem" className="ta-menu-item" onClick={() => go("/history")}>
            <img src="/images/academy/settings/game.png" alt="" />
            Lịch sử đấu
          </button>
          <button role="menuitem" className="ta-menu-item danger" onClick={logout}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
            </svg>
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
