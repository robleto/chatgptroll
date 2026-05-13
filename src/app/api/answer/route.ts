import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "You are answering a user's question. Be concise (2-4 sentences), helpful, plainspoken modern English. Do NOT rhyme. Do NOT speak like a fairy-tale troll. Just answer.";

export async function POST(req: Request) {
  let question = "";
  try {
    const body = (await req.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: "missing_question" }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "question_too_long" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "server_misconfigured", detail: "ANTHROPIC_API_KEY is not set" },
      { status: 500 },
    );
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: question }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      return NextResponse.json({ error: "empty_response" }, { status: 502 });
    }

    return NextResponse.json({ answer: text });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "auth_failed" }, { status: 502 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "anthropic_api_error", status: error.status },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
