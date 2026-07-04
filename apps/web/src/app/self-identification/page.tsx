import { redirect } from "next/navigation";
import {
  getProfile,
  getSelfIdentificationHistory,
  getSelfIdentificationState,
} from "@/lib/api";
import { Header } from "@/components/header";
import { SelfIdentificationForm } from "@/components/self-identification-form";

export default async function SelfIdentificationPage() {
  const [user, state, history] = await Promise.all([
    getProfile(),
    getSelfIdentificationState(),
    getSelfIdentificationHistory(),
  ]);
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Самоидентификация пользователя
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Ответьте на несколько вопросов, чтобы VedaMatch мог подобрать подходящие сервисы и материалы.
        </p>
        <SelfIdentificationForm state={state} history={history ?? []} />
      </main>
    </div>
  );
}
