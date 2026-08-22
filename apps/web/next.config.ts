import type { NextConfig } from "next";
import { join } from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
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
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
