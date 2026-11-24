"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export type UserProfile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  elo: number;
  createdAt?: string;
};

type AuthModalProps = {
  open: boolean;
  initialMode: "login" | "register";
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
};

export default function AuthModal({
  open,
  initialMode,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint =
        mode === "login"
          ? "/api/auth/login"
          : "/api/auth/register";

      const body =
        mode === "login"
          ? { identifier, password }
          : { email, username, password, displayName };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message;

        throw new Error(message || "Đã xảy ra lỗi. Vui lòng thử lại.");
      }

      if (!data.user) {
        throw new Error("Máy chủ không trả về thông tin người chơi.");
      }

      onSuccess(data.user as UserProfile);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể kết nối đến máy chủ.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop auth-backdrop" onClick={onClose}>
      <div
        className="modal-card auth-card"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Đóng"
        >
          ×
        </button>

        <div className="auth-brand-mark">♞</div>

        <div className="modal-kicker">
          CHESSVERSE · THE NEXT MOVE
        </div>

        <h2>
          {mode === "login"
            ? "Chào mừng trở lại"
            : "Tạo tài khoản"}
        </h2>

        <p className="modal-description">
          {mode === "login"
            ? "Đăng nhập để tiếp tục hành trình chinh phục bàn cờ."
            : "Tham gia ChessVerse và bắt đầu hành trình của bạn."}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Đăng nhập
          </button>

          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Đăng ký
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <>
              <label htmlFor="auth-display-name">Tên hiển thị</label>
              <input
                id="auth-display-name"
                type="text"
                placeholder="Ví dụ: Huy Chess"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={2}
                maxLength={50}
                required
              />

              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={255}
                required
              />

              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                type="text"
                placeholder="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                title="Chỉ sử dụng chữ cái, số và dấu gạch dưới"
                required
              />
            </>
          ) : (
            <>
              <label htmlFor="auth-identifier">
                Email hoặc Username
              </label>
              <input
                id="auth-identifier"
                type="text"
                placeholder="Nhập email hoặc username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                minLength={3}
                maxLength={255}
                required
              />
            </>
          )}

          <label htmlFor="auth-password">Mật khẩu</label>
          <input
            id="auth-password"
            type="password"
            placeholder="Ít nhất 8 ký tự"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={72}
            required
          />

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary-button auth-submit"
            disabled={loading}
          >
            {loading
              ? "ĐANG XỬ LÝ..."
              : mode === "login"
                ? "ĐĂNG NHẬP"
                : "TẠO TÀI KHOẢN"}
          </button>
        </form>

        <p className="auth-switch-text">
          {mode === "login"
            ? "Chưa có tài khoản?"
            : "Đã có tài khoản?"}{" "}
          <button
            type="button"
            onClick={() =>
              switchMode(mode === "login" ? "register" : "login")
            }
          >
            {mode === "login" ? "Đăng ký ngay" : "Đăng nhập"}
          </button>
        </p>
      </div>
    </div>
  );
}
