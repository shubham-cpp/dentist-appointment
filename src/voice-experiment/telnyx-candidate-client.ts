import { z } from "zod";

const record = z.record(z.string(), z.unknown());
const callResponse = z.object({
  call_control_id: z.string().min(1),
  call_leg_id: z.string().min(1),
  call_session_id: z.string().min(1),
}).passthrough();
const apiErrorResponse = z.object({
  errors: z.array(z.object({
    code: z.union([z.string(), z.number()]).optional(),
    detail: z.string().optional(),
    title: z.string().optional(),
  }).passthrough()).min(1),
}).passthrough();

function safeProviderText(value: string | undefined, maximumLength = 160) {
  return value?.replace(/\s+/g, " ").trim().slice(0, maximumLength) || undefined;
}

export class TelnyxDialUncertainError extends Error {
  constructor(cause: unknown) {
    super("Telnyx did not confirm call creation.", { cause });
    this.name = "TelnyxDialUncertainError";
  }
}

export class TelnyxCandidateApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly providerCode?: string,
    readonly providerTitle?: string,
    readonly providerDetail?: string,
  ) {
    super(message);
    this.name = "TelnyxCandidateApiError";
  }
}

async function readJsonResponse(response: Response, maximumBytes: number) {
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
    await response.body?.cancel();
    throw new Error(`Telnyx API response exceeded ${maximumBytes} bytes.`);
  }
  if (!response.body) return undefined;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`Telnyx API response exceeded ${maximumBytes} bytes.`);
    }
    chunks.push(value);
  }
  if (receivedBytes === 0) return undefined;

  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function createTelnyxCandidateClient(options: {
  apiKey: string;
  baseUrl?: string;
  deadlines?: Partial<{ dialMs: number; readMs: number; writeMs: number }>;
  fetch?: typeof fetch;
  maxResponseBytes?: number;
}) {
  const requestFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.telnyx.com/v2";
  const deadlines = {
    dialMs: Math.max(1, options.deadlines?.dialMs ?? 20_000),
    readMs: Math.max(1, options.deadlines?.readMs ?? 5_000),
    writeMs: Math.max(1, options.deadlines?.writeMs ?? 10_000),
  };
  const maxResponseBytes = Math.max(1, options.maxResponseBytes ?? 1_048_576);

  async function request(path: string, init?: RequestInit, timeoutMs?: number) {
    const method = init?.method ?? "GET";
    const requestTimeoutMs = timeoutMs ?? (method === "GET" ? deadlines.readMs : deadlines.writeMs);
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const response = await requestFetch(new URL(path, `${baseUrl}/`), {
      ...init,
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
        ...init?.headers,
      },
      redirect: "error",
      signal: init?.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal,
    });
    const body = await readJsonResponse(response, maxResponseBytes);
    if (!response.ok) {
      const parsedError = apiErrorResponse.safeParse(body);
      const providerError = parsedError.success ? parsedError.data.errors[0] : undefined;
      const providerCode = providerError?.code === undefined ? undefined : String(providerError.code);
      const providerTitle = safeProviderText(providerError?.title);
      const providerDetail = safeProviderText(providerError?.detail, 500);
      const codeLabel = providerCode ? ` (code ${providerCode})` : "";
      const titleLabel = providerTitle ? `: ${providerTitle}` : "";
      throw new TelnyxCandidateApiError(
        response.status,
        `Telnyx API request failed with ${response.status}${codeLabel}${titleLabel}.`,
        providerCode,
        providerTitle,
        providerDetail,
      );
    }
    if (body && typeof body === "object" && "data" in body) {
      return (body as { data: unknown }).data;
    }
    return body;
  }

  return {
    async createAssistant(body: Record<string, unknown>) {
      return record.parse(await request("ai/assistants", { body: JSON.stringify(body), method: "POST" }));
    },
    async createAssistantTest(body: Record<string, unknown>) {
      return record.parse(await request("ai/assistants/tests", { body: JSON.stringify(body), method: "POST" }));
    },
    async dial(body: Record<string, unknown>) {
      let data: unknown;
      try {
        data = await request("calls", { body: JSON.stringify(body), method: "POST" }, deadlines.dialMs);
      } catch (error) {
        if (error instanceof TelnyxCandidateApiError) throw error;
        throw new TelnyxDialUncertainError(error);
      }
      const parsed = callResponse.parse(data);
      return {
        callControlId: parsed.call_control_id,
        callLegId: parsed.call_leg_id,
        callSessionId: parsed.call_session_id,
      };
    },
    async getAssistant(assistantId: string) {
      return record.parse(await request(`ai/assistants/${encodeURIComponent(assistantId)}`));
    },
    async getAssistantTestRun(testId: string, runId: string) {
      return record.parse(await request(
        `ai/assistants/tests/${encodeURIComponent(testId)}/runs/${encodeURIComponent(runId)}`,
      ));
    },
    async getBalance() {
      return record.parse(await request("balance"));
    },
    async getConnection(connectionId: string) {
      return record.parse(await request(`call_control_applications/${encodeURIComponent(connectionId)}`));
    },
    async getPublicKey() {
      return record.parse(await request("public_key"));
    },
    async hangup(callControlId: string, commandId: string) {
      await request(`calls/${encodeURIComponent(callControlId)}/actions/hangup`, {
        body: JSON.stringify({ command_id: commandId }),
        method: "POST",
      });
    },
    async speak(callControlId: string, body: Record<string, unknown>) {
      await request(`calls/${encodeURIComponent(callControlId)}/actions/speak`, {
        body: JSON.stringify(body),
        method: "POST",
      });
    },
    async startAiAssistant(callControlId: string, body: Record<string, unknown>) {
      await request(`calls/${encodeURIComponent(callControlId)}/actions/ai_assistant_start`, {
        body: JSON.stringify(body),
        method: "POST",
      });
    },
    async listPhoneNumbers(phoneNumber: string) {
      const query = new URLSearchParams({ "filter[phone_number]": phoneNumber });
      const data = await request(`phone_numbers?${query}`);
      return z.array(record).parse(data);
    },
    async listVoices() {
      const data = await request("text-to-speech/voices?filter[provider]=telnyx");
      if (data && typeof data === "object" && "voices" in data) {
        return z.array(record).parse((data as { voices: unknown }).voices);
      }
      return z.array(record).parse(data);
    },
    async listAssistantTests(testSuite: string) {
      const query = new URLSearchParams({ "page[size]": "100", test_suite: testSuite });
      return z.array(record).parse(await request(`ai/assistants/tests?${query}`));
    },
    async listAssistantTestRuns(testId: string) {
      return z.array(record).parse(await request(
        `ai/assistants/tests/${encodeURIComponent(testId)}/runs?page[size]=100&page[number]=1`,
      ));
    },
    async listConversationMessages(conversationId: string) {
      return z.array(record).parse(await request(
        `ai/conversations/${encodeURIComponent(conversationId)}/messages?page[size]=100&page[number]=1`,
      ));
    },
    async triggerAssistantTest(options: {
      idempotencyKey: string;
      testId: string;
      versionId: string;
    }) {
      return record.parse(await request(
        `ai/assistants/tests/${encodeURIComponent(options.testId)}/runs`,
        {
          body: JSON.stringify({ destination_version_id: options.versionId }),
          headers: { "idempotency-key": options.idempotencyKey },
          method: "POST",
        },
      ));
    },
    async updateAssistantTest(testId: string, body: Record<string, unknown>) {
      return record.parse(await request(`ai/assistants/tests/${encodeURIComponent(testId)}`, {
        body: JSON.stringify(body),
        method: "PUT",
      }));
    },
    async updateAssistant(assistantId: string, body: Record<string, unknown>) {
      return record.parse(await request(`ai/assistants/${encodeURIComponent(assistantId)}`, {
        body: JSON.stringify(body),
        method: "POST",
      }));
    },
  };
}
