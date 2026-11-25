"use client";

import { useEffect, useState } from "react";

// Kiểu nhìn bàn cờ: phẳng (2D) hoặc nghiêng có chiều sâu (3D). Lưu trên trình duyệt.
export type BoardView = "2d" | "3d";

const KEY = "cv_board_view";
const EVENT = "cv-board-view";

function read(): BoardView {
  try {
    return localStorage.getItem(KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

export function useBoardView(): [BoardView, (view: BoardView) => void] {
  const [view, setView] = useState<BoardView>("2d");

  useEffect(() => {
    const sync = () => setView(read());

    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function change(next: BoardView) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Trình duyệt chặn lưu: vẫn đổi trong phiên hiện tại
    }

    setView(next);
    window.dispatchEvent(new Event(EVENT));
  }

  return [view, change];
}
