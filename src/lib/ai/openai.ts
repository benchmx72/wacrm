interface OpenAIResponseTextItem {
  type?: string;
  text?: string;
}

interface OpenAIResponseOutputItem {
  type?: string;
  content?: OpenAIResponseTextItem[];
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: OpenAIResponseOutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

export async function createAgentResponse(input: {
  model: string;
  instructions: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      instructions: input.instructions,
      input: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: input.temperature,
      max_output_tokens: 700,
      store: false,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as OpenAIResponseBody;

  if (!response.ok) {
    throw new Error(body.error?.message ?? `OpenAI request failed (${response.status})`);
  }

  const outputText =
    body.output_text ??
    body.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("")
      .trim();

  return {
    text: outputText || "No pude generar una respuesta.",
    inputTokens: body.usage?.input_tokens ?? null,
    outputTokens: body.usage?.output_tokens ?? null,
  };
}
