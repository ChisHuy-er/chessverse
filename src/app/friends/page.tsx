"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import PlayerAvatar from "../components/PlayerAvatar";
import Flag, { countryName } from "../components/Flag";
import TierBadge from "../components/TierBadge";
import { getCover } from "../lib/appearance";
import { getTier } from "../lib/rank";
import "./friends.css";

const IMG = "/images/academy/friends";
const PER_PAGE = 6;

type Status = "in-match" | "online" | "offline";

type Person = {
  id: string;
  displayName: string;
  elo: number;
  avatarId: string | null;
  avatarFrame: string | null;
  cover: string | null;
  playerCode: string | null;
  country?: string | null;
  status: Status;
  lastSeenAt: string | null;
  favorite?: boolean;
  since?: string;
  sameClub?: boolean;
  isFriend?: boolean;
};

type Profile = Person & {
  joinedAt: string;
  club: { name: string; banner: string } | null;
  stats: { total: number; wins: number; winRate: number };
  friendSince: string | null;
};

type Tab = "friends" | "suggest" | "requests" | "sent" | "blocked";
type Row = { key: string; person: Person; requestId?: string };

async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/friends${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(new Error(typeof data?.message === "string" ? data.message : "Có lỗi xảy ra"), {
      status: response.status,
    });
  }

  return data as T;
}

function ago(iso: string | null) {
  if (!iso) return null;

  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (m < 60) return `${Math.max(1, m)} phút trước`;
  if (m < 1440) return `${Math.floor(m / 60)} giờ trước`;

  return `${Math.floor(m / 1440)} ngày trước`;
}

function StatusText({ p }: { p: Person }) {
  if (p.status === "in-match") return <span className="fr-status match">Trong trận</span>;
  if (p.status === "online") return <span className="fr-status on">Online</span>;

  const when = ago(p.lastSeenAt);

  return (
    <span className="fr-status off">
      Ngoại tuyến
      {when && <small>{when}</small>}
    </span>
  );
}

const Icon = ({ name, alt = "" }: { name: string; alt?: string }) => <img src={`${IMG}/i-${name}.png`} alt={alt} />;

export default function FriendsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("friends");
  const [state, setState] = useState<"loading" | "guest" | "error" | "ok">("loading");
  const [friends, setFriends] = useState<Person[]>([]);
  const [max, setMax] = useState(100);
  const [incoming, setIncoming] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"status" | "elo" | "name">("status");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadFriends = useCallback(async () => {
    try {
      const data = await api<{ friends: Person[]; max: number; incoming: number }>("");

      setFriends(data.friends);
      setMax(data.max);
      setIncoming(data.incoming);
      setState("ok");
    } catch (e) {
      setState((e as { status?: number }).status === 401 ? "guest" : "error");
    }
  }, []);

  useEffect(() => {
    loadFriends();

    const t = setInterval(loadFriends, 45_000);

    return () => clearInterval(t);
  }, [loadFriends]);

  // Dữ liệu cho các tab khác
  const loadTab = useCallback(async (which: Tab, q = "") => {
    if (which === "friends") return;

    setListLoading(true);

    try {
      if (which === "suggest") {
        const data = q.trim().length >= 2
          ? await api<{ users: Person[] }>(`/search?q=${encodeURIComponent(q.trim())}`)
          : await api<{ users: Person[] }>("/suggest");

        setRows(data.users.map((p) => ({ key: p.id, person: p })));
      } else if (which === "requests" || which === "sent") {
        const data = await api<{ requests: { id: string; user: Person }[] }>(`/${which}`);

        setRows(data.requests.map((r) => ({ key: r.id, person: r.user, requestId: r.id })));
      } else {
        const data = await api<{ users: { user: Person }[] }>("/blocked");

        setRows(data.users.map((r) => ({ key: r.user.id, person: r.user })));
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Không thể tải danh sách");
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "friends") return;

    const t = setTimeout(() => loadTab(tab, tab === "suggest" ? query : ""), tab === "suggest" ? 300 : 0);

    return () => clearTimeout(t);
  }, [tab, query, loadTab]);

  // Hồ sơ người được chọn (khung phải)
  useEffect(() => {
    if (!selectedId) {
      setProfile(null);
      return;
    }

    let alive = true;

    api<Profile>(`/profile/${selectedId}`)
      .then((p) => alive && setProfile(p))
      .catch(() => alive && setProfile(null));

    return () => {
      alive = false;
    };
  }, [selectedId, friends]);

  // Đóng menu "..." khi bấm ra ngoài
  useEffect(() => {
    if (!menuFor) return;

    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    }

    document.addEventListener("mousedown", onDown);

    return () => document.removeEventListener("mousedown", onDown);
  }, [menuFor]);

  const friendRows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    let list = q
      ? friends.filter((f) => f.displayName.toLowerCase().includes(q) || f.playerCode?.includes(q))
      : friends;

    if (sort === "elo") list = [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.elo - a.elo);
    if (sort === "name") list = [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.displayName.localeCompare(b.displayName, "vi"));

    return list.map((p) => ({ key: p.id, person: p }));
  }, [friends, query, sort]);

  const current = tab === "friends" ? friendRows : rows;
  const pageCount = Math.max(1, Math.ceil(current.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const shown = current.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Tự chọn người đầu tiên để khung phải không trống
  useEffect(() => {
    if (tab === "friends" && !selectedId && friends[0]) setSelectedId(friends[0].id);
  }, [tab, friends, selectedId]);

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
    setQuery("");
    setRows([]);
    setMenuFor(null);
  }

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);

    try {
      await fn();
      if (done) setNotice(done);
      await loadFriends();
      if (tab !== "friends") await loadTab(tab, tab === "suggest" ? query : "");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusy(null);
      setMenuFor(null);
    }
  }

  const soon = (what: string) => setNotice(`${what} đang được phát triển, sẽ sớm ra mắt!`);

  const TABS: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: "friends", label: "Danh sách bạn bè", icon: "people" },
    { id: "suggest", label: "Đề xuất kết bạn", icon: "user-plus" },
    { id: "requests", label: "Lời mời", icon: "mail", badge: incoming },
    { id: "sent", label: "Đã gửi", icon: "send" },
    { id: "blocked", label: "Chặn", icon: "block" },
  ];

  const panelTitle: Record<Tab, string> = {
    friends: `Bạn bè (${friends.length}/${max})`,
    suggest: query.trim().length >= 2 ? "Kết quả tìm kiếm" : "Gợi ý cho bạn",
    requests: `Lời mời kết bạn (${rows.length})`,
    sent: `Lời mời đã gửi (${rows.length})`,
    blocked: `Đã chặn (${rows.length})`,
  };

  const empty: Record<Tab, string> = {
    friends: query ? "Không có bạn nào khớp tên này." : "Bạn chưa có bạn bè nào. Vào tab Đề xuất kết bạn để tìm người chơi nhé!",
    suggest: query.trim().length >= 2 ? "Không tìm thấy người chơi nào." : "Chưa có gợi ý nào lúc này.",
    requests: "Không có lời mời nào đang chờ.",
    sent: "Bạn chưa gửi lời mời nào.",
    blocked: "Bạn chưa chặn ai.",
  };

  function actions(row: Row) {
    const p = row.person;

    if (tab === "friends") {
      return (
        <>
          <button className="fr-icon-btn" title="Nhắn tin" onClick={(e) => { e.stopPropagation(); soon("Nhắn tin"); }}>
            <Icon name="chat" alt="Nhắn tin" />
          </button>
          <button className="fr-icon-btn" title="Thách đấu" onClick={(e) => { e.stopPropagation(); soon("Thách đấu bạn bè"); }}>
            <Icon name="swords" alt="Thách đấu" />
          </button>
          <button className="fr-icon-btn" title="Tặng quà" onClick={(e) => { e.stopPropagation(); soon("Tặng quà"); }}>
            <Icon name="gift" alt="Tặng quà" />
          </button>
          <div className="fr-more" ref={menuFor === p.id ? menuRef : undefined}>
            <button
              className="fr-icon-btn"
              title="Thêm"
              aria-expanded={menuFor === p.id}
              onClick={(e) => {
                e.stopPropagation();
                setMenuFor(menuFor === p.id ? null : p.id);
              }}
            >
              <Icon name="dots" alt="Thêm" />
            </button>
            {menuFor === p.id && (
              <div className="fr-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => act(p.id, () => api(`/${p.id}/favorite`, "POST"))}>
                  {p.favorite ? "Bỏ yêu thích" : "Yêu thích"}
                </button>
                <button onClick={() => act(p.id, () => api(`/${p.id}/remove`, "POST"), `Đã xóa ${p.displayName} khỏi danh sách bạn bè.`)}>
                  Xóa bạn
                </button>
                <button className="danger" onClick={() => act(p.id, () => api(`/${p.id}/block`, "POST"), `Đã chặn ${p.displayName}.`)}>
                  Chặn
                </button>
              </div>
            )}
          </div>
        </>
      );
    }

    if (tab === "suggest") {
      if (p.isFriend) return <span className="fr-note">Đã là bạn</span>;

      return (
        <button
          className="fr-btn gold"
          disabled={busy === p.id}
          onClick={(e) => {
            e.stopPropagation();
            act(p.id, async () => {
              const r = await api<{ status: string }>("/request", "POST", { userId: p.id });

              setNotice(r.status === "friends" ? `Bạn và ${p.displayName} đã là bạn bè!` : `Đã gửi lời mời đến ${p.displayName}.`);
            });
          }}
        >
          <Icon name="user-plus" />
          Kết bạn
        </button>
      );
    }

    if (tab === "requests") {
      return (
        <>
          <button className="fr-btn gold" disabled={busy === row.key} onClick={(e) => { e.stopPropagation(); act(row.key, () => api(`/requests/${row.requestId}/accept`, "POST"), `Bạn và ${p.displayName} đã là bạn bè!`); }}>
            Đồng ý
          </button>
          <button className="fr-btn ghost" disabled={busy === row.key} onClick={(e) => { e.stopPropagation(); act(row.key, () => api(`/requests/${row.requestId}/decline`, "POST")); }}>
            Từ chối
          </button>
        </>
      );
    }

    if (tab === "sent") {
      return (
        <button className="fr-btn ghost" disabled={busy === row.key} onClick={(e) => { e.stopPropagation(); act(row.key, () => api(`/requests/${row.requestId}/decline`, "POST"), "Đã hủy lời mời."); }}>
          Hủy lời mời
        </button>
      );
    }

    return (
      <button className="fr-btn ghost" disabled={busy === p.id} onClick={(e) => { e.stopPropagation(); act(p.id, () => api(`/${p.id}/unblock`, "POST"), `Đã bỏ chặn ${p.displayName}.`); }}>
        Bỏ chặn
      </button>
    );
  }

  return (
    <AcademyShell active="Bạn bè">
      {() => {
        if (state === "loading") return <div className="fr-page"><p className="fr-muted">Đang tải...</p></div>;

        if (state !== "ok") {
          return (
            <div className="fr-page">
              <div className="fr-panel fr-center">
                <p>{state === "guest" ? "Bạn cần đăng nhập để xem bạn bè." : "Không thể tải danh sách bạn bè. Hãy kiểm tra backend đã chạy."}</p>
                <button className="fr-btn gold" onClick={() => (state === "guest" ? router.push("/") : loadFriends())}>
                  {state === "guest" ? "Về trang chủ để đăng nhập" : "Thử lại"}
                </button>
              </div>
            </div>
          );
        }

        const tier = profile ? getTier(profile.elo) : null;

        return (
          <div className="fr-page">
            <header className="fr-head">
              <img className="fr-laurel" src="/images/academy/practice/laurel-l.png" alt="" />
              <div>
                <h1>Bạn Bè</h1>
                <p>Kết nối – Giao lưu – Cùng chinh phục đỉnh cao!</p>
              </div>
              <img className="fr-laurel" src="/images/academy/practice/laurel-r.png" alt="" />
            </header>

            <nav className="fr-tabs">
              {TABS.map((t) => (
                <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => switchTab(t.id)}>
                  <Icon name={t.icon} />
                  {t.label}
                  {!!t.badge && <b className="fr-badge">{t.badge > 9 ? "9+" : t.badge}</b>}
                </button>
              ))}
            </nav>

            {notice && (
              <div className="ac-notice fr-notice">
                <span>ⓘ</span>
                <p>{notice}</p>
                <button onClick={() => setNotice("")}>×</button>
              </div>
            )}

            <div className="fr-body">
              <section className="fr-panel fr-list-panel">
                <header className="fr-list-head">
                  <Icon name={TABS.find((t) => t.id === tab)!.icon} />
                  <h2>{panelTitle[tab]}</h2>

                  {(tab === "friends" || tab === "suggest") && (
                    <label className="fr-search">
                      <input
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setPage(1);
                        }}
                        placeholder={tab === "friends" ? "Tìm kiếm bạn bè..." : "Tìm theo tên hoặc ID #12345678"}
                      />
                      <Icon name="search" />
                    </label>
                  )}

                  {tab === "friends" && (
                    <label className="fr-sort" title="Sắp xếp">
                      <Icon name="sliders" />
                      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sắp xếp">
                        <option value="status">Đang online trước</option>
                        <option value="elo">Elo cao nhất</option>
                        <option value="name">Tên A–Z</option>
                      </select>
                    </label>
                  )}
                </header>

                <div className="fr-rows">
                  {listLoading && tab !== "friends" && <p className="fr-muted fr-empty">Đang tải...</p>}
                  {!listLoading && shown.length === 0 && <p className="fr-muted fr-empty">{empty[tab]}</p>}

                  {shown.map((row) => {
                    const p = row.person;
                    const t = getTier(p.elo);

                    return (
                      <div
                        key={row.key}
                        role="button"
                        tabIndex={0}
                        className={`fr-row${selectedId === p.id ? " on" : ""}`}
                        onClick={() => setSelectedId(p.id)}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedId(p.id)}
                      >
                        {tab === "friends" ? (
                          <button
                            className={`fr-star${p.favorite ? " on" : ""}`}
                            title={p.favorite ? "Bỏ yêu thích" : "Yêu thích"}
                            onClick={(e) => {
                              e.stopPropagation();
                              act(p.id, () => api(`/${p.id}/favorite`, "POST"));
                            }}
                          >
                            ★
                          </button>
                        ) : (
                          <span className="fr-star-space" />
                        )}

                        <PlayerAvatar avatar={p.avatarId} frame={p.avatarFrame} name={p.displayName} className="fr-pa" />

                        <div className="fr-name">
                          <strong>
                            <Flag code={p.country} /> {p.displayName}
                          </strong>
                          <span className="fr-elo">
                            <Icon name="crown" />
                            {p.elo.toLocaleString("en-US")}
                          </span>
                        </div>

                        <StatusText p={p} />

                        <div className="fr-tier">
                          <TierBadge index={t.index} text={false} className="fr-tier-badge" />
                          <span>{t.name}</span>
                          {p.sameClub && <em>Cùng CLB</em>}
                        </div>

                        <div className="fr-actions">{actions(row)}</div>
                      </div>
                    );
                  })}
                </div>

                {pageCount > 1 && (
                  <div className="fr-pager">
                    <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1} aria-label="Trang trước">‹</button>
                    <span>{safePage} / {pageCount}</span>
                    <button onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage === pageCount} aria-label="Trang sau">›</button>
                  </div>
                )}
              </section>

              <aside className="fr-panel fr-card">
                {!profile ? (
                  <p className="fr-muted fr-card-empty">Chọn một người chơi để xem hồ sơ.</p>
                ) : (
                  <>
                    <div className="fr-cover" style={{ backgroundImage: `url(${getCover(profile.cover).src})` }} />
                    <PlayerAvatar avatar={profile.avatarId} frame={profile.avatarFrame} name={profile.displayName} className="fr-card-pa" />
                    <h3>
                      <Flag code={profile.country} /> {profile.displayName}
                    </h3>
                    <div className="fr-card-sub">
                      {profile.country && <span className="fr-country">{countryName(profile.country)}</span>}
                      {profile.playerCode && <span className="fr-code">#{profile.playerCode}</span>}
                      <StatusText p={profile} />
                    </div>

                    {tier && (
                      <div className="fr-card-tier">
                        <TierBadge index={tier.index} text={false} className="fr-tier-badge big" />
                        <span>{tier.name}</span>
                        <b>
                          <Icon name="crown" />
                          {profile.elo.toLocaleString("en-US")}
                        </b>
                      </div>
                    )}

                    <div className="fr-stats">
                      <div>
                        <Icon name="swords" />
                        <b>{profile.stats.total.toLocaleString("en-US")}</b>
                        <small>Trận</small>
                      </div>
                      <div>
                        <img src="/images/academy/club/i-trophy.png" alt="" />
                        <b>{profile.stats.wins.toLocaleString("en-US")}</b>
                        <small>Thắng</small>
                      </div>
                      <div>
                        <img src="/images/academy/club/i-target.png" alt="" />
                        <b>{profile.stats.winRate}%</b>
                        <small>Tỷ lệ thắng</small>
                      </div>
                    </div>

                    <ul className="fr-facts">
                      {profile.club && (
                        <li>
                          <img src={`/images/academy/club/flags/${profile.club.banner}.webp`} alt="" />
                          CLB <b>{profile.club.name}</b>
                        </li>
                      )}
                      {profile.friendSince && (
                        <li>
                          <Icon name="heart" />
                          Bạn bè từ <b>{new Date(profile.friendSince).toLocaleDateString("vi-VN")}</b>
                        </li>
                      )}
                      <li>
                        <Icon name="calendar" />
                        Tham gia <b>{new Date(profile.joinedAt).toLocaleDateString("vi-VN")}</b>
                      </li>
                    </ul>

                    {profile.friendSince ? (
                      <div className="fr-card-actions">
                        <button className="fr-btn gold big" onClick={() => soon("Thách đấu bạn bè")}>
                          <Icon name="swords" />
                          Thách đấu
                        </button>
                        <button className="fr-btn ghost big" onClick={() => soon("Nhắn tin")}>
                          <Icon name="chat" />
                          Nhắn tin
                        </button>
                        <button className="fr-btn ghost big" onClick={() => soon("Tặng quà")}>
                          <Icon name="gift" />
                          Tặng quà
                        </button>
                        <button
                          className={`fr-btn ghost big${profile.favorite ? " fav" : ""}`}
                          onClick={() => act(profile.id, () => api(`/${profile.id}/favorite`, "POST"))}
                        >
                          <Icon name="heart" />
                          {profile.favorite ? "Đã yêu thích" : "Yêu thích"}
                        </button>
                      </div>
                    ) : (
                      <p className="fr-muted fr-card-note">Người chơi này chưa là bạn của bạn.</p>
                    )}
                  </>
                )}
              </aside>
            </div>
          </div>
        );
      }}
    </AcademyShell>
  );
}
