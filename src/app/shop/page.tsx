"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import PlayerAvatar from "../components/PlayerAvatar";
import { getCover } from "../lib/appearance";
import {
  SHOP_ENTRIES,
  effectInfo,
  entry,
  fetchWallet,
  owns,
  pieceSkinPath,
  type Category,
  type ShopEntry,
  type Wallet,
} from "../lib/shop";
import TopupModal from "./TopupModal";
import "./shop.css";

const IMG = "/images/academy/shop";
const PER_PAGE = 8;

type Tab = { id: Category; label: string; title: string; sub: string; icon: ReactNode; soon?: boolean };

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TABS: Tab[] = [
  {
    id: "piece",
    label: "Quân Cờ",
    title: "Quân Cờ",
    sub: "Thay đổi ngoại hình Vua, Hậu, Xe, Tượng, Mã và Tốt!",
    icon: svg("M9 20h6M8 17h8M10 17l1-7-2-2h6l-2 2 1 7M12 3v3M10.5 4.5h3"),
  },
  {
    id: "board",
    label: "Bàn Cờ",
    title: "Bàn Cờ",
    sub: "Khoác áo mới cho bàn cờ trong mọi trận đấu online.",
    icon: svg("M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"),
  },
  {
    id: "effect",
    label: "Hiệu Ứng",
    title: "Hiệu Ứng",
    sub: "Hiệu ứng di chuyển, ăn quân và chiếu tướng.",
    icon: svg("M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"),
  },
  {
    id: "frame",
    label: "Khung & Nền",
    title: "Khung Avatar & Ảnh Nền",
    sub: "Tô điểm ảnh đại diện và hồ sơ của bạn.",
    icon: svg("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM7 18a6 6 0 0 1 10 0"),
  },
  {
    id: "bundle",
    label: "Gói Ưu Đãi",
    title: "Gói Ưu Đãi",
    sub: "Các gói vật phẩm giá tốt theo mùa.",
    icon: svg("M3 12V4h8l10 10-8 8L3 12ZM7.5 7.5h.01"),
    soon: true,
  },
];

const SORTS = [
  { id: "popular", label: "Phổ biến" },
  { id: "low", label: "Giá thấp" },
  { id: "high", label: "Giá cao" },
] as const;

const PIECE_NAMES = ["Vua", "Hậu", "Xe", "Tượng", "Mã", "Tốt"];
const PIECE_KEYS = ["K", "Q", "R", "B", "N", "P"];

function Price({ entry }: { entry: ShopEntry }) {
  return (
    <span className="sh-price">
      <img src={`${IMG}/${entry.currency === "gems" ? "gem.svg" : "coin.svg"}`} alt={entry.currency === "gems" ? "kim cương" : "xu"} />
      {entry.price.toLocaleString("en-US")}
    </span>
  );
}

const BACK_RANK = ["R", "N", "B", "Q", "K", "B", "N", "R"];

// Bàn cờ thu nhỏ; có skin thì xếp quân theo thế cờ ban đầu (8x8) hoặc góc bàn (4x4)
function MiniBoard({ light, dark, size = 4, skin }: { light: string; dark: string; size?: number; skin?: string }) {
  function pieceAt(row: number, col: number) {
    if (!skin) return null;

    const r = size === 8 ? row : row < 2 ? row : row + 4;

    if (r === 0) return `b${BACK_RANK[col]}`;
    if (r === 1) return "bP";
    if (r === 6) return "wP";
    if (r === 7) return `w${BACK_RANK[col]}`;

    return null;
  }

  return (
    <div className={`sh-board${skin ? " with-pieces" : ""}`} style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
      {Array.from({ length: size * size }, (_, i) => {
        const row = Math.floor(i / size);
        const col = i % size;
        const piece = pieceAt(row, col);

        return (
          <span key={i} style={{ background: (row + col) % 2 ? dark : light }}>
            {piece && <img src={`${skin}/${piece}.webp`} alt="" />}
          </span>
        );
      })}
    </div>
  );
}

export default function ShopPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Category>("piece");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("popular");
  const [kind, setKind] = useState<"all" | "frames" | "covers">("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>("piece:set2");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupOrder, setTopupOrder] = useState<string | null>(null);

  const load = useCallback(async () => {
    const w = await fetchWallet();

    setWallet(w);
    setLoggedIn(w !== null);
    // Báo ô kim cương / xu trên thanh trên cùng cập nhật số dư
    window.dispatchEvent(new Event("cv-wallet"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Nút "+" kim cương trên thanh trên cùng khi đang ở Cửa hàng
  useEffect(() => {
    const open = () => setTopupOpen(true);

    window.addEventListener("cv-open-topup", open);
    return () => window.removeEventListener("cv-open-topup", open);
  }, []);

  // Quay về từ VNPAY/MoMo: /shop?topup=<mã đơn>
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("topup");

    // Bấm "+" kim cương trên thanh trên cùng: /shop?nap=1
    if (url.searchParams.get("nap") !== null) {
      url.searchParams.delete("nap");
      window.history.replaceState(null, "", url.pathname + url.search);
      setTopupOpen(true);
    }

    if (id === null) return;

    url.searchParams.delete("topup");
    window.history.replaceState(null, "", url.pathname + url.search);

    if (id) {
      setTopupOrder(id);
      setTopupOpen(true);
    }
  }, []);

  const current = TABS.find((t) => t.id === tab)!;

  const list = useMemo(() => {
    let items = SHOP_ENTRIES.filter((e) => e.category === tab);

    if (tab === "frame" && kind !== "all") {
      items = items.filter((e) => (kind === "frames" ? e.frameId : e.coverId));
    }

    if (sort !== "popular") {
      const value = (e: ShopEntry) => (e.free ? 0 : e.currency === "gems" ? e.price * 10 : e.price);

      items = [...items].sort((a, b) => (sort === "low" ? value(a) - value(b) : value(b) - value(a)));
    }

    return items;
  }, [tab, kind, sort]);

  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const shown = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const selected = SHOP_ENTRIES.find((e) => e.id === selectedId && e.category === tab) ?? shown[0];

  // Khung chi tiết: các trang trượt (ảnh → ngoại hình → hiệu ứng), tự chuyển sau 5 giây
  const selectedSet = selected?.category === "piece" ? selected.id.split(":")[1] : "";
  const hasFx = !!selectedSet && SHOP_ENTRIES.some((e) => e.effectFor === selectedSet);
  const slideCount = selected?.category === "piece" ? (hasFx ? 3 : 2) : 1;
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    setSlide(0);
  }, [selected?.id]);

  useEffect(() => {
    if (slideCount < 2) return;

    const t = setInterval(() => setSlide((n) => (n + 1) % slideCount), 5000);
    return () => clearInterval(t);
  }, [slideCount, selected?.id, slide]);

  function switchTab(next: Tab) {
    if (next.soon) {
      setNotice(`"${next.label}" đang được phát triển, sẽ sớm ra mắt!`);
      return;
    }

    setTab(next.id);
    setPage(1);
    setKind("all");
    setConfirming(false);
    setSelectedId(SHOP_ENTRIES.find((e) => e.category === next.id && !e.free)?.id ?? "");
  }

  async function post(path: string, body: unknown) {
    const response = await fetch(`/api/shop/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(typeof data?.message === "string" ? data.message : "Có lỗi xảy ra, vui lòng thử lại.");
    }

    return data as Wallet;
  }

  async function buy(item: ShopEntry) {
    setBusy(true);

    try {
      setWallet(await post("buy", { itemId: item.id }));
      setNotice(`Đã mua ${item.name}!`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Không thể mua");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function usePieces(item: ShopEntry) {
    setBusy(true);

    try {
      setWallet(await post("pieces", { set: item.id.split(":")[1] }));
      setNotice(`Đã dùng ${item.name} cho các trận online.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Không thể đổi bộ quân cờ");
    } finally {
      setBusy(false);
    }
  }

  async function useBoard(item: ShopEntry) {
    setBusy(true);

    try {
      setWallet(await post("board", { theme: item.id.split(":")[1] }));
      setNotice(`Đã dùng ${item.name} cho các trận online.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Không thể đổi bàn cờ");
    } finally {
      setBusy(false);
    }
  }

  function status(item: ShopEntry) {
    if (!item.available) return "soon";
    if (item.category === "board" && wallet?.boardTheme === item.id.split(":")[1]) return "using";
    if (item.category === "piece" && wallet && (wallet.pieceSet ?? "set1") === item.id.split(":")[1]) return "using";
    if (item.category === "effect" && wallet && wallet.pieceSet === item.effectFor) return "using";
    if (owns(wallet, item.id)) return "owned";
    if (item.bundledWith) return "bundle";

    return "buy";
  }

  function enough(item: ShopEntry) {
    if (!wallet) return false;

    return (item.currency === "gems" ? wallet.gems : wallet.coins) >= item.price;
  }

  return (
    <AcademyShell active="Cửa hàng">
      {(user) => {
        const preview = (item: ShopEntry, big = false) => {
          if (item.board) {
            const skin = item.bundledWith ? pieceSkinPath(item.bundledWith.split(":")[1]) : undefined;

            return <MiniBoard light={item.board.light} dark={item.board.dark} size={big ? 8 : 4} skin={skin} />;
          }

          if (item.frameId) {
            return (
              <div className="sh-frame-preview">
                <PlayerAvatar avatar={user?.avatarId} frame={item.frameId} name={user?.displayName ?? "?"} />
              </div>
            );
          }

          if (item.coverId) {
            return (
              <div className="sh-cover-preview" style={{ backgroundImage: `url(${getCover(item.coverId).src})` }}>
                {big && <PlayerAvatar avatar={user?.avatarId} frame={user?.avatarFrame} name={user?.displayName ?? "?"} />}
              </div>
            );
          }

          if (item.category === "effect" && item.sprite) {
            return (
              <div className="sh-fx-preview">
                <span
                  className="sh-sprite"
                  style={
                    {
                      backgroundImage: `url(${item.sprite.src})`,
                      aspectRatio: String(item.sprite.ratio),
                      "--n": item.sprite.frames,
                    } as CSSProperties
                  }
                />
              </div>
            );
          }

          // Ảnh hiện trọn vẹn (không cắt); nền phía sau là chính ảnh đó làm mờ
          return (
            <div className="sh-art-wrap" style={{ "--bg": `url(${item.image})` } as CSSProperties}>
              <img className="sh-art" src={item.image} alt="" />
            </div>
          );
        };

        return (
          <div className="sh-page">
            <header className="sh-head">
              <div className="sh-title">
                <img className="sh-laurel" src="/images/academy/practice/laurel-l.png" alt="" />

                <div>
                  <div className="sh-h1row">
                    <svg className="sh-cart" viewBox="0 0 64 64" aria-hidden="true">
                      <defs>
                        <linearGradient id="shCartGold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#fff3c4" />
                          <stop offset=".45" stopColor="#f3c65a" />
                          <stop offset="1" stopColor="#b9771a" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M4 8h8.5a3 3 0 0 1 2.9 2.3L16.4 15H58a2.5 2.5 0 0 1 2.4 3.2l-5.6 19A4 4 0 0 1 51 40H23l1 5h27a3 3 0 0 1 0 6H21.5a3 3 0 0 1-2.9-2.4L10.2 14H4a3 3 0 0 1 0-6Z"
                        fill="url(#shCartGold)"
                        stroke="#7a4a06"
                        strokeWidth="1.5"
                      />
                      <path d="M22 21h31l-3.6 13H24.6Z" fill="#1b2a6b" opacity=".55" />
                      <circle cx="25" cy="56" r="4.5" fill="url(#shCartGold)" stroke="#7a4a06" strokeWidth="1.5" />
                      <circle cx="48" cy="56" r="4.5" fill="url(#shCartGold)" stroke="#7a4a06" strokeWidth="1.5" />
                    </svg>
                    <h1>Cửa Hàng</h1>
                  </div>
                  <p>Mua sắm vật phẩm, skin, hiệu ứng và nhiều ưu đãi đặc biệt!</p>
                </div>
                <img className="sh-laurel" src="/images/academy/practice/laurel-r.png" alt="" />
              </div>

            </header>


            <TopupModal
              open={topupOpen}
              returnOrderId={topupOrder}
              onClose={() => {
                setTopupOpen(false);
                setTopupOrder(null);
              }}
              onPaid={load}
            />

            {notice && (
              <div className="ac-notice sh-notice">
                <span>ⓘ</span>
                <p>{notice}</p>
                <button onClick={() => setNotice("")}>×</button>
              </div>
            )}

            {loggedIn === false && (
              <div className="ac-notice sh-notice">
                <span>ⓘ</span>
                <p>Đăng nhập để xem số dư và mua vật phẩm.</p>
                <button onClick={() => router.push("/")}>→</button>
              </div>
            )}

            <div className="sh-body">
              <div className="sh-main">
                <section className="sh-hero">
                  <h2>{current.title}</h2>
                  <p>{current.sub}</p>
                </section>

                <div className="sh-filters">
                  <nav className="sh-tabs">
                    {TABS.map((t) => (
                      <button key={t.id} className={`${tab === t.id ? "on" : ""}${t.soon ? " soon" : ""}`} onClick={() => switchTab(t)}>
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </nav>
                  <span className="sh-sep" aria-hidden="true" />
                  {tab === "frame" ? (
                    (
                      [
                        ["all", "Tất cả"],
                        ["frames", "Khung avatar"],
                        ["covers", "Ảnh nền"],
                      ] as const
                    ).map(([id, label]) => (
                      <button key={id} className={kind === id ? "on" : ""} onClick={() => { setKind(id); setPage(1); }}>
                        {label}
                      </button>
                    ))
                  ) : (
                    <button className="on">Tất cả</button>
                  )}

                  <label className="sh-sort">
                    <span aria-hidden="true">⇅</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sắp xếp">
                      {SORTS.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="sh-grid">
                  {shown.map((item, i) => {
                    const st = status(item);

                    return (
                      <button
                        key={item.id}
                        className={`sh-card${selected?.id === item.id ? " on" : ""}${st === "soon" ? " soon" : ""}`}
                        style={{ "--i": i } as CSSProperties}
                        onClick={() => {
                          setSelectedId(item.id);
                          setConfirming(false);
                        }}
                      >
                        <div className={`sh-card-art ${item.category}`}>{preview(item)}</div>
                        <strong className="sh-card-name">{item.name}</strong>
                        <div className="sh-card-foot">
                          {st === "owned" && <span className="sh-owned"><img src={`${IMG}/check.png`} alt="" />Đã sở hữu</span>}
                          {st === "using" && <span className="sh-owned"><img src={`${IMG}/check.png`} alt="" />Đang dùng</span>}
                          {st === "soon" && (
                            <span className="sh-pricebar">
                              <Price entry={item} />
                              <span className="sh-chip soon">Sắp có</span>
                            </span>
                          )}
                          {st === "bundle" && item.bundledWith && (
                            <span className="sh-chip soon">Kèm {entry(item.bundledWith)?.name}</span>
                          )}
                          {st === "buy" && (
                            <span className="sh-pricebar">
                              <Price entry={item} />
                              <span className="sh-chip">Mua</span>
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {pageCount > 1 && (
                  <div className="sh-pager">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Trang trước">‹</button>
                    <span>{page} / {pageCount}</span>
                    <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} aria-label="Trang sau">›</button>
                  </div>
                )}
              </div>

              {selected && (
                <aside className="sh-detail">
                  <h3>{selected.name}</h3>
                  <span className="sh-tag">{selected.tag}</span>

                  <div className="sh-slider">
                    <div className="sh-slides" style={{ transform: `translateX(-${Math.min(slide, slideCount - 1) * 100}%)` }}>
                      <div className="sh-slide">
                        <div className={`sh-detail-art ${selected.category}`}>{preview(selected, true)}</div>
                      </div>

                  {selected.category === "piece" && (() => {
                    const skin = pieceSkinPath(selected.id.split(":")[1]);

                    return (
                      <>
                        <div className="sh-slide sh-pane">
                        <p className="sh-label">Thay đổi ngoại hình:</p>
                        <div className={`sh-pieces${skin ? " real" : ""}`}>
                          {PIECE_NAMES.map((n, i) => (
                            <span key={n}>
                              <img src={skin ? `${skin}/w${PIECE_KEYS[i]}.webp` : `${IMG}/p${i + 1}.png`} alt="" />
                              {n}
                            </span>
                          ))}
                        </div>
                        {skin && (
                          <div className="sh-pieces real dark">
                            {PIECE_KEYS.map((k) => (
                              <span key={k}>
                                <img src={`${skin}/b${k}.webp`} alt="" />
                              </span>
                            ))}
                          </div>
                        )}
                        </div>
                        {SHOP_ENTRIES.some((e) => e.effectFor === selected.id.split(":")[1]) && (
                          <div className="sh-slide sh-pane">
                            <p className="sh-label">Hiệu ứng kèm theo:</p>
                            <div className="sh-fx-list">
                              {SHOP_ENTRIES.filter(
                                (e) =>
                                  e.effectFor === selected.id.split(":")[1] &&
                                  /-(move|capture|check)$/.test(e.id),
                              ).map((e) => (
                                  <button
                                    key={e.id}
                                    onClick={() => {
                                      setTab("effect");
                                      setPage(1);
                                      setSelectedId(e.id);
                                    }}
                                  >
                                    <span>
                                      {e.sprite && (
                                        <i
                                          className="sh-sprite"
                                          style={
                                            {
                                              backgroundImage: `url(${e.sprite.src})`,
                                              aspectRatio: String(e.sprite.ratio),
                                              "--n": e.sprite.frames,
                                            } as CSSProperties
                                          }
                                        />
                                      )}
                                    </span>
                                    {e.name.replace(" Hắc Ám", "")}
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                    </div>

                    {slideCount > 1 && (
                      <div className="sh-dots">
                        {Array.from({ length: slideCount }, (_, i) => (
                          <button
                            key={i}
                            className={i === slide ? "on" : ""}
                            aria-label={`Trang ${i + 1}`}
                            onClick={() => setSlide(i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {selected.category === "piece" && (
                    <p className="sh-desc">
                      {selected.free
                        ? "Bộ quân cờ mặc định của ChessVerse."
                        : pieceSkinPath(selected.id.split(":")[1])
                          ? "Đổi toàn bộ quân Trắng và Đen trong mọi trận online của bạn."
                          : "Bộ quân này đang được hoàn thiện hình ảnh, sẽ sớm mở bán."}
                    </p>
                  )}

                  {selected.category === "board" && (
                    <p className="sh-desc">
                      {selected.bundledWith
                        ? `Bàn cờ cùng chủ đề, tặng kèm khi sở hữu ${entry(selected.bundledWith)?.name}.`
                        : "Bàn cờ được dùng trong mọi trận Đấu xếp hạng và Đấu thường. Bạn có thể đổi lại bất cứ lúc nào."}
                    </p>
                  )}
                  {selected.frameId && (
                    <p className="sh-desc">Sau khi sở hữu, vào Hồ sơ → Tùy chỉnh để đeo khung này. Mọi người sẽ thấy ở Bảng xếp hạng và Câu lạc bộ.</p>
                  )}
                  {selected.coverId && (
                    <p className="sh-desc">Ảnh nền cho bìa hồ sơ, hiện cả ở Bảng xếp hạng. Đổi trong Hồ sơ → Tùy chỉnh.</p>
                  )}

                  {selected.category === "effect" && (
                    <p className="sh-desc">
                      {effectInfo(selected.id)?.desc} Hiệu ứng tự bật trong trận online khi bạn dùng {entry(selected.bundledWith ?? "")?.name}.
                    </p>
                  )}


                  <div className="sh-detail-price">
                    {selected.bundledWith ? (
                      <b className="sh-free">Tặng kèm</b>
                    ) : selected.free ? (
                      <b className="sh-free">Miễn phí</b>
                    ) : (
                      <Price entry={selected} />
                    )}
                  </div>

                  {(() => {
                    const st = status(selected);

                    if (!loggedIn) {
                      return <button className="sh-buy" onClick={() => router.push("/")}>Đăng nhập để mua</button>;
                    }

                    if (st === "soon") {
                      return <button className="sh-buy" disabled>Sắp ra mắt</button>;
                    }

                    if (st === "bundle" && selected.bundledWith) {
                      const pack = selected.bundledWith;

                      return (
                        <button
                          className="sh-buy"
                          onClick={() => {
                            setTab("piece");
                            setPage(1);
                            setSelectedId(pack);
                          }}
                        >
                          Xem {entry(pack)?.name}
                        </button>
                      );
                    }

                    if (st === "using") {
                      return <button className="sh-buy" disabled>Đang sử dụng</button>;
                    }

                    if (st === "owned") {
                      if (selected.category === "board") {
                        return <button className="sh-buy" disabled={busy} onClick={() => useBoard(selected)}>Sử dụng</button>;
                      }

                      if (selected.category === "piece") {
                        return <button className="sh-buy" disabled={busy} onClick={() => usePieces(selected)}>Sử dụng</button>;
                      }

                      if (selected.category === "effect" && selected.bundledWith) {
                        const pack = entry(selected.bundledWith);

                        return (
                          <button className="sh-buy" disabled={busy || !pack} onClick={() => pack && usePieces(pack)}>
                            Bật cùng {pack?.name}
                          </button>
                        );
                      }

                      if (selected.frameId || selected.coverId) {
                        return <button className="sh-buy" onClick={() => router.push("/profile")}>Dùng trong Hồ sơ</button>;
                      }

                      return <button className="sh-buy" disabled>Đã sở hữu</button>;
                    }

                    if (confirming) {
                      return (
                        <div className="sh-confirm">
                          <p>
                            Mua <b>{selected.name}</b> với {selected.price.toLocaleString("en-US")} {selected.currency === "gems" ? "kim cương" : "xu"}?
                          </p>
                          <div>
                            <button className="sh-ghost" onClick={() => setConfirming(false)}>Hủy</button>
                            <button className="sh-buy small" disabled={busy} onClick={() => buy(selected)}>
                              {busy ? "Đang mua..." : "Xác nhận"}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="sh-actions">
                        <button className="sh-buy" disabled={!enough(selected)} onClick={() => setConfirming(true)}>
                          <svg className="sh-buy-cart" viewBox="0 0 64 64" aria-hidden="true">
                            <path d="M4 8h8.5a3 3 0 0 1 2.9 2.3L16.4 15H58a2.5 2.5 0 0 1 2.4 3.2l-5.6 19A4 4 0 0 1 51 40H23l1 5h27a3 3 0 0 1 0 6H21.5a3 3 0 0 1-2.9-2.4L10.2 14H4a3 3 0 0 1 0-6Z" />
                            <circle cx="25" cy="56" r="4.5" />
                            <circle cx="48" cy="56" r="4.5" />
                          </svg>
                          {enough(selected) ? "Mua ngay" : `Không đủ ${selected.currency === "gems" ? "kim cương" : "xu"}`}
                        </button>
                        <button className="sh-gift" aria-label="Tặng bạn bè" onClick={() => setNotice("Tặng quà cho bạn bè sẽ có khi mục Bạn bè ra mắt.")}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" />
                          </svg>
                        </button>
                      </div>
                    );
                  })()}
                </aside>
              )}
            </div>
          </div>
        );
      }}
    </AcademyShell>
  );
}
