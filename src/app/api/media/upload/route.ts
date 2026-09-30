import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, enforceRateLimit } from "@/lib/actions";
import { objectStorage, detectImage } from "@/lib/storage";
import { randomToken } from "@/lib/random";
import { audit } from "@/modules/admin/audit";
import { authorize } from "@/modules/auth/session";

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const actor = await authorize("content:edit");
  enforceRateLimit("upload", `${actor.id}:${await clientIp()}`);
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = detectImage(bytes);
  if (!contentType) return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const key = `media/${new Date().toISOString().slice(0, 10)}/${randomToken(18)}.${ext}`;
  await objectStorage().put(key, bytes, contentType);
  const asset = await prisma.mediaAsset.create({ data: { key, contentType, size: bytes.length, alt: typeof form.get("alt") === "string" ? String(form.get("alt")) : null, uploadedById: actor.id } });
  await audit({ id: actor.id, email: actor.email }, "media.upload", { entityType: "MEDIA_ASSET", entityId: asset.id, summary: key });
  return NextResponse.json({ id: asset.id, key, url: `/api/media/${key}`, markdown: `![${asset.alt ?? ""}](/api/media/${key})` });
}
