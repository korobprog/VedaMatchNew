import type { BlogMediaDto } from "@vedamatch/shared";
import { BlogCarousel, BlogFrame } from "./blog-carousel";
import { BlogFitImage } from "./blog-fit-image";
import { blogMediaAspect, formatBlogDuration } from "./blog-media-list";

/**
 * Фото и ролики поста в развороте (VED-238, VED-116).
 *
 * Снимок — во всю ширину карточки и целиком, без обрезки: «сделай, чтобы
 * картинку было видно полностью» (чек-лист VED-238). Рамка берёт пропорцию
 * первого вложения в границах 4:5…1,91:1, остальное вписывается в неё — как
 * в карусели Instagram, где у всех слайдов одна высота.
 *
 * Ролик играет прямо в ленте штатным плеером браузера: `preload="none"` —
 * лента из двенадцати постов не должна тянуть мегабайты видео, пока их
 * никто не включил, а до нажатия видна обложка, снятая сервером.
 */
export function BlogMedia({
  media,
  alt,
  compact = false,
}: {
  media: BlogMediaDto[];
  alt?: string | null;
  /** Вложенная карточка репоста: не выше 18rem, чтобы не оттеснять слова. */
  compact?: boolean;
}) {
  if (media.length === 0) return null;

  /* Каждое вложение — в рамке своей пропорции, без полей (VED-527): раньше
     все слайды брали рамку первого, и снимок другой формы обрастал полями.
     Высота карусели садится по видимому слайду (`fitHeight`, VED-443). */
  const slide = (
    entry: BlogMediaDto,
    index: number,
    frame: { className?: string; maxHeight?: string } = {},
  ) =>
    entry.kind === "video" ? (
      <BlogFrame key={entry.id} aspect={blogMediaAspect(entry)} {...frame}>
        <BlogVideo video={entry} index={index} />
      </BlogFrame>
    ) : (
      <BlogFitImage
        key={entry.id}
        src={entry.url}
        alt={alt ?? ""}
        width={entry.width}
        height={entry.height}
        lazy={index > 0}
        {...frame}
      />
    );

  if (compact) {
    return slide(media[0], 0, { className: "rounded-lg", maxHeight: "18rem" });
  }

  if (media.length === 1) return slide(media[0], 0);

  return (
    <BlogCarousel
      count={media.length}
      label={`Вложения поста: ${media.length}`}
      dots
      focusable
      fitHeight
      renderSlide={(index) => slide(media[index], index)}
    />
  );
}

function BlogVideo({ video, index }: { video: BlogMediaDto; index: number }) {
  const duration = formatBlogDuration(video.durationSec);
  return (
    <>
      <video
        src={video.url}
        poster={video.posterUrl ?? undefined}
        controls
        playsInline
        preload="none"
        aria-label={
          duration ? `Ролик ${index + 1}, ${duration}` : `Ролик ${index + 1}`
        }
        className="size-full bg-bg-2 object-contain"
      />
      {duration && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-2 rounded-full bg-bg-0/85 px-2 py-0.5 font-mono text-[11px] font-semibold text-text-0"
        >
          {duration}
        </span>
      )}
    </>
  );
}
