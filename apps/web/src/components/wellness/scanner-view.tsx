"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import type { WellnessScanResult } from "@vedamatch/shared";
import {
  createWellnessProduct,
  recognizeWellnessLabel,
  scanWellness,
  WellnessApiError,
} from "@/lib/wellness-api";
import { AddToBasket } from "./add-to-basket";
import { OffAttribution } from "./off-attribution";
import { fileToScanImage } from "./scan-image";
import { VerdictCard } from "./verdict-card";
import { hasSomethingToJudge } from "./verdict-labels";

/**
 * Сканер у полки. Три пути, и ни один не обязателен:
 *
 * 1. Камера со штрихкодом — быстрый путь там, где браузер умеет
 *    `BarcodeDetector`.
 * 2. Снимок состава — когда код стёрт, смят или его нет вовсе.
 * 3. Ввод цифр руками — обязательный запасной: в Safari на iOS нет
 *    `BarcodeDetector`, и без него сервис остался бы недоступен половине
 *    телефонов.
 */
type Mode = "camera" | "photo" | "manual";

interface DetectedCode {
  rawValue: string;
}

interface BarcodeReader {
  detect(source: HTMLVideoElement): Promise<DetectedCode[]>;
}

/** Возможности браузера не меняются по ходу жизни страницы — подписки нет. */
function subscribeToNothing(): () => void {
  return () => {};
}

function barcodeReader(): BarcodeReader | null {
  const ctor = (
    window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => BarcodeReader;
    }
  ).BarcodeDetector;
  if (!ctor) return null;
  return new ctor({
    formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
  });
}

export function ScannerView() {
  const [mode, setMode] = useState<Mode>("manual");
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<WellnessScanResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Есть ли вообще камера. Через `useSyncExternalStore`, а не через эффект:
  // серверный снимок `false` даёт ту же разметку, что и первый клиентский
  // рендер, и гидрация не расходится.
  //
  // Проверяем камеру, а не `BarcodeDetector`: нативного детектора нет в Safari
  // на iOS, и раньше половина телефонов вкладки «Камера» не видела вовсе.
  // Теперь там подхватывается ZXing.
  const hasCamera = useSyncExternalStore(
    subscribeToNothing,
    () => Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const send = useCallback(async (body: Parameters<typeof scanWellness>[0]) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await scanWellness(body));
    } catch (cause) {
      setError(
        cause instanceof WellnessApiError
          ? cause.message
          : "Не удалось проверить продукт",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setError(
        "Камера недоступна. Введите цифры под штрихкодом или снимите состав.",
      );
      setMode("manual");
    }
  }, []);

  // Поиск кода в кадре. Нативный детектор — раз в 400 мс: чаще не нужно, а
  // батарею в магазине человек тратит не на нас. Где его нет, тот же кадр
  // читает ZXing — он грузится только здесь, чтобы не тащить wasm на все
  // страницы портала.
  useEffect(() => {
    if (mode !== "camera" || !cameraReady) return;
    let stopped = false;
    let timer = 0;
    let controls: { stop: () => void } | null = null;

    const found = (value: string) => {
      if (stopped || !value) return;
      stopped = true;
      window.clearInterval(timer);
      controls?.stop();
      stopCamera();
      void send({ kind: "barcode", barcode: value });
    };

    const native = barcodeReader();
    if (native) {
      timer = window.setInterval(() => {
        const video = videoRef.current;
        if (stopped || !video || video.readyState < 2) return;
        void native
          .detect(video)
          .then(([hit]) => found(hit?.rawValue ?? ""))
          .catch(() => {
            // Кадр не прочитался — это норма, ждём следующий.
          });
      }, 400);
    } else {
      void import("@zxing/browser")
        .then(async ({ BrowserMultiFormatReader }) => {
          const video = videoRef.current;
          if (stopped || !video) return;
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromVideoElement(video, (result) => {
            if (result) found(result.getText());
          });
          if (stopped) controls.stop();
        })
        .catch(() => {
          setError(
            "Не удалось запустить распознавание кода. Снимите состав или введите цифры.",
          );
        });
    }

    return () => {
      stopped = true;
      window.clearInterval(timer);
      controls?.stop();
    };
  }, [mode, cameraReady, send, stopCamera]);

  const onPhoto = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const image = await fileToScanImage(file);
        const { ingredientsRaw } = await recognizeWellnessLabel(image);
        if (!ingredientsRaw) {
          setError(
            "На снимке не видно состава. Снимите ближе ту часть упаковки, где написано «Состав».",
          );
          return;
        }
        await send({ kind: "photo", ingredientsRaw });
      } catch (cause) {
        setError(
          cause instanceof WellnessApiError
            ? cause.message
            : "Не удалось прочитать снимок",
        );
      } finally {
        setBusy(false);
      }
    },
    [send],
  );

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Способ проверки" className="flex gap-2">
        {hasCamera && (
          <ModeButton
            active={mode === "camera"}
            onClick={() => {
              setMode("camera");
              void startCamera();
            }}
          >
            Камера
          </ModeButton>
        )}
        <ModeButton
          active={mode === "photo"}
          onClick={() => {
            stopCamera();
            setMode("photo");
          }}
        >
          Снимок состава
        </ModeButton>
        <ModeButton
          active={mode === "manual"}
          onClick={() => {
            stopCamera();
            setMode("manual");
          }}
        >
          Ввести цифры
        </ModeButton>
      </div>

      {mode === "camera" && (
        <div className="overflow-hidden rounded-2xl border border-glass-brd bg-bg-2">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-[4/3] w-full object-cover"
          />
          <p className="px-4 py-3 text-sm text-text-1">
            Наведите камеру на штрихкод. Если код стёрт — снимите состав.
          </p>
        </div>
      )}

      {mode === "photo" && (
        <div className="rounded-2xl border border-glass-brd bg-glass p-4">
          <label
            htmlFor="wellness-label-photo"
            className="block text-sm font-medium text-text-0"
          >
            Снимок той части упаковки, где написан состав
          </label>
          <p className="mt-1 text-sm text-text-1">
            Подходит, когда штрихкода нет или он не читается. Со снимка мы
            читаем только буквы — решение принимает наш справочник.
          </p>
          <input
            id="wellness-label-photo"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            className="mt-3 block w-full text-sm text-text-1 file:mr-3 file:rounded-xl file:border file:border-glass-brd file:bg-bg-1 file:px-4 file:py-2 file:text-sm file:text-text-0"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onPhoto(file);
              event.target.value = "";
            }}
          />
        </div>
      )}

      {mode === "manual" && (
        <form
          className="rounded-2xl border border-glass-brd bg-glass p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (manual.trim()) void send({ kind: "barcode", barcode: manual });
          }}
        >
          <label
            htmlFor="wellness-barcode"
            className="block text-sm font-medium text-text-0"
          >
            Цифры под штрихкодом
          </label>
          <input
            id="wellness-barcode"
            inputMode="numeric"
            autoComplete="off"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="4600000000000"
            className="mt-2 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 font-mono text-text-0"
          />
          <button
            type="submit"
            disabled={busy || !manual.trim()}
            className="mt-3 rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0 disabled:opacity-50"
          >
            Проверить
          </button>
        </form>
      )}

      {busy && (
        <p role="status" className="text-sm text-text-1">
          Читаем состав…
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      )}

      {result && (
        <ScanOutcome
          result={result}
          onPhotoRequested={() => {
            stopCamera();
            setMode("photo");
          }}
        />
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm ${
        active ? "border-magenta text-text-0" : "border-glass-brd text-text-1"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Продукта может не оказаться — на старте база пуста, и это главный путь, а не
 * ошибка. Поэтому «не нашли» не извиняется, а ведёт к снимку состава и дальше
 * к пополнению базы: иначе она никогда не наполнится.
 */
function ScanOutcome({
  result,
  onPhotoRequested,
}: {
  result: WellnessScanResult;
  onPhotoRequested: () => void;
}) {
  return (
    <div className="space-y-4">
      {result.product ? (
        <div className="rounded-2xl border border-glass-brd bg-glass p-4">
          <h2 className="font-display text-lg font-bold text-text-0">
            {result.product.name}
          </h2>
          {result.product.brand && (
            <p className="text-sm text-text-1">{result.product.brand}</p>
          )}
          <p className="mt-2 text-sm text-text-1">
            {result.product.ingredientsRaw}
          </p>
          {result.product.source === "openfoodfacts" && (
            <OffAttribution barcode={result.product.barcode} />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <AddToBasket productId={result.product.id} />
            <Link
              href={`/wellness/products/${result.product.barcode}`}
              className="text-sm text-cyan underline"
            >
              Карточка продукта
            </Link>
          </div>
        </div>
      ) : (
        result.kind === "barcode" && (
          <div className="rounded-2xl border border-glass-brd bg-glass p-4">
            <p className="text-sm text-text-0">
              Этого продукта пока нет ни в нашей базе, ни в открытой базе Open
              Food Facts.
            </p>
            <p className="mt-1 text-sm text-text-1">
              Снимите состав с упаковки — мы прочитаем его и заодно пополним
              базу для остальных.
            </p>
            <button
              type="button"
              onClick={onPhotoRequested}
              className="mt-3 rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0"
            >
              Снять состав
            </button>
          </div>
        )
      )}

      {hasSomethingToJudge(result) && <VerdictCard result={result.result} />}

      {!result.product && result.ingredientsRaw && (
        <SaveProduct
          barcode={result.barcode}
          ingredientsRaw={result.ingredientsRaw}
        />
      )}
    </div>
  );
}

/**
 * Пополнение базы. Штрихкод берётся из предыдущего скана: без него состав
 * останется в истории одного человека и никому больше не поможет.
 */
function SaveProduct({
  barcode,
  ingredientsRaw,
}: {
  barcode: string | null;
  ingredientsRaw: string;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(barcode ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    return (
      <p
        role="status"
        className="rounded-2xl border border-glass-brd px-4 py-3 text-sm text-cyan"
      >
        Спасибо. Продукт ушёл на проверку — после неё его увидят все.
      </p>
    );
  }

  return (
    <form
      className="rounded-2xl border border-glass-brd p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        void createWellnessProduct({ barcode: code, name, ingredientsRaw })
          .then(() => setSaved(true))
          .catch((cause) =>
            setError(
              cause instanceof WellnessApiError
                ? cause.message
                : "Не удалось сохранить",
            ),
          );
      }}
    >
      <p className="font-display text-base font-bold text-text-0">
        Добавить продукт в базу
      </p>
      <p className="mt-1 text-sm text-text-1">
        Состав уже прочитан. Назовите продукт — и остальные найдут его по
        штрихкоду.
      </p>

      <label
        htmlFor="save-product-name"
        className="mt-3 block text-sm font-medium text-text-0"
      >
        Название с упаковки
      </label>
      <input
        id="save-product-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />

      <label
        htmlFor="save-product-barcode"
        className="mt-3 block text-sm font-medium text-text-0"
      >
        Цифры под штрихкодом
      </label>
      <input
        id="save-product-barcode"
        inputMode="numeric"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 font-mono text-sm text-text-0"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={name.trim().length < 2 || code.trim().length < 8}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0 disabled:opacity-50"
        >
          Отправить на проверку
        </button>
        {error && (
          <span role="alert" className="text-sm text-magenta">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
