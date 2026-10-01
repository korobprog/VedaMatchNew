import type { NextConfig } from "next";
import { join } from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  /**
   * Защитные заголовки на каждый ответ. CSP здесь намеренно нет: без nonce
   * она сломает инлайн-скрипты Next и вводится отдельной задачей.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
  turbopack: {
    root: join(__dirname, "../.."),
  },
  /**
   * Справочник людей переехал из сервиса «Контакты» в «Общение». Старые
   * адреса раздавались ссылками в письмах и уведомлениях, поэтому ведут на
   * новое место постоянным редиректом, а не в 404.
   */
  async redirects() {
    return [
      { source: "/contacts", destination: "/chat/people", permanent: true },
      {
        source: "/contacts/:path*",
        destination: "/chat/people/:path*",
        permanent: true,
      },
      {
        source: "/admin/contacts",
        destination: "/admin/chat/people",
        permanent: true,
      },
      {
        source: "/admin/contacts/:path*",
        destination: "/admin/chat/people/:path*",
        permanent: true,
      },
      // www → апекс. Канонический адрес портала всегда без www: одна и та же
      // страница по двум адресам делит поисковый вес и ломает cookie, которые
      // выставлены на конкретный хост.
      //
      // Правило дремлет, пока хост не заведён в Dokploy: Traefik просто не
      // маршрутизирует такой Host и отдаёт 404, до приложения запрос не
      // доходит. Поэтому его безопасно выкладывать заранее.
      //
      // statusCode вместо permanent: `permanent: true` даёт 308, а для смены
      // адреса нужен именно 301 — его понимают все, включая старые клиенты.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.vedamatch.com" }],
        destination: "https://vedamatch.com/:path*",
        statusCode: 301,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.vedamatch.ru" }],
        destination: "https://vedamatch.ru/:path*",
        statusCode: 301,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
