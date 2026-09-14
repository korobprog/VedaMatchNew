/**
 * Обложка материала целиком (VED-138). Раньше картинка обрезалась под 16:9, и
 * у баннера катхи пропадали края с надписью. Теперь кадр вписывается в рамку
 * полностью, а поля вокруг занимает размытая копия — тот же приём, что у кадров
 * в ленте Вдохновения (VED-124). Рамка остаётся 16:9, чтобы лента не прыгала,
 * пока картинка грузится.
 */
export function CoverPicture({
  src,
  alt,
  lazy = false,
}: {
  src: string;
  alt: string;
  lazy?: boolean;
}) {
  const loading = lazy ? "lazy" : undefined;
  return (
    <span className="relative block aspect-video w-full overflow-hidden bg-bg-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- обложка лежит в нашем S3 */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading={loading}
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- обложка лежит в нашем S3 */}
      <img
        src={src}
        alt={alt}
        loading={loading}
        className="relative h-full w-full object-contain"
      />
    </span>
  );
}
