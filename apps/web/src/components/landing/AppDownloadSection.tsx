"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FolderDown,
  LogIn,
  Plus,
  RefreshCcw,
  Send,
  Share,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import type { AppManifest } from "@/lib/app-download";
import { formatApkSizeMb, formatBuildDate } from "@/lib/app-download";
import { resolveDownloadDevice, type DownloadDevice } from "@/lib/app-download-device";
import { InstallButton } from "@/components/pwa/install-button";
import { cn } from "@/lib/utils";

/**
 * Секция установки приложения (VED-176): Android — прямой APK с сайта,
 * iPhone/iPad — PWA через Safari. Живёт и урезанной (`variant="embed"`) на
 * обеих витринах (`LandingPage`, `VaishnavaLandingPage`), и в полный рост на
 * `/app` (`variant="full"`).
 *
 * Без данных манифеста (`manifest === null`) карточка Android честно
 * говорит «скоро» вместо мёртвой ссылки — первая публикация ещё не прошла
 * либо хранилище ненадолго недоступно (см. `lib/app-download-api.ts`).
 *
 * Никакой анимации входа: только hover-переходы на обычных Tailwind-классах,
 * которые уже гасит глобальное правило `prefers-reduced-motion` в
 * `globals.css` — своей логики уважения `prefers-reduced-motion` здесь не
 * требуется.
 */
export function AppDownloadSection({
  manifest,
  variant = "embed",
  showTelegram = false,
}: {
  manifest: AppManifest | null;
  variant?: "embed" | "full";
  /**
   * Хост запроса — контур `vedamatch.com`: там включён вход через Telegram,
   * и кнопка «Открыть в Telegram» имеет смысл. На `vedamatch.ru` пропуск не
   * передаётся (или передаётся `false`) — кнопки не будет вовсе.
   */
  showTelegram?: boolean;
}) {
  const [device, setDevice] = useState<DownloadDevice | null>(null);
  const [androidStepsOpen, setAndroidStepsOpen] = useState(false);
  const [iosStepsOpen, setIosStepsOpen] = useState(false);
  const [checksumOpen, setChecksumOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    // Обёрнуто во вложенную функцию — тот же приём, что в use-install-prompt:
    // определение устройства требует navigator, доступного только в браузере.
    function resolve() {
      setDevice(resolveDownloadDevice(window.navigator.userAgent));
    }
    resolve();
  }, []);

  useEffect(() => {
    if (variant !== "full" || device !== "desktop") return;
    let cancelled = false;
    void QRCode.toString(`${window.location.origin}/app`, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then((svg) => {
      if (!cancelled) setQrSvg(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [variant, device]);

  const HeadingTag = variant === "full" ? "h1" : "h2";

  return (
    <section
      id="app-download"
      aria-labelledby="app-download-heading"
      className="relative py-20 md:py-28"
    >
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="mb-12 text-center md:mb-16">
          <HeadingTag
            id="app-download-heading"
            className={cn(
              "font-display font-bold text-text-0",
              variant === "full"
                ? "text-3xl md:text-4xl lg:text-5xl mb-4"
                : "text-2xl md:text-3xl mb-3",
            )}
          >
            {variant === "full" ? "Приложение VedaMatch" : "Установите приложение"}
          </HeadingTag>
          <p className="mx-auto max-w-2xl text-lg text-text-1">
            Быстрый доступ с главного экрана телефона — без магазина
            приложений. Android ставится файлом прямо с сайта, iPhone и iPad —
            через Safari, в один приём.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <AndroidCard
            manifest={manifest}
            highlighted={device === "android"}
            stepsOpen={androidStepsOpen}
            onToggleSteps={() => setAndroidStepsOpen((v) => !v)}
            checksumOpen={checksumOpen}
            onToggleChecksum={() => setChecksumOpen((v) => !v)}
          />
          <IosCard
            highlighted={device === "ios"}
            stepsOpen={iosStepsOpen}
            onToggleSteps={() => setIosStepsOpen((v) => !v)}
          />
        </div>

        {/* Веб-версия приложения (ios.vedamatch.com) — не PWA сайта из
            карточки выше, а сама Expo-сборка в браузере: звонки, лента и
            уведомления как в нативном приложении, без App Store. Гостю с
            iPhone/iPad показываем сразу; на полной странице `/app` — всем,
            даже с десктопа, чтобы ссылку можно было переслать себе на
            телефон. */}
        {(device === "ios" || variant === "full") && (
          <IPhoneAppBlock showTelegram={showTelegram} />
        )}

        {variant === "full" && device === "desktop" && (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-text-1">
              На компьютере? Откройте эту страницу на телефоне — камерой по
              QR-коду или по ссылке{" "}
              <span className="font-mono text-text-0">vedamatch.ru/app</span>.
            </p>
            {qrSvg && (
              <div
                className="w-40 rounded-xl bg-white p-3"
                // Код рисуется в браузере библиотекой qrcode (see
                // travel/stay-qr-dialog.tsx) — своего разметочного текста в
                // SVG нет, только геометрия кода.
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CardShell({
  highlighted,
  accent,
  children,
}: {
  highlighted: boolean;
  accent: "magenta" | "cyan";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-2xl border p-6 md:p-8 glass transition-colors duration-300",
        highlighted
          ? accent === "magenta"
            ? "border-magenta/60 shadow-[0_0_24px_rgba(255,62,158,0.25)]"
            : "border-cyan/60 shadow-[0_0_24px_rgba(35,240,199,0.2)]"
          : "border-glass-brd",
      )}
    >
      {children}
    </div>
  );
}

function AndroidCard({
  manifest,
  highlighted,
  stepsOpen,
  onToggleSteps,
  checksumOpen,
  onToggleChecksum,
}: {
  manifest: AppManifest | null;
  highlighted: boolean;
  stepsOpen: boolean;
  onToggleSteps: () => void;
  checksumOpen: boolean;
  onToggleChecksum: () => void;
}) {
  return (
    <CardShell highlighted={highlighted} accent="magenta">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-glass-brd bg-glass text-magenta">
          <Smartphone className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="font-display text-xl font-bold text-text-0">Android</h3>
      </div>

      {manifest ? (
        <>
          <a
            href={manifest.url}
            rel="noopener"
            aria-label={`Скачать APK VedaMatch, версия ${manifest.versionName}, ${formatApkSizeMb(manifest.sizeBytes)}`}
            className={cn(
              "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 py-3",
              "bg-gradient-to-r from-magenta to-[#B23EFF] text-base font-semibold text-white",
              "transition-transform duration-300 hover:-translate-y-0.5",
            )}
          >
            <Download className="h-5 w-5" aria-hidden="true" />
            Скачать APK
          </a>
          <p className="mt-3 text-sm text-text-2">
            Версия {manifest.versionName} · {formatApkSizeMb(manifest.sizeBytes)}{" "}
            · {formatBuildDate(manifest.builtAt)}
          </p>
          <button
            type="button"
            aria-expanded={checksumOpen}
            aria-controls="apk-checksum"
            onClick={onToggleChecksum}
            className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-text-1 underline decoration-dotted underline-offset-4 transition-colors hover:text-text-0"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", checksumOpen && "rotate-180")}
              aria-hidden="true"
            />
            Проверить файл
          </button>
          {checksumOpen && (
            <p
              id="apk-checksum"
              className="mt-2 break-all rounded-lg border border-glass-brd bg-bg-1/60 p-3 font-mono text-xs text-text-2"
            >
              SHA-256: {manifest.sha256}
            </p>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-glass-brd p-4 text-sm text-text-1">
          Скоро: собираем первую сборку для сайта. Актуальный статус —
          на странице «Обновления».
        </div>
      )}

      <button
        type="button"
        aria-expanded={stepsOpen}
        aria-controls="android-install-steps"
        onClick={onToggleSteps}
        className="mt-5 inline-flex min-h-11 items-center gap-1 text-left text-sm font-medium text-text-0"
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", stepsOpen && "rotate-180")}
          aria-hidden="true"
        />
        Как установить
      </button>
      {stepsOpen && (
        <ol id="android-install-steps" className="mt-3 space-y-3 text-sm text-text-1">
          <li className="flex items-start gap-3">
            <Download className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>Нажмите «Скачать APK» выше</span>
          </li>
          <li className="flex items-start gap-3">
            <FolderDown className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>Откройте файл из уведомления о загрузке или из папки «Загрузки»</span>
          </li>
          <li className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>
              Если телефон спросит — разрешите установку из этого браузера
              («Настройки → Установка неизвестных приложений»)
            </span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>
              Если Play Защита предупредит — «Подробнее → Всё равно
              установить»: приложение не из магазина, поэтому Google не может
              его заранее проверить
            </span>
          </li>
          <li className="flex items-start gap-3">
            <LogIn className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>Откройте VedaMatch и войдите тем же аккаунтом, что на сайте</span>
          </li>
          <li className="flex items-start gap-3">
            <RefreshCcw className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>
              Новые версии приложение позже предложит само; пока — скачивайте
              их здесь же
            </span>
          </li>
        </ol>
      )}
    </CardShell>
  );
}

function IosCard({
  highlighted,
  stepsOpen,
  onToggleSteps,
}: {
  highlighted: boolean;
  stepsOpen: boolean;
  onToggleSteps: () => void;
}) {
  return (
    <CardShell highlighted={highlighted} accent="cyan">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-glass-brd bg-glass text-cyan">
          <Smartphone className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="font-display text-xl font-bold text-text-0">iPhone и iPad</h3>
      </div>

      <button
        type="button"
        aria-expanded={stepsOpen}
        aria-controls="ios-install-steps"
        onClick={onToggleSteps}
        className={cn(
          "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 py-3",
          "border border-glass-brd text-base font-semibold text-text-0",
          "transition-colors duration-300 hover:border-cyan/50",
        )}
      >
        <Share className="h-5 w-5" aria-hidden="true" />
        Установить с сайта
      </button>
      <p className="mt-3 text-sm text-text-2">
        Через Safari, без App Store — приложение из магазина появится позже.
      </p>

      {stepsOpen && (
        <ol id="ios-install-steps" className="mt-4 space-y-3 text-sm text-text-1">
          <li className="flex items-start gap-3">
            <Share className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>Откройте vedamatch.ru в Safari и нажмите «Поделиться» внизу экрана</span>
          </li>
          <li className="flex items-start gap-3">
            <Plus className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>Выберите «На экран „Домой“»</span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            <span>Нажмите «Добавить» — значок появится рядом с обычными приложениями</span>
          </li>
        </ol>
      )}

      {/* В браузерах, где системный диалог реально доступен (Chrome/Samsung на
          Android, если гость всё же открыл эту карточку не с iPhone), кнопка
          не рендерится вовсе — компонент сам решает по режиму установки. */}
      <InstallButton className="mt-4" />
    </CardShell>
  );
}

function IPhoneAppBlock({ showTelegram }: { showTelegram: boolean }) {
  return (
    <div className="mt-6 rounded-2xl border border-glass-brd glass p-6 md:p-8">
      <h3 className="font-display text-xl font-bold text-text-0">
        VedaMatch для iPhone
      </h3>
      <p className="mt-2 max-w-2xl text-sm text-text-1">
        Полная веб-версия приложения — те же чаты, звонки и уведомления, что
        в мобильном приложении, прямо в Safari, без App Store. Откройте её и
        добавьте на экран «Домой»: «Поделиться» → «На экран „Домой“» — дальше
        запускается одним нажатием, как обычное приложение.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a
          href="https://ios.vedamatch.com"
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3",
            "bg-gradient-to-r from-magenta to-[#B23EFF] text-base font-semibold text-white",
            "transition-transform duration-300 hover:-translate-y-0.5",
          )}
        >
          <ExternalLink className="h-5 w-5" aria-hidden="true" />
          Открыть веб-версию
        </a>
        {showTelegram && (
          <a
            href="https://t.me/vedamatch_bot"
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3",
              "border border-glass-brd text-base font-semibold text-text-0",
              "transition-colors duration-300 hover:border-cyan/50",
            )}
          >
            <Send className="h-5 w-5" aria-hidden="true" />
            Открыть в Telegram
          </a>
        )}
      </div>
    </div>
  );
}
