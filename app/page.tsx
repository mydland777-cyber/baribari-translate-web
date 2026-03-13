"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type Mode = "chat" | "mail";

type LanguageCode = "ja" | "en" | "zh" | "ko" | "th" | "id";

type ActionType = "translate" | "shorten" | "shortest";
type ResultView = "translated" | "shortened" | "shortest";
type ToneType = "normal" | "polite" | "friendly" | "soft";

type LanguageOption = {
  label: string;
  code: LanguageCode;
};

type ResultSet = {
  translated: string;
  shortened: string;
  shortest: string;
  katakanaTranslated: string;
  katakanaShortened: string;
  katakanaShortest: string;
};

type ResultsByLanguage = Record<LanguageCode, ResultSet>;

type TranslateApiResponse = {
  ok?: boolean;
  translatedText?: string;
  katakanaText?: string;
  message?: string;
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

const toneOptions: { label: string; value: ToneType }[] = [
  { label: "通常", value: "normal" },
  { label: "丁寧", value: "polite" },
  { label: "フレンドリー", value: "friendly" },
  { label: "柔らかく", value: "soft" },
];

const chatQuickPhrases = [
  "マップを更新しました",
  "宣戦布告の時間までに都市へ移動してください",
  "🏠️初期配置",
  "⚔️🛡️本日の戦略🛡️⚔️",
  "なるほど、その通りだと思います",
];

function createEmptyResultSet(): ResultSet {
  return {
    translated: "",
    shortened: "",
    shortest: "",
    katakanaTranslated: "",
    katakanaShortened: "",
    katakanaShortest: "",
  };
}

function createEmptyResults(): ResultsByLanguage {
  return {
    ja: createEmptyResultSet(),
    en: createEmptyResultSet(),
    zh: createEmptyResultSet(),
    ko: createEmptyResultSet(),
    th: createEmptyResultSet(),
    id: createEmptyResultSet(),
  };
}

function detectLanguageFromText(text: string): LanguageCode | null {
  const value = text.trim();
  if (!value) return null;

  if (/[\u0E00-\u0E7F]/.test(value)) return "th";
  if (/[\uAC00-\uD7AF]/.test(value)) return "ko";
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(value)) return "ja";

  const hasCjk = /[\u4E00-\u9FFF]/.test(value);
  const hasLatin = /[A-Za-zÀ-ÿ]/.test(value);

  if (hasCjk) {
    const jaHints =
      /[々ー]/.test(value) ||
      /(です|ます|した|ない|する|して|から|まで|より|こと|もの|さん|ちゃん|くん)/.test(value);
    if (jaHints) return "ja";
    return "zh";
  }

  if (hasLatin) {
    const lower = value.toLowerCase();

    if (
      /\b(terima kasih|selamat|tidak|iya|aku|kamu|dan|untuk|saya|kami|tolong|sudah|belum|lagi)\b/.test(
        lower
      )
    ) {
      return "id";
    }

    return "en";
  }

  return null;
}

function getSpeechLang(languageCode: LanguageCode) {
  if (languageCode === "ja") return "ja-JP";
  if (languageCode === "en") return "en-US";
  if (languageCode === "zh") return "zh-CN";
  if (languageCode === "ko") return "ko-KR";
  if (languageCode === "th") return "th-TH";
  if (languageCode === "id") return "id-ID";
  return "en-US";
}

function TranslatePanel({
  title,
  limit,
  visible,
  enableSpeech = false,
  showKatakana = false,
  showQuickPhrases = false,
}: {
  title: string;
  limit: number;
  visible: boolean;
  enableSpeech?: boolean;
  showKatakana?: boolean;
  showQuickPhrases?: boolean;
}) {
  const [selectedSourceLanguage, setSelectedSourceLanguage] = useState<LanguageOption>(
    sourceLanguages[0]
  );
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState<LanguageOption>(
    targetLanguages.find((language) => language.code === "en") ?? targetLanguages[0]
  );
  const [selectedTone, setSelectedTone] = useState<ToneType>("normal");
  const [inputText, setInputText] = useState("");

  const [resultsByLanguage, setResultsByLanguage] = useState<ResultsByLanguage>(
    createEmptyResults()
  );
  const [currentView, setCurrentView] = useState<ResultView>("translated");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [inputCopied, setInputCopied] = useState(false);
  const [translatedCopied, setTranslatedCopied] = useState(false);
  const [katakanaCopied, setKatakanaCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const inputCount = inputText.length;
  const currentLanguageResults = resultsByLanguage[selectedTargetLanguage.code];

  const currentDisplayedText =
    currentView === "translated"
      ? currentLanguageResults.translated
      : currentView === "shortened"
        ? currentLanguageResults.shortened
        : currentLanguageResults.shortest;

  const currentKatakanaText =
    currentView === "translated"
      ? currentLanguageResults.katakanaTranslated
      : currentView === "shortened"
        ? currentLanguageResults.katakanaShortened
        : currentLanguageResults.katakanaShortest;

  const translatedCount = currentDisplayedText.length;
  const inputOver = inputCount > limit;
  const translatedOver = translatedCount > limit;

  const isMail = limit === 220;
  const wrapperClass = "mx-auto w-full max-w-6xl";
  const textareaHeightClass = isMail ? "h-72" : "h-40";
  const resultMinHeightClass = isMail ? "min-h-92" : "min-h-60";

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const getButtonClass = (
    tone: "gray" | "blue" | "orange" | "red" | "copyGlow" | "activeGray" | "translateMain" = "gray"
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
    if (tone === "translateMain") {
      return "rounded-xl bg-emerald-500 px-5 py-3 text-base font-bold text-white shadow-[0_0_18px_rgba(16,185,129,0.35)] transition active:scale-95 disabled:opacity-50";
    }

    return "rounded-xl bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 transition active:scale-95 disabled:opacity-50";
  };

  const flashCopied = (target: "input" | "translated" | "katakana") => {
    if (target === "input") {
      setInputCopied(true);
      setTimeout(() => setInputCopied(false), 2000);
      return;
    }

    if (target === "translated") {
      setTranslatedCopied(true);
      setTimeout(() => setTranslatedCopied(false), 2000);
      return;
    }

    setKatakanaCopied(true);
    setTimeout(() => setKatakanaCopied(false), 2000);
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
        tone: selectedTone,
      }),
    });

    const data = (await res.json().catch(() => null)) as TranslateApiResponse | null;

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

    return {
      translatedText: String(data.translatedText ?? ""),
      katakanaText: String(data.katakanaText ?? ""),
    };
  };

  const updateLanguageResults = (
    languageCode: LanguageCode,
    updater: (current: ResultSet) => ResultSet
  ) => {
    setResultsByLanguage((prev) => ({
      ...prev,
      [languageCode]: updater(prev[languageCode]),
    }));
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

  const handleCopyKatakana = async () => {
    try {
      await navigator.clipboard.writeText(currentKatakanaText);
      flashCopied("katakana");
    } catch {
      alert("コピーに失敗しました");
    }
  };

  const stopSpeech = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    setSpeaking(false);
  };

  const handleSpeak = () => {
    const cleanedText = currentDisplayedText.replace(/^\[[a-z]{2}\]\s*/, "").trim();

    if (!cleanedText) return;

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("このブラウザは音声読み上げに対応していません");
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanedText);
      utterance.lang = getSpeechLang(selectedTargetLanguage.code);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onend = () => {
        setSpeaking(false);
        speechUtteranceRef.current = null;
      };

      utterance.onerror = () => {
        setSpeaking(false);
        speechUtteranceRef.current = null;
      };

      speechUtteranceRef.current = utterance;
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
      alert("音声再生に失敗しました");
    }
  };

  const clearAllResults = () => {
    stopSpeech();
    setResultsByLanguage(createEmptyResults());
    setCurrentView("translated");
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) {
      clearAllResults();
      setErrorMessage("");
      return;
    }

    try {
      stopSpeech();
      setLoading(true);
      setErrorMessage("");

      const result = await callTranslateApi("translate", inputText, limit);
      const cleaned = result.translatedText.replace(/^\[[a-z]{2}\]\s*/, "");
      const currentLanguageCode = selectedTargetLanguage.code;

      updateLanguageResults(currentLanguageCode, () => ({
        translated: cleaned,
        shortened: "",
        shortest: "",
        katakanaTranslated: result.katakanaText,
        katakanaShortened: "",
        katakanaShortest: "",
      }));

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
    if (!currentLanguageResults.translated.trim()) return;
    stopSpeech();
    setCurrentView("translated");
  };

  const handleShorten = async () => {
    const currentLanguageCode = selectedTargetLanguage.code;
    const currentLanguageResult = resultsByLanguage[currentLanguageCode];

    if (!currentLanguageResult.translated.trim()) return;

    if (currentLanguageResult.shortened.trim()) {
      stopSpeech();
      setCurrentView("shortened");
      return;
    }

    try {
      stopSpeech();
      setLoading(true);
      setErrorMessage("");

      const result = await callTranslateApi("shorten", currentLanguageResult.translated, limit);
      const cleaned = result.translatedText.replace(/^\[[a-z]{2}\]\s*/, "");

      updateLanguageResults(currentLanguageCode, (prev) => ({
        ...prev,
        shortened: cleaned,
        katakanaShortened: result.katakanaText,
      }));

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
    const currentLanguageCode = selectedTargetLanguage.code;
    const currentLanguageResult = resultsByLanguage[currentLanguageCode];

    if (!currentLanguageResult.translated.trim()) return;

    if (currentLanguageResult.shortest.trim()) {
      stopSpeech();
      setCurrentView("shortest");
      return;
    }

    try {
      stopSpeech();
      setLoading(true);
      setErrorMessage("");

      const shortestLimit = Math.max(1, Math.floor(limit * 0.6));
      const result = await callTranslateApi(
        "shortest",
        currentLanguageResult.translated,
        shortestLimit
      );
      const cleaned = result.translatedText.replace(/^\[[a-z]{2}\]\s*/, "");

      updateLanguageResults(currentLanguageCode, (prev) => ({
        ...prev,
        shortest: cleaned,
        katakanaShortest: result.katakanaText,
      }));

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
    stopSpeech();
    setInputText("");
    clearAllResults();
    setErrorMessage("");
  };

  const handleToneChange = (tone: ToneType) => {
    stopSpeech();
    setSelectedTone(tone);
    clearAllResults();
    setErrorMessage("");
  };

  const handleQuickPhrase = (phrase: string) => {
    stopSpeech();
    setInputText((prev) => {
      if (!prev.trim()) return phrase;
      return `${prev}\n${phrase}`;
    });
    setSelectedSourceLanguage(sourceLanguages[0]);
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
                      ? "rounded-xl bg-blue-600 px-2.5 py-2 text-sm font-medium text-white transition active:scale-95"
                      : "rounded-xl border border-gray-600 bg-gray-800 px-2.5 py-2 text-sm font-medium text-gray-100 transition active:scale-95"
                  }
                >
                  {language.label}
                </button>
              );
            })}
          </div>

          <div className="mb-3">
            <div className="mb-2 text-sm font-bold text-gray-100">口調</div>
            <div className="flex flex-wrap gap-2">
              {toneOptions.map((toneOption) => {
                const active = selectedTone === toneOption.value;

                return (
                  <button
                    key={toneOption.value}
                    type="button"
                    onClick={() => handleToneChange(toneOption.value)}
                    className={
                      active
                        ? "rounded-xl bg-blue-600 px-2.5 py-2 text-sm font-medium text-white transition active:scale-95"
                        : "rounded-xl border border-gray-600 bg-gray-800 px-2.5 py-2 text-sm font-medium text-gray-100 transition active:scale-95"
                    }
                  >
                    {toneOption.label}
                  </button>
                );
              })}
            </div>
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
              className={`ml-auto ${getButtonClass("translateMain")}`}
            >
              {loading ? "翻訳中..." : "翻訳"}
            </button>
          </div>

          {showQuickPhrases ? (
            <div className="mt-4">
              <div className="mb-2 text-sm font-bold text-gray-100">定型文</div>
              <div className="flex flex-wrap gap-2">
                {chatQuickPhrases.map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => handleQuickPhrase(phrase)}
                    className="rounded-xl border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-100 transition active:scale-95"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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
                  onClick={() => {
                    stopSpeech();
                    setSelectedTargetLanguage(language);
                  }}
                  className={
                    active
                      ? "rounded-xl bg-blue-600 px-2.5 py-2 text-sm font-medium text-white transition active:scale-95"
                      : "rounded-xl border border-gray-600 bg-gray-800 px-2.5 py-2 text-sm font-medium text-gray-100 transition active:scale-95"
                  }
                >
                  {language.label}
                </button>
              );
            })}
          </div>

          <div
            className={`rounded-xl border border-gray-600 bg-gray-800 p-3 overflow-y-auto ${resultMinHeightClass} ${isMail ? "max-h-72" : "max-h-60"}`}
          >
            <div className="text-sm text-gray-400">
              {selectedSourceLanguage.label} ({selectedSourceLanguage.code}) →{" "}
              {selectedTargetLanguage.label} ({selectedTargetLanguage.code})
            </div>
            <div className="mt-1 text-xs text-gray-500">
              口調:{" "}
              {selectedTone === "normal"
                ? "通常"
                : selectedTone === "polite"
                  ? "丁寧"
                  : selectedTone === "friendly"
                    ? "フレンドリー"
                    : "柔らかく"}
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
              disabled={loading || !currentLanguageResults.translated.trim()}
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
              disabled={loading || !currentLanguageResults.translated.trim()}
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
              disabled={loading || !currentLanguageResults.translated.trim()}
              className={
                currentView === "shortest"
                  ? getButtonClass("activeGray")
                  : getButtonClass("red")
              }
            >
              最短
            </button>

            {enableSpeech ? (
              <button
                type="button"
                onClick={speaking ? stopSpeech : handleSpeak}
                disabled={!currentDisplayedText.trim()}
                className={`ml-auto ${speaking ? getButtonClass("activeGray") : getButtonClass("gray")}`}
                aria-label={speaking ? "音声停止" : "音声再生"}
                title={speaking ? "音声停止" : "音声再生"}
              >
                {speaking ? "■" : "🔊"}
              </button>
            ) : null}
          </div>

          {showKatakana ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-gray-100">カタカナ</div>
                <button
                  type="button"
                  onClick={handleCopyKatakana}
                  disabled={!currentKatakanaText.trim()}
                  className={katakanaCopied ? getButtonClass("copyGlow") : getButtonClass("gray")}
                >
                  コピー
                </button>
              </div>

              <div className="rounded-xl border border-gray-600 bg-gray-800 p-3 min-h-24">
                <div className="whitespace-pre-wrap break-words text-gray-100">
                  {currentKatakanaText || (
                    <span className="text-gray-500">ここにカタカナ表記が表示されます</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ScreenshotSection() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [japaneseText, setJapaneseText] = useState("");
  const [readingLoading, setReadingLoading] = useState(false);
  const [japaneseCopied, setJapaneseCopied] = useState(false);
  const [ocrCopied, setOcrCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const getButtonClass = (tone: "gray" | "blue" | "copyGlow" = "gray") => {
    if (tone === "blue") {
      return "rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50";
    }

    if (tone === "copyGlow") {
      return "rounded-xl bg-lime-400 px-3 py-2 text-sm font-medium text-gray-900 shadow-[0_0_18px_rgba(163,230,53,0.9)] transition active:scale-95";
    }

    return "rounded-xl bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 transition active:scale-95 disabled:opacity-50";
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

  const fileToBase64 = async (file: File): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const base64 = result.includes(",") ? result.split(",")[1] : "";
        if (!base64) {
          reject(new Error("base64 error"));
          return;
        }
        resolve(base64);
      };

      reader.onerror = () => reject(new Error("file read error"));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(file);

    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
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

      const imageBase64 = await fileToBase64(selectedFile);

      const res = await fetch("/api/screenshot-translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64,
          mimeType: selectedFile.type || "image/png",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const message =
          typeof data?.message === "string" && data.message.trim()
            ? data.message
            : "画像の読み取りに失敗しました";
        alert(message);
        return;
      }

      setOcrText(String(data.ocrText ?? ""));
      setJapaneseText(String(data.japaneseText ?? ""));
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
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl("");
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
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-gray-100">画像アップロード</label>

              {!previewUrl ? (
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
              ) : null}
            </div>

            {previewUrl ? (
              <img
                src={previewUrl}
                alt="選択した画像"
                className="h-24 w-24 rounded-xl border border-gray-600 object-cover"
              />
            ) : (
              <div className="text-sm text-gray-400">まだ画像は選ばれていません</div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-bold text-gray-100">日本語確認</div>
          <textarea
            className="h-40 w-full resize-none rounded-xl border border-gray-600 bg-gray-800 p-3 text-gray-100 outline-none placeholder:text-gray-500"
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
            disabled={!japaneseText.trim()}
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
            className="h-32 w-full resize-none rounded-xl border border-gray-600 bg-gray-800 p-3 text-gray-100 outline-none placeholder:text-gray-500"
            placeholder="ここに読み取った本文を表示"
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
          <div className="flex items-center gap-4">
            <img
              src="/icon.png"
              alt="バリバリ大作戦 アイコン"
              className="h-16 w-16 rounded-2xl object-cover md:h-20 md:w-20"
            />

            <div>
              <h1 className="text-2xl font-bold text-gray-100 md:text-3xl">
                バリバリ大作戦 翻訳アプリ
              </h1>
              <p className="mt-2 text-sm text-gray-400">
                チャット・同盟メール向けの多言語翻訳
              </p>
            </div>
          </div>

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
          <TranslatePanel
            title="チャットモード"
            limit={100}
            visible={mode === "chat"}
            enableSpeech={true}
            showKatakana={true}
            showQuickPhrases={true}
          />

          <div className={mode === "mail" ? "block space-y-4" : "hidden"}>
            <TranslatePanel
              title="同盟メール 1"
              limit={220}
              visible={true}
              showKatakana={false}
              showQuickPhrases={false}
            />
            <TranslatePanel
              title="同盟メール 2"
              limit={220}
              visible={true}
              showKatakana={false}
              showQuickPhrases={false}
            />
          </div>

          <ScreenshotSection />
        </div>
      </div>
    </main>
  );
}