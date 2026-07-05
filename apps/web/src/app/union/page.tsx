import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { getUnionProfileState } from "@/lib/union-api";
import { Header } from "@/components/header";
import { UnionProfileForm } from "@/components/union/union-profile-form";

export default async function UnionPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const state = await getUnionProfileState();
  const profile = state?.profile ?? null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              VedaMatch Union
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Осознанные знакомства и сотрудничество: семья, дружба, служение,
              проекты
            </p>
          </div>
          {profile && (
            <Link
              href="/union/recommendations"
              className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-700"
            >
              Смотреть рекомендации
            </Link>
          )}
        </div>

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
