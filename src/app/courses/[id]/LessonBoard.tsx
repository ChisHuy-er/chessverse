"use client";

import type { CSSProperties, ReactNode } from "react";
import { FILES, type Arrow, type MarkKind, type Marks, type Position } from "../../lib/lessons";

const GLYPH: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟︎" };

export function PieceView({ code, skin }: { code: string; skin?: string }) {
  const color = code[0];
  const type = code[1];

  if (skin) return <img className="lb-img" src={`${skin}/${color}${type}.webp`} alt="" draggable={false} />;

  return <span className={`lb-glyph ${color}`}>{GLYPH[type]}</span>;
}

type View = { f0: number; f1: number; r0: number; r1: number };

const FULL: View = { f0: 0, f1: 7, r0: 0, r1: 7 };

// Khung nhìn thu gọn (ít nhất 4×4) bao quanh các ô được dùng
export function autoView(squares: string[]): View {
  if (squares.length === 0) return { f0: 2, f1: 5, r0: 2, r1: 5 };

  const fs = squares.map((s) => FILES.indexOf(s[0]));
  const rs = squares.map((s) => Number(s[1]) - 1);
  const grow = (lo: number, hi: number) => {
    while (hi - lo < 3) {
      if (lo > 0 && (hi === 7 || (hi - lo) % 2 === 0)) lo--;
      else hi++;
    }
    return [lo, hi];
  };
  const [f0, f1] = grow(Math.min(...fs), Math.max(...fs));
  const [r0, r1] = grow(Math.min(...rs), Math.max(...rs));

  return { f0, f1, r0, r1 };
}

const ORDER: MarkKind[] = ["move", "target", "good", "capture", "bad", "check"];

export default function LessonBoard({
  position,
  marks = {},
  arrows = [],
  selected,
  skin,
  view = FULL,
  coords = false,
  onSquare,
  className = "",
}: {
  position: Position;
  marks?: Marks;
  arrows?: Arrow[];
  selected?: string | null;
  skin?: string;
  view?: View;
  coords?: boolean;
  onSquare?: (sq: string) => void;
  className?: string;
}) {
  const cols = view.f1 - view.f0 + 1;
  const rows = view.r1 - view.r0 + 1;

  const markOf = (sq: string) => {
    let kind: MarkKind | null = null;

    for (const k of ORDER) if (marks[k]?.includes(sq)) kind = k;

    return kind;
  };

  const squares: ReactNode[] = [];

  for (let r = view.r1; r >= view.r0; r--) {
    for (let f = view.f0; f <= view.f1; f++) {
      const sq = `${FILES[f]}${r + 1}`;
      const piece = position[sq];
      const mark = markOf(sq);

      squares.push(
        <div
          key={sq}
          className={`lb-sq ${(f + r) % 2 ? "light" : "dark"}${mark ? ` m-${mark}` : ""}${selected === sq ? " sel" : ""}${onSquare ? " click" : ""}`}
          onClick={onSquare ? () => onSquare(sq) : undefined}
        >
          {mark === "move" && !piece && <i className="lb-dot" />}
          {piece && <PieceView code={`${piece.color}${piece.type}`} skin={skin} />}
          {mark === "bad" && !piece && <i className="lb-x">✕</i>}
        </div>,
      );
    }
  }

  const xy = (sq: string) => [FILES.indexOf(sq[0]) + 0.5, 7 - (Number(sq[1]) - 1) + 0.5];

  return (
    <div className={`lb ${className}`} style={{ "--cols": cols, "--rows": rows } as CSSProperties}>
      <div className="lb-grid">
        {squares}
        {arrows.length > 0 && (
          <svg className="lb-arrows" viewBox={`${view.f0} ${7 - view.r1} ${cols} ${rows}`} aria-hidden="true">
            {arrows.map(([from, to, tone], i) => {
              const [x1, y1] = xy(from);
              const [x2, y2] = xy(to);
              const len = Math.hypot(x2 - x1, y2 - y1);
              const ux = (x2 - x1) / len;
              const uy = (y2 - y1) / len;
              const ex = x2 - ux * 0.32;
              const ey = y2 - uy * 0.32;
              const px = -uy * 0.2;
              const py = ux * 0.2;

              return (
                <g key={i} className={`lb-arrow ${tone ?? "gold"}`}>
                  <line x1={x1} y1={y1} x2={ex} y2={ey} />
                  <polygon points={`${x2},${y2} ${ex + px},${ey + py} ${ex - px},${ey - py}`} />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {coords && (
        <>
          <div className="lb-ranks" aria-hidden="true">
            {Array.from({ length: rows }, (_, i) => (
              <span key={i}>{view.r1 - i + 1}</span>
            ))}
          </div>
          <div className="lb-files" aria-hidden="true">
            {Array.from({ length: cols }, (_, i) => (
              <span key={i}>{FILES[view.f0 + i].toUpperCase()}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
