"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Iris } from "./Iris";
import { useServiceNames } from "@/components/service-catalog-provider";
import { SERVICE_CONTENT } from "@/lib/service-content";

export function Footer() {
  const t = useTranslations("Landing.footer");
  const names = useServiceNames();
  return (
    <footer className="relative py-12 border-t border-glass-brd">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <Iris size={32} />
            <span className="font-display text-lg font-bold text-text-0">VedaMatch</span>
          </Link>

          {/* Links */}
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-text-1 text-sm">
            {SERVICE_CONTENT.map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="hover:text-text-0 transition-colors"
              >
                {names(service.slug, service.name)}
              </Link>
            ))}
            <Link href="/support" className="hover:text-text-0 transition-colors">
              {t("support")}
            </Link>
            <Link href="/team" className="hover:text-text-0 transition-colors">
              {t("team")}
            </Link>
            <Link href="/updates" className="hover:text-text-0 transition-colors">
              {t("whatsNew")}
            </Link>
            <Link href="/legal/privacy" className="hover:text-text-0 transition-colors">
              {t("privacy")}
            </Link>
            <Link href="/legal/terms" className="hover:text-text-0 transition-colors">
              {t("terms")}
            </Link>
          </nav>

          {/* Copyright */}
          <p className="text-text-2 text-sm">{t("copyright", { year: 2026 })}</p>
        </div>
      </div>
    </footer>
  );
}
