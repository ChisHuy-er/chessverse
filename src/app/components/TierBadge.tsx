import { TIERS, tierLabel, type Lang } from "../lib/rank";

// Huy hiệu hạng: ảnh để trống + chữ vẽ bằng code (tự đổi theo ngôn ngữ).
export default function TierBadge({
  index,
  lang = "vi",
  text = true,
  className = "",
}: {
  index: number;
  lang?: Lang;
  text?: boolean;
  className?: string;
}) {
  const t = TIERS[Math.max(0, Math.min(TIERS.length - 1, index - 1))];
  const label = tierLabel(t, lang).short;

  return (
    <span className={`tb ${className}`} data-long={label.length > 8 ? "1" : "0"}>
      {/* Huy hiệu không có ô chữ; nếu cần tên hạng thì hiện bên dưới */}
      <img src={`/images/academy/tier/r${t.index}.webp`} alt={tierLabel(t, lang).name} />
      {text && <b className="tb-name">{label}</b>}
    </span>
  );
}
