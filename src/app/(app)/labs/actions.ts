"use server";

import { revalidatePath } from "next/cache";
import { runAction, enforceRateLimit, type ActionResult } from "@/lib/actions";
import { authorize } from "@/modules/auth/session";
import { getLocale } from "@/i18n/server";
import {
  applyLabEvent,
  attemptInputSchema,
  checkLab,
  hintInputSchema,
  labEventInputSchema,
  resetLab,
  revealSolution,
  startLab,
  startLabInputSchema,
  useHint as consumeLabHint,
  type LabPlayerData,
} from "@/modules/labs/service";

function revalidateLab(data: LabPlayerData) {
  revalidatePath("/labs");
  revalidatePath(`/labs/${data.lab.id}`);
}

export async function startLabAction(input: unknown): Promise<ActionResult<LabPlayerData>> {
  return runAction("labs.start", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("labAction", user.id);
    const data = await startLab(user, startLabInputSchema.parse(input), await getLocale());
    revalidateLab(data);
    return data;
  });
}

export async function applyLabEventAction(input: unknown): Promise<ActionResult<LabPlayerData>> {
  return runAction("labs.applyEvent", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("labAction", user.id);
    const parsed = labEventInputSchema.parse(input);
    const data = await applyLabEvent(user, parsed.attemptId, parsed.event, await getLocale());
    revalidateLab(data);
    return data;
  });
}

export async function checkLabAction(input: unknown): Promise<ActionResult<LabPlayerData>> {
  return runAction("labs.check", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("labAction", user.id);
    const parsed = attemptInputSchema.parse(input);
    const data = await checkLab(user, parsed.attemptId, await getLocale());
    revalidateLab(data);
    return data;
  });
}

export async function useHintAction(input: unknown): Promise<ActionResult<LabPlayerData & { hint: string }>> {
  return runAction("labs.hint", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("labAction", user.id);
    const data = await consumeLabHint(user, hintInputSchema.parse(input), await getLocale());
    revalidateLab(data);
    return data;
  });
}

export async function revealSolutionAction(input: unknown): Promise<ActionResult<LabPlayerData>> {
  return runAction("labs.revealSolution", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("labAction", user.id);
    const parsed = attemptInputSchema.parse(input);
    const data = await revealSolution(user, parsed.attemptId, await getLocale());
    revalidateLab(data);
    return data;
  });
}

export async function resetLabAction(input: unknown): Promise<ActionResult<LabPlayerData>> {
  return runAction("labs.reset", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("labAction", user.id);
    const parsed = attemptInputSchema.parse(input);
    const data = await resetLab(user, parsed.attemptId, await getLocale());
    revalidateLab(data);
    return data;
  });
}
