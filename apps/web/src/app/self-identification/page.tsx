import { redirect } from "next/navigation";
import {
  getProfile,
  getSelfIdentificationHistory,
  getSelfIdentificationState,
} from "@/lib/api";
import { Header } from "@/components/header";
import { SelfIdentificationForm } from "@/components/self-identification-form";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function SelfIdentificationPage() {
  const [user, state, history] = await Promise.all([
    getProfile(),
    getSelfIdentificationState(),
    getSelfIdentificationHistory(),
  ]);
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Самоидентификация пользователя
        </h1>
        <p className="mb-6 text-text-1">
          Ответьте на несколько вопросов, чтобы VedaMatch мог подобрать подходящие сервисы и материалы.
        </p>
        <SelfIdentificationForm state={state} history={history ?? []} />
      </main>
    </div>
  );
}
