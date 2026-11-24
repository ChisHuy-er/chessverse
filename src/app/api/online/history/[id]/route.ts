
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    // 1. Lấy ID trận đấu từ URL
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { message: "Thiếu ID trận đấu." },
        { status: 400 },
      );
    }

    // 2. Lấy JWT từ cookie đăng nhập
    const token = request.cookies.get("cv_access_token")?.value;

    if (!token) {
      return NextResponse.json(
        { message: "Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn." },
        { status: 401 },
      );
    }

    // 3. Gọi API chi tiết trận đấu của NestJS
    const backendResponse = await fetch(
      `${BACKEND_URL}/online/history/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    // 4. Đọc dữ liệu trả về từ Backend
    const responseText = await backendResponse.text();

    let data: unknown;

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      console.error(
        "Backend trả về dữ liệu không phải JSON:",
        responseText,
      );

      return NextResponse.json(
        {
          message:
            "Backend trả về dữ liệu không hợp lệ. Vui lòng kiểm tra API NestJS.",
        },
        { status: 502 },
      );
    }

    // 5. Trả nguyên dữ liệu và HTTP status về Frontend
    return NextResponse.json(data, {
      status: backendResponse.status,
    });
  } catch (error) {
    console.error("Lỗi API lấy chi tiết trận đấu:", error);

    return NextResponse.json(
      {
        message: "Không thể kết nối đến Backend.",
      },
      { status: 500 },
    );
  }
}
