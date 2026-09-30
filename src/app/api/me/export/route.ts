import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/actions";
import { getAccountExport } from "@/modules/account/export";
import { authorize } from "@/modules/auth/session";

export async function GET() {
  const user = await authorize("learn:use");
  enforceRateLimit("export", user.id);
  const data = await getAccountExport(user.id);
  const body = JSON.stringify(data, null, 2);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="fundamentals-academy-export-${user.id}.json"`,
      "cache-control": "no-store",
    },
  });
}
