import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "ok", version: process.env.npm_package_version ?? "0.1.0" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "ok", db: "error", version: process.env.npm_package_version ?? "0.1.0" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
