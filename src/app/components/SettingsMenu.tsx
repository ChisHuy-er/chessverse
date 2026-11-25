"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SettingsDialog from "./SettingsDialog";
import { applySettings, loadSettings } from "../lib/settings";
import "./top-actions.css";

// Nút Cài đặt ở góc phải: mở hộp Cài đặt (Chung, Âm thanh, Tài khoản, Hỗ trợ).
export default function SettingsMenu() {
  const [open, setOpen] = useState(false);

  // Áp dụng cài đặt đã lưu (vd. giảm hiệu ứng) ngay khi trang mở.
  useEffect(() => {
    applySettings(loadSettings());
  }, []);

  return (
    <div className="ta-wrap">
      <button
        className="ac-bell ta-gear"
        aria-label="Cài đặt"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="ta-gear-icon" />
      </button>

      {/* Gắn vào <body> để hộp luôn phủ toàn màn hình */}
      {open && createPortal(<SettingsDialog onClose={() => setOpen(false)} />, document.body)}
    </div>
  );
}
