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

function parseSection(text: string, label: "READING" | "JAPANESE") {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedLabel}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:\\s|$)`,
    "i"
  );
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
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
      "You are reading a mobile game screenshot that may contain chat messages, alliance mail, names, UI buttons, icons, coordinates, timestamps, and decorative elements. " +
      "Your job is to extract only the actual message text that a human would want to understand. " +
      "Ignore player names, alliance tags, ranks, coordinates, menu labels, buttons, icons, notification badges, decorative symbols, and fragmented junk. " +
      "Group related message lines naturally. " +
      "Do not guess aggressively. Omit anything unreadable or uncertain. " +
      "Then translate the extracted message text into natural Japanese. " +
      "Return plain text only in exactly this format:\n\n" +
      "READING:\n" +
      "(clean extracted message text in original language order)\n\n" +
      "JAPANESE:\n" +
      "(natural Japanese translation only)\n\n" +
      "Do not add any other headings, explanations, bullets, or quotes.";

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
                text: "Read this screenshot and return only the requested format.",
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

    const readingText = parseSection(outputText, "READING");
    const japaneseText = parseSection(outputText, "JAPANESE");

    return NextResponse.json({
      ok: true,
      ocrText: readingText,
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