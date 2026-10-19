import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuizRunner } from "./QuizRunner";
import type { QuizQuestion } from "@/services/vocabulary/quiz-service";
import { ToastProvider } from "@/components/ui/ToastProvider";

const typedQuestion: QuizQuestion = {
  id: "q-express",
  cardId: "card-express",
  type: "typed_vi_en",
  prompt: "bày tỏ; diễn đạt",
  spellingHints: {
    partial: "_x_re__",
    blank: "_______",
  },
};

describe("QuizRunner typed recall", () => {
  it("keeps spelling hints hidden until the learner explicitly requests one", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <QuizRunner
          deck={{ id: "deck-1", name: "Từ vựng" }}
          initialQuestions={[typedQuestion]}
          initialSessionId="session-1"
          initialMode="typed"
        />
      </ToastProvider>
    );

    expect(html).toContain("bày tỏ; diễn đạt");
    expect(html).toContain("Hiện gợi ý chính tả");
    expect(html).not.toContain("Lộ một phần chữ");
    expect(html).not.toContain("Chỉ dấu gạch");
    expect(html).not.toContain("_x_re__");
    expect(html).toContain(">Nhập từ hoặc cụm từ tiếng Anh tương ứng:</label>");
    expect(html).not.toContain("express");
  });

  it("renders the randomized letter-hint toggle without exposing its mask by default", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <QuizRunner
          deck={{ id: "global-typing", name: "Toàn bộ thư viện" }}
          initialQuestions={[{ ...typedQuestion, letterHint: "_ x _ r _ _ _" }]}
          initialSessionId="session-1"
          initialMode="global_typing"
          lockedMode
          typedHintPolicy="hidden"
          letterHintPolicy="available"
        />
      </ToastProvider>
    );

    expect(html).toContain("Gợi ý — Bật");
    expect(html).toContain('data-testid="random-letter-hint-toggle"');
    expect(html).not.toContain("_ x _ r _ _ _");
    expect(html).not.toContain("express");
  });

  it("locks the normal Challenge to direct recall without a mode switch or spelling hint", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <QuizRunner
          deck={{ id: "deck-1", name: "Từ vựng" }}
          initialQuestions={[typedQuestion]}
          initialSessionId="session-1"
          initialMode="typed"
          isProductionChallenge
        />
      </ToastProvider>
    );

    expect(html).toContain("Thử thách · Tự nhớ &amp; viết");
    expect(html).toContain("Nhập từ hoặc cụm từ tiếng Anh tương ứng:");
    expect(html).not.toContain("Trắc nghiệm");
    expect(html).not.toContain("Lộ một phần chữ");
    expect(html).not.toContain("Chỉ dấu gạch");
    expect(html).not.toContain("_x_re__");
  });

  it("shows only an already-safe contextual cue for an ambiguous Challenge target", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <QuizRunner
          deck={{ id: "deck-1", name: "Từ vựng" }}
          initialQuestions={[{
            ...typedQuestion,
            prompt: "giải quyết",
            promptDetail: "Từ loại: verb",
            cueContext: "The report should _____ the safety concerns.",
          }]}
          initialSessionId="session-1"
          initialMode="typed"
          isProductionChallenge
        />
      </ToastProvider>
    );

    expect(html).toContain("Ngữ cảnh");
    expect(html).toContain("The report should _____ the safety concerns.");
    expect(html).not.toContain("express");
  });
});
