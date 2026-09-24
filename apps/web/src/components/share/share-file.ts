/**
 * Картинка для историй и статусов (VED-156).
 *
 * «Отправить в приложение» не срабатывало на телефоне по двум причинам.
 * Картинку качали уже после нажатия, а системная шторка открывается, только
 * пока браузер помнит жест: на мобильной сети загрузка выходила за это окно,
 * и `navigator.share` отказывал. И файл назывался `.jpg`, хотя внутри лежал
 * webp — часть приложений такой файл не берёт. Теперь картинку готовим сразу
 * при открытии экрана и отдаём JPEG: его принимают все истории и статусы.
 */

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Имя файла для шторки и сохранения: понятное человеку в «Загрузках» и с
 * расширением, совпадающим с содержимым.
 */
export function shareFileName(path: string, type: string): string {
  const segments = path.split("?")[0]!.split("/").filter(Boolean);
  // `/m/<slug>/story` — последним идёт вид картинки, осмысленное имя — слаг.
  const meaningful =
    segments.find((part) => part.length > 8) ?? segments.at(-1);
  const base = (meaningful ?? "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const extension =
    EXTENSIONS[type.split(";")[0]!.trim().toLowerCase()] ?? "jpg";
  return `vedamatch-${base || "card"}.${extension}`;
}

/**
 * Перевести картинку в JPEG. Если браузер не умеет — отдать как есть:
 * лучше webp, чем ничего.
 */
export async function toJpeg(blob: Blob): Promise<Blob> {
  if (blob.type === "image/jpeg") return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return blob;
    // У JPEG нет прозрачности: без подложки прозрачные места станут чёрными.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    return jpeg ?? blob;
  } catch {
    return blob;
  }
}

/** Где сейчас картинка для «Отправить в приложение». */
export type FilePrepare = "loading" | "ready" | "failed";

/**
 * Может ли это окно отдать файл системной шторке. Chrome на Android умеет;
 * встроенные окна приложений (Telegram, ВКонтакте) и десктопный Firefox — нет:
 * там `navigator.share` либо отсутствует, либо отказывает файлам.
 */
export function canShareFiles(
  nav: Pick<Navigator, "share" | "canShare"> | undefined,
  file: File | null,
): boolean {
  if (!nav || typeof nav.share !== "function") return false;
  // Без `canShare` проверить заранее нечем — пробуем, ошибку поймает вызов.
  if (typeof nav.canShare !== "function") return true;
  if (!file) return true;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Встроенный браузер Telegram: в нём шторки нет, и человеку надо сказать,
 * как выйти в обычный браузер.
 */
export function isTelegramWebView(
  userAgent: string,
  win?: { TelegramWebviewProxy?: unknown; Telegram?: unknown },
): boolean {
  return (
    /Telegram/i.test(userAgent) ||
    Boolean(win?.TelegramWebviewProxy) ||
    Boolean(win?.Telegram)
  );
}

/**
 * Что показывает кнопка «Отправить в приложение» (VED-156, дописка
 * заказчика: «сделай какой-нибудь индикатор ожидания, чтобы было понятно что
 * надо подождать и человек не тыкал в эту кнопку по 10 раз»).
 *
 * `busy` — крутится индикатор и повторные нажатия ничего не делают.
 */
export function shareButtonState(input: {
  prepare: FilePrepare;
  sharing: boolean;
  /** Окно умеет отдавать файлы в приложения; `false` — известно, что нет. */
  supported?: boolean;
}): { label: string; busy: boolean; ready: boolean } {
  if (input.sharing)
    return { label: "Открываем приложения…", busy: true, ready: false };
  if (input.prepare === "loading")
    return { label: "Готовим картинку…", busy: true, ready: false };
  /* VED-414: картинка готова — кнопка меняется заметно, толстой цветной
     рамкой, а не только исчезнувшим значком ожидания. Если окно файлы не
     отдаёт или приготовить не вышло, звать к кнопке нечестно. */
  return {
    label: "Отправить в приложение",
    busy: false,
    ready: input.prepare === "ready" && input.supported !== false,
  };
}

/** Подсказка, когда отдать файл в приложение из этого окна нельзя. */
export function unsupportedShareMessage(telegram: boolean): string {
  return telegram
    ? "Во встроенном браузере Telegram отправить картинку в приложение нельзя. Сохраните её кнопкой «Сохранить картинку» или откройте страницу в Chrome: ⋮ → «Открыть в браузере»."
    : "Этот браузер не умеет отдавать картинку в приложения. Сохраните её кнопкой «Сохранить картинку» и выложите из галереи.";
}

/**
 * Три качества «Сохранить картинку» (VED-156, дописка от 23.09: «размер
 * изображения значительно уменьшился. Сделай 3 кнопки сохранить изображение
 * в разном качестве, чтобы когда нужно хорошее качество можно было его
 * получить»).
 *
 * Экран портальный и сам файлов не собирает: сервис, отдавший `file`,
 * сообщает, что его адрес понимает `?q=light|standard|max` (параметр
 * `fileQualities=1` у `/share`). Без этого кнопка одна, как раньше.
 *
 * Оценки веса — по замерам на иллюстрациях с прода (кадр 1080×1920):
 * лёгкий JPEG 280–390 КБ, хороший 480–680 КБ, PNG 2,4–2,9 МБ. Картинки с
 * надписью легче. Точный вес кнопка показывает, когда файл уже получен.
 */
export type SaveQuality = "light" | "standard" | "max";

export const SAVE_OPTIONS: ReadonlyArray<{
  quality: SaveQuality;
  title: string;
  hint: string;
  estimate: string;
}> = [
  {
    quality: "light",
    title: "Лёгкое",
    hint: "Быстро грузится. Его же получает «Отправить в приложение»",
    estimate: "≈\u00a00,4\u00a0МБ",
  },
  {
    quality: "standard",
    title: "Хорошее",
    hint: "Чётче буквы и цвета",
    estimate: "≈\u00a00,7\u00a0МБ",
  },
  {
    quality: "max",
    title: "Максимум",
    hint: "Без сжатия, PNG — для печати и большого экрана",
    estimate: "≈\u00a03\u00a0МБ",
  },
];

/** Адрес файла в нужном качестве: лёгкое — прежний адрес без параметра. */
export function qualityFilePath(file: string, quality: SaveQuality): string {
  if (quality === "light") return file;
  const separator = file.includes("?") ? "&" : "?";
  return `${file}${separator}q=${quality}`;
}

const QUALITY_SUFFIX: Record<SaveQuality, string> = {
  light: "",
  standard: "-hq",
  max: "-max",
};

/**
 * Имя сохранённого файла: у трёх качеств одной картинки разные имена, иначе
 * телефон допишет «(1)» и не понять, какой файл какой. Лёгкое — прежнее имя.
 */
export function qualityFileName(
  file: string,
  type: string,
  quality: SaveQuality,
): string {
  const name = shareFileName(file, type);
  const dot = name.lastIndexOf(".");
  return `${name.slice(0, dot)}${QUALITY_SUFFIX[quality]}${name.slice(dot)}`;
}

/**
 * Вес файла по-русски: «430 КБ», «2,8 МБ». Пробел неразрывный — число не
 * отрывается от единицы при переносе.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024)
    return `${Math.max(1, Math.round(bytes / 1024))}\u00a0КБ`;
  const mb = bytes / (1024 * 1024);
  const value = mb < 10 ? mb.toFixed(1) : String(Math.round(mb));
  return `${value.replace(".", ",")}\u00a0МБ`;
}

/** Где сейчас файл одного качества. */
export type SavePhase = "idle" | "loading" | "saved" | "failed";

/**
 * Что показывает кнопка качества справа: индикатор, отметку о сохранении
 * или вес. Пока файла нет — оценка, после получения — точный вес.
 */
export function saveOptionState(input: {
  phase: SavePhase;
  size: number | null;
  estimate: string;
}): { note: string; busy: boolean; saved: boolean } {
  if (input.phase === "loading")
    return { note: "Готовим…", busy: true, saved: false };
  const size = input.size !== null ? formatFileSize(input.size) : input.estimate;
  if (input.phase === "saved")
    return { note: `✓ Сохранено · ${size}`, busy: false, saved: true };
  return { note: size, busy: false, saved: false };
}
