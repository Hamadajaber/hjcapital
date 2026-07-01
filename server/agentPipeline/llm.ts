import { invokeLLM } from "../_core/llm";
import type { z } from "zod";

export async function invokeJsonAgent<T extends z.ZodType>(
  schema: T,
  params: {
    model: string;
    system: string;
    user: string;
    agentName: string;
  }
): Promise<z.infer<T>> {
  const response = await invokeLLM({
    model: params.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    response_format: { type: "json_object" } as never,
  });

  const content = response.choices?.[0]?.message?.content ?? "{}";
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[${params.agentName}] Invalid JSON from LLM`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `[${params.agentName}] Schema validation failed: ${result.error.message}`
    );
  }
  return result.data;
}

export async function invokeTextAgent(params: {
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const response = await invokeLLM({
    model: params.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });
  const content = response.choices?.[0]?.message?.content ?? "";
  return typeof content === "string" ? content : JSON.stringify(content);
}
