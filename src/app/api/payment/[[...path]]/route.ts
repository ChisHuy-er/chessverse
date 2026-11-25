import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connection } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

// Chuyển tiếp mọi yêu cầu /api/payment/... sang backend /payment/...
async function forward(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  await connection();

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("cv_access_token")?.value;
    const { path = [] } = await context.params;

    // Danh sách gói nạp xem được khi chưa đăng nhập
    if (!token && !(request.method === "GET" && path[0] === "packages")) {
      return NextResponse.json(
        { message: "Bạn chưa đăng nhập" },
        { status: 401 },
      );
    }

    const search = new URL(request.url).search;
    const target = `${BACKEND_URL}/payment${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${search}`;

    const init: RequestInit = {
      method: request.method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      cache: "no-store",
    };

    if (request.method !== "GET") {
      init.body = JSON.stringify((await request.json().catch(() => null)) ?? {});
    }

    const backendResponse = await fetch(target, init);
    const data = await backendResponse.json().catch(() => ({}));

    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error("Payment API error:", error);

    return NextResponse.json(
      { message: "Không thể kết nối máy chủ thanh toán" },
      { status: 502 },
    );
  }
}

export { forward as GET, forward as POST };
