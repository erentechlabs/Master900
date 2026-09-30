import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { getFlashcardDeck } from "@/modules/learning/flashcards";
import { FlashcardSession } from "@/components/learning/flashcard-session";
import { PageHeader, EmptyState } from "@/components/page";
import { Field, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Flashcards" };

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const [{ t, locale }, user] = await Promise.all([getI18n(), requirePermission("learn:use", "/flashcards")]);
  const certificationId = typeof params.certificationId === "string" ? params.certificationId : undefined;
  const domainId = typeof params.domainId === "string" ? params.domainId : undefined;
  const moduleId = typeof params.moduleId === "string" ? params.moduleId : undefined;
  const deck = await getFlashcardDeck(user.id, locale, { certificationId, domainId, moduleId });
  const selected = deck.enrollments.find((enrollment) => enrollment.certificationId === deck.certificationId);
  return (
    <div className="space-y-6">
      <PageHeader title={t("learner.flashcards.title")} description={t("learner.flashcards.subtitle")} />
      <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
        <Field id="certificationId" label={t("learner.flashcards.chooseCert")}>
          <Select name="certificationId" defaultValue={deck.certificationId ?? ""}>
            {deck.enrollments.map((enrollment) => <option key={enrollment.certificationId} value={enrollment.certificationId}>{enrollment.certification.code} · {enrollment.certification.name}</option>)}
          </Select>
        </Field>
        <Field id="domainId" label={t("catalog.skillsMeasured")}>
          <Select name="domainId" defaultValue={domainId ?? ""}>
            <option value="">{t("common.all")}</option>
            {selected?.certification.domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.title}</option>)}
          </Select>
        </Field>
        <Field id="moduleId" label={t("catalog.learningPath")}>
          <Select name="moduleId" defaultValue={moduleId ?? ""}>
            <option value="">{t("common.all")}</option>
            {selected?.certification.domains.flatMap((domain) => domain.modules).map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
          </Select>
        </Field>
        <div className="flex items-end"><Button type="submit">{t("common.filter")}</Button></div>
      </form>
      {deck.cards.length ? <FlashcardSession cards={deck.cards} /> : <EmptyState title={t("learner.flashcards.empty")} />}
    </div>
  );
}
