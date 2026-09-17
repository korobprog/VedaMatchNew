import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppManifest } from "@/lib/app-download";
import { AppDownloadSection } from "./AppDownloadSection";

// use-install-prompt читает navigator/matchMedia в эффекте — в jsdom без
// подмены он просто не покажет кнопку InstallButton (mode "unsupported"),
// что и нужно этому тесту: секция не должна зависеть от неё.
vi.mock("@/components/pwa/install-button", () => ({
  InstallButton: () => null,
}));

const DEFAULT_UA = window.navigator.userAgent;
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  setUserAgent(DEFAULT_UA);
});

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

  it("shows the iPhone web-app block to iPhone guests even in the embed variant", () => {
    setUserAgent(IOS_UA);
    render(<AppDownloadSection manifest={null} variant="embed" />);

    const link = screen.getByRole("link", { name: /Открыть веб-версию/ });
    expect(link).toHaveAttribute("href", "https://ios.vedamatch.com");
  });

  it("hides the iPhone web-app block from non-iPhone guests in the embed variant", () => {
    render(<AppDownloadSection manifest={null} variant="embed" />);

    expect(
      screen.queryByRole("link", { name: /Открыть веб-версию/ }),
    ).not.toBeInTheDocument();
  });

  it("always shows the iPhone web-app block on the full page, regardless of device", () => {
    render(<AppDownloadSection manifest={null} variant="full" />);

    expect(
      screen.getByRole("link", { name: /Открыть веб-версию/ }),
    ).toBeInTheDocument();
  });

  it("hides the Telegram button unless the .com contour asked for it", () => {
    render(<AppDownloadSection manifest={null} variant="full" />);

    expect(
      screen.queryByRole("link", { name: /Открыть в Telegram/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the Telegram button on the .com contour", () => {
    render(<AppDownloadSection manifest={null} variant="full" showTelegram />);

    const link = screen.getByRole("link", { name: /Открыть в Telegram/ });
    expect(link).toHaveAttribute("href", "https://t.me/vedamatch_bot");
  });
});
