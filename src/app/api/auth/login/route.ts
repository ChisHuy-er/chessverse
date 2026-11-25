import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const backendResponse = await fetch(
      `${BACKEND_URL}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
          // Gợi ý quốc gia: header CDN (khi chạy thật) + múi giờ/ngôn ngữ trình duyệt
          "x-geo-country": request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? "",
          "x-client-tz": request.headers.get("x-client-tz") ?? "",
          "x-client-locale": request.headers.get("x-client-locale") ?? "",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );

    const data = await backendResponse.json();

    if (!backendResponse.ok) {
      return NextResponse.json(data, {
        status: backendResponse.status,
      });
    }

    if (!data.accessToken) {
      return NextResponse.json(
        { message: "Backend không trả về access token" },
        { status: 502 },
      );
    }

    const response = NextResponse.json({
      message: data.message,
      user: data.user,
    });

    response.cookies.set("cv_access_token", data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    console.error("Login API error:", error);

    return NextResponse.json(
      { message: "Không thể kết nối đến máy chủ đăng nhập" },
      { status: 502 },
    );
  }
}