import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { PortalPreview } from "./PortalPreview";

/**
 * Указатель в макете портала.
 *
 * В jsdom нет `IntersectionObserver`, и компонент по этому признаку считает
 * себя видимым и крутит ролик всегда — то, что в браузере приходится ловить
 * прокруткой, здесь есть с первого рендера.
 *
 * Проверяем именно фигуру: у пальца и у прежней стрелки нет ни роли, ни
 * подписи — макет целиком `aria-hidden`, и зацепиться больше не за что.
 */
const ПАЛЕЦ = "M9 11.24";
const СТРЕЛКА = "M6 3.4";

const формы = (container: HTMLElement) =>
  [...container.querySelectorAll("svg path")].map(
    (path) => path.getAttribute("d") ?? "",
  );

describe("указатель макета портала", () => {
  it("ведёт ролик пальцем, а не стрелкой мыши", () => {
    // Ролики лендинга идут друг за другом на одной странице: разные
    // указатели читаются как разные интерфейсы вместо одного портала.
    const { container } = render(
      <NextIntlClientProvider locale="ru" messages={{}}>
        <PortalPreview />
      </NextIntlClientProvider>,
    );

    const пути = формы(container);
    expect(пути.some((d) => d.startsWith(ПАЛЕЦ))).toBe(true);
    expect(пути.some((d) => d.startsWith(СТРЕЛКА))).toBe(false);
  });
});
