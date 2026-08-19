import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { getMarketChats } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { MarketNav } from "@/components/market/market-nav";
import { navLabels } from "../labels";

export default async function MarketChatsPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/market/chats");

  const [t, locale, state] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketChats(),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t("chat.title")}
        </h1>
        <MarketNav active="chats" labels={navLabels(t)} />

        {!state || state.chats.length === 0 ? (
          <div className="glass rounded-2xl border border-glass-brd p-8 text-center">
            <p className="text-text-1">{t("chat.empty")}</p>
            <p className="mt-1 text-sm text-text-2">{t("chat.emptyHint")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {state.chats.map((chat) => {
              // Покупатель видит магазин, продавец — покупателя: показывать
              // человеку самого себя в списке диалогов бессмысленно.
              const title =
                chat.viewerRole === "seller"
                  ? (chat.buyer?.name ?? t("chat.withBuyer"))
                  : chat.shop.name;
              return (
                <li key={chat.id}>
                  <Link
                    href={`/market/chats/${chat.id}`}
                    className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3 transition-colors hover:border-magenta/40"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-glass-brd text-text-2">
                      {title.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-0">
                        {title}
                      </span>
                      {chat.lastMessagePreview && (
                        <span className="block truncate text-xs text-text-2">
                          {chat.lastMessagePreview}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      {chat.lastMessageAt && (
                        <span className="block text-xs text-text-2">
                          {new Date(chat.lastMessageAt).toLocaleDateString(locale)}
                        </span>
                      )}
                      {chat.unreadCount > 0 && (
                        <span className="mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-magenta px-1.5 text-[11px] font-bold text-white">
                          {chat.unreadCount}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
