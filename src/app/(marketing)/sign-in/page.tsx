import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/modules/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";
import { safeCallbackUrl } from "@/lib/urls";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("common.signIn") };
}

const DEMO = [
  { role: "demoLearner" as const, email: "learner@example.com", password: "Learner12345!" },
  { role: "demoInstructor" as const, email: "instructor@example.com", password: "Instructor123!" },
  { role: "demoAdmin" as const, email: "admin@example.com", password: "Admin12345!" },
];

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const target = safeCallbackUrl(callbackUrl);
  if (await getCurrentUser()) redirect(target);
  const { t } = await getI18n();
  // Demo credentials are only shown outside production and when the demo accounts exist.
  const showDemo = process.env.NODE_ENV !== "production" && (await prisma.user.count({ where: { isDemo: true, email: { in: DEMO.map((d) => d.email) } } })) > 0;
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">
            {t("auth.signInTitle")}
          </CardTitle>
          <CardDescription>{t("auth.signInSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm callbackUrl={target} demoAccounts={showDemo ? DEMO : []} />
        </CardContent>
      </Card>
    </div>
  );
}
