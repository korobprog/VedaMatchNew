import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_COOKIE_NAME, ThemeProvider, THEME_STORAGE_KEY } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

function mockSystemTheme(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("theme toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom shares document.cookie across tests in this file; clear it so the
    // migration effect doesn't see a cookie written by a previous test.
    document.cookie = `${THEME_COOKIE_NAME}=; path=/; max-age=0`;
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preference");
  });

  it("follows the device preference until the reader picks a theme", async () => {
    mockSystemTheme(true);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(screen.getByRole("radio", { name: "Как в системе" })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "Светлая" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themePreference).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("restores the stored preference over the device preference", async () => {
    // Simulates a returning visitor whose cookie hasn't been set yet (e.g. an
    // older localStorage-only session): the provider migrates it post-mount.
    mockSystemTheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Светлая" })).toBeChecked(),
    );
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
