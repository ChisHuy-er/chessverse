import { confettiPieces, confettiColors } from "./constants";
import type { OnlineMode, EloChange, FinishedData } from "./types";

export default function ResultOverlay({
  finished,
  isWinner,
  mode,
  myEloChange,
  onDismiss,
  onLeave,
}: {
  finished: FinishedData;
  isWinner: boolean;
  mode: OnlineMode;
  myEloChange: EloChange | null;
  onDismiss: () => void;
  onLeave: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-200 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">

        {/* CONFETTI */}

        {isWinner && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {confettiPieces.map((piece) => (
              <span
                key={piece}
                className="confetti-piece"
                style={{
                  left: `${(piece * 37) % 100}%`,
                  backgroundColor:
                    confettiColors[
                      piece % confettiColors.length
                    ],
                  animationDelay: `${
                    (piece % 8) * 0.12
                  }s`,
                  animationDuration: `${
                    2.8 + (piece % 5) * 0.3
                  }s`,
                }}
              />
            ))}
          </div>
        )}

        {/* RESULT CARD */}

        <div className="relative z-10 my-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-yellow-500/40 bg-[#1c1c25] p-6 text-center shadow-[0_0_60px_rgba(234,179,8,0.2)] md:p-7">

          {/* CLOSE X */}
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDismiss();
            }}
            aria-label="Đóng bảng kết quả"
            title="Đóng bảng kết quả"
            className="absolute right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-xl text-gray-300 transition hover:border-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400"
          >
            ×
          </button>


          {/* RESULT TITLE */}

          {finished.result === "draw" ? (
            <>
              <div className="mb-4 text-7xl">🤝</div>

              <h2 className="text-3xl font-black text-gray-200">
                VÁN CỜ HÒA!
              </h2>

              <p className="mt-3 text-gray-400">
                Trận đấu đã kết thúc với kết quả hòa.
              </p>
            </>
          ) : isWinner ? (
            <>
              <div className="mb-4 animate-bounce text-7xl">
                🏆
              </div>

              <div className="text-sm font-bold tracking-[0.3em] text-yellow-400">
                CHESSVERSE
              </div>

              <h2 className="mt-3 text-3xl font-black text-yellow-400 md:text-4xl">
                CHÚC MỪNG BẠN ĐÃ CHIẾN THẮNG!
              </h2>

              <p className="mt-4 text-sm text-gray-300">
                {finished.reason === "checkmate"
                  ? "Bạn đã chiếu hết đối thủ."
                  : finished.reason === "resign"
                    ? "Đối thủ đã đầu hàng."
                    : finished.reason === "disconnect"
                      ? "Đối thủ đã rời trận hoặc mất kết nối."
                      : "Bạn đã giành chiến thắng."}
              </p>
            </>
          ) : (
            <>
              <div className="mb-4 text-7xl">♟️</div>

              <h2 className="text-3xl font-black text-red-400">
                BẠN ĐÃ THUA!
              </h2>

              <p className="mt-3 text-gray-400">
                {finished.reason === "resign"
                  ? "Bạn đã đầu hàng."
                  : finished.reason === "disconnect"
                    ? "Bạn đã mất kết nối hoặc rời trận."
                    : "Đối thủ đã giành chiến thắng."}
              </p>
            </>
          )}

          {/* ONLY MY ELO */}

          {mode === "ranked" && myEloChange && (
            <div className="mt-6 rounded-2xl border border-yellow-500/30 bg-[#272630] p-4 text-left">
              <div className="mb-4 text-center text-xs font-bold tracking-wider text-yellow-400">
                ELO CỦA BẠN
              </div>

              <div className="grid grid-cols-3 items-center gap-2 text-center">
                <div>
                  <div className="text-xs text-gray-400">
                    ELO CŨ
                  </div>

                  <div className="mt-1 text-xl font-bold">
                    {myEloChange.before}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-400">
                    THAY ĐỔI
                  </div>

                  <div
                    className={[
                      "mt-1 text-2xl font-black",
                      myEloChange.change > 0
                        ? "text-green-400"
                        : myEloChange.change < 0
                          ? "text-red-400"
                          : "text-gray-300",
                    ].join(" ")}
                  >
                    {myEloChange.change > 0 ? "+" : ""}
                    {myEloChange.change}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-400">
                    ELO MỚI
                  </div>

                  <div className="mt-1 text-xl font-bold text-yellow-400">
                    {myEloChange.after}
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === "ranked" && !myEloChange && (
            <div className="mt-6 rounded-xl bg-[#272630] p-4">
              <p className="text-sm text-gray-300">
                Chưa nhận được dữ liệu thay đổi Elo từ máy chủ.
              </p>
            </div>
          )}

          {mode === "casual" && (
            <div className="mt-6 rounded-xl bg-[#272630] p-4">
              <div className="text-sm font-semibold text-gray-200">
                ĐẤU THƯỜNG
              </div>

              <p className="mt-2 text-xs text-gray-400">
                Trận đấu này không làm thay đổi điểm Elo của bạn.
              </p>
            </div>
          )}

          {/* CLOSE MATCH */}

          <button
            onClick={onLeave}
            className="mt-6 w-full rounded-xl bg-yellow-500 px-6 py-3 font-bold text-black transition hover:bg-yellow-400"
          >
            ĐÓNG TRẬN
          </button>

          <p className="mt-3 text-xs text-gray-500">
            Nhấn × để xem lại bàn cờ và phân tích các nước đi.
          </p>
        </div>
      </div>
      <style jsx global>{`
        .confetti-piece {
          position: absolute;
          top: -20px;
          width: 9px;
          height: 15px;
          border-radius: 2px;
          opacity: 0;
          animation-name: chessverse-confetti;
          animation-timing-function: ease-in;
          animation-fill-mode: forwards;
        }

        @keyframes chessverse-confetti {
          0% {
            transform: translateY(-5vh) rotate(0deg);
            opacity: 1;
          }

          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
