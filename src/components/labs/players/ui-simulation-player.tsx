"use client";

import * as React from "react";
import { Globe, SquareTerminal } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { LabPlayerData } from "@/modules/labs/service";
import {
  applyUiSimEvent,
  uiSimConfigSchema,
  type UiSimConfig,
  type UiSimEvent,
  type UiSimState,
} from "@/modules/labs/engine/ui-simulation";
import { BrowserApp } from "@/components/labs/portal/portal-renderer";
import { SimTerminal } from "@/components/labs/portal/sim-terminal";
import { VmShell } from "@/components/labs/vm/vm-shell";

/**
 * Portal labs: events are applied optimistically with the same reducer the server uses, then sent to the server in
 * order; the server's authoritative state replaces the local one once no event is in flight.
 */
export function UiSimulationPlayer({
  lab,
  run,
  targetId,
  height = "page",
  onEvent,
}: {
  lab: LabPlayerData["lab"];
  run: LabPlayerData["run"];
  targetId?: string | null;
  height?: "page" | "full";
  onEvent: (event: UiSimEvent) => Promise<LabPlayerData | null>;
}) {
  const { t } = useI18n();
  const config = React.useMemo<UiSimConfig>(() => uiSimConfigSchema.parse(lab.config), [lab.config]);
  const serverState = run.publicState as UiSimState;
  const [localState, setLocalState] = React.useState<UiSimState>(serverState);
  const [syncedState, setSyncedState] = React.useState<UiSimState>(serverState);
  const [pending, setPending] = React.useState(0);
  const [activeApp, setActiveApp] = React.useState("browser");
  const queueRef = React.useRef(Promise.resolve<LabPlayerData | null>(null));
  const pendingRef = React.useRef(0);
  const serverRef = React.useRef(serverState);

  React.useEffect(() => {
    serverRef.current = serverState;
  }, [serverState]);

  // The server state also changes without our events (reset, check, hints): adopt it when nothing is in flight.
  if (serverState !== syncedState) {
    setSyncedState(serverState);
    if (pending === 0) setLocalState(serverState);
  }

  const send = React.useCallback(
    (event: UiSimEvent) => {
      setLocalState((current) => applyUiSimEvent(config, current, event));
      pendingRef.current += 1;
      setPending(pendingRef.current);
      queueRef.current = queueRef.current
        .then(() => onEvent(event))
        .then((data) => {
          pendingRef.current -= 1;
          setPending(pendingRef.current);
          if (!data) setLocalState(serverRef.current);
          else if (pendingRef.current === 0) setLocalState(data.run.publicState as UiSimState);
          return data;
        });
    },
    [config, onEvent],
  );

  const terminalSurface = config.terminal?.surface ?? (config.portal.theme === "azure" ? "cloudshell" : undefined);
  const hasTerminalApp = !!config.terminal && (terminalSurface === "app" || terminalSurface === "both" || config.vm?.apps?.includes("terminal"));
  const apps = [
    {
      id: "browser",
      title: t("labs.vm.browser"),
      icon: <Globe className="h-4 w-4" aria-hidden="true" />,
      content: <BrowserApp config={config} state={localState} targetId={targetId} onEvent={send} />,
    },
    ...(hasTerminalApp
      ? [
          {
            id: "terminal",
            title: t("labs.vm.terminal"),
            icon: <SquareTerminal className="h-4 w-4" aria-hidden="true" />,
            content: <SimTerminal config={config} state={localState} onEvent={send} />,
          },
        ]
      : []),
  ];

  return <VmShell vmName={config.vm?.name ?? "LAB-VM01"} apps={apps} activeAppId={activeApp} height={height} onActiveAppChange={setActiveApp} />;
}
