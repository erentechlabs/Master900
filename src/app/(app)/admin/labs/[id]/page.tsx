import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth/session";
import { prisma } from "@/lib/db";
import { LabForm } from "../lab-form";
import { saveLab } from "../../actions";

export default async function EditLabPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("labs:edit");
  const { id } = await params;
  const [lab, certs] = await Promise.all([
    prisma.lab.findUnique({ where: { id }, include: { steps: { orderBy: { sortOrder: "asc" }, include: { rules: { orderBy: { sortOrder: "asc" } } } }, rules: { where: { stepId: null }, orderBy: { sortOrder: "asc" } } } }),
    prisma.certification.findMany({ include: { domains: { include: { objectives: true } }, modules: true }, orderBy: { code: "asc" } }),
  ]);
  if (!lab) notFound();
  return <LabForm lab={lab} certifications={certs} action={saveLab as never} />;
}
