import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth/session";
import { prisma } from "@/lib/db";
import { QuestionForm } from "../question-form";
import { saveQuestion } from "../../actions";

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("questions:edit");
  const { id } = await params;
  const [question, certs] = await Promise.all([
    prisma.question.findUnique({ where: { id }, include: { domain: true, objective: true, lesson: true, options: { orderBy: { sortOrder: "asc" } }, sources: { include: { source: true } }, translations: true } }),
    prisma.certification.findMany({ include: { domains: { include: { objectives: true } }, lessons: true }, orderBy: { code: "asc" } }),
  ]);
  if (!question) notFound();
  return <QuestionForm action={saveQuestion as never} question={question} certifications={certs} />;
}
