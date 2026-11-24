
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { io, Socket } from "socket.io-client";

interface MatchFoundData {
  matchId: string;
  fen: string;
  players: {
    white: string;
    black: string;
  };
}

interface SocketError {
  message: string;
}

export default function OnlinePage() {
  const socketRef = useRef<Socket | null>(null);

  const [status, setStatus] = useState("Chưa kết nối");
  const [message, setMessage] = useState(
    "Sẵn sàng tìm đối thủ",
  );
  const [loading, setLoading] = useState(false);
  const [match, setMatch] = useState<MatchFoundData | null>(null);
  const [myColor, setMyColor] = useState<string | null>(null);

  const disconnectSocket = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  };

  const findMatch = async () => {
    if (loading || socketRef.current) return;

    setLoading(true);
    setMatch(null);
    setMyColor(null);
    setMessage("Đang xác thực tài khoản...");

    try {
      const response = await fetch("/api/auth/socket-token", {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(
          data.message || "Không thể xác thực tài khoản",
        );
      }

      setMessage("Đang kết nối máy chủ Online...");

      const socket = io(
        process.env.NEXT_PUBLIC_SOCKET_URL ||
          "http://localhost:3000",
        {
          auth: {
            token: data.token,
          },
          transports: ["websocket", "polling"],
          reconnection: false,
        },
      );

      socketRef.current = socket;

      socket.on("connect", () => {
        setStatus("Đã kết nối");
        setMessage("Đang tìm đối thủ...");
        const params = new URLSearchParams(window.location.search);
        const mode = params.get("mode") === "casual" ? "casual" : "ranked";

        socket.emit("match:find", { mode });
      });

      socket.on("connect_error", (error) => {
        setStatus("Kết nối thất bại");
        setMessage(error.message);
        setLoading(false);
        disconnectSocket();
      });

      socket.on("match:waiting", (data: SocketError) => {
        setMessage(data.message);
        setStatus("Đang tìm trận");
      });

      socket.on("match:found", (data: MatchFoundData) => {
        setMatch(data);
        setMessage("Đã tìm thấy đối thủ!");
        setStatus("Đã ghép trận");
        setLoading(false);
      });

      socket.on(
        "match:your-color",
        (data: { color: string }) => {
          setMyColor(data.color);
        },
      );

      socket.on("match:cancelled", (data: SocketError) => {
        setMessage(data.message);
        setStatus("Đã hủy");
        setLoading(false);
        disconnectSocket();
      });

      socket.on("match:error", (data: SocketError) => {
        setMessage(data.message);
        setStatus("Có lỗi xảy ra");
        setLoading(false);
      });

      socket.on("match:opponent-disconnected", (data: SocketError) => {
        setMessage(data.message);
        setStatus("Đối thủ mất kết nối");
      });

      socket.on("disconnect", () => {
        setStatus("Đã ngắt kết nối");
      });
    } catch (error) {
      setStatus("Có lỗi xảy ra");
      setMessage(
        error instanceof Error
          ? error.message
          : "Không thể kết nối máy chủ",
      );
      setLoading(false);
      disconnectSocket();
    }
  };

  const cancelMatch = () => {
    const socket = socketRef.current;

    if (socket?.connected) {
      socket.emit("match:cancel");
    } else {
      disconnectSocket();
      setLoading(false);
      setStatus("Đã hủy");
      setMessage("Đã hủy tìm trận.");
    }
  };

  return (
    <main className="min-h-screen bg-[#101014] text-white px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/play"
          className="text-sm text-gray-400 hover:text-white"
        >
          ← Quay lại chơi cờ
        </Link>

        <div className="mt-10 rounded-2xl border border-white/10 bg-[#19191f] p-6 md:p-10">
          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-yellow-500">
              CHESSVERSE
            </p>

            <h1 className="mt-3 text-3xl font-bold">
              Online 1v1
            </h1>

            <p className="mt-3 text-gray-400">
              Tìm kiếm đối thủ và bắt đầu trận đấu
            </p>
          </div>

          <div className="mt-10 rounded-xl bg-[#101014] p-6 text-center">
            <div className="text-sm text-gray-400">
              Trạng thái kết nối
            </div>

            <div className="mt-2 text-lg font-semibold text-yellow-400">
              {status}
            </div>

            <p className="mt-3 text-sm text-gray-300">
              {message}
            </p>
          </div>

          {match && (
            <div className="mt-6 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
              <h2 className="text-center text-xl font-bold text-yellow-400">
                Đã ghép trận thành công!
              </h2>

              <div className="mt-5 grid grid-cols-2 gap-4 text-center">
                <div className="rounded-lg bg-[#101014] p-4">
                  <div className="text-sm text-gray-400">
                    Quân Trắng
                  </div>
                  <div className="mt-2 font-semibold">
                    {match.players.white}
                  </div>
                </div>

                <div className="rounded-lg bg-[#101014] p-4">
                  <div className="text-sm text-gray-400">
                    Quân Đen
                  </div>
                  <div className="mt-2 font-semibold">
                    {match.players.black}
                  </div>
                </div>
              </div>

              <div className="mt-5 text-center">
                <p className="text-sm text-gray-400">
                  Bạn chơi quân
                </p>
                <p className="mt-1 text-2xl font-bold text-yellow-400">
                  {myColor === "white"
                    ? "TRẮNG"
                    : myColor === "black"
                      ? "ĐEN"
                      : "Đang xác định..."}
                </p>
              </div>

              <p className="mt-4 break-all text-center text-xs text-gray-500">
                Match ID: {match.matchId}
              </p>

              <p className="mt-3 text-center text-sm text-gray-400">
                Bàn cờ Online sẽ được tích hợp ở bước tiếp theo.
              </p>
            </div>
          )}

          <div className="mt-8">
            {!match && !loading && (
              <button
                onClick={findMatch}
                className="w-full rounded-xl bg-yellow-500 py-4 font-bold text-black transition hover:bg-yellow-400"
              >
                TÌM ĐỐI THỦ
              </button>
            )}

            {loading && (
              <button
                onClick={cancelMatch}
                className="w-full rounded-xl border border-red-500 py-4 font-bold text-red-400 transition hover:bg-red-500/10"
              >
                HỦY TÌM TRẬN
              </button>
            )}

            {match && (
              <button
                onClick={() => {
                  disconnectSocket();
                  setMatch(null);
                  setMyColor(null);
                  setLoading(false);
                  setStatus("Đã ngắt kết nối");
                  setMessage("Sẵn sàng tìm trận mới");
                }}
                className="w-full rounded-xl bg-yellow-500 py-4 font-bold text-black transition hover:bg-yellow-400"
              >
                RỜI TRẬN
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
