import { NextResponse } from "next/server";

type LanguageCode = "ja" | "en" | "zh" | "ko" | "th" | "id";

type SourceLanguageCode = LanguageCode | "auto";
type ActionType = "translate" | "shorten" | "shortest";
type ToneType = "normal" | "polite" | "friendly" | "soft";

type TranslateRequestBody = {
  text?: string;
  sourceLanguage?: SourceLanguageCode;
  targetLanguage?: LanguageCode;
  action?: ActionType;
  limit?: number;
  tone?: ToneType;
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
const ALLOWED_TONES: ToneType[] = ["normal", "polite", "friendly", "soft"];

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

function parseSection(text: string, label: "TRANSLATION" | "KATAKANA") {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedLabel}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:\\s|$)`,
    "i"
  );
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
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

  if (tone === "soft") {
    return (
      `Use gentle, soft, kind, natural ${targetLabel}. ` +
      `Make the wording feel warm, calm, and easy to receive. ` +
      `It should sound politely soft rather than stiff. ` +
      `Avoid harsh, blunt, or overly direct phrasing.`
    );
  }

  return (
    `Use natural wording for chat or alliance messages. ` +
    `Keep the tone neutral and easy to use.`
  );
}

function buildInstructions(params: {
  action: ActionType;
  sourceLanguage: SourceLanguageCode;
  targetLanguage: LanguageCode;
  targetLabel: string;
  limit: number;
  tone: ToneType;
}) {
  const { action, sourceLanguage, targetLanguage, targetLabel, limit, tone } = params;
  const toneInstruction = buildToneInstruction(tone, targetLabel);
  const needKatakana = targetLanguage !== "ja";

  if (action === "translate") {
    if (sourceLanguage === "auto") {
      if (!needKatakana) {
        return (
          `Translate the input into natural Japanese. ` +
          `The input is OCR text from a game screenshot and may contain heavy noise. ` +
          `It may include a mix of English, Chinese, Korean, Thai, and Indonesian. ` +
          `Extract only the actual chat message text that appears inside speech bubbles or chat message boxes, then translate that message text into Japanese. ` +
          `Ignore player names, titles, ranks, alliance tags, icons, coordinates, menu text, button text, system labels, decorative symbols, and OCR junk. ` +
          `Never output the original language. Never echo the source text. ` +
          `Output Japanese only. ` +
          `If a line looks like a name, title, UI label, or fragmented OCR, omit it. ` +
          `If a line is too corrupted to understand, omit it. ` +
          `Return only clean natural Japanese chat message text. ` +
          `No labels, no quotes, no explanations.`
        );
      }

      return (
        `Translate the input into natural ${targetLabel}. ` +
        `The input may contain OCR noise and mixed languages. ` +
        `Return plain text only in exactly this format:\n\n` +
        `TRANSLATION:\n` +
        `(natural ${targetLabel} translation)\n\n` +
        `KATAKANA:\n` +
        `(Japanese katakana reading of the translated ${targetLabel} text, spaced naturally)\n\n` +
        `Rules for KATAKANA: use easy-to-read Japanese katakana approximation for how a Japanese speaker would read the translated text aloud. ` +
        `Keep it natural and readable. Do not use phonetic symbols or romaji. ` +
        `No explanations, no bullets, no quotes.\n\n` +
        `${toneInstruction}`
      );
    }

    if (!needKatakana) {
      return (
        `Translate from ${LANGUAGE_LABELS[sourceLanguage]} to ${targetLabel}. ` +
        `Return only the translation. ` +
        `No labels, no quotes, no explanations. ` +
        `Keep line breaks if present. ` +
        `${toneInstruction}`
      );
    }

    return (
      `Translate from ${LANGUAGE_LABELS[sourceLanguage]} to ${targetLabel}. ` +
      `Return plain text only in exactly this format:\n\n` +
      `TRANSLATION:\n` +
      `(natural ${targetLabel} translation)\n\n` +
      `KATAKANA:\n` +
      `(Japanese katakana reading of the translated ${targetLabel} text, spaced naturally)\n\n` +
      `Rules for KATAKANA: convert the translated ${targetLabel} text into easy-to-read Japanese katakana approximation. ` +
      `Use spaces where helpful for readability. ` +
      `Do not use romaji, IPA, labels other than TRANSLATION and KATAKANA, quotes, or explanations.\n\n` +
      `${toneInstruction}`
    );
  }

  if (action === "shorten") {
    if (!needKatakana) {
      return (
        `Rewrite the text in ${targetLabel} so it is shorter but still natural. ` +
        `Keep the meaning. ` +
        `Return only the rewritten text. ` +
        `Target length: within ${limit} characters. ` +
        `Preserve the original emojis whenever possible. ` +
        `Do not remove meaningful emojis unless absolutely necessary for length. ` +
        `Do not add many new emojis. ` +
        `No labels, no quotes, no explanations. ` +
        `${toneInstruction}`
      );
    }

    return (
      `Rewrite the text in ${targetLabel} so it is shorter but still natural. ` +
      `Keep the meaning. ` +
      `Target length: within ${limit} characters. ` +
      `Preserve the original emojis whenever possible. ` +
      `Do not remove meaningful emojis unless absolutely necessary for length. ` +
      `Do not add many new emojis. ` +
      `Return plain text only in exactly this format:\n\n` +
      `TRANSLATION:\n` +
      `(short natural ${targetLabel} text)\n\n` +
      `KATAKANA:\n` +
      `(Japanese katakana reading of that translated text, spaced naturally)\n\n` +
      `No explanations, no quotes.\n\n` +
      `${toneInstruction}`
    );
  }

  if (!needKatakana) {
    return (
      `Rewrite the text in ${targetLabel} to be as short as possible while keeping the core meaning natural. ` +
      `Return only the rewritten text. ` +
      `Target length: within ${limit} characters. ` +
      `Preserve the original emojis whenever possible. ` +
      `Do not remove meaningful emojis unless absolutely necessary for length. ` +
      `Do not add many new emojis. ` +
      `No labels, no quotes, no explanations. ` +
      `${toneInstruction}`
    );
  }

  return (
    `Rewrite the text in ${targetLabel} to be as short as possible while keeping the core meaning natural. ` +
    `Target length: within ${limit} characters. ` +
    `Preserve the original emojis whenever possible. ` +
    `Do not remove meaningful emojis unless absolutely necessary for length. ` +
    `Do not add many new emojis. ` +
    `Return plain text only in exactly this format:\n\n` +
    `TRANSLATION:\n` +
    `(very short natural ${targetLabel} text)\n\n` +
    `KATAKANA:\n` +
    `(Japanese katakana reading of that translated text, spaced naturally)\n\n` +
    `No explanations, no quotes.\n\n` +
    `${toneInstruction}`
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

    const instructions = buildInstructions({
      action,
      sourceLanguage,
      targetLanguage,
      targetLabel,
      limit,
      tone,
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
        max_output_tokens: 700,
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

    const outputText = extractOutputText(data);

    if (!outputText) {
      return NextResponse.json(
        {
          ok: false,
          message: getFriendlyErrorMessage(action),
        },
        { status: 500 }
      );
    }

    let translatedText = outputText;
    let katakanaText = "";

    if (targetLanguage !== "ja") {
      const parsedTranslation = parseSection(outputText, "TRANSLATION");
      const parsedKatakana = parseSection(outputText, "KATAKANA");

      translatedText = parsedTranslation || outputText;
      katakanaText = parsedKatakana || "";
    }

    if (!translatedText.trim()) {
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