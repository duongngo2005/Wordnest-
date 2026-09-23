import React, { cache } from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { QuizRunner } from "@/components/quiz/QuizRunner";
import { deckService, quizService } from "@/services/vocabulary";
import { WordNestMascot } from "@/components/ui/Mascot";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const revalidate = 0;

interface QuizPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string; storyId?: string }>;
}

const getDeckOverview = cache((deckId: string) => deckService.getDeckOverview(deckId));

export async function generateMetadata({ params }: QuizPageProps) {
  const { id } = await params;
  const deck = await getDeckOverview(id);
  if (!deck) return { title: "Quiz | WordNest" };
  return {
    title: `Quiz: ${deck.name} | WordNest`,
    description: `Kiểm tra và củng cố vốn từ vựng trong bộ "${deck.name}"`,
  };
}

export default async function QuizPage({ params, searchParams }: QuizPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const modeParam = resolvedSearchParams.mode;
  const storyId = resolvedSearchParams.storyId;
  const initialMode =
    modeParam === "focused_practice"
      ? ("focused_practice" as const)
      : modeParam === "story_cloze"
      ? ("story_cloze" as const)
      : modeParam === "typed" || modeParam === "typed_vi_en"
      ? ("typed" as const)
      : ("multiple_choice" as const);
  const deck = await getDeckOverview(id);

  if (!deck) {
    notFound();
  }

  // If the deck has 0 cards, show a helpful prompt
  if (deck._count.cards === 0) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
        <Header />
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 flex items-center justify-center">
          <div className="brick-card p-8 bg-[#FFFDF9] text-center space-y-4 w-full">
            <WordNestMascot mood="thinking" size={90} />
            <h1 className="text-2xl font-black text-[#221C16]">
              Bộ từ vựng này chưa có thẻ nào
            </h1>
            <p className="text-sm font-semibold text-[#6B6258]">
              Hãy thêm từ vựng vào bộ thẻ trước khi bắt đầu luyện nhé.
            </p>
            <div className="pt-2">
              <Link
                href={`/decks/${deck.id}`}
                className="brick-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-black"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại bộ từ vựng</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  let quiz: { questions: import("@/services/vocabulary").QuizQuestion[]; sessionId: string } | null = null;
  let emptyClozeError: string | null = null;

  if (initialMode === "focused_practice") {
    const focusedQuiz = await quizService.getFocusedPracticeQuiz(deck.id, 10);
    if (focusedQuiz.questions.length === 0) {
      return (
        <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
          <Header />
          <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 flex items-center justify-center">
            <div data-testid="empty-focused-practice" className="brick-card p-8 bg-[#FFFDF9] text-center space-y-4 w-full shadow-[4px_4px_0px_#221C16]">
              <WordNestMascot mood="happy" size={90} />
              <h1 className="text-2xl font-black text-[#221C16]">
                Chưa có từ nào cần luyện tập trung
              </h1>
              <p className="text-sm font-semibold text-[#6B6258]">
                Hiện chưa có đủ bằng chứng về từ cần luyện thêm trong bộ từ này. Hãy tiếp tục học thẻ hoặc làm bài Quiz thông thường để tích lũy dữ liệu nhé.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href={`/decks/${deck.id}`}
                  className="brick-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-black"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Quay lại bộ từ vựng</span>
                </Link>
                <Link
                  href={`/decks/${deck.id}/quiz`}
                  className="brick-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-black"
                >
                  <span>Làm bài Quiz thường</span>
                </Link>
              </div>
            </div>
          </main>
        </div>
      );
    }
    quiz = {
      questions: focusedQuiz.questions,
      sessionId: focusedQuiz.sessionId,
    };
  } else {
    // Create a server-side quiz session so submitted answers can be scored safely.
    const allowedTypes =
      initialMode === "story_cloze"
        ? (["story_cloze"] as const)
        : initialMode === "typed"
        ? (["typed_vi_en"] as const)
        : (["multiple_choice_en_vi", "multiple_choice_vi_en", "fill_in_blank"] as const);

    try {
      quiz = await quizService.getDeckQuiz(deck.id, 10, [...allowedTypes], storyId);
    } catch (err) {
      if (initialMode === "story_cloze") {
        emptyClozeError =
          err instanceof Error ? err.message : "Không có từ phù hợp để tạo bài Cloze từ Story này.";
      } else {
        throw err;
      }
    }
  }

  if (emptyClozeError || !quiz) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
        <Header />
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 flex items-center justify-center">
          <div className="brick-card p-8 bg-[#FFFDF9] text-center space-y-4 w-full shadow-[4px_4px_0px_#221C16]">
            <WordNestMascot mood="thinking" size={90} />
            <h1 className="text-2xl font-black text-[#221C16]">
              Không thể tạo bài Story Cloze
            </h1>
            <p className="text-sm font-semibold text-[#6B6258]">
              {emptyClozeError || "Không có từ phù hợp để tạo bài Cloze từ Story này."}
            </p>
            <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
              <Link
                href={`/decks/${deck.id}/story`}
                className="brick-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-black"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại trang truyện</span>
              </Link>
              <Link
                href={`/decks/${deck.id}/quiz`}
                className="brick-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-black"
              >
                <span>Làm bài Quiz thường</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 sm:py-6">
        <QuizRunner
          deck={{ id: deck.id, name: deck.name }}
          initialQuestions={quiz.questions}
          initialSessionId={quiz.sessionId}
          initialMode={initialMode}
          storyId={storyId}
        />
      </main>
    </div>
  );
}
