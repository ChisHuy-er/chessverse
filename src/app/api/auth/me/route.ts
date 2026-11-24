
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connection } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

export async function GET() {
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

    const backendResponse = await fetch(
      `${BACKEND_URL}/auth/me`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    const data = await backendResponse.json();

    if (!backendResponse.ok) {
      const response = NextResponse.json(data, {
        status: backendResponse.status,
      });

      if (backendResponse.status === 401) {
        response.cookies.delete("cv_access_token");
      }

      return response;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Get profile API error:", error);

    return NextResponse.json(
      { message: "Không thể lấy thông tin tài khoản" },
      { status: 502 },
    );
  }
}
