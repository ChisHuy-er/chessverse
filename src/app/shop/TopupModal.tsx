"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./topup.css";

const GEM = "/images/academy/shop/gem.svg";

type Provider = "vnpay" | "momo" | "mock";

interface Pkg {
  id: string;
  price: number;
  gems: number;
  bonus: number;
  tag?: "popular" | "best";
}

interface Info {
  packages: Pkg[];
  providers: Record<Provider, boolean>;
  sandbox: boolean;
  locked?: boolean;
}

interface Order {
  id: string;
  amount: number;
  gems: number;
  provider: "VNPAY" | "MOMO" | "MOCK";
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
  createdAt: string;
  balance?: number;
}

const PROVIDERS: { id: Provider; name: string; note: string }[] = [
  { id: "vnpay", name: "VNPAY", note: "QR ngân hàng · thẻ ATM · thẻ quốc tế" },
  { id: "momo", name: "MoMo", note: "Ví điện tử MoMo" },
  { id: "mock", name: "Thanh toán thử", note: "Không trừ tiền, chỉ để kiểm tra" },
];

const STATUS: Record<Order["status"], string> = {
  PENDING: "Đang chờ",
  PAID: "Thành công",
  FAILED: "Thất bại",
  EXPIRED: "Hết hạn",
};

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

async function api<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/payment/${path}`, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "Có lỗi xảy ra, vui lòng thử lại.");
  }

  return data as T;
}

export default function TopupModal({
  open,
  returnOrderId,
  onClose,
  onPaid,
}: {
  open: boolean;
  returnOrderId?: string | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [pkgId, setPkgId] = useState("g500");
  const [provider, setProvider] = useState<Provider>("vnpay");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"pick" | "mock" | "result" | "history">("pick");
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<Order[]>([]);

  useEffect(() => {
    if (!open) return;

    api<Info>("packages")
      .then((data) => {
        setInfo(data);
        // Chọn sẵn cổng đầu tiên đang bật
        const first = PROVIDERS.find((p) => data.providers[p.id]);
        if (first) setProvider((cur) => (data.providers[cur] ? cur : first.id));
      })
      .catch((e: Error) => setError(e.message));
  }, [open]);

  // Quay về từ cổng thanh toán: xem trạng thái đơn, chờ IPN tối đa ~30 giây
  const track = useCallback(
    async (id: string) => {
      setView("result");
      setError("");

      for (let i = 0; i < 15; i++) {
        try {
          const o = await api<Order>(`orders/${encodeURIComponent(id)}`);

          setOrder(o);

          if (o.status !== "PENDING") {
            if (o.status === "PAID") onPaid();
            return;
          }
        } catch (e) {
          setError((e as Error).message);
          return;
        }

        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    [onPaid],
  );

  useEffect(() => {
    if (open && returnOrderId) track(returnOrderId);
  }, [open, returnOrderId, track]);

  useEffect(() => {
    if (!open) {
      setView("pick");
      setOrder(null);
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const pkg = info?.packages.find((p) => p.id === pkgId);

  async function pay() {
    if (!pkg) return;

    setBusy(true);
    setError("");

    try {
      const res = await api<{ orderId: string; payUrl: string | null; mock?: boolean }>("orders", "POST", {
        packageId: pkg.id,
        provider,
      });

      if (res.payUrl) {
        window.location.href = res.payUrl;
        return;
      }

      setOrder({ id: res.orderId, amount: pkg.price, gems: pkg.gems + pkg.bonus, provider: "MOCK", status: "PENDING", createdAt: new Date().toISOString() });
      setView("mock");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmMock() {
    if (!order) return;

    setBusy(true);
    setError("");

    try {
      const o = await api<Order>(`orders/${order.id}/mock-pay`, "POST");

      setOrder(o);
      setView("result");
      if (o.status === "PAID") onPaid();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openHistory() {
    setView("history");
    setError("");

    try {
      setHistory(await api<Order[]>("orders"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return createPortal(
    <div className="tp-back" onClick={onClose}>
      <div className="tp-box" role="dialog" aria-label="Nạp kim cương" onClick={(e) => e.stopPropagation()}>
        <header className="tp-head">
          <img src={GEM} alt="" />
          <div>
            <h2>Nạp Kim Cương</h2>
            <p>Kim cương dùng để mua bộ quân cờ, bàn cờ và hiệu ứng.</p>
          </div>
          {info?.sandbox && <span className="tp-sandbox">Thử nghiệm</span>}
          <button className="tp-x" aria-label="Đóng" onClick={onClose}>×</button>
        </header>

        {error && <p className="tp-error">{error}</p>}

        {view === "pick" && (
          <>
            <div className="tp-grid">
              {(info?.packages ?? []).map((p) => (
                <button
                  key={p.id}
                  className={`tp-pkg${p.id === pkgId ? " on" : ""}`}
                  onClick={() => setPkgId(p.id)}
                >
                  {p.tag && <i className={`tp-tag ${p.tag}`}>{p.tag === "popular" ? "Phổ biến" : "Lợi nhất"}</i>}
                  <span className="tp-gems">
                    <img src={GEM} alt="" />
                    <b>{p.gems.toLocaleString("en-US")}</b>
                  </span>
                  <small className={p.bonus ? "" : "none"}>{p.bonus ? `+${p.bonus.toLocaleString("en-US")} thưởng` : "Không thưởng"}</small>
                  <strong>{vnd(p.price)}</strong>
                </button>
              ))}
            </div>

            {info?.locked && (
              <p className="tp-dev">🛠 Tính năng nạp kim cương đang được phát triển, hiện chưa thể thanh toán.</p>
            )}

            <h3 className="tp-label">Phương thức thanh toán</h3>
            <div className="tp-methods">
              {PROVIDERS.filter((p) => p.id !== "mock" || info?.providers.mock || info?.locked).map((p) => {
                const on = !!info?.providers[p.id];

                return (
                  <button
                    key={p.id}
                    className={`tp-method ${p.id}${provider === p.id && !info?.locked ? " on" : ""}`}
                    disabled={!on || !!info?.locked}
                    onClick={() => setProvider(p.id)}
                  >
                    <span className="tp-dot" />
                    <span>
                      <b>{p.name}</b>
                      <small>{info?.locked ? "Đang phát triển" : on ? p.note : "Chưa cấu hình khóa"}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <footer className="tp-foot">
              <div>
                {pkg && (
                  <>
                    <span>Nhận <b>{(pkg.gems + pkg.bonus).toLocaleString("en-US")}</b> <img src={GEM} alt="" /></span>
                    <strong>{vnd(pkg.price)}</strong>
                  </>
                )}
              </div>
              <button className="tp-link" onClick={openHistory}>Lịch sử nạp</button>
              <button className="tp-pay" disabled={busy || !pkg || !!info?.locked || !info?.providers[provider]} onClick={pay}>
                {info?.locked ? "Đang phát triển" : busy ? "Đang tạo đơn…" : "Thanh toán"}
              </button>
            </footer>
            <p className="tp-fine">Kim cương được cộng ngay khi cổng thanh toán xác nhận giao dịch. Vật phẩm ảo không hoàn tiền.</p>
          </>
        )}

        {view === "mock" && order && (
          <div className="tp-center">
            <div className="tp-mockcard">
              <span>Cổng thanh toán thử</span>
              <strong>{vnd(order.amount)}</strong>
              <p>Mã đơn: {order.id}</p>
              <p>Nhận {order.gems.toLocaleString("en-US")} kim cương</p>
            </div>
            <div className="tp-row">
              <button className="tp-ghost" onClick={() => setView("pick")}>Hủy</button>
              <button className="tp-pay" disabled={busy} onClick={confirmMock}>{busy ? "Đang xử lý…" : "Xác nhận đã thanh toán"}</button>
            </div>
          </div>
        )}

        {view === "result" && (
          <div className="tp-center">
            {!order ? (
              <p className="tp-wait">Đang kiểm tra giao dịch…</p>
            ) : order.status === "PAID" ? (
              <>
                <div className="tp-ok">✓</div>
                <h3>Nạp thành công!</h3>
                <p className="tp-plus">+{order.gems.toLocaleString("en-US")} <img src={GEM} alt="" /></p>
                {order.balance !== undefined && <p>Số dư hiện tại: <b>{order.balance.toLocaleString("en-US")}</b> kim cương</p>}
              </>
            ) : order.status === "PENDING" ? (
              <>
                <div className="tp-spin" />
                <h3>Đang chờ cổng thanh toán xác nhận</h3>
                <p>Nếu bạn đã trả tiền, kim cương sẽ được cộng trong ít phút. Bạn có thể đóng cửa sổ này.</p>
              </>
            ) : (
              <>
                <div className="tp-bad">!</div>
                <h3>{order.status === "EXPIRED" ? "Đơn đã hết hạn" : "Thanh toán không thành công"}</h3>
                <p>Bạn chưa bị trừ kim cương. Hãy thử lại hoặc chọn phương thức khác.</p>
              </>
            )}
            <div className="tp-row">
              <button className="tp-ghost" onClick={() => setView("pick")}>Nạp thêm</button>
              <button className="tp-pay" onClick={onClose}>Xong</button>
            </div>
          </div>
        )}

        {view === "history" && (
          <div className="tp-hist">
            {history.length === 0 ? (
              <p className="tp-wait">Chưa có giao dịch nạp nào.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Thời gian</th><th>Cổng</th><th>Số tiền</th><th>Kim cương</th><th>Trạng thái</th></tr>
                </thead>
                <tbody>
                  {history.map((o) => (
                    <tr key={o.id}>
                      <td>{new Date(o.createdAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</td>
                      <td>{o.provider === "MOCK" ? "Thử" : o.provider === "MOMO" ? "MoMo" : "VNPAY"}</td>
                      <td>{vnd(o.amount)}</td>
                      <td>+{o.gems.toLocaleString("en-US")}</td>
                      <td><span className={`tp-st ${o.status.toLowerCase()}`}>{STATUS[o.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="tp-row">
              <button className="tp-ghost" onClick={() => setView("pick")}>← Quay lại</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
