import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { VaishnavaLandingPage } from "@/components/landing/VaishnavaLandingPage";
import { getBillingPlan, getCommunityStats } from "@/lib/api";
import { getChatPublicMap } from "@/lib/chat-api";

/**
 * Лендинг для вайшнавов — публичная витрина под отдельный поддомен.
 *
 * Страница не проверяет сессию и не редиректит вошедшего: с поддомена сюда
 * приходят по ссылке, и человек с аккаунтом тоже должен увидеть, что ему
 * рассказывают, — кнопка «Войти» отведёт его на главную портала.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Vaishnava.meta");
  const title = t("title");
  const description = t("description");
  // На поддомене страница — корень сайта, и канонический адрес обязан быть
  // его, а не `/vaishnava` основного домена: иначе поисковик склеит поддомен
  // с главной и в выдаче останется не он.
  const host = (await headers()).get("host") ?? "";
  const canonical = host.startsWith("vaishnava.")
    ? `https://${host}/`
    : "/vaishnava";
  return {
    // Суффикс « — VedaMatch» для вкладки добавит template корневого layout;
    // в openGraph шаблон не действует, поэтому там имя полное.
    title,
    description,
    openGraph: { title: `${title} — VedaMatch`, description },
    twitter: { title: `${title} — VedaMatch`, description },
    alternates: { canonical },
  };
}

export default async function VaishnavaPage() {
  // Каждый источник в своём catch: упавшая статистика убирает счётчики,
  // молчащая карта — секцию карты, но не лендинг целиком.
  const [plan, communityStats, publicMap] = await Promise.all([
    getBillingPlan().catch(() => null),
    getCommunityStats().catch(() => null),
    getChatPublicMap().catch(() => null),
  ]);

  return (
    <VaishnavaLandingPage
      plan={plan ?? undefined}
      totalMembers={communityStats?.totalMembers}
      totalCities={communityStats?.totalCities}
      totalCommunities={communityStats?.totalCommunities}
      communities={publicMap?.communities ?? []}
    />
  );
}
