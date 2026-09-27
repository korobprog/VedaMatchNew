import Link from "next/link";

/**
 * «← Каталог» на странице исполнителя.
 *
 * Своей строки у ссылки нет (VED-530): она висит над строкой имени и имя не
 * теснит (VED-535). С VED-588 — в левом поле, где «назад» ищут глазами, а
 * не в правом углу. Отступ `left-2` плюс `px-2` у самой ссылки выравнивает
 * стрелку по краю обложки под ней (`px-4` у `<main>`), на широком экране —
 * так же с `md:px-6`.
 *
 * Без хуков и без "use client": её рисует серверная страница.
 */
export function MusicCatalogBackLink() {
  return (
    <Link
      href="/music"
      className="absolute left-2 top-0 inline-flex min-h-9 items-center gap-1.5 px-2 text-sm text-text-2 hover:text-text-0 md:left-4"
    >
      <span aria-hidden="true">←</span> Каталог
    </Link>
  );
}
