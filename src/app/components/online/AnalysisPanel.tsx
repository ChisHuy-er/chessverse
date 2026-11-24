import { getReasonText, getAnalysisColor, getAnalysisIcon, formatCpl, getMoveTitle, formatEvaluation } from "./helpers";
import type { AnalysisMove, FinishedData } from "./types";

export default function AnalysisPanel({
  finished,
  isWinner,
  myAverageCpl,
  selectedAnalysisMove,
  bestMoveSan,
  allAnalysisMoves,
  selectedReviewPly,
  onSelectPly,
}: {
  finished: FinishedData;
  isWinner: boolean;
  myAverageCpl: number | null;
  selectedAnalysisMove: AnalysisMove | null;
  bestMoveSan: string;
  allAnalysisMoves: AnalysisMove[];
  selectedReviewPly: number | null;
  onSelectPly: (ply: number | null) => void;
}) {
  return (
    <>
      <div className="rounded-xl border border-yellow-500/30 bg-[#24242c] p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold tracking-wider text-yellow-400">
            PHÂN TÍCH VÁN ĐẤU
          </div>

          <span className="rounded-full bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-400">
            STOCKFISH
          </span>
        </div>

        <div className="mt-3 text-lg font-bold text-white">
          {finished.result === "draw"
            ? "Ván cờ hòa"
            : isWinner
              ? "Bạn chiến thắng"
              : "Bạn đã thua"}
        </div>

        <p className="mt-1 text-xs text-gray-400">
          {getReasonText(finished.reason)}
        </p>
      </div>

      {/* MY CPL */}

      <div className="rounded-xl bg-[#24242c] p-4">
        <div className="text-xs font-bold tracking-wider text-gray-400">
          ĐÁNH GIÁ CỦA BẠN
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-gray-300">
            Trung bình CPL
          </span>

          <span className="text-xl font-bold text-yellow-400">
            {formatCpl(myAverageCpl)}
          </span>
        </div>
      </div>

      {/* SELECTED MOVE ANALYSIS */}

      <div className="rounded-xl border border-yellow-500/20 bg-[#24242c] p-4">
        <div className="text-xs font-bold tracking-wider text-yellow-400">
          PHÂN TÍCH NƯỚC ĐI ĐANG CHỌN
        </div>

        {selectedAnalysisMove ? (
          <>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-lg font-bold">
                {getMoveTitle(selectedAnalysisMove)}
              </div>

              <span
                className={[
                  "text-sm font-bold",
                  getAnalysisColor(
                    selectedAnalysisMove.label,
                  ),
                ].join(" ")}
              >
                {getAnalysisIcon(
                  selectedAnalysisMove.label,
                )}{" "}
                {selectedAnalysisMove.label}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-black/20 p-3">
                <div className="text-[10px] text-gray-500">
                  MẤT LỢI THẾ
                </div>

                <div className="mt-1 font-bold text-white">
                  {formatCpl(
                    selectedAnalysisMove.centipawnLoss,
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-black/20 p-3">
                <div className="text-[10px] text-gray-500">
                  ĐỘ SÂU
                </div>

                <div className="mt-1 font-bold text-white">
                  Depth {selectedAnalysisMove.depth}
                </div>
              </div>

              <div className="rounded-lg bg-black/20 p-3">
                <div className="text-[10px] text-gray-500">
                  ĐÁNH GIÁ STOCKFISH
                </div>

                <div className="mt-1 font-bold text-yellow-300">
                  {formatEvaluation(selectedAnalysisMove)}
                </div>
              </div>

              <div className="rounded-lg bg-black/20 p-3">
                <div className="text-[10px] text-gray-500">
                  NƯỚC TỐT NHẤT
                </div>

                <div className="mt-1 font-bold text-green-400">
                  {bestMoveSan}
                </div>
              </div>
            </div>

            {selectedAnalysisMove.pv.length > 0 && (
              <div className="mt-3 rounded-lg bg-black/20 p-3">
                <div className="text-[10px] text-gray-500">
                  BIẾN PHÂN TÍCH STOCKFISH (UCI)
                </div>

                <div className="mt-1 wrap-break-words text-xs leading-relaxed text-gray-300">
                  {selectedAnalysisMove.pv.join(" ")}
                </div>
              </div>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
              Điểm đánh giá Stockfish được tính theo góc nhìn
              của bên tới lượt đi tại vị trí trước nước đi.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-gray-400">
            Chọn một nước đi trong danh sách bên dưới để xem
            phân tích chi tiết.
          </p>
        )}
      </div>

      {/* ALL MOVES */}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-[#24242c]">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <div className="text-sm font-bold text-white">
              DANH SÁCH NƯỚC ĐI
            </div>

            <div className="mt-1 text-xs text-gray-400">
              {allAnalysisMoves.length} nước đã được phân tích
            </div>
          </div>

          <button
            onClick={() => onSelectPly(null)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-white/10"
          >
            Vị trí cuối
          </button>
        </div>

        <div className="border-b border-white/10 p-2">
          <button
            onClick={() => onSelectPly(0)}
            className={[
              "w-full rounded-lg px-3 py-2 text-left text-xs transition",
              selectedReviewPly === 0
                ? "bg-yellow-500/15 text-yellow-300"
                : "text-gray-400 hover:bg-white/5",
            ].join(" ")}
          >
            Xem vị trí bắt đầu
          </button>
        </div>

        {allAnalysisMoves.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-5 text-center">
            <div className="text-4xl text-gray-600">
              ♞
            </div>

            <p className="mt-3 text-sm text-gray-400">
              Chưa có dữ liệu phân tích nước đi.
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Hãy kiểm tra dữ liệu Stockfish từ Backend.
            </p>
          </div>
        ) : (
          <div className="max-h-[430px] flex-1 space-y-1 overflow-y-auto p-2">
            {allAnalysisMoves.map((item) => {
              const isSelected =
                selectedReviewPly === item.ply;

              return (
                <button
                  key={item.ply}
                  onClick={() =>
                    onSelectPly(item.ply)
                  }
                  className={[
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left transition",
                    isSelected
                      ? "border border-yellow-500/40 bg-yellow-500/15"
                      : "border border-transparent bg-black/10 hover:bg-white/5",
                  ].join(" ")}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={[
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                        item.color === "w"
                          ? "bg-gray-200 text-black"
                          : "bg-gray-700 text-white",
                      ].join(" ")}
                    >
                      {item.color === "w" ? "T" : "Đ"}
                    </span>

                    <div className="min-w-0">
                      <div className="font-semibold text-white">
                        {getMoveTitle(item)}
                      </div>

                      <div className="mt-1 text-[11px] text-gray-500">
                        Depth {item.depth}
                        {" · "}
                        {formatCpl(item.centipawnLoss)}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={[
                        "text-sm font-black",
                        getAnalysisColor(item.label),
                      ].join(" ")}
                    >
                      {getAnalysisIcon(item.label)}
                    </span>

                    <span
                      className={[
                        "text-xs font-bold",
                        getAnalysisColor(item.label),
                      ].join(" ")}
                    >
                      {item.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="border-t border-white/10 p-3">
          <p className="text-[10px] leading-relaxed text-gray-500">
            Chọn một nước đi để xem lại bàn cờ tại thời điểm đó.
            CPL là mức mất lợi thế tính bằng centipawn.
          </p>
        </div>
      </div>
    </>
  );
}
