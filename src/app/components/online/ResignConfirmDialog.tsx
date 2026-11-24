export default function ResignConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#1c1c25] p-6 text-center shadow-2xl">
        <div className="text-5xl">🏳️</div>

        <h3 className="mt-4 text-xl font-bold text-white">
          Xác nhận đầu hàng?
        </h3>

        <p className="mt-2 text-sm text-gray-400">
          Bạn sẽ thua ván đấu nếu xác nhận đầu hàng.
          Bạn có chắc chắn muốn tiếp tục?
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-white/10"
          >
            Hủy
          </button>

          <button
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500"
          >
            Đầu hàng
          </button>
        </div>
      </div>
    </div>
  );
}
