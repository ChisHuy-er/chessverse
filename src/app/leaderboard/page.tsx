"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import AcademyShell from "../components/AcademyShell";
import PlayerAvatar from "../components/PlayerAvatar";
import Flag from "../components/Flag";
import { getCover } from "../lib/appearance";
import "./leaderboard-avatars.css";

type Leader = {
  rank: number;
  id: string;
  name: string;
  elo: number;
  avatarId?: string | null;
  avatarFrame?: string | null;
  cover?: string | null;
  country?: string | null;
};

const PER_PAGE = 7;
const IMG = "/images/academy/lb";

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // Phạm vi xếp hạng: toàn cầu hoặc chỉ bạn bè (gồm cả bạn)
  const [scope, setScope] = useState<"global" | "friends">("global");
  const [friendBoard, setFriendBoard] = useState<Leader[] | null>(null);
  const [friendNote, setFriendNote] = useState("");

  async function openFriends() {
    setScope("friends");
    setPage(1);

    if (friendBoard) return;

    try {
      const [fr, me] = await Promise.all([
        fetch("/api/friends", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

      if (fr.status === 401 || me.status === 401) {
        setFriendNote("Đăng nhập để xem bảng xếp hạng bạn bè.");
        setFriendBoard([]);
        return;
      }

      const fData = await fr.json();
      const mData = await me.json();
      type F = { id: string; displayName: string; elo: number; avatarId?: string | null; avatarFrame?: string | null; cover?: string | null };
      const people: F[] = [...(fData.friends ?? [])];

      if (mData.user) {
        people.push({
          id: mData.user.id,
          displayName: mData.user.displayName,
          elo: mData.user.elo,
          avatarId: mData.user.avatarId,
          avatarFrame: mData.user.avatarFrame,
          cover: leaders.find((l) => l.id === mData.user.id)?.cover ?? null,
        });
      }

      const board = people
        .sort((a, b) => b.elo - a.elo)
        .map((p, i) => ({
          rank: i + 1,
          id: p.id,
          name: p.displayName,
          elo: p.elo,
          avatarId: p.avatarId,
          avatarFrame: p.avatarFrame,
          cover: p.cover,
          country: leaders.find((l) => l.id === p.id)?.country ?? (p.id === mData.user?.id ? mData.user.country : null),
        }));

      setFriendNote(board.length <= 1 ? "Bạn chưa có bạn bè nào. Kết bạn ở trang Bạn bè để so tài!" : "");
      setFriendBoard(board);
    } catch {
      setFriendNote("Không tải được danh sách bạn bè.");
      setFriendBoard([]);
    }
  }

  const board = scope === "friends" ? friendBoard ?? [] : leaders;

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch("/api/online/leaderboard?limit=50", {
          cache: "no-store",
        });

        if (!response.ok) throw new Error("bad response");

        const data = await response.json();

        if (alive && Array.isArray(data.leaders)) setLeaders(data.leaders);
      } catch {
        if (alive) setError("Không thể tải bảng xếp hạng. Vui lòng thử lại sau.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());

    return q ? board.filter((l) => normalize(l.name).includes(q)) : board;
  }, [board, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  // Dãy số trang hiển thị tối đa 4 nút quanh trang hiện tại.
  const first = Math.max(1, Math.min(current - 1, pageCount - 3));
  const pageNumbers = Array.from(
    { length: Math.min(4, pageCount) },
    (_, i) => first + i,
  );

  function goTo(next: number) {
    setPage(Math.min(pageCount, Math.max(1, next)));
  }

  return (
    <AcademyShell active="Bảng xếp hạng">
      {(user) => {
        const mine = board.find((l) => l.id === user?.id);
        const above = mine ? board.find((l) => l.rank === mine.rank - 1) : null;
        const podium = [board[1], board[0], board[2]];

        return (
          <div className="lb-page">
            <div className="lb-head">
              <img className="lb-title" src={`${IMG}/title.png`} alt="Bảng xếp hạng" />

              <div className="lb-tabs">
                <button
                  className={`lb-tab${scope === "global" ? " on" : ""}`}
                  type="button"
                  onClick={() => {
                    setScope("global");
                    setPage(1);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
                  </svg>
                  Toàn cầu
                </button>
                <button className={`lb-tab${scope === "friends" ? " on" : ""}`} type="button" onClick={openFriends}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="9" cy="8" r="3.2" />
                    <path d="M3 19c0-3.4 2.7-5.5 6-5.5s6 2.1 6 5.5M16 6.2a3 3 0 010 5.6M18 14c2 .6 3 2.2 3 5" />
                  </svg>
                  Bạn bè
                </button>
                <button className="lb-tab" type="button" disabled title="Sắp ra mắt">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="5" width="16" height="15" rx="2" />
                    <path d="M4 10h16M8 3v4M16 3v4" />
                  </svg>
                  Tuần này
                </button>
              </div>
            </div>

            <div className="lb-body">
              <div className="lb-left">
                <div className="lb-frame">
                  <div className="lb-row lb-header">
                    <span className="lb-c-rank">Hạng</span>
                    <span className="lb-c-name">Người chơi</span>
                    <span className="lb-c-elo">Elo</span>
                  </div>

                  {rows.map((player, index) => (
                    <div
                      key={player.id}
                      className={`lb-row has-cover${player.id === user?.id ? " me" : ""}`}
                      style={
                        {
                          "--i": index,
                          "--cover": `url(${getCover(player.cover).src})`,
                        } as CSSProperties
                      }
                    >
                      <span className="lb-c-rank">
                        {player.rank <= 3 ? (
                          <img src={`${IMG}/medal${player.rank}.png`} alt={`Hạng ${player.rank}`} />
                        ) : (
                          <span className="lb-plate">{player.rank}</span>
                        )}
                      </span>
                      <span className="lb-c-name">
                        <PlayerAvatar
                          avatar={player.avatarId}
                          frame={player.avatarFrame}
                          name={player.name}
                          className="lb-pa"
                        />
                        <b>{player.name}</b>
                        <Flag code={player.country} />
                      </span>
                      <span className="lb-c-elo">{player.elo.toLocaleString("en-US")}</span>
                    </div>
                  ))}

                  {scope === "friends" && friendNote && <p className="lb-empty">{friendNote}</p>}

                  {(loading || error || rows.length === 0) && !(scope === "friends" && friendNote) && (
                    <p className="lb-empty">
                      {scope === "friends" && !friendBoard
                        ? "Đang tải bạn bè..."
                        : loading
                          ? "Đang tải..."
                          : error ||
                            (query ? "Không tìm thấy người chơi nào." : "Chưa có người chơi nào.")}
                    </p>
                  )}
                </div>

                <div className="lb-pager">
                  <button type="button" onClick={() => goTo(1)} disabled={current === 1} aria-label="Trang đầu">
                    «
                  </button>
                  <button type="button" onClick={() => goTo(current - 1)} disabled={current === 1} aria-label="Trang trước">
                    ‹
                  </button>
                  {pageNumbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={n === current ? "on" : ""}
                      onClick={() => goTo(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button type="button" onClick={() => goTo(current + 1)} disabled={current === pageCount} aria-label="Trang sau">
                    ›
                  </button>
                  <button type="button" onClick={() => goTo(pageCount)} disabled={current === pageCount} aria-label="Trang cuối">
                    »
                  </button>
                </div>

                <label className="lb-search">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M16.5 16.5L21 21" />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Tìm người chơi..."
                  />
                </label>
              </div>

              <aside className="lb-right">
                <div className="lb-podium">
                  {podium.map((p, i) =>
                    p ? (
                      <div key={p.id} className={`lb-pod pod-${p.rank}`}>
                        <PlayerAvatar avatar={p.avatarId} frame={p.avatarFrame} name={p.name} className="lb-pod-pa" />
                        <img className="lb-pod-shield" src={`${IMG}/shield${p.rank}.png`} alt={`Hạng ${p.rank}`} />
                        <strong>
                          <Flag code={p.country} /> {p.name}
                        </strong>
                        <span>{p.elo.toLocaleString("en-US")} Elo</span>
                      </div>
                    ) : (
                      <div key={`empty-${i}`} className="lb-pod" />
                    ),
                  )}
                </div>

                <div className="ac-panel lb-me">
                  <img src={`${IMG}/emblem-king.png`} alt="" />
                  <div>
                    <small>Hạng của bạn</small>
                    {!user ? (
                      <p>Đăng nhập để xem hạng của bạn.</p>
                    ) : mine ? (
                      <>
                        <strong>
                          #{mine.rank}
                          <em>{mine.elo.toLocaleString("en-US")} Elo</em>
                        </strong>
                        <p>
                          {above
                            ? `Cần thêm ${Math.max(1, above.elo - mine.elo + 1)} Elo để lên hạng #${above.rank}.`
                            : "Bạn đang đứng đầu bảng!"}
                        </p>
                      </>
                    ) : (
                      <p>
                        {scope === "friends"
                          ? "Kết bạn để so tài cùng bạn bè!"
                          : "Bạn chưa vào top 50. Chơi thêm các ván xếp hạng để leo hạng!"}
                      </p>
                    )}
                  </div>
                </div>

                <img className="lb-banner" src={`${IMG}/banner.png`} alt="" />
              </aside>
            </div>
          </div>
        );
      }}
    </AcademyShell>
  );
}
