import type { AnnouncementImageDto } from "@vedamatch/shared";

/**
 * Картинки новости (VED-137). Каждая открывается целиком в новой вкладке:
 * к новостям прикладывают скриншоты, и мелкий текст на них читают, увеличив.
 *
 * Размеры из базы задают пропорции заранее, чтобы текст новости не прыгал,
 * пока картинка грузится. Одна картинка — во всю ширину, несколько — плиткой
 * по две: шесть скриншотов подряд заняли бы несколько экранов.
 */
export function NewsImages({
  images,
  title,
  limit,
}: {
  images: AnnouncementImageDto[];
  /** Для подписи картинок скринридеру. */
  title: string;
  /** Показать только первые N; остальные — в полном тексте новости. */
  limit?: number;
}) {
  const shown = limit ? images.slice(0, limit) : images;
  if (shown.length === 0) return null;
  const single = shown.length === 1;
  return (
    <ul className={`grid gap-2 ${single ? "grid-cols-1" : "grid-cols-2"}`}>
      {shown.map((image, index) => (
        <li key={image.url}>
          <a
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-glass-brd bg-bg-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- картинка лежит в нашем S3 */}
            <img
              src={image.url}
              alt={
                images.length === 1
                  ? `Картинка к новости «${title}»`
                  : `Картинка ${index + 1} к новости «${title}»`
              }
              width={image.width}
              height={image.height}
              loading="lazy"
              className={`h-auto w-full ${single ? "max-h-96 object-contain" : "aspect-[4/3] object-cover"}`}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
