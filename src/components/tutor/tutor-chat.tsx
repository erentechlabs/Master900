"use client";

import * as React from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translator";
import { deleteTutorConversationAction, sendTutorMessageAction } from "@/app/(app)/tutor/actions";
import type { TutorConversationView, TutorMessageView } from "@/modules/tutor/service";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Spinner } from "@/components/ui/misc";

type TutorChatProps = {
  conversations: TutorConversationView[];
  certifications: { code: string; name: string }[];
  initialContext: { lessonId?: string; questionId?: string; certificationCode?: string };
  maxInput: number;
  modes: string[];
  depths: string[];
  disabled: boolean;
};

function errorText(t: ReturnType<typeof useI18n>["t"], code: string): string {
  if (code === "tutor_disabled") return t("tutor.disabledBody");
  if (code === "tutor_daily_limit") return t("tutor.dailyLimit");
  const key = `errors.${code}` as MessageKey;
  const translated = t(key);
  return translated === key ? t("tutor.error") : translated;
}

export function TutorChat({ conversations, certifications, initialContext, maxInput, modes, depths, disabled }: TutorChatProps) {
  const { t } = useI18n();
  const hasNewContext = !!(initialContext.questionId || initialContext.lessonId);
  const [items, setItems] = React.useState(conversations);
  const [activeId, setActiveId] = React.useState(hasNewContext ? "" : (conversations[0]?.id ?? ""));
  const [draft, setDraft] = React.useState(initialContext.questionId ? t("tutor.mode_mistake") : "");
  const [mode, setMode] = React.useState(initialContext.questionId ? "mistake" : "explain");
  const [depth, setDepth] = React.useState("intermediate");
  const [certificationCode, setCertificationCode] = React.useState(initialContext.certificationCode ?? certifications[0]?.code ?? "");
  const [pending, startTransition] = React.useTransition();
  const active = items.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];
  const remaining = maxInput - draft.length;

  const replaceConversation = (conversation: TutorConversationView) => {
    setItems((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)]);
    setActiveId(conversation.id);
  };

  const submit = () => {
    const message = draft.trim();
    if (!message || disabled || pending) return;
    setDraft("");
    startTransition(async () => {
      const result = await sendTutorMessageAction({
        conversationId: activeId || undefined,
        message,
        mode,
        depth,
        certificationCode: certificationCode || undefined,
        lessonId: initialContext.lessonId,
        questionId: initialContext.questionId,
      });
      if (!result.ok) {
        toast.error(errorText(t, result.error));
        setDraft(message);
        return;
      }
      if (result.data) replaceConversation(result.data.conversation);
    });
  };

  const remove = (conversationId: string) => {
    startTransition(async () => {
      const result = await deleteTutorConversationAction({ conversationId });
      if (!result.ok) {
        toast.error(errorText(t, result.error));
        return;
      }
      setItems((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeId === conversationId) setActiveId("");
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{t("tutor.conversations")}</CardTitle>
          <Button size="iconSm" variant="outline" onClick={() => setActiveId("")} aria-label={t("tutor.newConversation")}>
            <Plus aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? <p className="text-sm text-muted-foreground">{t("tutor.noConversations")}</p> : null}
          <ul className="space-y-2">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={cn("min-h-10 flex-1 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted", activeId === c.id && "border-primary bg-primary/10")}
                >
                  <span className="line-clamp-2">{c.title}</span>
                </button>
                <Button size="iconSm" variant="ghost" onClick={() => remove(c.id)} aria-label={t("tutor.deleteConversation")}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{active?.title ?? t("tutor.newConversation")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field id="tutor-mode" label={t("tutor.mode")}>
              <Select value={mode} onChange={(e) => setMode(e.target.value)} disabled={disabled || pending}>
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {t(`tutor.mode_${m}` as MessageKey)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="tutor-depth" label={t("tutor.depth")}>
              <Select value={depth} onChange={(e) => setDepth(e.target.value)} disabled={disabled || pending}>
                {depths.map((d) => (
                  <option key={d} value={d}>
                    {t(`tutor.depth_${d}` as MessageKey)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="tutor-certification" label={t("tutor.certificationScope")}>
              <Select value={certificationCode} onChange={(e) => setCertificationCode(e.target.value)} disabled={disabled || pending}>
                <option value="">{t("tutor.allCertifications")}</option>
                {certifications.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div role="log" aria-live="polite" aria-relevant="additions" className="min-h-[24rem] space-y-4 rounded-lg border bg-muted/20 p-4">
            {messages.length === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{t("tutor.starters")}</p>
                <ul className="list-inside list-disc">
                  <li>{t("tutor.starter1")}</li>
                  <li>{t("tutor.starter2")}</li>
                  <li>{t("tutor.starter3")}</li>
                </ul>
              </div>
            ) : (
              messages.map((m) => <ChatMessage key={m.id} message={m} />)
            )}
            {pending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Spinner className="h-4 w-4" /> {t("tutor.thinking")}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Field id="tutor-input" label={t("tutor.inputLabel")} hint={t("tutor.enterHint")}>
              <Textarea
                value={draft}
                maxLength={maxInput}
                rows={4}
                placeholder={t("tutor.inputPlaceholder")}
                disabled={disabled || pending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className={cn("text-xs text-muted-foreground", remaining < 80 && "text-warning")}>{t("tutor.charactersRemaining", { count: remaining })}</p>
              <Button onClick={submit} disabled={disabled || pending || !draft.trim()}>
                {pending ? <Spinner className="h-4 w-4" /> : <Send aria-hidden="true" />}
                {t("tutor.send")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChatMessage({ message }: { message: TutorMessageView }) {
  const { t } = useI18n();
  const isUser = message.role === "USER";
  return (
    <article className={cn("rounded-lg border bg-card p-3", isUser ? "ml-auto max-w-3xl border-primary/30" : "max-w-4xl")}>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{isUser ? t("tutor.you") : t("tutor.assistant")}</p>
      <Markdown>{message.content}</Markdown>
      {message.flagged && !isUser ? <p className="mt-2 text-xs text-warning">{t("tutor.flagged")}</p> : null}
      {!isUser && message.citations.length ? (
        <div className="mt-3 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">{t("tutor.sources")}</p>
          <ol className="mt-1 list-inside list-decimal space-y-1 text-sm">
            {message.citations.map((c) => (
              <li key={c.id}>
                <a href={c.url} className="text-primary underline">
                  {c.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </article>
  );
}
