
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const backendResponse = await fetch(
      `${BACKEND_URL}/auth/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

    const response = NextResponse.json(
      {
        message: data.message,
        user: data.user,
      },
      { status: 201 },
    );

    response.cookies.set("cv_access_token", data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    console.error("Register API error:", error);

    return NextResponse.json(
      { message: "Không thể kết nối đến máy chủ đăng ký" },
      { status: 502 },
    );
  }
}
