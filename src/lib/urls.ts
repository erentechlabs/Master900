/**
 * Only allow same-origin relative paths as post-login redirect targets (prevents open redirects such as
 * `//evil.example`, `/\evil.example` or `https://evil.example`).
 */
export function safeCallbackUrl(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || value.length > 2048) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
