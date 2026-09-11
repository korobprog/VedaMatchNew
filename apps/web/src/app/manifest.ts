import type { MetadataRoute } from "next";

/**
 * Быстрое меню по долгому нажатию на значок установленного приложения
 * (VED-78). Chrome на Android показывает только ТРИ первых пункта, поэтому
 * порядок здесь и есть выбор, какие сервисы открываются одним жестом; на
 * компьютере видны все.
 *
 * Значки у каждого пункта: без них Android пункт может не показать вовсе.
 * Рисует их scripts/generate-shortcut-icons.mjs из значков сетки сервисов —
 * новый пункт добавлять в оба списка.
 */
const SHORTCUTS = [
  { slug: "motivation", name: "Вдохновение", url: "/motivation" },
  { slug: "music", name: "Музыка", url: "/music" },
  { slug: "library", name: "Образование", url: "/library" },
  { slug: "chat", name: "Общение", url: "/chat" },
  { slug: "vedabase", name: "Библиотека", url: "/vedabase" },
  { slug: "union", name: "Знакомства", url: "/union" },
  { slug: "work", name: "Работа", url: "/work" },
  { slug: "notices", name: "Объявления", url: "/notices" },
] as const;

const SHORTCUT_ICON_SIZES = [96, 192] as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "VedaMatch",
    short_name: "VedaMatch",
    description: "Единый вход во все сервисы VedaMatch",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FBF9FF",
    theme_color: "#FBF9FF",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: SHORTCUTS.map(({ slug, name, url }) => ({
      name,
      short_name: name,
      url,
      icons: SHORTCUT_ICON_SIZES.map((size) => ({
        src: `/icons/shortcuts/${slug}-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
      })),
    })),
  };
}
