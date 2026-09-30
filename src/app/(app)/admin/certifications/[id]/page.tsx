import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { ICON_NAMES } from "@/components/icon";
import { saveCertification } from "../../actions";
import { CertificationForm } from "../certification-form";

export default async function EditCertificationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("catalog:manage");
  const { id } = await params;
  const [cert, certifications] = await Promise.all([
    prisma.certification.findUnique({ where: { id }, include: { domains: { orderBy: { sortOrder: "asc" }, include: { objectives: { orderBy: { sortOrder: "asc" } } }, }, versions: { orderBy: { version: "desc" } }, curriculumAlerts: { orderBy: { createdAt: "desc" } }, relatedFrom: { include: { to: true } } } }),
    prisma.certification.findMany({ orderBy: { code: "asc" } }),
  ]);
  if (!cert) notFound();
  return <CertificationForm action={saveCertification as never} certification={cert} iconNames={ICON_NAMES} certifications={certifications} />;
}
