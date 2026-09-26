"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BlogFrame } from "./blog-carousel";
import { blogFrameFit } from "./blog-media-list";

/**
 * Снимок в рамке его собственной пропорции (VED-527: без полей нигде).
 *
 * Пропорцию берём из размеров вложения, а где их нет — у обложки материала,
 * отправленного в ленту из Образования (VED-490), размеров не бывает — из
 * самого снимка, когда он загрузится. Раньше такая обложка вписывалась в
 * квадрат и обрастала сиреневыми полями сверху и снизу.
 */
export function BlogFitImage({
  src,
  alt,
  width,
  height,
  lazy = false,
  className = "",
  maxHeight,
  children,
}: {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  lazy?: boolean;
  className?: string;
  maxHeight?: string;
  /** Поверх снимка: значок ролика и т.п. */
  children?: ReactNode;
}) {
  const known =
    width && height && width > 0 && height > 0 ? width / height : null;
  const [natural, setNatural] = useState<number | null>(null);
  const ref = useRef<HTMLImageElement>(null);

  const measure = (img: HTMLImageElement | null) => {
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNatural(img.naturalWidth / img.naturalHeight);
    }
  };
  // Снимок из кэша мог загрузиться раньше гидратации — `load` тогда уже был.
  useEffect(() => {
    if (ref.current?.complete) measure(ref.current);
  }, [src]);

  const { aspect, crop } = blogFrameFit(natural ?? known);
  return (
    <BlogFrame aspect={aspect} className={className} maxHeight={maxHeight}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        width={width ?? undefined}
        height={height ?? undefined}
        loading={lazy ? "lazy" : undefined}
        onLoad={(event) => measure(event.currentTarget)}
        className={`size-full ${crop ? "object-cover" : "object-contain"}`}
      />
      {children}
    </BlogFrame>
  );
}
