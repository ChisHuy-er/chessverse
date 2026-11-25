import { NextResponse, connection } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3000";

export async function GET(request: Request) {
  await connection();

  try {
    const limit = new URL(request.url).searchParams.get("limit") ?? "";
    const query = /^\d{1,2}$/.test(limit) ? `?limit=${limit}` : "";

    const backendResponse = await fetch(`${BACKEND_URL}/online/leaderboard${query}`, {
      method: "GET",
      cache: "no-store",
    });

    const data = await backendResponse.json();

    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error("Get leaderboard API error:", error);

    return NextResponse.json(
      { message: "Không thể lấy bảng xếp hạng" },
      { status: 502 },
    );
  }
}
