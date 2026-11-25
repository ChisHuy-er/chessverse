"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Khung nhỏ đổi tên hiển thị, nổi đè lên trang Hồ sơ.
export default function RenameBox({
  current,
  onClose,
  onSaved,
}: {
  current: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = value.trim().replace(/\s+/g, " ");
  const valid = name.length >= 2 && name.length <= 50;

  async function save() {
    if (!valid || name === current) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/online/profile/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        throw new Error(typeof data?.message === "string" ? data.message : "Không thể đổi tên.");
      }

      onSaved(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đổi tên.");
      setSaving(false);
    }
  }

  return createPortal(
    <div className="rn-backdrop" onMouseDown={onClose}>
      <form
        className="rn-box"
        role="dialog"
        aria-label="Đổi tên hiển thị"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h4>Đổi tên hiển thị</h4>
        <input
          value={value}
          maxLength={50}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          aria-label="Tên hiển thị mới"
        />
        <small className={valid ? "" : "bad"}>
          {error || `${name.length}/50 ký tự · tối thiểu 2 ký tự`}
        </small>
        <div className="rn-foot">
          <button type="button" className="rn-cancel" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="rn-save" disabled={!valid || name === current || saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
