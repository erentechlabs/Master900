import { NextRequest, NextResponse } from "next/server";
import { objectStorage } from "@/lib/storage";

// Only keys produced by /api/media/upload are served (media/<date>/<token>.<image-ext>).
const MEDIA_KEY = /^media\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{8,64}\.(png|jpg|gif|webp)$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const joined = key.join("/");
  if (!MEDIA_KEY.test(joined)) return new NextResponse("Not found", { status: 404 });
  const object = await objectStorage()
    .get(joined)
    .catch(() => null);
  if (!object || !object.contentType.startsWith("image/")) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(object.bytes), {
    headers: {
      "content-type": object.contentType,
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
