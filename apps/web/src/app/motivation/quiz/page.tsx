import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { redirectToLogin } from "@/lib/require-user";
import { needsWelcome } from "@/lib/welcome";
import { MotivationQuiz } from "@/components/motivation/motivation-quiz";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { getProfile } from "@/lib/api";
import { getMotivationQuiz } from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Викторина Вдохновения (VED-243): угадать по рисунку, какой стих
 * Бхагавад-гиты на нём. Вход — кнопка «Викторина» в нижнем ряду ленты.
 * `?seed=` — семя раунда: перезагрузка не перетасовывает вопросы, а «Ещё
 * раунд» уводит на новое семя.
 */
export default async function MotivationQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string }>;
}) {
  const { seed } = await searchParams;
  const [user, quiz] = await Promise.all([
    getProfile(),
    getMotivationQuiz(typeof seed === "string" ? seed : undefined),
  ]);
  if (!user) redirectToLogin("/motivation/quiz");
  if (needsWelcome(user)) redirect("/welcome");
  const isAdmin = user.role === "admin" || user.role === "service-admin";
  const round = quiz ?? { seed: "", available: 0, questions: [] };

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-xl px-2 py-4 pb-24 sm:px-4">
        <MotivationTopBar
          active="quiz"
          isAdmin={isAdmin}
          title="Викторина"
          action={{ href: "/motivation", label: "К ленте" }}
        />
        <div className="mt-4 px-2">
          {/* Ключ — семя: новый раунд начинается с чистого счёта. */}
          <MotivationQuiz key={round.seed} quiz={round} />
        </div>
      </main>
    </div>
  );
}
