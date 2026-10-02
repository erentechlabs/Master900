"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Switch } from "@/components/ui/radix";
import type {
  CaseStudyPublic,
  CategorizationPublic,
  FillInBlankPublic,
  MatchingPublic,
  OrderingPublic,
  PublicQuestion,
  QuestionResponse,
  QuestionReview,
  UiSimulationPublic,
} from "@/modules/assessment/engine/types";

export type QuestionViewProps = {
  question: PublicQuestion;
  value: QuestionResponse | null;
  onChange: (value: QuestionResponse) => void;
  disabled?: boolean;
  review?: QuestionReview | null;
  idPrefix?: string;
};

/** Initial response for question types whose UI always has a value (ordering). */
export function defaultResponse(question: PublicQuestion): QuestionResponse | null {
  if (question.type === "ORDERING") return { kind: "ordering", order: (question.interaction as OrderingPublic).items.map((i) => i.id) };
  return null;
}

const CHOICE = new Set(["SINGLE_CHOICE", "MULTIPLE_RESPONSE", "TRUE_FALSE", "SCENARIO", "COMMAND_SELECTION"]);

export function QuestionView({ question, value, onChange, disabled, review, idPrefix = "q" }: QuestionViewProps) {
  const { t } = useI18n();
  const locked = !!disabled || !!review;
  const stemId = `${idPrefix}-stem`;
  return (
    <div className="space-y-5">
      {question.translationNotice ? (
        <p className="text-xs text-muted-foreground">
          {question.translationNotice === "pending" ? t("common.translationPending") : t("common.translationFallback")}
        </p>
      ) : null}
      {question.scenario ? (
        <section aria-label={t("assessment.runner.scenario")} className="rounded-lg border bg-muted/40 p-4">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("assessment.runner.scenario")}</p>
          <Markdown>{question.scenario}</Markdown>
        </section>
      ) : null}
      <div id={stemId} className="text-base font-medium">
        <Markdown>{question.stem}</Markdown>
      </div>

      {CHOICE.has(question.type) ? (
        <ChoiceInput question={question} value={value} onChange={onChange} locked={locked} review={review} stemId={stemId} idPrefix={idPrefix} />
      ) : null}
      {question.type === "MATCHING" ? <MatchingInput question={question} value={value} onChange={onChange} locked={locked} idPrefix={idPrefix} /> : null}
      {question.type === "ORDERING" ? <OrderingInput question={question} value={value} onChange={onChange} locked={locked} stemId={stemId} /> : null}
      {question.type === "CATEGORIZATION" ? <CategorizationInput question={question} value={value} onChange={onChange} locked={locked} idPrefix={idPrefix} /> : null}
      {question.type === "FILL_IN_BLANK" ? <FillInput question={question} value={value} onChange={onChange} locked={locked} idPrefix={idPrefix} /> : null}
      {question.type === "CASE_STUDY" ? <CaseStudyInput question={question} value={value} onChange={onChange} locked={locked} idPrefix={idPrefix} /> : null}
      {question.type === "UI_SIMULATION" ? <UiSimInput question={question} value={value} onChange={onChange} locked={locked} idPrefix={idPrefix} /> : null}

      {review ? <ReviewPanel review={review} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ choice

function ChoiceInput({
  question,
  value,
  onChange,
  locked,
  review,
  stemId,
  idPrefix,
}: {
  question: PublicQuestion;
  value: QuestionResponse | null;
  onChange: (v: QuestionResponse) => void;
  locked: boolean;
  review?: QuestionReview | null;
  stemId: string;
  idPrefix: string;
}) {
  const { t } = useI18n();
  const multiple = question.type === "MULTIPLE_RESPONSE";
  const selected = value?.kind === "choice" ? value.selected : [];
  const reviewByKey = new Map((review?.options ?? []).map((o) => [o.key, o]));
  const toggle = (key: string) => {
    if (locked) return;
    if (!multiple) return onChange({ kind: "choice", selected: [key] });
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    onChange({ kind: "choice", selected: next });
  };
  return (
    <fieldset aria-labelledby={stemId} className="space-y-2">
      <legend className="mb-2 text-sm text-muted-foreground">
        {multiple ? t("assessment.runner.selectMany", { count: question.selectCount ?? 2 }) : t("assessment.runner.selectOne")}
      </legend>
      {(question.options ?? []).map((o, i) => {
        const id = `${idPrefix}-opt-${o.key}`;
        const r = reviewByKey.get(o.key);
        const isSelected = selected.includes(o.key);
        return (
          <div
            key={o.key}
            className={cn(
              "rounded-lg border p-3 transition-colors",
              !locked && "hover:border-primary/60 hover:bg-primary/5",
              isSelected && !r && "border-primary bg-primary/5",
              r?.isCorrect && "border-success/60 bg-success/5",
              r && !r.isCorrect && r.selected && "border-destructive/60 bg-destructive/5",
            )}
          >
            <label htmlFor={id} className={cn("flex items-start gap-3", !locked && "cursor-pointer")}>
              <input
                id={id}
                type={multiple ? "checkbox" : "radio"}
                name={`${idPrefix}-choice`}
                value={o.key}
                checked={isSelected}
                disabled={locked}
                onChange={() => toggle(o.key)}
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <span className="flex-1">
                <span className="sr-only">{String.fromCharCode(65 + i)}. </span>
                <Markdown inline className={cn(question.type === "COMMAND_SELECTION" && "font-mono text-sm")}>
                  {o.text}
                </Markdown>
              </span>
              {r ? (
                r.isCorrect ? (
                  <Check className={cn("h-5 w-5 shrink-0 text-success", r.selected && "motion-safe:animate-pop")} aria-label={t("assessment.runner.correctAnswer")} />
                ) : r.selected ? (
                  <X className="h-5 w-5 shrink-0 text-destructive motion-safe:animate-pop" aria-label={t("assessment.runner.incorrect")} />
                ) : null
              ) : null}
            </label>
            {r ? (
              <p className={cn("mt-2 pl-7 text-sm", r.isCorrect ? "text-success" : "text-muted-foreground")}>
                <span className="font-medium">{r.isCorrect ? t("assessment.runner.whyCorrect") : t("assessment.runner.whyIncorrect")}: </span>
                {r.explanation}
              </p>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

// ------------------------------------------------------------------ matching

function MatchingInput({ question, value, onChange, locked, idPrefix }: { question: PublicQuestion; value: QuestionResponse | null; onChange: (v: QuestionResponse) => void; locked: boolean; idPrefix: string }) {
  const { t } = useI18n();
  const m = question.interaction as MatchingPublic;
  const pairs = value?.kind === "matching" ? value.pairs : {};
  return (
    <div className="space-y-3">
      {m.prompts.map((p) => {
        const id = `${idPrefix}-match-${p.id}`;
        return (
          <div key={p.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 sm:items-center">
            <label htmlFor={id} className="text-sm font-medium">
              {p.text}
            </label>
            <Select
              id={id}
              value={pairs[p.id] ?? ""}
              disabled={locked}
              onChange={(e) => onChange({ kind: "matching", pairs: { ...pairs, [p.id]: e.target.value } })}
            >
              <option value="">{t("assessment.runner.matchingSelect")}</option>
              {m.answers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.text}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ ordering

function OrderingInput({ question, value, onChange, locked, stemId }: { question: PublicQuestion; value: QuestionResponse | null; onChange: (v: QuestionResponse) => void; locked: boolean; stemId: string }) {
  const { t } = useI18n();
  const o = question.interaction as OrderingPublic;
  const order = value?.kind === "ordering" && value.order.length ? value.order : o.items.map((i) => i.id);
  const text = new Map(o.items.map((i) => [i.id, i.text]));
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const move = (from: number, to: number) => {
    if (locked || to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange({ kind: "ordering", order: next });
    setAnnouncement(`${text.get(item!) ?? ""}: ${t("assessment.runner.position", { n: to + 1 })}`);
  };
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">{t("assessment.runner.orderingInstructions")}</p>
      <ol aria-labelledby={stemId} className="space-y-2">
        {order.map((id, index) => (
          <li
            key={id}
            draggable={!locked}
            onDragStart={() => setDragging(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging) move(order.indexOf(dragging), index);
              setDragging(null);
            }}
            className={cn("flex items-center gap-2 rounded-lg border bg-card p-2 pl-3", dragging === id && "opacity-60")}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{index + 1}.</span>
            <span className="flex-1 text-sm">{text.get(id)}</span>
            <Button size="iconSm" variant="ghost" disabled={locked || index === 0} onClick={() => move(index, index - 1)} aria-label={`${t("assessment.runner.moveUp")}: ${text.get(id)}`}>
              <ArrowUp />
            </Button>
            <Button size="iconSm" variant="ghost" disabled={locked || index === order.length - 1} onClick={() => move(index, index + 1)} aria-label={`${t("assessment.runner.moveDown")}: ${text.get(id)}`}>
              <ArrowDown />
            </Button>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ categorization

function CategorizationInput({ question, value, onChange, locked, idPrefix }: { question: PublicQuestion; value: QuestionResponse | null; onChange: (v: QuestionResponse) => void; locked: boolean; idPrefix: string }) {
  const { t } = useI18n();
  const c = question.interaction as CategorizationPublic;
  const placements = value?.kind === "categorization" ? value.placements : {};
  const [dragging, setDragging] = React.useState<string | null>(null);
  const place = (itemId: string, categoryId: string) => {
    if (locked) return;
    const next = { ...placements };
    if (categoryId) next[itemId] = categoryId;
    else delete next[itemId];
    onChange({ kind: "categorization", placements: next });
  };
  const zones = [{ id: "", label: t("assessment.runner.unassigned") }, ...c.categories];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("assessment.runner.categorizeInstructions")}</p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {zones.map((zone) => {
          const items = c.items.filter((i) => (placements[i.id] ?? "") === zone.id);
          return (
            <section
              key={zone.id || "unassigned"}
              aria-label={zone.label}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) place(dragging, zone.id);
                setDragging(null);
              }}
              className={cn("min-h-28 rounded-lg border-2 border-dashed p-3", zone.id ? "bg-muted/30" : "bg-card")}
            >
              <h4 className="mb-2 text-sm font-semibold">{zone.label}</h4>
              {items.length === 0 ? <p className="text-xs text-muted-foreground">{t("assessment.runner.dragHere")}</p> : null}
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} draggable={!locked} onDragStart={() => setDragging(item.id)} className="rounded-md border bg-card p-2 text-sm shadow-sm">
                    <p className="mb-1.5">{item.text}</p>
                    <label className="sr-only" htmlFor={`${idPrefix}-cat-${item.id}`}>
                      {t("assessment.runner.chooseCategory")}: {item.text}
                    </label>
                    <Select id={`${idPrefix}-cat-${item.id}`} className="h-8 text-xs" value={placements[item.id] ?? ""} disabled={locked} onChange={(e) => place(item.id, e.target.value)}>
                      <option value="">{t("assessment.runner.unassigned")}</option>
                      {c.categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fill in the blank

function FillInput({ question, value, onChange, locked, idPrefix }: { question: PublicQuestion; value: QuestionResponse | null; onChange: (v: QuestionResponse) => void; locked: boolean; idPrefix: string }) {
  const { t } = useI18n();
  const f = question.interaction as FillInBlankPublic;
  const blanks = value?.kind === "fill" ? value.blanks : {};
  const parts = f.template.split(/(\{\{[a-zA-Z0-9_-]+\}\})/g);
  const isBlank = parts.map((part) => /^\{\{[a-zA-Z0-9_-]+\}\}$/.test(part));
  const blankNumber = isBlank.map((_, i) => isBlank.slice(0, i + 1).filter(Boolean).length);
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">{t("assessment.runner.fillInstructions")}</p>
      <p className="leading-10">
        {parts.map((part, i) => {
          const m = /^\{\{([a-zA-Z0-9_-]+)\}\}$/.exec(part);
          if (!m) return <span key={i}>{part}</span>;
          const id = m[1]!;
          const label = t("assessment.runner.blank", { n: blankNumber[i] });
          const common = { id: `${idPrefix}-blank-${id}`, "aria-label": label, disabled: locked };
          return f.wordBank?.length ? (
            <Select key={i} {...common} className="mx-1 inline-flex h-9 w-auto min-w-40 align-middle" value={blanks[id] ?? ""} onChange={(e) => onChange({ kind: "fill", blanks: { ...blanks, [id]: e.target.value } })}>
              <option value="">{t("assessment.runner.chooseWord")}</option>
              {f.wordBank.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </Select>
          ) : (
            <input
              key={i}
              {...common}
              type="text"
              autoComplete="off"
              maxLength={120}
              value={blanks[id] ?? ""}
              onChange={(e) => onChange({ kind: "fill", blanks: { ...blanks, [id]: e.target.value } })}
              className="mx-1 inline-flex h-9 w-44 rounded-md border border-input bg-background px-2 align-middle text-sm"
            />
          );
        })}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ case study

function CaseStudyInput({ question, value, onChange, locked, idPrefix }: { question: PublicQuestion; value: QuestionResponse | null; onChange: (v: QuestionResponse) => void; locked: boolean; idPrefix: string }) {
  const { t } = useI18n();
  const cs = question.interaction as CaseStudyPublic;
  const answers = value?.kind === "caseStudy" ? value.answers : {};
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("assessment.runner.caseStudyInstructions")}</caption>
        <thead className="bg-muted/60 text-left">
          <tr>
            <th scope="col" className="p-3 font-semibold">
              {t("assessment.runner.caseStudyInstructions")}
            </th>
            <th scope="col" className="w-20 p-3 text-center font-semibold">
              {t("assessment.runner.yes")}
            </th>
            <th scope="col" className="w-20 p-3 text-center font-semibold">
              {t("assessment.runner.no")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {cs.statements.map((s) => (
            <tr key={s.id}>
              <th scope="row" className="p-3 text-left font-normal">
                {s.text}
              </th>
              {[true, false].map((v) => (
                <td key={String(v)} className="p-3 text-center">
                  <input
                    type="radio"
                    name={`${idPrefix}-cs-${s.id}`}
                    aria-label={`${s.text}: ${v ? t("assessment.runner.yes") : t("assessment.runner.no")}`}
                    checked={answers[s.id] === v}
                    disabled={locked}
                    onChange={() => onChange({ kind: "caseStudy", answers: { ...answers, [s.id]: v } })}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ UI simulation question

function UiSimInput({ question, value, onChange, locked, idPrefix }: { question: PublicQuestion; value: QuestionResponse | null; onChange: (v: QuestionResponse) => void; locked: boolean; idPrefix: string }) {
  const { t } = useI18n();
  const u = question.interaction as UiSimulationPublic;
  const values = value?.kind === "uiSimulation" ? value.values : {};
  const set = (id: string, v: string | boolean) => onChange({ kind: "uiSimulation", values: { ...values, [id]: v } });
  return (
    <div className="overflow-hidden rounded-lg border shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-4 py-2">
        <p className="text-sm font-semibold">{u.title}</p>
        <Badge variant="outline">{t("labs.sim.fictional")}</Badge>
      </div>
      <div className="space-y-4 p-4">
        <p className="text-xs text-muted-foreground">{u.description ?? t("assessment.runner.uiSimNotice")}</p>
        {u.fields.map((f) => {
          const id = `${idPrefix}-ui-${f.id}`;
          if (f.control === "toggle") {
            return (
              <div key={f.id} className="flex items-center justify-between gap-4">
                <label htmlFor={id} className="text-sm font-medium">
                  {f.label}
                </label>
                <Switch id={id} checked={values[f.id] === true} disabled={locked} onCheckedChange={(checked) => set(f.id, checked)} />
              </div>
            );
          }
          if (f.control === "radio") {
            return (
              <fieldset key={f.id} className="space-y-1.5">
                <legend className="text-sm font-medium">{f.label}</legend>
                {f.options?.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm">
                    <input type="radio" name={id} checked={values[f.id] === o.value} disabled={locked} onChange={() => set(f.id, o.value)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    {o.label}
                  </label>
                ))}
              </fieldset>
            );
          }
          return (
            <div key={f.id} className="space-y-1.5">
              <label htmlFor={id} className="text-sm font-medium">
                {f.label}
              </label>
              <Select id={id} value={typeof values[f.id] === "string" ? (values[f.id] as string) : ""} disabled={locked} onChange={(e) => set(f.id, e.target.value)}>
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ review

export function ReviewPanel({ review }: { review: QuestionReview }) {
  const { t } = useI18n();
  const partial = !review.isCorrect && review.score > 0;
  return (
    <div className="space-y-3" aria-live="polite">
      <Alert
        variant={review.isCorrect ? "success" : partial ? "warning" : "destructive"}
        title={review.isCorrect ? t("assessment.runner.correct") : partial ? t("assessment.runner.partiallyCorrect") : t("assessment.runner.incorrect")}
      >
        <div className="text-foreground">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("assessment.runner.explanation")}</p>
          <Markdown>{review.explanation}</Markdown>
        </div>
      </Alert>
      {review.details ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th scope="col" className="p-2.5">
                  <span className="sr-only">{t("assessment.runner.item")}</span>
                </th>
                <th scope="col" className="p-2.5">
                  {t("assessment.runner.yourAnswer")}
                </th>
                <th scope="col" className="p-2.5">
                  {t("assessment.runner.correctAnswer")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {review.details.rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <th scope="row" className="p-2.5 text-left font-medium">
                    {row.label}
                    {row.explanation ? <p className="mt-1 text-xs font-normal text-muted-foreground">{row.explanation}</p> : null}
                  </th>
                  <td className={cn("p-2.5", row.correct ? "text-success" : "text-destructive")}>
                    <span className="inline-flex items-center gap-1">
                      {row.correct ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                      {row.given ?? t("assessment.runner.notAnswered")}
                    </span>
                  </td>
                  <td className="p-2.5">{row.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
