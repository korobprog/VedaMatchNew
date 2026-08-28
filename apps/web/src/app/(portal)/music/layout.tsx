import type { ReactNode } from "react";
import { MusicFavoritesProvider } from "@/components/music/favorites-provider";

/**
 * Раздел Музыки. Оболочка нужна ровно ради одного: списка отмеченного —
 * он читается один раз на весь раздел, а не карточкой на каждую плитку.
 *
 * Провайдер не оборачивает портал целиком намеренно: за пределами Музыки
 * сердец нет, и держать там лишний запрос и лишний контекст незачем. Кнопка
 * сердца без провайдера просто не рисуется.
 */
export default function MusicLayout({ children }: { children: ReactNode }) {
  return <MusicFavoritesProvider>{children}</MusicFavoritesProvider>;
}
