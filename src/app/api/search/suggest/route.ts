import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { limitBy } from "@/lib/rate-limit";
import { getI18n } from "@/i18n/server";
import { authorize } from "@/modules/auth/session";
import { suggestSearch } from "@/modules/learning/search-suggest";

const querySchema = z.object({ q: z.string().trim().max(100).catch("") });

export async function GET(req: NextRequest) {
  const user = await authorize("learn:use");
  if (!limitBy("answer", user.id).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { q } = querySchema.parse({ q: req.nextUrl.searchParams.get("q") ?? "" });
  const { locale, t } = await getI18n();
  const result = await suggestSearch(locale, q, t);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
