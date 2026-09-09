import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { ShareView } from "@/components/share/share-view";
import { getProfile } from "@/lib/api";

type Query = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/**
 * Экран «Поделиться» — портальный, как `/chat/share`.
 *
 * Сервис описывает карточку в адресе и ничего не знает про устройство
 * отправки: что умеет Telegram, чего не умеет Instagram и почему истории
 * берут только файл — забота этого экрана. Подключиться новому сервису стоит
 * одной ссылки.
 *
 * `file` — путь к картинке на нашем домене (например `/m/<slug>/story`).
 * Чужой адрес сюда не пускается: см. isOwnFile.
 */
export default async function SharePage({ searchParams }: { searchParams: Query }) {
  const user = await getProfile();
  const params = await searchParams;
  const text = one(params.text);
  const path = one(params.link);
  if (!user) redirectToLogin("/share");
  /* Адрес карточки принимаем только своим путём и делаем полным здесь.
     Чужую ссылку сюда пускать нельзя: экран портала предлагал бы отправить
     знакомым что угодно, и подпись «Поделиться» ручалась бы за это нашим
     именем. По той же причине проверяется и `file`. */
  if (!text || !path || !path.startsWith("/") || path.startsWith("//")) {
    redirect("/");
  }
  const host = (await headers()).get("host");
  const proto = host?.startsWith("localhost") ? "http" : "https";
  const link = `${proto}://${host}${path}`;

  const chat = new URLSearchParams();
  for (const key of ["kind", "title", "subtitle", "previewUrl", "sourceService", "sourceId"]) {
    const value = one(params[key]);
    if (value) chat.set(key, value);
  }

  return (
    <div className="min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/motivation" className="text-sm text-text-1 hover:text-text-0">
          ← Назад
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-text-0">
          Поделиться
        </h1>
        <p className="mb-6 mt-1 text-sm text-text-1">
          Выберите, что и куда отправить.
        </p>
        <ShareView
          text={text}
          source={one(params.subtitle) ?? null}
          link={link}
          previewUrl={one(params.previewUrl) ?? null}
          filePath={one(params.file) ?? null}
          chatHref={chat.size > 0 ? `/chat/share?${chat.toString()}` : null}
        />
      </main>
    </div>
  );
}
