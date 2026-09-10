import { ProductView } from "@/components/wellness/product-view";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "Продукт — Здоровье",
  description: "Состав продукта и вердикт по вашим ограничениям.",
  robots: { index: false, follow: false },
};

export default async function WellnessProductPage({
  params,
}: {
  params: Promise<{ barcode: string }>;
}) {
  const { barcode } = await params;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <WellnessNav />
      <ProductView barcode={barcode} />
    </main>
  );
}
