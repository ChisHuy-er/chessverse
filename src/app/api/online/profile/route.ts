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

    const backendResponse = await fetch(`${BACKEND_URL}/online/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = await backendResponse.json();

    const response = NextResponse.json(data, {
      status: backendResponse.status,
    });

    if (backendResponse.status === 401) {
      response.cookies.delete("cv_access_token");
    }

    return response;
  } catch (error) {
    console.error("Get profile API error:", error);

    return NextResponse.json(
      { message: "Không thể lấy hồ sơ" },
      { status: 502 },
    );
  }
}

// Lưu ảnh đại diện / khung / nền hồ sơ.
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

    const backendResponse = await fetch(`${BACKEND_URL}/online/profile`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });

    const data = await backendResponse.json().catch(() => ({}));

    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error("Update appearance API error:", error);

    return NextResponse.json(
      { message: "Không thể lưu giao diện" },
      { status: 502 },
    );
  }
}
