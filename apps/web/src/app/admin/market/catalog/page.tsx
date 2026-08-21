import { MarketAdminTabs } from "@/components/market/admin/admin-tabs";
import {
  MarketCatalogEditor,
  type CatalogSection,
} from "@/components/market/admin/catalog-editor";
import { getMarketCategories, getMarketSections } from "@/lib/market-api";

export const metadata = {
  title: "Каталог Рынка",
  robots: { index: false, follow: false },
};

export default async function AdminMarketCatalogPage() {
  const sections = (await getMarketSections()) ?? [];
  // Категории приходят по одному запросу на раздел — своего «всё сразу»
  // маршрута у каталога нет, а разделов десяток, и они грузятся параллельно.
  const catalog: CatalogSection[] = await Promise.all(
    sections.map(async (section) => ({
      section,
      categories: (await getMarketCategories(section.slug)) ?? [],
    })),
  );

  return (
    <>
      <MarketAdminTabs active="catalog" />

      <p className="mb-4 max-w-3xl text-sm text-text-1">
        Разделы и категории видны всем, включая гостей. Слаг задаётся при
        создании и потом не меняется — он попадает в ссылки витрины.
      </p>

      {catalog.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Каталог пуст. Начните с раздела.
        </p>
      ) : (
        <MarketCatalogEditor sections={catalog} />
      )}
    </>
  );
}
