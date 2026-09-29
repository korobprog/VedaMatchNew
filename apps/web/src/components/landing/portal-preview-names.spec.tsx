import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import type { ServiceCard } from "@vedamatch/shared";
import { ServiceCatalogProvider } from "@/components/service-catalog-provider";
import { PortalPreview } from "./PortalPreview";

/**
 * Имена в ряду «Ходовые сервисы» макета портала.
 *
 * Раньше имя выводилось прямо из запасного русского значения, и англоязычный
 * гость видел на лендинге «Общение / Музыка / Работа» при том, что каталог
 * уже отдаёт английские названия. Теперь имя идёт через `useServiceNames`.
 *
 * Провайдеры — как в соседних тестах лендинга: настоящий
 * `NextIntlClientProvider` с нужной локалью (без мока `useLocale`), настоящий
 * `ServiceCatalogProvider`. matchMedia уже заглушен в vitest.setup.ts;
 * IntersectionObserver не заглушаем — без него макет считает себя видимым
 * (см. portal-preview-cursor.spec).
 */
const card = (slug: string, name: string, nameEn: string | null): ServiceCard => ({
  id: slug,
  slug,
  name,
  nameEn,
  description: "",
  iconUrl: null,
  url: `/${slug}`,
  status: "active",
  category: "general",
  requiresDevoteeVerification: false,
});

function renderPreview(locale: string, services: ServiceCard[]) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{}}>
      <ServiceCatalogProvider services={services}>
        <PortalPreview />
      </ServiceCatalogProvider>
    </NextIntlClientProvider>,
  );
}

/**
 * Ряд ходовых сервисов. Слаги «Музыка» и «Работа» повторяются ещё и в сетке
 * ниже, поэтому глобальный getByText для них нашёл бы два элемента. Ряд
 * находим по значку непрочитанного (цифра 3) — он стоит только на плитке
 * «Общения» из этого ряда — и ищем имена уже внутри него.
 */
const featuredRow = () => {
  const row = screen.getByText("3").closest(".grid");
  if (!(row instanceof HTMLElement)) throw new Error("ряд ходовых сервисов не найден");
  return row;
};

describe("имена ходовых сервисов в макете портала", () => {
  it("в en-локали берёт английские имена из каталога", () => {
    const { container } = renderPreview("en", [
      card("chat", "Общение", "Chat"),
      card("music", "Музыка", "Media Library"),
      card("work", "Работа", "Work"),
    ]);

    const row = within(featuredRow());
    expect(row.getByText("Chat")).toBeInTheDocument();
    expect(row.getByText("Media Library")).toBeInTheDocument();
    expect(row.getByText("Work")).toBeInTheDocument();

    // Русских имён нет ни в ряду, ни где-либо ещё в макете: те же слаги
    // выводятся и в сетке, и в заголовке ролика, и все идут через каталог.
    for (const ru of ["Общение", "Музыка", "Работа"]) {
      expect(row.queryByText(ru)).not.toBeInTheDocument();
      expect(within(container).queryByText(ru)).not.toBeInTheDocument();
    }
  });

  it("при пустом каталоге показывает запасные имена", () => {
    const { container } = renderPreview("ru", []);

    const row = within(featuredRow());
    expect(row.getByText("Общение")).toBeInTheDocument();
    expect(row.getByText("Музыка")).toBeInTheDocument();
    expect(row.getByText("Работа")).toBeInTheDocument();
    // «Музыка» и «Работа» есть и в сетке ниже — просто убеждаемся, что не пропали.
    expect(within(container).getAllByText("Музыка").length).toBeGreaterThan(0);
  });

  it("в en-локали без английского имени остаётся русское из каталога", () => {
    renderPreview("en", [card("music", "Музыка", null)]);

    expect(within(featuredRow()).getByText("Музыка")).toBeInTheDocument();
  });
});
