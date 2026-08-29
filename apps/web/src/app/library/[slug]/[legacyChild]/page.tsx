import { permanentRedirect } from "next/navigation";

/**
 * Старые двухуровневые адреса `/library/<раздел>/<категория>`.
 *
 * Разделов больше нет, а слаг рубрики теперь уникален глобально, поэтому
 * второй сегмент сам по себе и есть новый адрес. 301, а не 404: ссылки на
 * рубрики уже разошлись по чатам и закладкам.
 */
export default async function LegacyLibraryCategoryRedirect({
  params,
}: {
  params: Promise<{ legacyChild: string }>;
}) {
  const { legacyChild } = await params;
  permanentRedirect(`/library/${legacyChild}`);
}
