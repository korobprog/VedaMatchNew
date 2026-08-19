import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { MarketCategoryDto } from "@vedamatch/shared";
import {
  getMarketCategories,
  getMarketSections,
  getMarketShopShelves,
  getMyMarketShop,
} from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { ListingForm } from "@/components/market/listing-form";
import { MarketNav } from "@/components/market/market-nav";
import { navLabels } from "../../../labels";

export default async function MarketNewListingPage() {

  const [t, locale, shop, sections] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMyMarketShop(),
    getMarketSections(),
  ]);
  if (!shop) redirect("/market/sell/new");

  // Категории всех разделов сразу: селект раздела в форме переключается без
  // похода на сервер, а разделов десяток — это один короткий батч.
  const shelves = (await getMarketShopShelves(shop.slug)) ?? [];
  const categoriesBySection = await loadCategories(sections ?? []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        {t("sell.newListing")}
      </h1>
      <MarketNav active="sell" labels={navLabels(t)} />
      <ListingForm
        sections={sections ?? []}
        categoriesBySection={categoriesBySection}
        shelves={shelves}
        locale={locale}
      />
    </main>
  );
}

async function loadCategories(
  sections: Array<{ slug: string }>,
): Promise<Record<string, MarketCategoryDto[]>> {
  const lists = await Promise.all(
    sections.map((section) => getMarketCategories(section.slug)),
  );
  return Object.fromEntries(
    sections.map((section, index) => [section.slug, lists[index] ?? []]),
  );
}
