import { redirect } from "next/navigation";
import { ServiceCatalogEditor } from "@/components/admin/service-catalog-editor";
import { getAdminServices } from "@/lib/api";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Каталог сервисов",
  robots: { index: false, follow: false },
};

export default async function AdminServicesPage() {
  const user = await requireUser();
  // Портальный раздел: администратор сервиса правит содержимое своего сервиса,
  // но не решает, какие сервисы есть на портале.
  if (user.role !== "admin") redirect("/");

  const services = await getAdminServices();

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Каталог сервисов
      </h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-text-1">
        Карточки в сетке портала: название, описание, статус, порядок и кому
        сервис виден. Тексты лендинга и страниц «О сервисе» сюда не относятся —
        они живут в коде веба и меняются вместе с ним.
      </p>

      {!services || services.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Каталог пуст.
        </p>
      ) : (
        <ServiceCatalogEditor services={services} />
      )}
    </>
  );
}
