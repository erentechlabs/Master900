import * as React from "react";
import {
  Activity,
  Award,
  BookOpen,
  Bot,
  Brain,
  Building2,
  Cloud,
  Crown,
  Database,
  Factory,
  Flame,
  FlaskConical,
  GitBranch,
  GraduationCap,
  LayoutGrid,
  Medal,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Allow-listed icon names that can be stored in the database (certifications, badges). */
export const ICONS: Record<string, LucideIcon> = {
  GraduationCap,
  Cloud,
  Brain,
  Database,
  ShieldCheck,
  Workflow,
  LayoutGrid,
  Users,
  Building2,
  Factory,
  Bot,
  GitBranch,
  Award,
  Flame,
  Trophy,
  Star,
  Medal,
  Target,
  Zap,
  BookOpen,
  FlaskConical,
  Sparkles,
  Rocket,
  TrendingUp,
  Crown,
  Activity,
};

export const ICON_NAMES = Object.keys(ICONS);

export function DynamicIcon({ name, className, ...props }: { name: string; className?: string } & React.SVGProps<SVGSVGElement>) {
  const Icon = ICONS[name] ?? GraduationCap;
  return <Icon className={className} aria-hidden="true" {...(props as object)} />;
}
