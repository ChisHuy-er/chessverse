"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SETTINGS_EVENT, loadSettings } from "../lib/settings";
import { playSound } from "../lib/sound";
import "./top-actions.css";

type Item = {
  id: string;
  title: string;
  body: string;
  at: string;
  href: string;
  tone: "win" | "loss" | "draw";
};

type RecentMatch = {
  id: string;
  mode: "RANKED" | "CASUAL";
  result: "WIN" | "LOSS" | "DRAW";
  opponent: string;
  eloChange: number;
  playedAt: string;
};

const READ_KEY = (userId: string) => `cv-notif-read-${userId}`;

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);

  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;

  const h = Math.floor(m / 60);

  if (h < 24) return `${h} giờ trước`;

  return `${Math.floor(h / 24)} ngày trước`;
}

function toItem(match: RecentMatch): Item {
  const elo =
    match.mode === "RANKED" && match.eloChange !== 0
      ? ` · ${match.eloChange > 0 ? "+" : ""}${match.eloChange} Elo`
      : "";
  const verb = match.result === "WIN" ? "Bạn đã thắng" : match.result === "LOSS" ? "Bạn đã thua" : "Bạn đã hòa";

  return {
    id: match.id,
    title: `${verb} ${match.opponent}`,
    body: `${match.mode === "RANKED" ? "Đấu xếp hạng" : "Đấu thường"}${elo}`,
    at: match.playedAt,
    href: `/history/${match.id}`,
    tone: match.result === "WIN" ? "win" : match.result === "LOSS" ? "loss" : "draw",
  };
}

// Chuông thông báo: chỉ hiện chấm đỏ khi có thông báo mới (sau lần mở chuông gần nhất).
// Nguồn hiện tại: kết quả các trận online gần đây.
export default function NotificationBell({ userId }: { userId?: string | null }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [lastRead, setLastRead] = useState<number>(Number.POSITIVE_INFINITY); // chưa tải thì chưa có gì mới
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const prevUnread = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }

    // Lần đầu dùng: coi mọi thứ cũ là đã đọc, không bật chấm đỏ.
    let saved = Number(localStorage.getItem(READ_KEY(userId)) ?? 0);

    if (!saved) {
      saved = Date.now();
      localStorage.setItem(READ_KEY(userId), String(saved));
    }

    setLastRead(saved);

    try {
      const response = await fetch("/api/online/profile", { cache: "no-store" });

      if (!response.ok) return;

      const data = (await response.json()) as { recent?: RecentMatch[] };

      setItems((data.recent ?? []).map(toItem));
    } catch {
      /* mất mạng: giữ danh sách cũ */
    }
  }, [userId]);

  useEffect(() => {
    load();

    const timer = setInterval(load, 60_000);

    window.addEventListener("focus", load);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  // Bật/tắt theo Cài đặt → Chung → "Nhận thông báo trong game"
  useEffect(() => {
    setEnabled(loadSettings().notifyInGame);

    function onSettings() {
      setEnabled(loadSettings().notifyInGame);
    }

    window.addEventListener(SETTINGS_EVENT, onSettings);

    return () => window.removeEventListener(SETTINGS_EVENT, onSettings);
  }, []);

  // Bấm ra ngoài thì đóng
  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onDown);

    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = enabled ? items.filter((i) => new Date(i.at).getTime() > lastRead).length : 0;

  // Có thông báo mới xuất hiện → phát âm báo (theo Cài đặt → Âm thanh)
  useEffect(() => {
    if (unread > prevUnread.current) playSound("alert");
    prevUnread.current = unread;
  }, [unread]);

  function toggle() {
    const next = !open;

    setOpen(next);

    // Mở chuông = đã xem → tắt chấm đỏ.
    if (next && userId && unread > 0) {
      const now = Date.now();

      localStorage.setItem(READ_KEY(userId), String(now));
      // Giữ lastRead cũ đến khi đóng để vẫn tô sáng mục mới trong lúc đang xem.
      setTimeout(() => setLastRead(now), 4000);
    }
  }

  return (
    <div className="ta-wrap" ref={wrapRef}>
      <button
        className="ac-bell"
        aria-label={unread > 0 ? `Thông báo (${unread} mới)` : "Thông báo"}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="ac-bell-icon" />
        {unread > 0 && <span className="ta-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="ta-panel ta-notif" role="menu">
          <div className="ta-head">Thông báo</div>

          {!userId && <p className="ta-empty">Đăng nhập để nhận thông báo.</p>}
          {userId && !enabled && <p className="ta-empty">Bạn đã tắt thông báo trong Cài đặt.</p>}
          {userId && enabled && items.length === 0 && <p className="ta-empty">Bạn chưa có thông báo nào.</p>}

          {enabled && items.map((item) => (
            <button
              key={item.id}
              className={`ta-item ${item.tone}${new Date(item.at).getTime() > lastRead ? " new" : ""}`}
              onClick={() => {
                setOpen(false);
                router.push(item.href);
              }}
            >
              <i aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.body} · {timeAgo(item.at)}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
