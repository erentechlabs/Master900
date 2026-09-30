import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { authorize } from "@/modules/auth/session";
import { sendTutorMessage, tutorMessageSchema } from "@/modules/tutor/service";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === getEnv().APP_URL;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await authorize("learn:use");
  const input = tutorMessageSchema.parse(await request.json());
  const result = await sendTutorMessage(user, input, await getI18n());
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
