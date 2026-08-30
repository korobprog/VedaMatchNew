import type { Metadata } from "next";
import { getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { TeamApplicationForm } from "@/components/team/team-application-form";
import {
  teamRoleDescriptions,
  teamRoleLabels,
  teamRoles,
} from "@/lib/team-labels";

export const metadata: Metadata = {
  title: "Команда",
  description:
    "VedaMatch ищет людей: разработчиков, DevOps, дизайнера и в первую очередь — специалиста по безопасности. Оставьте заявку без регистрации.",
};

export default async function TeamPage() {
  const user = await getProfile();

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      {user ? <Header user={user} /> : <Navbar />}

      <main
        className={`mx-auto max-w-3xl px-4 pb-24 ${user ? "py-8" : "pt-28 pb-24"}`}
      >
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Команда
        </h1>
        <p className="mb-6 text-text-1">
          Проекту нужны люди. Заявку можно отправить без регистрации —
          оставьте email или Telegram, и мы свяжемся.
        </p>

        <div className="glass mb-8 rounded-2xl border border-glass-brd p-5 text-sm text-text-1">
          <p className="mb-1 font-semibold text-text-0">
            Как это устроено сейчас
          </p>
          <p>
            Проект пока держится на энтузиазме и вере в идею — постоянных
            окладов сейчас нет. Но это не «поработайте бесплатно и прощайте»:
            по мере роста аудитории и монетизации сервисов появляются
            оплачиваемые позиции, и в первую очередь их предлагаем тем, кто
            присоединился на раннем этапе и внёс реальный вклад.
          </p>
        </div>

        <section className="mb-10 space-y-3">
          {teamRoles
            .filter((role) => role !== "other")
            .map((role) => (
              <div
                key={role}
                className="glass rounded-2xl border border-glass-brd p-5"
              >
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-text-0">
                    {teamRoleLabels[role]}
                  </h2>
                  {role === "security" && (
                    <span className="rounded-full bg-magenta/15 px-2.5 py-1 text-xs font-semibold text-magenta">
                      Приоритет
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-2">
                  {teamRoleDescriptions[role]}
                </p>
                <p className="mt-2 text-xs text-text-2">
                  Сейчас — на энтузиазме, дальше — по мере роста возможна
                  оплачиваемая позиция.
                </p>
              </div>
            ))}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            Заявка
          </h2>
          <TeamApplicationForm />
        </section>
      </main>
    </div>
  );
}
