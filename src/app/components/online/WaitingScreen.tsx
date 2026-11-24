export default function WaitingScreen({
  status,
  message,
}: {
  status: string;
  message: string;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
      <div className="mb-6 text-6xl text-yellow-400">
        ♞
      </div>

      <h3 className="text-2xl font-bold">{status}</h3>

      <p className="mt-3 text-sm text-gray-400">
        {message}
      </p>

      <div className="mt-7 h-2 w-48 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-yellow-500" />
      </div>
    </div>
  );
}
