import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import type { BlogPostLinkDto } from "@vedamatch/shared";

/**
 * Материал другого сервиса, отправленный в ленту (VED-490): «В Блог-ленту»
 * в Образовании. Обложка — вместо карусели (своих фото у такого поста нет),
 * под текстом — ссылка на сам материал.
 *
 * Адрес на портале открывается у нас же, внешний — в новой вкладке.
 */
export function BlogPostLinkCover({
  link,
  alt,
}: {
  link: BlogPostLinkDto;
  alt: string | null;
}) {
  if (!link.imageUrl) return null;
  return (
    <LinkTo url={link.url} className="block">
      {/* Обложка чужого сервиса: адрес любой, размеры неизвестны — next/image
          тут только мешал бы. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={link.imageUrl}
        alt={alt ?? ""}
        loading="lazy"
        className="max-h-96 w-full bg-bg-1 object-cover"
      />
    </LinkTo>
  );
}

export function BlogPostLinkButton({
  link,
  className = "",
}: {
  link: BlogPostLinkDto;
  className?: string;
}) {
  return (
    <LinkTo
      url={link.url}
      className={`flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd px-3 text-sm text-text-1 transition-colors hover:border-cyan/60 hover:text-text-0 ${className}`}
    >
      <BookOpen aria-hidden className="size-4 shrink-0 text-cyan" />
      <span className="min-w-0 flex-1 truncate">
        {link.label ? `Открыть в разделе «${link.label}»` : "Открыть материал"}
      </span>
      <ArrowUpRight aria-hidden className="size-4 shrink-0" />
    </LinkTo>
  );
}

function LinkTo({
  url,
  className,
  children,
}: {
  url: string;
  className: string;
  children: React.ReactNode;
}) {
  if (url.startsWith("/")) {
    return (
      <Link href={url} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
