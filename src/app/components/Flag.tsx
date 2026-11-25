"use client";

// Lá cờ quốc gia theo mã ISO 2 chữ (VN, BR...).
// Dùng ảnh SVG từ flagcdn.com vì Windows không hiển thị được emoji cờ.

let names: Intl.DisplayNames | null = null;

export function countryName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(["vi"], { type: "region" });
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export default function Flag({ code, className = "" }: { code?: string | null; className?: string }) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;

  const name = countryName(code);

  return (
    <img
      className={`cv-flag ${className}`}
      src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
      alt={name}
      title={name}
      loading="lazy"
      draggable={false}
      style={{
        display: "inline-block",
        width: "1.35em",
        height: "1em",
        objectFit: "cover",
        borderRadius: 3,
        verticalAlign: "-0.12em",
        boxShadow: "0 0 0 1px rgba(255,255,255,.25), 0 1px 3px rgba(0,0,0,.5)",
        flex: "none",
      }}
    />
  );
}
