import Link from "next/link";
import { Iris } from "./Iris";
import { SERVICE_CONTENT } from "@/lib/service-content";

export function Footer() {
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
                {service.name}
              </Link>
            ))}
            <Link href="/support" className="hover:text-text-0 transition-colors">
              Поддержка
            </Link>
            <Link href="/updates" className="hover:text-text-0 transition-colors">
              Что нового
            </Link>
            <Link href="/legal/privacy" className="hover:text-text-0 transition-colors">
              Политика конфиденциальности
            </Link>
            <Link href="/legal/terms" className="hover:text-text-0 transition-colors">
              Пользовательское соглашение
            </Link>
          </nav>

          {/* Copyright */}
          <p className="text-text-2 text-sm">© 2026 VedaMatch. Все права защищены.</p>
        </div>
      </div>
    </footer>
  );
}
