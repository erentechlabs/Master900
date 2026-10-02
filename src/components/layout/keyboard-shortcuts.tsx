"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DropdownMenuItem } from "@/components/ui/radix";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable || !!target.closest('[data-terminal], [data-sql-editor], [role="textbox"]');
}

export function KeyboardShortcuts() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>("[data-pane-toggle]")?.click();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        window.dispatchEvent(new Event("mfa:open-focus"));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogTitle>{t("shell.keyboardShortcuts")}</DialogTitle>
        <DialogDescription>{t("shell.keyboardShortcutsDescription")}</DialogDescription>
        <div className="space-y-3">
          <Shortcut label={t("shell.shortcutSearch")} keys={["Ctrl", "K"]} alt="/" />
          <Shortcut label={t("shell.shortcutNavigation")} keys={["Ctrl", "B"]} />
          <Shortcut label={t("shell.shortcutHelp")} keys={["?"]} />
          <Shortcut label={t("shell.shortcutFocus")} keys={["Ctrl", "Shift", "F"]} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Shortcut({ label, keys, alt }: { label: string; keys: string[]; alt?: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-md border bg-card p-3 text-sm"><span>{label}</span><span className="flex items-center gap-1">{keys.map((key) => <Kbd key={key}>{key}</Kbd>)}{alt ? <><span className="px-1 text-muted-foreground">or</span><Kbd>{alt}</Kbd></> : null}</span></div>;
}

export function KeyboardShortcutsMenuItem() {
  const { t } = useI18n();
  return <DropdownMenuItem onSelect={() => setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" })))}><HelpCircle aria-hidden="true" />{t("shell.keyboardShortcuts")}</DropdownMenuItem>;
}

export function KeyboardShortcutsButton() {
  const { t } = useI18n();
  return <Button variant="ghost" size="icon" className="w-10" aria-label={t("shell.keyboardShortcuts")} onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}><HelpCircle aria-hidden="true" /></Button>;
}
