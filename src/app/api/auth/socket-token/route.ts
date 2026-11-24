
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connection } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

export async function POST() {
  await connection();

  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("cv_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { message: "Bạn chưa đăng nhập" },
        { status: 401 },
      );
    }

    const backendResponse = await fetch(
      `${BACKEND_URL}/auth/socket-token`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );

    const data = await backendResponse.json();

    if (!backendResponse.ok) {
      return NextResponse.json(data, {
        status: backendResponse.status,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Get socket token error:", error);

    return NextResponse.json(
      { message: "Không thể tạo kết nối Online" },
      { status: 502 },
    );
  }
}
