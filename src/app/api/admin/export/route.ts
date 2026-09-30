import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorize } from "@/modules/auth/session";
import { exportCatalog, exportCoursePackage, exportQuestionsCsv } from "@/modules/content/exporter";

export async function GET(req: NextRequest) {
  await authorize("content:export");
  const params = req.nextUrl.searchParams;
  const type = params.get("type") ?? "catalog";
  const code = params.get("code") ?? "";
  if (type === "questions") {
    const csv = await exportQuestionsCsv(prisma, code);
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${code}-questions.csv"` } });
  }
  const data = type === "course" ? await exportCoursePackage(prisma, code) : await exportCatalog(prisma);
  return NextResponse.json(data, { headers: { "content-disposition": `attachment; filename="${type === "course" ? code : "catalog"}.json"` } });
}
