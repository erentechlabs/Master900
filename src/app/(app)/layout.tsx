import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/modules/auth/session";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return <AppShell user={user}>{children}</AppShell>;
}
