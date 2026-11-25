"use client";

import { useEffect, useState } from "react";
import "./hero-slides.css";

// Banner trang chủ: trang 1 là ChessVerse (nội dung gốc trong page.tsx), 2 trang sau đè lên.
// Sửa chữ thông báo ở đây.
export const HERO_SLIDE_COUNT = 3;

const DECEMBER = [
  { icon: "🏆", text: "Đua top Bảng xếp hạng mùa Đông" },
  { icon: "🎁", text: "Skin Giáng Sinh sắp mở bán trong Cửa hàng" },
  { icon: "🎆", text: "Đón năm mới 2027 cùng ChessVerse" },
];

const FLAKES = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: -((i * 1.37) % 9),
  dur: 7 + ((i * 7) % 6),
  size: 2 + (i % 3),
}));

function Snow() {
  return (
    <div className="hs-snow" aria-hidden="true">
      {FLAKES.map((f, i) => (
        <i
          key={i}
          style={{ left: `${f.left}%`, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s`, width: f.size, height: f.size }}
        />
      ))}
    </div>
  );
}

// Cây thông vẽ bằng SVG (viền vàng, quả châu, ngôi sao)
function TreeArt() {
  const balls = [
    [92, 78, "#e8475f"], [118, 92, "#f1d58f"], [76, 110, "#5fb2ff"], [130, 120, "#e8475f"],
    [100, 132, "#f1d58f"], [66, 150, "#f1d58f"], [140, 158, "#5fb2ff"], [104, 168, "#e8475f"],
  ] as const;

  return (
    <svg className="hs-art tree" viewBox="0 0 220 230" aria-hidden="true">
      <defs>
        <linearGradient id="hsPine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f8a5b" />
          <stop offset="1" stopColor="#0f4a34" />
        </linearGradient>
        <radialGradient id="hsGlow">
          <stop offset="0" stopColor="#ffe7a3" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffe7a3" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="104" cy="34" r="34" fill="url(#hsGlow)" />
      <ellipse cx="110" cy="214" rx="100" ry="12" fill="#e9f1ff" opacity=".85" />
      <rect x="96" y="184" width="16" height="24" rx="2" fill="#6b4226" />
      <path d="M104 40 150 100H128L168 150H140L186 196H22L68 150H40L80 100H58Z" fill="url(#hsPine)" stroke="#f1d58f" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M70 104Q104 120 138 100M52 152Q104 172 156 148" fill="none" stroke="#f1d58f" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
      {balls.map(([x, y, c], i) => (
        <circle key={i} className="hs-ball" style={{ animationDelay: `${i * 0.35}s` }} cx={x} cy={y} r="5.5" fill={c} stroke="#fff6" strokeWidth="1" />
      ))}
      <path className="hs-star" d="M104 18l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8L104 45.1l-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7Z" fill="#ffd866" stroke="#fff3c4" strokeWidth="1.5" />
      {/* Hộp quà */}
      <g>
        <rect x="140" y="182" width="34" height="28" rx="3" fill="#c8324c" />
        <rect x="154" y="182" width="6" height="28" fill="#f1d58f" />
        <rect x="140" y="192" width="34" height="5" fill="#f1d58f" />
        <rect x="36" y="188" width="30" height="22" rx="3" fill="#2d5fc4" />
        <rect x="48" y="188" width="6" height="22" fill="#f1d58f" />
      </g>
    </svg>
  );
}

// Tờ lịch tháng 12
function CalendarArt() {
  return (
    <svg className="hs-art cal" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="hsCalTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8475f" />
          <stop offset="1" stopColor="#a8233b" />
        </linearGradient>
      </defs>
      <rect x="30" y="34" width="140" height="146" rx="16" fill="#f5f1e6" stroke="#f1d58f" strokeWidth="3" />
      <path d="M30 50a16 16 0 0 1 16-16h108a16 16 0 0 1 16 16v26H30Z" fill="url(#hsCalTop)" />
      <text x="100" y="66" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700" letterSpacing="2">THÁNG</text>
      <text x="100" y="154" textAnchor="middle" fill="#1a2350" fontSize="72" fontWeight="800" fontFamily="Georgia, serif">12</text>
      <rect x="62" y="22" width="10" height="26" rx="5" fill="#f1d58f" />
      <rect x="128" y="22" width="10" height="26" rx="5" fill="#f1d58f" />
      {/* Bông tuyết */}
      <g stroke="#cfe3ff" strokeWidth="2" strokeLinecap="round" className="hs-flake">
        <path d="M176 22v24M164 34h24M168 26l16 16M184 26l-16 16" />
      </g>
      <g stroke="#cfe3ff" strokeWidth="1.6" strokeLinecap="round" className="hs-flake b">
        <path d="M18 150v16M10 158h16M12.5 152.5l11 11M23.5 152.5l-11 11" />
      </g>
    </svg>
  );
}

export function HeroSlides({ slide, onShop, onPlay }: { slide: number; onShop: () => void; onPlay: () => void }) {
  return (
    <>
      <div className={`hs-slide noel${slide === 1 ? " on" : ""}`} aria-hidden={slide !== 1}>
        <Snow />
        <div className="hs-text">
          <span className="hs-kicker">Sự kiện tháng 12</span>
          <h2>Giáng Sinh ChessVerse</h2>
          <p>Không khí Noel đã về! Bộ quân cờ và bàn cờ chủ đề Giáng Sinh sắp có mặt trong Cửa hàng.</p>
          <button className="ac-gold-button" tabIndex={slide === 1 ? 0 : -1} onClick={onShop}>🎁 Ghé Cửa hàng</button>
        </div>
        <TreeArt />
      </div>

      <div className={`hs-slide dec${slide === 2 ? " on" : ""}`} aria-hidden={slide !== 2}>
        <Snow />
        <div className="hs-text">
          <span className="hs-kicker">Thông báo</span>
          <h2>Tháng 12 có gì mới?</h2>
          <ul>
            {DECEMBER.map((d) => (
              <li key={d.text}>
                <span>{d.icon}</span>
                {d.text}
              </li>
            ))}
          </ul>
          <button className="ac-gold-button" tabIndex={slide === 2 ? 0 : -1} onClick={onPlay}>▶ Chơi ngay</button>
        </div>
        <CalendarArt />
      </div>
    </>
  );
}

// Tự chuyển trang sau 6 giây; bấm chấm để chọn
export function useHeroSlide(): [number, (n: number) => void] {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSlide((n) => (n + 1) % HERO_SLIDE_COUNT), 6000);
    return () => clearTimeout(t);
  }, [slide]);

  return [slide, setSlide];
}
