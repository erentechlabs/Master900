"use client";

import * as React from "react";
import { ArrowRight, BookOpenCheck, Briefcase, Check, Code2, Lightbulb, ListChecks, Target, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Alert } from "@/components/ui/alert";

export type LessonBlock = { key: string; type: string; data: unknown };

type Obj = Record<string, unknown>;
const md = (data: unknown) => (typeof (data as Obj | null)?.markdown === "string" ? ((data as Obj).markdown as string) : "");

function Section({ title, icon: Icon, children, id, className }: { title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; id: string; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("space-y-3", className)}>
      <h2 id={id} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {Icon ? <Icon className="h-5 w-5 text-primary" aria-hidden="true" /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Diagram({ data }: { data: Obj }) {
  const { t } = useI18n();
  const nodes = (data.nodes as { id: string; label: string; detail?: string }[]) ?? [];
  const edges = (data.edges as { from: string; to: string; label?: string }[]) ?? [];
  const kind = data.kind as string;
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <figure className="rounded-xl border bg-card p-4">
      {typeof data.title === "string" ? <p className="mb-3 text-sm font-semibold">{data.title}</p> : null}
      <div aria-hidden="true">
        {kind === "layers" ? (
          <div className="space-y-2">
            {nodes.map((n, i) => (
              <div key={n.id} className="rounded-lg border bg-gradient-to-r from-primary/10 to-accent p-3 text-center" style={{ marginInline: `${i * 4}%` }}>
                <p className="text-sm font-semibold">{n.label}</p>
                {n.detail ? <p className="text-xs text-muted-foreground">{n.detail}</p> : null}
              </div>
            ))}
          </div>
        ) : kind === "hub" ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full border-2 border-primary bg-primary/10 px-5 py-3 text-center">
              <p className="text-sm font-semibold">{nodes[0]?.label}</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
              {nodes.slice(1).map((n) => (
                <div key={n.id} className="rounded-lg border bg-muted/40 p-2 text-center">
                  <p className="text-sm font-medium">{n.label}</p>
                  {n.detail ? <p className="text-xs text-muted-foreground">{n.detail}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {nodes.map((n, i) => (
              <React.Fragment key={n.id}>
                {i > 0 ? (
                  <span className="flex flex-col items-center px-1 text-muted-foreground">
                    <ArrowRight className="h-5 w-5" />
                    {edges.find((e) => e.to === n.id)?.label ? <span className="text-[10px]">{edges.find((e) => e.to === n.id)?.label}</span> : null}
                  </span>
                ) : null}
                <div className="min-w-24 rounded-lg border bg-muted/40 px-3 py-2 text-center">
                  <p className="text-sm font-semibold">{n.label}</p>
                  {n.detail ? <p className="text-xs text-muted-foreground">{n.detail}</p> : null}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
        {kind !== "flow" && edges.length ? (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {edges.map((e, i) => (
              <li key={i}>
                {label(e.from)} → {label(e.to)}
                {e.label ? ` (${e.label})` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <figcaption className="mt-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{t("learner.lesson.diagramAlt")}: </span>
        {String(data.caption ?? "")}
      </figcaption>
    </figure>
  );
}

function ExtraBlock({ block }: { block: LessonBlock }) {
  const { t } = useI18n();
  const data = (block.data ?? {}) as Obj;
  switch (block.type) {
    case "COMPARISON": {
      const columns = (data.columns as { title: string; points: string[] }[]) ?? [];
      return (
        <section aria-label={(data.title as string) ?? t("learner.lesson.comparison")} className="space-y-2">
          {typeof data.title === "string" ? <h3 className="text-base font-semibold">{data.title}</h3> : null}
          <div className={cn("grid gap-3", columns.length >= 3 ? "md:grid-cols-3" : "sm:grid-cols-2")}>
            {columns.map((c) => (
              <div key={c.title} className="rounded-xl border bg-card p-4">
                <p className="mb-2 font-semibold">{c.title}</p>
                <ul className="space-y-1.5 text-sm">
                  {c.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      );
    }
    case "DIAGRAM":
      return <Diagram data={data} />;
    case "ACTIVITY": {
      const items = (data.items as { prompt: string; answer: string }[]) ?? [];
      return (
        <section aria-label={String(data.title ?? "")} className="rounded-xl border border-dashed p-4">
          <p className="font-semibold">{String(data.title ?? "")}</p>
          {typeof data.instructions === "string" ? <p className="mb-3 text-sm text-muted-foreground">{data.instructions}</p> : null}
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i}>
                <details className="group rounded-lg border bg-card p-3">
                  <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                    <span className="flex items-start justify-between gap-3">
                      <span>{item.prompt}</span>
                      <span className="shrink-0 text-xs text-primary group-open:hidden">{t("learner.lesson.activityReveal")}</span>
                      <span className="hidden shrink-0 text-xs text-primary group-open:inline">{t("learner.lesson.activityHide")}</span>
                    </span>
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "CALLOUT":
      return (
        <Alert variant={data.variant === "warning" ? "warning" : data.variant === "tip" ? "success" : "info"} title={typeof data.title === "string" ? data.title : undefined}>
          <div className="text-foreground">
            <Markdown>{String(data.body ?? "")}</Markdown>
          </div>
        </Alert>
      );
    case "VIDEO":
      return (
        <section aria-label={t("learner.lesson.video")} className="rounded-xl border p-4">
          <a href={String(data.url)} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary underline">
            {String(data.title)} <span className="sr-only">{t("common.opensInNewTab")}</span>
          </a>
          {typeof data.transcript === "string" ? (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t("learner.lesson.transcript")}</summary>
              <p className="mt-2 whitespace-pre-line">{data.transcript}</p>
            </details>
          ) : null}
        </section>
      );
    default:
      return typeof data.markdown === "string" ? <Markdown>{data.markdown}</Markdown> : null;
  }
}

/** Renders lesson content blocks in order. Keys in `hide` (e.g. on-demand blocks) are skipped. */
export function LessonBlocks({ blocks, hide = [] }: { blocks: LessonBlock[]; hide?: string[] }) {
  const { t } = useI18n();
  const visible = blocks.filter((b) => !hide.includes(b.key));
  return (
    <div className="space-y-8">
      {visible.map((block) => {
        const data = (block.data ?? {}) as Obj;
        const hid = `block-${block.key}`;
        switch (block.type) {
          case "LEARNING_OBJECTIVES":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.objectives")} icon={Target} className="rounded-xl border bg-primary/5 p-5">
                <ul className="space-y-1.5">
                  {((data.items as string[]) ?? []).map((item) => (
                    <li key={item} className="flex gap-2 text-sm">
                      <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          case "EXPLANATION":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.explanation")} icon={BookOpenCheck}>
                <Markdown>{md(data)}</Markdown>
              </Section>
            );
          case "TERMINOLOGY":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.terminology")}>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {((data.terms as { term: string; definition: string }[]) ?? []).map((term) => (
                    <div key={term.term} className="rounded-lg border bg-card p-3">
                      <dt className="font-semibold">{term.term}</dt>
                      <dd className="mt-1 text-sm text-muted-foreground">{term.definition}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            );
          case "BUSINESS_SCENARIO":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.businessScenario")} icon={Briefcase} className="rounded-xl border-l-4 border-brand-teal bg-card p-5">
                <Markdown>{md(data)}</Markdown>
              </Section>
            );
          case "TECHNICAL_EXAMPLE":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.technicalExample")} icon={Code2}>
                <Markdown>{md(data)}</Markdown>
              </Section>
            );
          case "MISCONCEPTION":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.misconception")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-destructive">
                      <X className="h-4 w-4" aria-hidden="true" />
                      {t("learner.lesson.myth")}
                    </p>
                    <Markdown className="text-sm">{String(data.myth ?? "")}</Markdown>
                  </div>
                  <div className="rounded-lg border border-success/40 bg-success/5 p-4">
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-success">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {t("learner.lesson.reality")}
                    </p>
                    <Markdown className="text-sm">{String(data.reality ?? "")}</Markdown>
                  </div>
                </div>
              </Section>
            );
          case "EXAM_TAKEAWAY":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.examTakeaway")} icon={Lightbulb} className="rounded-xl border border-warning/40 bg-warning/10 p-5">
                <Markdown>{md(data)}</Markdown>
              </Section>
            );
          case "SUMMARY":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.recap")}>
                <Markdown>{md(data)}</Markdown>
              </Section>
            );
          case "SIMPLER_EXPLANATION":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.simpler")}>
                <Markdown>{md(data)}</Markdown>
              </Section>
            );
          case "ANOTHER_EXAMPLE":
            return (
              <Section key={block.key} id={hid} title={t("learner.lesson.anotherExample")}>
                <Markdown>{md(data)}</Markdown>
              </Section>
            );
          default:
            return <ExtraBlock key={block.key} block={block} />;
        }
      })}
    </div>
  );
}
