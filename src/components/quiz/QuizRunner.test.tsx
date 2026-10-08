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
  it("shows the Vietnamese meaning with both safe spelling-hint choices", () => {
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
    expect(html).toContain("Lộ một phần chữ");
    expect(html).toContain("Chỉ dấu gạch");
    expect(html).toContain("_x_re__");
    expect(html).toContain(">Nhập từ hoặc cụm từ tiếng Anh tương ứng:</label>");
    expect(html).not.toContain("express");
  });
});
