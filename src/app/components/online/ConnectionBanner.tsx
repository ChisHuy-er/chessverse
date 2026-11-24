export default function ConnectionBanner({
  message,
  connectionLost,
  onClose,
}: {
  message: string;
  connectionLost: boolean;
  onClose: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
      <span>{message}</span>
      {connectionLost && (
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg border border-yellow-500/50 px-3 py-1 font-semibold transition hover:bg-yellow-500/10"
        >
          Đóng
        </button>
      )}
    </div>
  );
}
