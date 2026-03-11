import { NextResponse } from "next/server";

type ScreenshotTranslateRequestBody = {
  imageBase64?: string;
  mimeType?: string;
};

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

function parseSection(text: string, labels: string[]) {
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:^|\\n)${escapedLabel}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z _-]{2,}:|$)`,
      "i"
    );
    const match = text.match(pattern);
    const value = match?.[1]?.trim() ?? "";
    if (value) return value;
  }

  return "";
}

function normalizeMimeType(value: string | undefined) {
  if (!value) return "image/png";

  const lower = value.toLowerCase().trim();

  if (lower === "image/png") return "image/png";
  if (lower === "image/jpeg") return "image/jpeg";
  if (lower === "image/jpg") return "image/jpeg";
  if (lower === "image/webp") return "image/webp";

  return "image/png";
}

function cleanupSectionText(text: string) {
  return text
    .replace(/^(READING|JAPANESE|TRANSLATION)\s*:\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ScreenshotTranslateRequestBody;

    const imageBase64 = body.imageBase64?.trim() ?? "";
    const mimeType = normalizeMimeType(body.mimeType);

    if (!imageBase64) {
      return NextResponse.json(
        {
          ok: false,
          message: "画像の読み取りに失敗しました",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          message: "画像の読み取りに失敗しました",
        },
        { status: 500 }
      );
    }

    const instructions =
      "You are reading a mobile game screenshot. " +
      "Your highest priority is extracting the actual message text that a human wants to understand. " +
      "The screenshot may contain chat, alliance mail, names, UI buttons, icons, coordinates, timestamps, badges, decorative symbols, and OCR-like noise. " +
      "Focus on message bubbles, chat lines, mail body text, and meaningful human-written content. " +
      "Ignore player names, alliance tags, ranks, menu labels, buttons, coordinates, icons, notification badges, and decorative junk whenever possible. " +
      "If some text is uncertain, keep only the parts you can read with reasonable confidence. " +
      "Do not over-guess. " +
      "After extracting the readable message text, translate it into natural Japanese. " +
      "Return plain text only in exactly this format:\n\n" +
      "READING:\n" +
      "clean extracted message text only\n\n" +
      "JAPANESE:\n" +
      "natural Japanese translation only\n\n" +
      "Do not add bullets, quotes, explanations, or any other headings.";

    const openAiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        instructions,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Read this screenshot carefully. Extract only the meaningful message text, then translate it into Japanese using the required format.",
              },
              {
                type: "input_image",
                image_url: `data:${mimeType};base64,${imageBase64}`,
              },
            ],
          },
        ],
        reasoning: {
          effort: "minimal",
        },
        max_output_tokens: 1200,
        store: false,
      }),
    });

    const data = await openAiRes.json().catch(() => null);

    if (!openAiRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "画像の読み取りに失敗しました",
        },
        { status: openAiRes.status }
      );
    }

    const outputText = extractOutputText(data);

    if (!outputText) {
      return NextResponse.json(
        {
          ok: false,
          message: "画像の読み取りに失敗しました",
        },
        { status: 500 }
      );
    }

    const readingText = cleanupSectionText(
      parseSection(outputText, ["READING", "EXTRACTED", "TEXT", "MESSAGE"])
    );

    const japaneseText = cleanupSectionText(
      parseSection(outputText, ["JAPANESE", "TRANSLATION", "JP"])
    );

    const fallbackReading = cleanupSectionText(outputText);

    return NextResponse.json({
      ok: true,
      ocrText: readingText || fallbackReading,
      japaneseText,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "画像の読み取りに失敗しました",
      },
      { status: 400 }
    );
  }
}