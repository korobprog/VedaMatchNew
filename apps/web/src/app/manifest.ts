import type { MetadataRoute } from "next";

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
    shortcuts: [
      { name: "Библиотека", short_name: "Библиотека", url: "/vedabase" },
      { name: "Знакомства", short_name: "Знакомства", url: "/union" },
    ],
  };
}
