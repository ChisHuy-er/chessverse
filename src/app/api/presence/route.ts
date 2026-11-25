import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connection } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

// Báo backend rằng người dùng đang mở web (để hiện "Online").
export async function POST() {
  await connection();

  const cookieStore = await cookies();
  const token = cookieStore.get("cv_access_token")?.value;

  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const response = await fetch(`${BACKEND_URL}/presence/ping`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    return NextResponse.json({ ok: response.ok }, { status: response.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
