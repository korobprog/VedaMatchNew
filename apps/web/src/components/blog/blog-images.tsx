import type { BlogImageDto } from "@vedamatch/shared";

/**
 * Картинки поста. Крупно и первым делом — по чек-листу VED-238.
 *
 * Одна картинка идёт во всю ширину со своей пропорцией (обрезка по 4:3
 * срезала бы вертикальные снимки с телефона, а их большинство), несколько —
 * сеткой из квадратов, как в Instagram: ряд разной высоты читается как
 * поломка вёрстки.
 *
 * `compact` — для вложенной карточки под репостом: там снимок во весь экран
 * оттесняет слова того, кто переслал, за нижний край.
 */
export function BlogImages({
  images,
  alt,
  compact = false,
}: {
  images: BlogImageDto[];
  alt?: string | null;
  compact?: boolean;
}) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    const image = images[0];
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image.url}
        alt={alt ?? ""}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        className={`w-full bg-bg-2 object-cover ${
          compact ? "max-h-72 rounded-lg" : "max-h-[70vh]"
        }`}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
      {images.map((image) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={image.id}
          src={image.url}
          alt={alt ?? ""}
          className="aspect-square w-full bg-bg-2 object-cover"
        />
      ))}
    </div>
  );
}
