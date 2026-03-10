"use client";

import { ChangeEvent, useRef, useState } from "react";
import Tesseract from "tesseract.js";

type Mode = "chat" | "mail";

type LanguageCode = "ja" | "en" | "zh" | "ko" | "th" | "id";
type ActionType = "translate" | "shorten" | "shortest";
type ResultView = "translated" | "shortened" | "shortest";

type LanguageOption = {
  label: string;
  code: LanguageCode;
};

const sourceLanguages: LanguageOption[] = [
  { label: "日本語", code: "ja" },
  { label: "英語", code: "en" },
  { label: "中国語", code: "zh" },
  { label: "韓国語", code: "ko" },
  { label: "タイ語", code: "th" },
  { label: "インドネシア語", code: "id" },
];

const targetLanguages: LanguageOption[] = [
  { label: "日本語", code: "ja" },
  { label: "英語", code: "en" },
  { label: "中国語", code: "zh" },
  { label: "韓国語", code: "ko" },
  { label: "タイ語", code: "th" },
  { label: "インドネシア語", code: "id" },
];

function detectLanguageFromText(text: string): LanguageCode | null {
  const value = text.trim();
  if (!value) return null;

  if (/[\u0E00-\u0E7F]/.test(value)) return "th";
  if (/[\uAC00-\uD7AF]/.test(value)) return "ko";
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(value)) return "ja";

  const hasCjk = /[\u4E00-\u9FFF]/.test(value);
  const hasLatin = /[A-Za-z]/.test(value);

  if (hasCjk) {
    const jaHints =
      /[々ー]/.test(value) ||
      /(です|ます|した|ない|する|して|から|まで|より|こと|もの|さん|ちゃん|くん)/.test(value);
    if (jaHints) return "ja";
    return "zh";
  }

  if (hasLatin) {
    const lower = value.toLowerCase();

    const idPatterns = [
      /\b(terima kasih|selamat|tidak|iya|aku|kamu|dan|untuk|saya|kami|tolong|sudah|belum|lagi)\b/,
    ];

    for (const pattern of idPatterns) {
      if (pattern.test(lower)) return "id";
    }

    return "en";
  }

  return null;
}

function TranslatePanel({
  title,
  limit,
  visible,
}: {
  title: string;
  limit: number;
  visible: boolean;
}) {
  const [selectedSourceLanguage, setSelectedSourceLanguage] = useState<LanguageOption>(
    sourceLanguages[0]
  );
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState<LanguageOption>(
    targetLanguages.find((language) => language.code === "en") ?? targetLanguages[0]
  );
  const [inputText, setInputText] = useState("");

  const [translatedText, setTranslatedText] = useState("");
  const [shortenedText, setShortenedText] = useState("");
  const [shortestText, setShortestText] = useState("");
  const [currentView, setCurrentView] = useState<ResultView>("translated");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [inputCopied, setInputCopied] = useState(false);
  const [translatedCopied, setTranslatedCopied] = useState(false);

  const inputCount = inputText.length;

  const currentDisplayedText =
    currentView === "translated"
      ? translatedText
      : currentView === "shortened"
        ? shortenedText
        : shortestText;

  const translatedCount = currentDisplayedText.length;

  const inputOver = inputCount > limit;
  const translatedOver = translatedCount > limit;

  const isMail = limit === 220;
  const wrapperClass = "mx-auto w-full max-w-6xl";
  const textareaHeightClass = isMail ? "h-72" : "h-40";
  const resultMinHeightClass = isMail ? "min-h-72" : "min-h-40";

  const getButtonClass = (
    tone: "gray" | "blue" | "orange" | "red" | "copyGlow" | "activeGray" = "gray"
  ) => {
    if (tone === "blue") {
      return "rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50";
    }
    if (tone === "orange") {
      return "rounded-xl bg-orange-500 px-3 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50";
    }
    if (tone === "red") {
      return "rounded-xl bg-red-500 px-3 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50";
    }
    if (tone === "copyGlow") {
      return "rounded-xl bg-lime-400 px-3 py-2 text-sm font-medium text-gray-900 shadow-[0_0_18px_rgba(163,230,53,0.9)] transition active:scale-95";
    }
    if (tone === "activeGray") {
      return "rounded-xl bg-gray-600 px-3 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50";
    }

    return "rounded-xl bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 transition active:scale-95 disabled:opacity-50";
  };

  const flashCopied = (target: "input" | "translated") => {
    if (target === "input") {
      setInputCopied(true);
      setTimeout(() => setInputCopied(false), 2000);
      return;
    }

    setTranslatedCopied(true);
    setTimeout(() => setTranslatedCopied(false), 2000);
  };

  const applyAutoDetect = (text: string) => {
    const detectedCode = detectLanguageFromText(text);
    if (!detectedCode) return;

    const detectedLanguage = sourceLanguages.find((language) => language.code === detectedCode);
    if (!detectedLanguage) return;

    setSelectedSourceLanguage(detectedLanguage);
  };

  const callTranslateApi = async (action: ActionType, text: string, actionLimit: number) => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        sourceLanguage: selectedSourceLanguage.code,
        targetLanguage: selectedTargetLanguage.code,
        action,
        limit: actionLimit,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      const fallbackMessage =
        action === "translate"
          ? "翻訳に失敗しました。もう一度お試しください"
          : action === "shorten"
            ? "短縮に失敗しました。もう一度お試しください"
            : "最短化に失敗しました。もう一度お試しください";

      const message =
        typeof data?.message === "string" && data.message.trim()
          ? data.message
          : fallbackMessage;

      throw new Error(message);
    }

    return String(data.translatedText ?? "");
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
      applyAutoDetect(text);
      setErrorMessage("");
    } catch {
      alert("貼り付けに失敗しました");
    }
  };

  const handleCopyInput = async () => {
    try {
      await navigator.clipboard.writeText(inputText);
      flashCopied("input");
    } catch {
      alert("コピーに失敗しました");
    }
  };

  const handleCopyTranslated = async () => {
    try {
      const cleanedText = currentDisplayedText.replace(/^\[[a-z]{2}\]\s*/, "");
      await navigator.clipboard.writeText(cleanedText);
      flashCopied("translated");
    } catch {
      alert("コピーに失敗しました");
    }
  };

  const clearAllResults = () => {
    setTranslatedText("");
    setShortenedText("");
    setShortestText("");
    setCurrentView("translated");
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) {
      clearAllResults();
      setErrorMessage("");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const result = await callTranslateApi("translate", inputText, limit);
      const cleaned = result.replace(/^\[[a-z]{2}\]\s*/, "");

      setTranslatedText(cleaned);
      setShortenedText("");
      setShortestText("");
      setCurrentView("translated");
      setErrorMessage("");
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "翻訳に失敗しました。もう一度お試しください";
      setErrorMessage(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleShowTranslated = () => {
    if (!translatedText.trim()) return;
    setCurrentView("translated");
  };

  const handleShorten = async () => {
    if (!translatedText.trim()) return;

    if (shortenedText.trim()) {
      setCurrentView("shortened");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const result = await callTranslateApi("shorten", translatedText, limit);
      const cleaned = result.replace(/^\[[a-z]{2}\]\s*/, "");

      setShortenedText(cleaned);
      setCurrentView("shortened");
      setErrorMessage("");
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "短縮に失敗しました。もう一度お試しください";
      setErrorMessage(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleShortest = async () => {
    if (!translatedText.trim()) return;

    if (shortestText.trim()) {
      setCurrentView("shortest");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const shortestLimit = Math.max(1, Math.floor(limit * 0.6));
      const result = await callTranslateApi("shortest", translatedText, shortestLimit);
      const cleaned = result.replace(/^\[[a-z]{2}\]\s*/, "");

      setShortestText(cleaned);
      setCurrentView("shortest");
      setErrorMessage("");
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "最短化に失敗しました。もう一度お試しください";
      setErrorMessage(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearInput = () => {
    setInputText("");
    clearAllResults();
    setErrorMessage("");
  };

  return (
    <section
      className={`${visible ? "block" : "hidden"} rounded-2xl border border-gray-700 bg-gray-900 p-4 shadow-sm md:p-6 ${wrapperClass}`}
    >
      <h2 className="mb-4 text-lg font-bold text-gray-100">{title}</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <div className="mb-2 text-sm font-bold text-gray-100">入力</div>

          <div className="mb-3 flex flex-wrap gap-2">
            {sourceLanguages.map((language) => {
              const active = selectedSourceLanguage.code === language.code;

              return (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => setSelectedSourceLanguage(language)}
                  className={
                    active
                      ? "rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition active:scale-95"
                      : "rounded-xl border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-100 transition active:scale-95"
                  }
                >
                  {language.label}
                </button>
              );
            })}
          </div>

          <textarea
            className={`w-full resize-none rounded-xl border border-gray-600 bg-gray-800 p-3 text-gray-100 outline-none placeholder:text-gray-500 ${textareaHeightClass}`}
            placeholder="ここに入力"
            value={inputText}
            onChange={(e) => {
              const value = e.target.value;
              setInputText(value);
              applyAutoDetect(value);

              if (!value.trim()) {
                clearAllResults();
                setErrorMessage("");
              }
            }}
          />

          <div
            className={
              inputOver
                ? "mt-2 text-sm font-semibold text-red-400"
                : "mt-2 text-sm text-gray-400"
            }
          >
            {inputCount} / {limit}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={handlePaste} className={getButtonClass("gray")}>
              貼り付け
            </button>
            <button
              type="button"
              onClick={handleCopyInput}
              className={inputCopied ? getButtonClass("copyGlow") : getButtonClass("gray")}
            >
              コピー
            </button>
            <button type="button" onClick={handleClearInput} className={getButtonClass("gray")}>
              クリア
            </button>
            <button
              type="button"
              onClick={handleTranslate}
              disabled={loading}
              className={getButtonClass("blue")}
            >
              {loading ? "翻訳中..." : "翻訳"}
            </button>
          </div>

          {errorMessage ? (
            <div className="mt-3 rounded-xl border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <div className="mb-2 text-sm font-bold text-gray-100">翻訳</div>

          <div className="mb-3 flex flex-wrap gap-2">
            {targetLanguages.map((language) => {
              const active = selectedTargetLanguage.code === language.code;

              return (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => setSelectedTargetLanguage(language)}
                  className={
                    active
                      ? "rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition active:scale-95"
                      : "rounded-xl border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-100 transition active:scale-95"
                  }
                >
                  {language.label}
                </button>
              );
            })}
          </div>

          <div
            className={`rounded-xl border border-gray-600 bg-gray-800 p-3 overflow-y-auto ${resultMinHeightClass} ${isMail ? "max-h-72" : "max-h-40"}`}
          >
            <div className="text-sm text-gray-400">
              {selectedSourceLanguage.label} ({selectedSourceLanguage.code}) →{" "}
              {selectedTargetLanguage.label} ({selectedTargetLanguage.code})
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {currentView === "translated"
                ? "表示中: 翻訳後"
                : currentView === "shortened"
                  ? "表示中: 短く"
                  : "表示中: 最短"}
            </div>
            <div className="mt-2 whitespace-pre-wrap break-words text-gray-100">
              {currentDisplayedText || (
                <span className="text-gray-500">ここに翻訳結果が表示されます</span>
              )}
            </div>
          </div>

          <div
            className={
              translatedOver
                ? "mt-2 text-sm font-semibold text-red-400"
                : "mt-2 text-sm text-gray-400"
            }
          >
            {translatedCount} / {limit}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyTranslated}
              disabled={!currentDisplayedText.trim()}
              className={translatedCopied ? getButtonClass("copyGlow") : getButtonClass("gray")}
            >
              コピー
            </button>
            <button
              type="button"
              onClick={handleShowTranslated}
              disabled={loading || !translatedText.trim()}
              className={
                currentView === "translated"
                  ? getButtonClass("activeGray")
                  : getButtonClass("gray")
              }
            >
              翻訳後
            </button>
            <button
              type="button"
              onClick={handleShorten}
              disabled={loading || !translatedText.trim()}
              className={
                currentView === "shortened"
                  ? getButtonClass("activeGray")
                  : getButtonClass("orange")
              }
            >
              短く
            </button>
            <button
              type="button"
              onClick={handleShortest}
              disabled={loading || !translatedText.trim()}
              className={
                currentView === "shortest"
                  ? getButtonClass("activeGray")
                  : getButtonClass("red")
              }
            >
              最短
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScreenshotSection() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function cleanOcrText(text: string) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => {
        const noSpace = line.replace(/\s/g, "");
        if (!noSpace) return false;

        const validChars =
          (
            noSpace.match(
              /[A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/g
            ) || []
          ).length;
        const symbolChars =
          (
            noSpace.match(
              /[^A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/g
            ) || []
          ).length;

        if (validChars === 0) return false;
        if (symbolChars > validChars) return false;

        return true;
      })
      .join("\n")
      .trim();
  }

  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [japaneseText, setJapaneseText] = useState("");
  const [readingLoading, setReadingLoading] = useState(false);
  const [japaneseCopied, setJapaneseCopied] = useState(false);
  const [ocrCopied, setOcrCopied] = useState(false);

  const getButtonClass = (tone: "gray" | "blue" | "copyGlow" = "gray") => {
    if (tone === "blue") {
      return "rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50";
    }

    if (tone === "copyGlow") {
      return "rounded-xl bg-lime-400 px-3 py-2 text-sm font-medium text-gray-900 shadow-[0_0_18px_rgba(163,230,53,0.9)] transition active:scale-95";
    }

    return "rounded-xl bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 transition active:scale-95";
  };

  const flashCopied = (target: "japanese" | "ocr") => {
    if (target === "japanese") {
      setJapaneseCopied(true);
      setTimeout(() => setJapaneseCopied(false), 2000);
      return;
    }

    setOcrCopied(true);
    setTimeout(() => setOcrCopied(false), 2000);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setFileName(file.name);
    setOcrText("");
    setJapaneseText("");
  };

  const handleReadJapanese = async () => {
    if (!selectedFile) {
      alert("先に画像を選んでください");
      return;
    }

    try {
      setReadingLoading(true);

      const result = await Tesseract.recognize(
        selectedFile,
        "jpn+eng+chi_sim+kor+tha+ind"
      );
      const extractedText = cleanOcrText(result.data.text);

      setOcrText(extractedText);

      if (!extractedText) {
        setJapaneseText("");
        return;
      }

      const detectedSourceLanguage = detectLanguageFromText(extractedText) ?? "en";

      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: extractedText,
          sourceLanguage: "auto",
          targetLanguage: "ja",
          action: "translate",
          limit: 1000,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const message =
          typeof data?.message === "string" && data.message.trim()
            ? data.message
            : "日本語変換に失敗しました。もう一度お試しください";
        alert(message);
        return;
      }

      setJapaneseText(data.translatedText ?? "");
    } catch {
      alert("画像の読み取りに失敗しました");
    } finally {
      setReadingLoading(false);
    }
  };

  const handleCopyJapanese = async () => {
    try {
      await navigator.clipboard.writeText(japaneseText);
      flashCopied("japanese");
    } catch {
      alert("コピーに失敗しました");
    }
  };

  const handleCopyOcr = async () => {
    try {
      await navigator.clipboard.writeText(ocrText);
      flashCopied("ocr");
    } catch {
      alert("コピーに失敗しました");
    }
  };

  const handleClearScreenshot = () => {
    setFileName("");
    setSelectedFile(null);
    setOcrText("");
    setJapaneseText("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl rounded-2xl border border-gray-700 bg-gray-900 p-4 shadow-sm md:p-6">
      <h2 className="mb-4 text-lg font-bold text-gray-100">スクショ翻訳</h2>

      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-gray-100">画像アップロード</label>

            <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white transition active:scale-95">
              ＋
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          <div className="mt-2 text-sm text-gray-400">
            {fileName || "まだ画像は選ばれていません"}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-bold text-gray-100">日本語確認</div>
          <textarea
            className="h-32 w-full resize-none rounded-xl border border-gray-600 bg-gray-800 p-3 text-gray-100 outline-none placeholder:text-gray-500"
            placeholder="ここに日本語訳を表示"
            value={japaneseText}
            onChange={(e) => setJapaneseText(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleReadJapanese}
            disabled={readingLoading}
            className={getButtonClass("blue")}
          >
            {readingLoading ? "翻訳中..." : "翻訳"}
          </button>
          <button
            type="button"
            onClick={handleCopyJapanese}
            className={japaneseCopied ? getButtonClass("copyGlow") : getButtonClass("gray")}
          >
            コピー
          </button>
          <button
            type="button"
            onClick={handleClearScreenshot}
            className={getButtonClass("gray")}
          >
            クリア
          </button>
        </div>

        <div>
          <div className="mb-2 text-sm font-bold text-gray-100">読み取り本文</div>
          <textarea
            className="h-40 w-full resize-none rounded-xl border border-gray-600 bg-gray-800 p-3 text-gray-100 outline-none placeholder:text-gray-500"
            placeholder="ここにOCRで読み取った本文を表示"
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyOcr}
            disabled={!ocrText.trim()}
            className={ocrCopied ? getButtonClass("copyGlow") : getButtonClass("gray")}
          >
            読み取り本文をコピー
          </button>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("chat");

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 md:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-100 md:text-3xl">
            バリバリ大作戦 翻訳Webアプリ
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            チャット・同盟メール向けの多言語翻訳
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={
                mode === "chat"
                  ? "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
                  : "rounded-xl border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-100 transition active:scale-95"
              }
            >
              チャット
            </button>

            <button
              type="button"
              onClick={() => setMode("mail")}
              className={
                mode === "mail"
                  ? "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
                  : "rounded-xl border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-100 transition active:scale-95"
              }
            >
              同盟メール
            </button>
          </div>
        </header>

        <div className="space-y-4">
          <TranslatePanel title="チャットモード" limit={100} visible={mode === "chat"} />

          <div className={mode === "mail" ? "block space-y-4" : "hidden"}>
            <TranslatePanel title="同盟メール 1" limit={220} visible={true} />
            <TranslatePanel title="同盟メール 2" limit={220} visible={true} />
          </div>

          <ScreenshotSection />
        </div>
      </div>
    </main>
  );
}