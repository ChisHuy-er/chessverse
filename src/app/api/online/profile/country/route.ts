import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connection } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

// Tự điền quốc gia (lá cờ) cho tài khoản chưa có.
export async function PATCH(request: Request) {
  await connection();

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("cv_access_token")?.value;

    if (!token) {
      return NextResponse.json(
        { message: "Bạn chưa đăng nhập" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);

    const backendResponse = await fetch(`${BACKEND_URL}/online/profile/country`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-geo-country": request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? "",
      },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });

    const data = await backendResponse.json().catch(() => ({}));

    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error("Update country API error:", error);

    return NextResponse.json(
      { message: "Không thể cập nhật quốc gia" },
      { status: 502 },
    );
  }
}
