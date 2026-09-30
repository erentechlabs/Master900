import { requirePermission } from "@/modules/auth/session";
import { ICON_NAMES } from "@/components/icon";
import { saveCertification } from "../../actions";
import { CertificationForm } from "../certification-form";

export default async function NewCertificationPage() {
  await requirePermission("catalog:manage");
  return <CertificationForm action={saveCertification as never} iconNames={ICON_NAMES} certifications={[]} />;
}
