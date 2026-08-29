import Link from "next/link";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import { getLibraryPreferences } from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { t } from "@/components/library/i18n";

/**
 * Выбор режима заполнения. Отдельным экраном, а не переключателем внутри
 * формы: переключение посреди заполнения теряло бы уже введённое, а выбор
 * до начала — осознанный и ссылку на каждый режим можно дать напрямую.
 */
export default async function LibraryAddPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/library/add");

  const { category } = await searchParams;
  const preferences = await getLibraryPreferences();
  const locale = preferences?.uiLanguage ?? "ru";
  const query = category ? `?category=${encodeURIComponent(category)}` : "";

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <BackLink locale={locale} fallbackHref="/library" />
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          {t(locale, "add.title")}
        </h1>
        <p className="mb-6 text-sm text-text-1">{t(locale, "add.modeTitle")}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <ModeCard
            href={`/library/add/simple${query}`}
            title={t(locale, "add.modeSimple")}
            hint={t(locale, "add.modeSimpleHint")}
            action={t(locale, "add.modeSimpleAction")}
          />
          <ModeCard
            href={`/library/add/pro${query}`}
            title={t(locale, "add.modePro")}
            hint={t(locale, "add.modeProHint")}
            action={t(locale, "add.modeProAction")}
          />
        </div>
      </main>
    </div>
  );
}

function ModeCard({
  href,
  title,
  hint,
  action,
}: {
  href: string;
  title: string;
  hint: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="glass flex flex-col gap-2 rounded-2xl border border-glass-brd p-5 transition-colors hover:border-cyan/40"
    >
      <span className="font-display text-lg font-semibold text-text-0">
        {title}
      </span>
      <span className="flex-1 text-sm text-text-1">{hint}</span>
      <span className="mt-2 text-sm font-semibold text-cyan">{action} →</span>
    </Link>
  );
}
