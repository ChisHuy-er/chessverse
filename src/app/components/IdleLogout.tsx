"use client";

import { useEffect } from "react";

// Không thao tác gì quá lâu thì tự đăng xuất (tính chung mọi tab đang mở ChessVerse)
const IDLE_MINUTES = 30;
const KEY = "cv-last-active";

export default function IdleLogout({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;

    let lastWrite = 0;
    const mark = () => {
      const now = Date.now();

      // Ghi tối đa mỗi 5 giây cho nhẹ
      if (now - lastWrite > 5000) {
        lastWrite = now;
        try {
          localStorage.setItem(KEY, String(now));
        } catch {
          /* bỏ qua */
        }
      }
    };

    const lastActive = () => {
      try {
        return Number(localStorage.getItem(KEY)) || Date.now();
      } catch {
        return Date.now();
      }
    };

    mark();

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const timer = setInterval(async () => {
      if (Date.now() - lastActive() < IDLE_MINUTES * 60_000) return;

      clearInterval(timer);
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* bỏ qua */
      }
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      window.location.href = "/?idle=1";
    }, 30_000);

    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [active]);

  return null;
}
