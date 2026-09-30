import { requirePermission } from "@/modules/auth/session";
import { prisma } from "@/lib/db";
import { QuestionForm } from "../question-form";
import { saveQuestion } from "../../actions";

export default async function NewQuestionPage() {
  await requirePermission("questions:edit");
  const certs = await prisma.certification.findMany({ include: { domains: { include: { objectives: true } }, lessons: true }, orderBy: { code: "asc" } });
  return <QuestionForm action={saveQuestion as never} certifications={certs} />;
}
