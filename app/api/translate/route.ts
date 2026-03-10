import { NextResponse } from "next/server";

type LanguageCode = "ja" | "en" | "zh" | "ko" | "th" | "id";
type SourceLanguageCode = LanguageCode | "auto";
type ActionType = "translate" | "shorten" | "shortest";

type TranslateRequestBody = {
  text?: string;
  sourceLanguage?: SourceLanguageCode;
  targetLanguage?: LanguageCode;
  action?: ActionType;
  limit?: number;
};

const ALLOWED_LANGUAGES: LanguageCode[] = ["ja", "en", "zh", "ko", "th", "id"];
const ALLOWED_SOURCE_LANGUAGES: SourceLanguageCode[] = [
  "auto",
  "ja",
  "en",
  "zh",
  "ko",
  "th",
  "id",
];
const ALLOWED_ACTIONS: ActionType[] = ["translate", "shorten", "shortest"];

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  ja: "Japanese",
  en: "English",
  zh: "Chinese",
  ko: "Korean",
  th: "Thai",
  id: "Indonesian",
};

function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && ALLOWED_LANGUAGES.includes(value as LanguageCode);
}

function isSourceLanguageCode(value: unknown): value is SourceLanguageCode {
  return (
    typeof value === "string" &&
    ALLOWED_SOURCE_LANGUAGES.includes(value as SourceLanguageCode)
  );
}

function isActionType(value: unknown): value is ActionType {
  return typeof value === "string" && ALLOWED_ACTIONS.includes(value as ActionType);
}

function extractOutputText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const texts: string[] = [];

  for (const item of output) {
    const contents = Array.isArray(item?.content) ? item.content : [];

    for (const content of contents) {
      if (typeof content?.text === "string" && content.text.trim()) {
        texts.push(content.text.trim());
      }

      if (typeof content?.output_text === "string" && content.output_text.trim()) {
        texts.push(content.output_text.trim());
      }
    }
  }

  return texts.join("\n").trim();
}

function buildInstructions(params: {
  action: ActionType;
  sourceLanguage: SourceLanguageCode;
  targetLabel: string;
  limit: number;
}) {
  const { action, sourceLanguage, targetLabel, limit } = params;

  if (action === "translate") {
    if (sourceLanguage === "auto") {
  return (
    `Translate the input into ${targetLabel}. ` +
    `The input is OCR text from a game screenshot and may contain heavy noise. ` +
    `It may include a mix of English, Chinese, Korean, Thai, and Indonesian. ` +
    `Extract and translate only the actual chat message text that would appear inside speech bubbles or chat message boxes. ` +
    `Ignore player names, titles, ranks, alliance tags, icons, coordinates, menu text, button text, system labels, decorative symbols, and OCR junk. ` +
    `Do not preserve the original language. Do not echo noisy OCR fragments. ` +
    `If a line looks like a name, title, UI label, or fragmented OCR, omit it. ` +
    `If a line is too corrupted to understand, omit it. ` +
    `Return only clean natural ${targetLabel} chat message text. ` +
    `No labels, no quotes, no explanations. ` +
    `Keep line breaks only when they improve readability.`
  );
}

    return (
      `Translate from ${LANGUAGE_LABELS[sourceLanguage]} to ${targetLabel}. ` +
      `Return only the translation. ` +
      `No labels, no quotes, no explanations. ` +
      `Keep line breaks if present. ` +
      `Use natural wording for chat or alliance messages.`
    );
  }

  if (action === "shorten") {
    return (
      `Rewrite the text in ${targetLabel} so it is shorter but still natural. ` +
      `Keep the meaning. ` +
      `Return only the rewritten text. ` +
      `Target length: within ${limit} characters. ` +
      `No labels, no quotes, no explanations.`
    );
  }

  return (
    `Rewrite the text in ${targetLabel} to be as short as possible while keeping the core meaning natural. ` +
    `Prefer compact wording for chat or alliance messages. ` +
    `Return only the rewritten text. ` +
    `Target length: within ${limit} characters. ` +
    `No labels, no quotes, no explanations.`
  );
}

function getFriendlyErrorMessage(action: ActionType) {
  if (action === "translate") {
    return "翻訳に失敗しました。もう一度お試しください";
  }

  if (action === "shorten") {
    return "短縮に失敗しました。もう一度お試しください";
  }

  return "最短化に失敗しました。もう一度お試しください";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TranslateRequestBody;

    const text = body.text?.trim() ?? "";
    const sourceLanguage = isSourceLanguageCode(body.sourceLanguage)
      ? body.sourceLanguage
      : "ja";
    const targetLanguage = isLanguageCode(body.targetLanguage)
      ? body.targetLanguage
      : "en";
    const action = isActionType(body.action) ? body.action : "translate";
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
        ? Math.floor(body.limit)
        : 100;

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          message: getFriendlyErrorMessage(action),
        },
        { status: 400 }
      );
    }

    if (
      action === "translate" &&
      sourceLanguage !== "auto" &&
      sourceLanguage === targetLanguage
    ) {
      return NextResponse.json({
        ok: true,
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        action,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          message: getFriendlyErrorMessage(action),
        },
        { status: 500 }
      );
    }

    const targetLabel = LANGUAGE_LABELS[targetLanguage];

    const instructions = buildInstructions({
      action,
      sourceLanguage,
      targetLabel,
      limit,
    });

    const openAiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        instructions,
        input: text,
        reasoning: {
          effort: "minimal",
        },
        max_output_tokens: 500,
        store: false,
      }),
    });

    const data = await openAiRes.json().catch(() => null);

    if (!openAiRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: getFriendlyErrorMessage(action),
        },
        { status: openAiRes.status }
      );
    }

    const translatedText = extractOutputText(data);

    if (!translatedText) {
      return NextResponse.json(
        {
          ok: false,
          message: getFriendlyErrorMessage(action),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      translatedText,
      sourceLanguage,
      targetLanguage,
      action,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "翻訳に失敗しました。もう一度お試しください",
      },
      { status: 400 }
    );
  }
}