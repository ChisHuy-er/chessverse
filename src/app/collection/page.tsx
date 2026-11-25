"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import { SHOP_ENTRIES, BOARD_THEMES, fetchWallet, owns, pieceSkinPath, type ShopEntry, type Wallet } from "../lib/shop";
import "./collection.css";

type Tab = "board" | "piece";

const PIECE_KEYS = ["K", "Q", "R", "B", "N", "P"];

// Bàn cờ thu nhỏ 4x4 để xem trước màu / vân ô
function MiniBoard({ id }: { id: string }) {
  const t = BOARD_THEMES[id] ?? BOARD_THEMES.classic;

  return (
    <div className="co-board">
      {Array.from({ length: 16 }, (_, i) => {
        const dark = (Math.floor(i / 4) + i) % 2 === 1;

        return (
          <span
            key={i}
            style={{
              backgroundColor: dark ? t.dark : t.light,
              ...(t.texture
                ? { backgroundImage: `url(${dark ? t.texture.dark : t.texture.light})`, backgroundSize: "100% 100%" }
                : {}),
            }}
          />
        );
      })}
    </div>
  );
}

export default function CollectionPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("piece");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "guest">("loading");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const w = await fetchWallet();

    setWallet(w);
    setState(w ? "ok" : "guest");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function use(item: ShopEntry) {
    const key = item.id.split(":")[1];

    setBusy(item.id);
    setNotice("");

    try {
      const response = await fetch(`/api/shop/${item.category === "board" ? "board" : "pieces"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.category === "board" ? { theme: key } : { set: key }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(typeof data?.message === "string" ? data.message : "Không đổi được.");

      setWallet(data as Wallet);
      setNotice(`Đã dùng ${item.name}.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Không đổi được.");
    } finally {
      setBusy("");
    }
  }

  const items = SHOP_ENTRIES.filter((e) => e.category === tab && (tab === "board" || e.available || e.free));
  const owned = items.filter((e) => owns(wallet, e.id));
  const locked = items.filter((e) => !owns(wallet, e.id));
  const current = tab === "board" ? wallet?.boardTheme ?? "classic" : wallet?.pieceSet ?? "set1";

  return (
    <AcademyShell active="">
      {() => (
        <div className="co-page">
          <header className="co-head">
            <img src="/images/academy/practice/laurel-l.png" alt="" />
            <h1>Bộ Sưu Tập</h1>
            <img src="/images/academy/practice/laurel-r.png" alt="" />
          </header>

          <nav className="co-tabs">
            <button className={tab === "piece" ? "on" : ""} onClick={() => setTab("piece")}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 20h6M8 17h8l-1-5H9zM10 12V9h4v3M12 4v5M10.5 5.5h3" />
              </svg>
              Quân cờ
            </button>
            <button className={tab === "board" ? "on" : ""} onClick={() => setTab("board")}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" />
              </svg>
              Bàn cờ
            </button>

            {state === "ok" && (
              <span className="co-count">
                Đã sở hữu <b>{owned.length}</b>/{items.length}
              </span>
            )}
          </nav>

          {notice && <p className="co-notice">{notice}</p>}

          {state === "loading" && <p className="co-muted">Đang tải bộ sưu tập...</p>}

          {state === "guest" && (
            <div className="co-empty">
              <p>Đăng nhập để xem bộ sưu tập của bạn.</p>
              <button className="co-gold" onClick={() => router.push("/")}>
                Về trang chủ để đăng nhập
              </button>
            </div>
          )}

          {state === "ok" && (
            <div className="co-grid">
              {[...owned, ...locked].map((item) => {
                const key = item.id.split(":")[1];
                const has = owns(wallet, item.id);
                const using = has && key === current;
                const skin = item.category === "piece" ? pieceSkinPath(key) : undefined;

                return (
                  <article key={item.id} className={`co-card${using ? " using" : ""}${has ? "" : " locked"}`}>
                    <div className="co-art">
                      {item.category === "board" ? <MiniBoard id={key} /> : <img src={item.image} alt="" />}
                      {!has && <span className="co-lock">🔒</span>}
                    </div>

                    <div className="co-info">
                      <h3>{item.name.replace(/^Bàn cờ /, "")}</h3>

                      {skin && (
                        <div className="co-pieces">
                          {PIECE_KEYS.map((k) => (
                            <img key={k} src={`${skin}/w${k}.webp`} alt="" />
                          ))}
                        </div>
                      )}

                      {using ? (
                        <span className="co-using">✓ Đang dùng</span>
                      ) : has ? (
                        <button className="co-use" disabled={busy === item.id} onClick={() => use(item)}>
                          {busy === item.id ? "Đang đổi..." : "Sử dụng"}
                        </button>
                      ) : (
                        <button className="co-buy" onClick={() => router.push("/shop")}>
                          {item.bundledWith ? "Có trong bộ quân" : "Xem ở Cửa hàng"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AcademyShell>
  );
}
