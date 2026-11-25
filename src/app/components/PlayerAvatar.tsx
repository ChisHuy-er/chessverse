import type { CSSProperties } from "react";
import { getAvatar, getFrame } from "../lib/appearance";
import "./player-avatar.css";

// Ảnh đại diện nằm dưới khung. Vị trí/kích thước tính theo lỗ tròn đo sẵn của từng khung,
// nên đổi khung nào ảnh cũng vừa khít. Kích thước do CSS bên ngoài quyết định
// (đặt width hoặc height cho .pa, phần còn lại tự theo tỉ lệ khung).
export default function PlayerAvatar({
  avatar,
  frame,
  name,
  className = "",
}: {
  avatar: string | null | undefined;
  frame: string | null | undefined;
  name: string;
  className?: string;
}) {
  const f = getFrame(frame);
  const a = getAvatar(avatar);
  // Phóng ảnh to hơn lỗ một chút để mép ảnh nằm dưới viền khung.
  const R = f.r * 1.06;

  const discStyle: CSSProperties = {
    left: `${f.cx - R}%`,
    top: `${f.cy - R / f.ar}%`,
    width: `${R * 2}%`,
  };

  return (
    <span className={`pa ${className}`} style={{ "--ar": f.ar } as CSSProperties}>
      <span className="pa-disc" style={discStyle}>
        {a ? <img src={a.src} alt="" draggable={false} /> : <i>{name.charAt(0).toUpperCase()}</i>}
      </span>
      <img className="pa-frame" src={f.src} alt="" draggable={false} />
    </span>
  );
}
