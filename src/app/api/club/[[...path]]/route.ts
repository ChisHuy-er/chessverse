import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connection } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

// Chuyển tiếp mọi yêu cầu /api/club/... sang backend /club/...
async function forward(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
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

    const { path = [] } = await context.params;
    const search = new URL(request.url).search;
    const target = `${BACKEND_URL}/club${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${search}`;

    const init: RequestInit = {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
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
    console.error("Club API error:", error);

    return NextResponse.json(
      { message: "Không thể kết nối máy chủ câu lạc bộ" },
      { status: 502 },
    );
  }
}

export { forward as GET, forward as POST, forward as PATCH };
