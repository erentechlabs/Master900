import { requirePermission } from "@/modules/auth/session";
import { prisma } from "@/lib/db";
import { LabForm } from "../lab-form";
import { saveLab } from "../../actions";

export default async function NewLabPage() {
  await requirePermission("labs:edit");
  const certs = await prisma.certification.findMany({ include: { domains: { include: { objectives: true } }, modules: true }, orderBy: { code: "asc" } });
  return <LabForm certifications={certs} action={saveLab as never} />;
}
