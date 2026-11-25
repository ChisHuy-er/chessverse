"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import type { OnlineMode } from "./types";
import "./waiting.css";

const IMG = "/images/academy/match";

// Chữ vẽ bằng code → đổi ngôn ngữ chỉ cần đổi LANG.
const TEXT = {
  vi: {
    brand: "CHESSVERSE ONLINE",
    ranked: "Đấu xếp hạng",
    casual: "Đấu thường",
    cancel: "Hủy tìm trận",
    wait: "Thời gian chờ",
    online: "Người chơi trực tuyến",
    rankedHint: "Kết quả ván đấu sẽ được tính vào Elo",
    casualHint: "Ván giao hữu · Không ảnh hưởng Elo",
  },
  en: {
    brand: "CHESSVERSE ONLINE",
    ranked: "Ranked match",
    casual: "Casual match",
    cancel: "Cancel search",
    wait: "Waiting time",
    online: "Players online",
    rankedHint: "The result counts toward your Elo",
    casualHint: "Friendly game · Elo is not affected",
  },
} as const;
const LANG: keyof typeof TEXT = "vi";
const TX = TEXT[LANG];

function formatWait(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function WaitingScreen({
  mode,
  status,
  message,
  socket,
  onCancel,
}: {
  mode: OnlineMode;
  status: string;
  message: string;
  socket: Socket | null;
  onCancel: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [online, setOnline] = useState<number | null>(null);

  const failed = /thất bại|lỗi|mất kết nối|ngắt/i.test(status);

  // Đồng hồ chờ
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);

    return () => clearInterval(timer);
  }, []);

  // Hỏi server số người đang online mỗi 5 giây (server cũ không hỗ trợ thì hiện "—").
  useEffect(() => {
    if (!socket) return;

    let alive = true;

    function ask() {
      if (!socket?.connected) return;

      socket.timeout(4000).emit("lobby:stats", {}, (err: unknown, data?: { online?: number }) => {
        if (alive && !err && typeof data?.online === "number") setOnline(data.online);
      });
    }

    ask();
    socket.on("connect", ask);
    const timer = setInterval(ask, 5000);

    return () => {
      alive = false;
      clearInterval(timer);
      socket.off("connect", ask);
    };
  }, [socket]);

  return (
    <div className="mm-screen" role="dialog" aria-modal="true" aria-label={status}>
      <div className="mm-box">
      <div className="mm-frame" aria-hidden="true" />

      <header className="mm-top">
        <div className="mm-brand">
          <span>
            <i>✦</i>
            {TX.brand}
          </span>
          <h2>
            <img src={`${IMG}/icon-king.png`} alt="" />
            {mode === "ranked" ? TX.ranked : TX.casual}
            <img className="mm-leaf" src={`${IMG}/laurel-r.png`} alt="" />
          </h2>
        </div>

        <button className="mm-cancel" onClick={onCancel}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
          {TX.cancel}
        </button>
      </header>

      <main className={`mm-center${failed ? " failed" : ""}`}>
        <div className="mm-emblem">
          <span className="mm-halo" />
          <span className="mm-orbit" />
          <img src={`${IMG}/emblem.png`} alt="" />
        </div>

        <div className="mm-title">
          <img src={`${IMG}/laurel-l.png`} alt="" />
          <h1>{status}</h1>
          <img src={`${IMG}/laurel-r.png`} alt="" />
        </div>

        <p className="mm-message" aria-live="polite">
          {message}
        </p>

        <div className="mm-bar" aria-hidden="true">
          <b />
        </div>

        <div className="mm-info">
          <div>
            <img src={`${IMG}/icon-stopwatch.png`} alt="" />
            <span>
              <small>{TX.wait}</small>
              <strong>{formatWait(seconds)}</strong>
            </span>
          </div>
          <div>
            <img src={`${IMG}/icon-people.png`} alt="" />
            <span>
              <small>{TX.online}</small>
              <strong>{online === null ? "—" : online.toLocaleString("vi-VN")}</strong>
            </span>
          </div>
        </div>

        <p className="mm-hint">{mode === "ranked" ? TX.rankedHint : TX.casualHint}</p>
      </main>
      </div>
    </div>
  );
}
