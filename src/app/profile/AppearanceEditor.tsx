"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { entry, fetchWallet, owns, type Wallet } from "../lib/shop";
import PlayerAvatar from "../components/PlayerAvatar";
import {
  AVATARS,
  COVERS,
  FRAMES,
  getCover,
  type Appearance,
} from "../lib/appearance";

const TEXT = {
  vi: {
    title: "Tùy chỉnh hồ sơ",
    tabs: { avatar: "Ảnh đại diện", frame: "Khung", cover: "Ảnh nền" },
    initial: "Chữ cái",
    cancel: "Hủy",
    save: "Lưu thay đổi",
    saving: "Đang lưu...",
    error: "Không thể lưu. Vui lòng thử lại.",
  },
  en: {
    title: "Customize profile",
    tabs: { avatar: "Avatar", frame: "Frame", cover: "Background" },
    initial: "Initial",
    cancel: "Cancel",
    save: "Save changes",
    saving: "Saving...",
    error: "Could not save. Please try again.",
  },
} as const;

type Tab = "avatar" | "frame" | "cover";

export default function AppearanceEditor({
  initial,
  name,
  lang = "vi",
  onClose,
  onSaved,
}: {
  initial: Appearance;
  name: string;
  lang?: "vi" | "en";
  onClose: () => void;
  onSaved: (value: Appearance) => void;
}) {
  const TX = TEXT[lang];
  const [tab, setTab] = useState<Tab>("avatar");
  const [draft, setDraft] = useState<Appearance>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    fetchWallet().then(setWallet);
  }, []);

  // Khung / nền trả phí chưa mua (lựa chọn đang dùng sẵn thì vẫn giữ được)
  const locked = (id: string, current: string) => id !== current && !owns(wallet, id);
  const lockedFrame = locked(`frame:${draft.frame}`, `frame:${initial.frame}`);
  const lockedCover = locked(`cover:${draft.cover}`, `cover:${initial.cover}`);
  const needsPurchase = lockedFrame || lockedCover;

  const priceTag = (id: string) => {
    const e = entry(id);

    if (!e || e.free) return null;

    return (
      <em className="ae-lock">
        🔒 {e.price.toLocaleString("en-US")} {e.currency === "gems" ? "💎" : "xu"}
      </em>
    );
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/online/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      if (!response.ok) throw new Error("save failed");

      onSaved(draft);
    } catch {
      setError(TX.error);
      setSaving(false);
    }
  }

  const changed =
    draft.avatar !== initial.avatar || draft.frame !== initial.frame || draft.cover !== initial.cover;

  return (
    <div className="ae-backdrop" onMouseDown={onClose}>
      <div className="ae-dialog" role="dialog" aria-modal="true" aria-label={TX.title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="ae-head">
          <h2>{TX.title}</h2>
          <button className="ae-x" onClick={onClose} aria-label={TX.cancel}>
            ×
          </button>
        </header>

        <div className="ae-preview" style={{ backgroundImage: `url(${getCover(draft.cover).src})` }}>
          <PlayerAvatar avatar={draft.avatar} frame={draft.frame} name={name} className="ae-preview-avatar" />
          <strong>{name}</strong>
        </div>

        <nav className="ae-tabs">
          {(Object.keys(TX.tabs) as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {TX.tabs[t]}
            </button>
          ))}
        </nav>

        <div className={`ae-grid ae-grid-${tab}`}>
          {tab === "avatar" && (
            <>
              <button
                className={`ae-item ae-initial${draft.avatar === null ? " on" : ""}`}
                onClick={() => setDraft({ ...draft, avatar: null })}
                title={TX.initial}
              >
                <i>{name.charAt(0).toUpperCase()}</i>
              </button>
              {AVATARS.map((a) => (
                <button
                  key={a.id}
                  className={`ae-item${draft.avatar === a.id ? " on" : ""}`}
                  onClick={() => setDraft({ ...draft, avatar: a.id })}
                >
                  <img src={a.src} alt="" loading="lazy" />
                </button>
              ))}
            </>
          )}

          {tab === "frame" &&
            FRAMES.map((f) => (
              <button
                key={f.id}
                className={`ae-item ae-frame${draft.frame === f.id ? " on" : ""}`}
                onClick={() => setDraft({ ...draft, frame: f.id })}
                title={f[lang]}
              >
                <PlayerAvatar avatar={draft.avatar} frame={f.id} name={name} />
                <small>{f[lang]}</small>
                {locked(`frame:${f.id}`, `frame:${initial.frame}`) && priceTag(`frame:${f.id}`)}
              </button>
            ))}

          {tab === "cover" &&
            COVERS.map((c) => (
              <button
                key={c.id}
                className={`ae-item ae-cover${draft.cover === c.id ? " on" : ""}`}
                onClick={() => setDraft({ ...draft, cover: c.id })}
                style={{ backgroundImage: `url(${c.src})` }}
              >
                <small>{c[lang]}</small>
                {locked(`cover:${c.id}`, `cover:${initial.cover}`) && priceTag(`cover:${c.id}`)}
              </button>
            ))}
        </div>

        <footer className="ae-foot">
          {error && <p className="ae-error">{error}</p>}
          {needsPurchase && !error && (
            <p className="ae-error">
              {lockedFrame ? "Khung" : "Ảnh nền"} này cần mua ở Cửa hàng trước khi dùng.
            </p>
          )}
          <button className="ae-cancel" onClick={onClose}>
            {TX.cancel}
          </button>
          {needsPurchase ? (
            <Link className="ae-save ae-shop" href="/shop">
              Đến Cửa hàng
            </Link>
          ) : (
            <button className="ae-save" onClick={save} disabled={!changed || saving}>
              {saving ? TX.saving : TX.save}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
