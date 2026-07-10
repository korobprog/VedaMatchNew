import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { UnionNav } from "@/components/union/union-nav";
import { UnionProfileForm } from "@/components/union/union-profile-form";
import { getProfile } from "@/lib/api";
import {
  getUnionConnectionCounts,
  getUnionProfileState,
} from "@/lib/union-api";

export default async function UnionPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const [state, counts] = await Promise.all([
    getUnionProfileState(),
    getUnionConnectionCounts().catch(() => null),
  ]);
  const profile = state?.profile ?? null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            VedaMatch Union
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Осознанные знакомства и сотрудничество: семья, дружба, служение,
            проекты
          </p>
        </div>

        <UnionNav incomingPending={counts?.incomingPending ?? 0} />

        {!profile && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Добро пожаловать! Чтобы увидеть подходящих людей, заполните профиль
            Union: распределите приоритеты и расскажите о себе.
          </div>
        )}

        <UnionProfileForm profile={profile} />
      </main>
    </div>
  );
}
