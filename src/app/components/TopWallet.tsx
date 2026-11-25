"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchWallet } from "../lib/shop";

// Kim cương + xu trên thanh trên cùng (hiện ở mọi trang khi đã đăng nhập).
// Trang nào làm thay đổi số dư thì phát sự kiện "cv-wallet" để ô này tải lại.
export const WALLET_EVENT = "cv-wallet";

// Chỉ hiện ở Cửa hàng và Thử thách
const SHOW_ON = ["/shop", "/challenges"];

export default function TopWallet() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const show = SHOW_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const [wallet, setWallet] = useState<{ gems: number; coins: number } | null>(null);

  useEffect(() => {
    if (!show) return;

    let alive = true;
    const load = () =>
      fetchWallet().then((w) => {
        if (alive) setWallet(w ? { gems: w.gems, coins: w.coins } : null);
      });

    load();
    window.addEventListener(WALLET_EVENT, load);
    window.addEventListener("focus", load);

    return () => {
      alive = false;
      window.removeEventListener(WALLET_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [show]);

  if (!show || !wallet) return null;

  return (
    <div className="tw-wallet">
      <span className="tw-pill" title="Kim cương">
        <img src="/images/academy/shop/gem.svg" alt="" />
        <b>{wallet.gems.toLocaleString("en-US")}</b>
        <button aria-label="Nạp kim cương" title="Nạp kim cương" onClick={() => {
            // Đang ở Cửa hàng: mở hộp nạp ngay; trang khác: chuyển sang Cửa hàng rồi mở
            if (pathname === "/shop") window.dispatchEvent(new Event("cv-open-topup"));
            else router.push("/shop?nap=1");
          }}>
          +
        </button>
      </span>
      <span className="tw-pill" title="Xu">
        <img src="/images/academy/shop/coin.svg" alt="" />
        <b>{wallet.coins.toLocaleString("en-US")}</b>
        <button aria-label="Kiếm xu" title="Làm nhiệm vụ để kiếm xu" onClick={() => router.push("/challenges")}>
          +
        </button>
      </span>
    </div>
  );
}
