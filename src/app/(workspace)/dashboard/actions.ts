"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import {
  applyVoiceCallResult,
  getDemoReschedulingCase,
  updateDemoReschedulingCase,
} from "@/lib/demo-rescheduling";
import type { DemoReschedulingAction, DemoReschedulingCase } from "@/lib/demo-rescheduling-types";
import {
  controlledVoiceAttemptOutcomes,
  controlledVoiceAttemptSessionStatuses,
  controlledVoiceAttemptTransportStatuses,
  type ControlledVoiceAttempt,
} from "@/lib/controlled-voice-attempt";
import { z } from "zod";
import { isLoopbackHttpUrl } from "@/lib/loopback-url";
import { voiceCallContextSchema, voiceCallResultSchema } from "@/lib/voice-call-context";
import {
  createVoiceGatewayInternalRequestInit,
  loadVoiceGatewayInternalSettings,
  voiceGatewayRequestFailureMessage,
} from "@/lib/voice-gateway-internal";

export async function updateDemoReschedulingCaseAction(
  action: DemoReschedulingAction,
  selectedSlotId?: string,
) {
  return updateDemoReschedulingCase(action, selectedSlotId);
}

const attemptIdSchema = z.string().startsWith("voice_");
const voiceAttemptSchema = z.object({
  createdAt: z.string(),
  events: z.array(z.object({
    id: z.string(),
    label: z.string(),
    timestamp: z.string(),
  })),
  id: attemptIdSchema,
  outcome: z.enum(controlledVoiceAttemptOutcomes),
  processInstanceId: z.string(),
  result: voiceCallResultSchema.optional(),
  sessionStatus: z.enum(controlledVoiceAttemptSessionStatuses),
  transportStatus: z.enum(controlledVoiceAttemptTransportStatuses),
  updatedAt: z.string(),
});

export type ControlledVoiceAttemptActionResult =
  | { attempt: ControlledVoiceAttempt; ok: true; reschedulingCase: DemoReschedulingCase }
  | {
    code: "gateway_unavailable" | "not_configured" | "not_found" | "request_failed";
    message: string;
    ok: false;
  };

function voiceGatewaySettings() {
  try {
    return loadVoiceGatewayInternalSettings(process.env);
  } catch {
    return undefined;
  }
}

async function requestVoiceGateway(
  path: string,
  method: "GET" | "POST",
  extraHeaders: Record<string, string> = {},
  body?: unknown,
): Promise<ControlledVoiceAttemptActionResult> {
  const settings = voiceGatewaySettings();
  if (!settings) {
    return {
      code: "not_configured",
      message: "This server does not have the controlled phone demo configuration.",
      ok: false,
    };
  }

  let response: Response;
  try {
    const requestInit = createVoiceGatewayInternalRequestInit(settings.internalSecret, method, {
      ...extraHeaders,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    });
    response = await fetch(
      new URL(path, settings.internalUrl),
      { ...requestInit, body: body === undefined ? undefined : JSON.stringify(body) },
    );
  } catch {
    return {
      code: "gateway_unavailable",
      message: "The voice gateway is unavailable. It did not process this request.",
      ok: false,
    };
  }

  if (response.status === 404) {
    return {
      code: "not_found",
      message: "The voice gateway no longer has this test call. Its result is unknown.",
      ok: false,
    };
  }

  if (!response.ok) {
    const gatewayErrorResponse = z.object({ error: z.string().min(1).max(300) })
      .safeParse(await response.json().catch(() => undefined));
    return {
      code: "request_failed",
      message: voiceGatewayRequestFailureMessage(
        response.status,
        gatewayErrorResponse.success ? gatewayErrorResponse.data.error : undefined,
      ),
      ok: false,
    };
  }

  const parsed = z.object({ attempt: voiceAttemptSchema }).safeParse(await response.json());
  if (!parsed.success) {
    return {
      code: "gateway_unavailable",
      message: "The voice gateway returned an invalid status.",
      ok: false,
    };
  }

  const attempt = parsed.data.attempt;
  const reschedulingCase = attempt.result
    ? applyVoiceCallResult(attempt.id, attempt.result)
    : getDemoReschedulingCase();
  return { attempt, ok: true, reschedulingCase };
}

async function isLocalDashboardRequest() {
  const origin = (await headers()).get("origin");
  if (!origin) return false;

  try {
    const url = new URL(origin);
    return isLoopbackHttpUrl(url);
  } catch {
    return false;
  }
}

function localDashboardRequired(): ControlledVoiceAttemptActionResult {
  return {
    code: "request_failed",
    message: "Open the dashboard on localhost to use the billable phone demo.",
    ok: false,
  };
}

export async function startControlledVoiceAttemptAction() {
  if (!await isLocalDashboardRequest()) return localDashboardRequired();

  const requestId = randomUUID();
  const callContext = voiceCallContextSchema.parse(getDemoReschedulingCase().voiceContext);
  const result = await requestVoiceGateway(
    "/internal/controlled-attempt",
    "POST",
    { "x-voice-request-id": requestId },
    { callContext },
  );
  if (result.ok || result.code !== "gateway_unavailable") return result;

  return requestVoiceGateway(`/internal/controlled-attempt/by-request/${requestId}`, "GET");
}

export async function getControlledVoiceAttemptAction(attemptId: string) {
  if (!await isLocalDashboardRequest()) return localDashboardRequired();
  if (!attemptIdSchema.safeParse(attemptId).success) {
    return {
      code: "not_found",
      message: "The voice gateway cannot find the requested controlled phone call.",
      ok: false,
    } satisfies ControlledVoiceAttemptActionResult;
  }

  return requestVoiceGateway(`/internal/controlled-attempt/${encodeURIComponent(attemptId)}`, "GET");
}

export async function getCurrentControlledVoiceAttemptAction() {
  if (!await isLocalDashboardRequest()) return localDashboardRequired();
  return requestVoiceGateway("/internal/controlled-attempt/current", "GET");
}

export async function stopControlledVoiceAttemptAction(attemptId: string) {
  if (!await isLocalDashboardRequest()) return localDashboardRequired();
  if (!attemptIdSchema.safeParse(attemptId).success) {
    return {
      code: "not_found",
      message: "The voice gateway cannot find the requested controlled phone call.",
      ok: false,
    } satisfies ControlledVoiceAttemptActionResult;
  }

  return requestVoiceGateway(`/internal/controlled-attempt/${encodeURIComponent(attemptId)}/stop`, "POST");
}
