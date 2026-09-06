import { z } from "zod";

const controlledCallSafetyEnvironment = z.object({
  VOICE_CALLS_ENABLED: z.literal("true", {
    error: "VOICE_CALLS_ENABLED must be true before a voice call can start.",
  }),
  VOICE_DEMO_MODE: z.literal("true", {
    error: "VOICE_DEMO_MODE must be true for the controlled voice demo.",
  }),
});

export type ControlledCallSafetyPolicy = {
  callsEnabled: true;
  demoMode: true;
};

export function loadControlledCallSafetyPolicy(
  environment: Record<string, string | undefined>,
): ControlledCallSafetyPolicy {
  const parsed = controlledCallSafetyEnvironment.safeParse(environment);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => (
      `${issue.path.join(".")}: ${issue.message}`
    )).join("; "));
  }
  return { callsEnabled: true, demoMode: true };
}

export function assertControlledCallSafetyPolicy(
  policy: { callsEnabled?: boolean; demoMode?: boolean },
): asserts policy is ControlledCallSafetyPolicy {
  if (policy.callsEnabled !== true || policy.demoMode !== true) {
    throw new Error("The controlled call safety policy does not permit a call.");
  }
}
