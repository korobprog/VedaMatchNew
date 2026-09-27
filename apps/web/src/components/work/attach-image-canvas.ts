import {
  ATTACH_IMAGE_QUALITY,
  shouldShrinkImage,
  shrunkImageName,
  shrunkImageSize,
  smallerImage,
} from "./attach-image";

/**
 * Ужать картинку вложения в браузере (VED-582). Любой сбой — старый браузер,
 * битый файл, нехватка памяти — не ошибка загрузки: уходит исходный файл, и
 * сервер ужмёт его сам, как раньше. Расчёты — в `attach-image.ts`.
 */
export async function shrinkImageForUpload(file: File): Promise<File> {
  if (!shouldShrinkImage(file)) return file;
  if (typeof createImageBitmap !== "function") return file;
  try {
    // EXIF-поворот применяется здесь же: фото с телефона не ляжет на бок.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    try {
      const size = shrunkImageSize(bitmap.width, bitmap.height);
      if (!size) return file;
      const blob = await encode(bitmap, size);
      if (!blob) return file;
      const shrunk = new File([blob], shrunkImageName(file.name, blob.type), {
        type: blob.type,
        lastModified: file.lastModified,
      });
      return smallerImage(file, shrunk);
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

/**
 * WebP, а где браузер его не пишет (старый Safari отдаёт PNG) — JPEG на белой
 * подложке: прозрачное в JPEG иначе становится чёрным. Белый здесь — пиксели
 * файла, а не цвет интерфейса, поэтому не токен темы.
 */
async function encode(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
): Promise<Blob | null> {
  const webp = await draw(bitmap, size, "image/webp", false);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await draw(bitmap, size, "image/jpeg", true);
  return jpeg?.type === "image/jpeg" ? jpeg : null;
}

function draw(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  type: string,
  opaque: boolean,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  if (opaque) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size.width, size.height);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return new Promise((resolve) =>
    canvas.toBlob(resolve, type, ATTACH_IMAGE_QUALITY),
  );
}
