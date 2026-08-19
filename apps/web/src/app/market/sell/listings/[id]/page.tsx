import Link from "next/link";
import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getTranslations } from "next-intl/server";
import type { MarketCategoryDto } from "@vedamatch/shared";
import { getProfile } from "@/lib/api";
import {
  getMarketCategories,
  getMarketListing,
  getMarketSections,
  getMarketShopShelves,
  getMyMarketShop,
} from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { ListingForm } from "@/components/market/listing-form";
import { ListingImagesUpload } from "@/components/market/listing-images-upload";
import { ListingStatusActions } from "@/components/market/listing-status-actions";
import { MarketNav } from "@/components/market/market-nav";
import { navLabels } from "../../../labels";

export default async function MarketEditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getProfile();
  if (!user) {
    const { id } = await params;
    redirectToLogin(`/market/sell/listings/${id}`);
  }

  const { id } = await params;
  const [t, locale, listing, shop, sections] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketListing(id),
    getMyMarketShop(),
    getMarketSections(),
  ]);
  if (!listing) notFound();
  // canEdit приходит от API и учитывает и владельца, и админа — своей
  // проверки роли здесь заводить не нужно.
  if (!listing.canEdit) notFound();

  const shelves = shop ? ((await getMarketShopShelves(shop.slug)) ?? []) : [];
  const categoriesBySection = await loadCategories(sections ?? []);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-text-0">
            {t("sell.editListing")}
          </h1>
          <Link
            href={`/market/listing/${listing.id}`}
            className="text-sm text-text-2 hover:text-text-0"
          >
            {t("listing.goToShop")}
          </Link>
        </div>
        <MarketNav active="sell" labels={navLabels(t)} />

        <div className="glass mb-4 rounded-2xl border border-glass-brd p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            {t("sell.status")}
          </h2>
          <ListingStatusActions listingId={listing.id} status={listing.status} />
        </div>

        <div className="mb-4">
          <ListingImagesUpload listingId={listing.id} images={listing.images} />
        </div>

        <ListingForm
          sections={sections ?? []}
          categoriesBySection={categoriesBySection}
          shelves={shelves}
          locale={locale}
          listing={listing}
        />
      </main>
    </div>
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
