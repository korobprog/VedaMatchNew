import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginCard } from "./login-card";

describe("LoginCard", () => {
  it("рисует кнопку на каждый включённый способ", () => {
    render(<LoginCard providers={["google", "yandex"]} />);

    expect(screen.getByRole("link", { name: /Google/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Яндекс/ })).toBeInTheDocument();
  });

  it("не рисует выключенный способ", () => {
    render(<LoginCard providers={["google"]} />);

    expect(screen.queryByRole("link", { name: /Яндекс/ })).not.toBeInTheDocument();
  });

  it("сохраняет порядок, заданный сервером", () => {
    render(<LoginCard providers={["yandex", "google"]} />);

    const labels = screen
      .getAllByRole("link")
      .map((node) => node.textContent ?? "")
      .filter((text) => /Google|Яндекс/.test(text));
    expect(labels[0]).toMatch(/Яндекс/);
  });

  it("уносит returnTo в адрес входа", () => {
    render(<LoginCard providers={["google"]} returnTo="/union" />);

    expect(screen.getByRole("link", { name: /Google/ })).toHaveAttribute(
      "href",
      expect.stringContaining("returnTo=%2Funion"),
    );
  });

  it("без включённых способов говорит об этом, а не молчит", () => {
    render(<LoginCard providers={[]} />);

    expect(screen.getByText(/Вход временно недоступен/)).toBeInTheDocument();
  });
});
