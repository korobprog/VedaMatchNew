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
