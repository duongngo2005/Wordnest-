import React from "react";
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
}

export async function generateMetadata({ params }: QuizPageProps) {
  const { id } = await params;
  const deck = await deckService.getDeckById(id);
  if (!deck) return { title: "Quiz | WordNest" };
  return {
    title: `Quiz: ${deck.name} | WordNest`,
    description: `Kiểm tra và củng cố vốn từ vựng trong bộ "${deck.name}"`,
  };
}

export default async function QuizPage({ params }: QuizPageProps) {
  const { id } = await params;
  const deck = await deckService.getDeckById(id);

  if (!deck) {
    notFound();
  }

  // If the deck has 0 cards, show a helpful prompt
  if (deck.cards.length === 0) {
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
              Hãy tạo hoặc thêm từ vựng vào bộ thẻ trước khi làm bài Quiz trắc nghiệm nhé.
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

  // Generate initial questions from the deck cards
  const questions = quizService.generateQuestions(deck.cards, 10);

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 sm:py-6">
        <QuizRunner
          deck={{ id: deck.id, name: deck.name }}
          initialQuestions={questions}
        />
      </main>
    </div>
  );
}
