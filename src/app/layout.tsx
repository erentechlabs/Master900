import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/modules/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t("common.appName"), template: `%s · ${t("common.appShortName")}` },
    description: t("common.tagline"),
    applicationName: t("common.appName"),
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, messages }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  const reduceMotion = user?.preference?.reducedMotion ?? false;
  return (
    <html lang={locale} suppressHydrationWarning className={reduceMotion ? "reduce-motion" : undefined}>
      <body className="min-h-screen font-sans">
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
