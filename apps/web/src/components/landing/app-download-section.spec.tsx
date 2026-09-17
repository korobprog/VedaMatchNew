import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppManifest } from "@/lib/app-download";
import { AppDownloadSection } from "./AppDownloadSection";

// use-install-prompt читает navigator/matchMedia в эффекте — в jsdom без
// подмены он просто не покажет кнопку InstallButton (mode "unsupported"),
// что и нужно этому тесту: секция не должна зависеть от неё.
vi.mock("@/components/pwa/install-button", () => ({
  InstallButton: () => null,
}));

const MANIFEST: AppManifest = {
  versionName: "0.2.0+abc1234",
  versionCode: 21042,
  sizeBytes: 44 * 1024 * 1024,
  sha256: "a".repeat(64),
  url: "https://cdn.example.com/mobile/android/ru-site/vedamatch-0.2.0-21042.apk",
  commit: "abc1234",
  builtAt: "2026-09-17T12:00:00.000Z",
  minAndroid: "7.0",
};

describe("AppDownloadSection", () => {
  it("shows a real download link with version, size and date when the manifest is present", () => {
    render(<AppDownloadSection manifest={MANIFEST} />);

    const link = screen.getByRole("link", { name: /Скачать APK/ });
    expect(link).toHaveAttribute("href", MANIFEST.url);
    expect(screen.getByText(/0\.2\.0\+abc1234/)).toBeInTheDocument();
    expect(screen.getByText(/44,0 МБ/)).toBeInTheDocument();
  });

  it("hides the checksum until the disclosure is opened", async () => {
    render(<AppDownloadSection manifest={MANIFEST} />);

    expect(screen.queryByText(/SHA-256/)).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Проверить файл/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/SHA-256/)).toBeInTheDocument();
  });

  it("shows a friendly placeholder instead of a dead link when there is no manifest yet", () => {
    render(<AppDownloadSection manifest={null} />);

    expect(screen.queryByRole("link", { name: /Скачать APK/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Скоро/)).toBeInTheDocument();
  });

  it("always offers the iOS install instructions regardless of the manifest", async () => {
    render(<AppDownloadSection manifest={null} />);

    const toggle = screen.getByRole("button", { name: /Установить с сайта/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/На экран „Домой“/)).toBeInTheDocument();
  });

  it("uses an h1 heading only in the full page variant", () => {
    const { unmount } = render(<AppDownloadSection manifest={null} variant="embed" />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    unmount();

    render(<AppDownloadSection manifest={null} variant="full" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
