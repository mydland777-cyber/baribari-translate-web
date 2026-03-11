import { NextResponse } from "next/server";

type LanguageCode =
  | "ja"
  | "en"
  | "zh"
  | "ko"
  | "th"
  | "id"
  | "fr"
  | "it"
  | "ru"
  | "pt"
  | "de"
  | "ar"
  | "hi";

type SourceLanguageCode = LanguageCode | "auto";
type ActionType = "translate" | "shorten" | "shortest";
type ToneType = "normal" | "polite" | "friendly" | "native";

type TranslateRequestBody = {
  text?: string;
  sourceLanguage?: SourceLanguageCode;
  targetLanguage?: LanguageCode;
  action?: ActionType;
  limit?: number;
  tone?: ToneType;
};

const ALLOWED_LANGUAGES: LanguageCode[] = [
  "ja",
  "en",
  "zh",
  "ko",
  "th",
  "id",
  "fr",
  "it",
  "ru",
  "pt",
  "de",
  "ar",
  "hi",
];

const ALLOWED_SOURCE_LANGUAGES: SourceLanguageCode[] = [
  "auto",
  "ja",
  "en",
  "zh",
  "ko",
  "th",
  "id",
  "fr",
  "it",
  "ru",
  "pt",
  "de",
  "ar",
  "hi",
];

const ALLOWED_ACTIONS: ActionType[] = ["translate", "shorten", "shortest"];
const ALLOWED_TONES: ToneType[] = ["normal", "polite", "friendly", "native"];

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  ja: "Japanese",
  en: "English",
  zh: "Chinese",
  ko: "Korean",
  th: "Thai",
  id: "Indonesian",
  fr: "French",
  it: "Italian",
  ru: "Russian",
  pt: "Portuguese",
  de: "German",
  ar: "Arabic",
  hi: "Hindi",
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

function isToneType(value: unknown): value is ToneType {
  return typeof value === "string" && ALLOWED_TONES.includes(value as ToneType);
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

function buildToneInstruction(tone: ToneType, targetLabel: string) {
  if (tone === "polite") {
    return (
      `Use polite, respectful, natural ${targetLabel}. ` +
      `Keep it soft and appropriate for messages to other players or alliance members. ` +
      `Do not sound stiff or overly formal.`
    );
  }

  if (tone === "friendly") {
    return (
      `Use friendly, natural, conversational ${targetLabel}. ` +
      `Make it feel like real game chat or casual alliance conversation. ` +
      `Do not sound rude, slangy, or too formal.`
    );
  }

  if (tone === "native") {
    return (
      `Use highly natural ${targetLabel} that sounds like a native speaker wrote it. ` +
      `Avoid literal or awkward translation. ` +
      `Prefer common real-life wording and natural phrasing used by native speakers. ` +
      `Keep it clear, smooth, and appropriate for chat or alliance messages. ` +
      `Do not make it overly slangy, rude, or too formal.`
    );
  }

  return (
    `Use natural wording for chat or alliance messages. ` +
    `Keep the tone neutral and easy to use.`
  );
}

function buildTranslateInstructions(params: {
  action: ActionType;
  sourceLanguage: SourceLanguageCode;
  targetLanguage: LanguageCode;
  targetLabel: string;
  limit: number;
  tone: ToneType;
}) {
  const { action, sourceLanguage, targetLanguage, targetLabel, limit, tone } = params;
  const toneInstruction = buildToneInstruction(tone, targetLabel);

  if (action === "translate") {
    if (sourceLanguage === "auto") {
      if (targetLanguage === "ja") {
        return (
          `Translate the input into natural Japanese. ` +
          `The input may contain OCR noise and mixed languages. ` +
          `Return Japanese only. ` +
          `No labels, no quotes, no explanations.`
        );
      }

      return (
        `Translate the input into ${targetLabel}. ` +
        `Return only the final translation in ${targetLabel}. ` +
        `Never return English unless the target language is English. ` +
        `Never explain. Never label. Never include source text. ` +
        `${toneInstruction}`
      );
    }

    return (
      `Translate from ${LANGUAGE_LABELS[sourceLanguage]} to ${targetLabel}. ` +
      `Return only the final translation in ${targetLabel}. ` +
      `Never return English unless the target language is English. ` +
      `No labels, no quotes, no explanations. ` +
      `Keep line breaks if present. ` +
      `${toneInstruction}`
    );
  }

  if (action === "shorten") {
    return (
      `Rewrite the text in ${targetLabel} so it is shorter but still natural. ` +
      `Keep the meaning. ` +
      `Return only the rewritten text in ${targetLabel}. ` +
      `Target length: within ${limit} characters. ` +
      `Never return English unless the target language is English. ` +
      `No labels, no quotes, no explanations. ` +
      `${toneInstruction}`
    );
  }

  return (
    `Rewrite the text in ${targetLabel} to be as short as possible while keeping the core meaning natural. ` +
    `Return only the rewritten text in ${targetLabel}. ` +
    `Target length: within ${limit} characters. ` +
    `Never return English unless the target language is English. ` +
    `No labels, no quotes, no explanations. ` +
    `${toneInstruction}`
  );
}

function buildKatakanaInstructions(targetLabel: string) {
  return (
    `Convert the following ${targetLabel} text into Japanese katakana reading. ` +
    `Return only katakana. ` +
    `Use spaces where helpful for readability. ` +
    `Do not translate the meaning into Japanese sentences. ` +
    `Do not use romaji. Do not use IPA. Do not explain anything.`
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

async function callResponsesApi(params: {
  apiKey: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      instructions: params.instructions,
      input: params.input,
      reasoning: {
        effort: "minimal",
      },
      max_output_tokens: params.maxOutputTokens ?? 700,
      store: false,
    }),
  });

  const data = await res.json().catch(() => null);

  return { res, data };
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
    const tone = isToneType(body.tone) ? body.tone : "normal";
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
        katakanaText: "",
        sourceLanguage,
        targetLanguage,
        action,
        tone,
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

    const translateInstructions = buildTranslateInstructions({
      action,
      sourceLanguage,
      targetLanguage,
      targetLabel,
      limit,
      tone,
    });

    const translateCall = await callResponsesApi({
      apiKey,
      instructions: translateInstructions,
      input: text,
      maxOutputTokens: 700,
    });

    if (!translateCall.res.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: getFriendlyErrorMessage(action),
        },
        { status: translateCall.res.status }
      );
    }

    const translatedText = extractOutputText(translateCall.data).trim();

    if (!translatedText) {
      return NextResponse.json(
        {
          ok: false,
          message: getFriendlyErrorMessage(action),
        },
        { status: 500 }
      );
    }

    let katakanaText = "";

    if (targetLanguage !== "ja") {
      const katakanaInstructions = buildKatakanaInstructions(targetLabel);

      const katakanaCall = await callResponsesApi({
        apiKey,
        instructions: katakanaInstructions,
        input: translatedText,
        maxOutputTokens: 500,
      });

      if (katakanaCall.res.ok) {
        katakanaText = extractOutputText(katakanaCall.data).trim();
      }
    }

    return NextResponse.json({
      ok: true,
      translatedText,
      katakanaText,
      sourceLanguage,
      targetLanguage,
      action,
      tone,
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