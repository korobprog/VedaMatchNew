import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  AssistantLinkCard,
  PortalSearchResponse,
} from "@vedamatch/shared";
import {
  formatFoundCount,
  PortalSearchGroupCount,
  PortalSearchTotal,
  portalSearchTotal,
} from "./portal-search-count";

const card = (title: string): AssistantLinkCard => ({
  kind: "link",
  service: "library",
  title,
  subtitle: null,
  body: null,
  imageUrl: null,
  href: "/library/entry/1",
});

const cards = (count: number) =>
  Array.from({ length: count }, (_, index) => card(`Материал ${index}`));

function response(
  overrides: Partial<PortalSearchResponse> = {},
): PortalSearchResponse {
  return {
    query: "радха",
    groups: [
      { service: "library", items: cards(2), more: false },
      { service: "music", items: cards(5), more: true },
    ],
    unavailable: [],
    total: 7,
    more: true,
    ...overrides,
  };
}

describe("formatFoundCount", () => {
  it("число без плюса, когда показано всё", () => {
    expect(formatFoundCount(12)).toBe("12");
    expect(formatFoundCount(12, false)).toBe("12");
  });

  it("с плюсом, когда нашлось больше показанного", () => {
    expect(formatFoundCount(5, true)).toBe("5+");
  });
});

describe("portalSearchTotal", () => {
  it("берёт total и more из ответа", () => {
    expect(portalSearchTotal(response())).toEqual({ count: 7, more: true });
  });

  it("ответ без total считается по группам", () => {
    expect(
      portalSearchTotal(response({ total: undefined, more: undefined })),
    ).toEqual({ count: 7, more: true });
    expect(
      portalSearchTotal(
        response({
          total: undefined,
          more: undefined,
          groups: [{ service: "library", items: cards(3) }],
        }),
      ),
    ).toEqual({ count: 3, more: false });
  });
});

describe("PortalSearchTotal", () => {
  it("«Найдено: N» в вежливой живой области", () => {
    render(
      <PortalSearchTotal
        result={response({
          total: 3,
          more: false,
          groups: [{ service: "library", items: cards(3), more: false }],
        })}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/^Найдено: 3$/);
  });

  it("при неполном счёте — «N+» и пояснение", () => {
    render(<PortalSearchTotal result={response()} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Найдено: 7+");
    expect(status).toHaveTextContent("первые пять");
  });
});

describe("PortalSearchGroupCount", () => {
  it("число раздела", () => {
    const { container } = render(<PortalSearchGroupCount count={2} />);
    expect(container).toHaveTextContent(/^Найдено: 2$/);
  });

  it("раздел, где нашлось больше пяти", () => {
    const { container } = render(<PortalSearchGroupCount count={5} more />);
    expect(container).toHaveTextContent(/^Найдено: 5\+$/);
  });
});
