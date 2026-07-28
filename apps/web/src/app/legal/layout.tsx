import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/** Общая рамка правовых документов: доступна и гостям, и авторизованным. */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-24">
        <article className="glass rounded-2xl border border-glass-brd p-6 md:p-10">
          {children}
        </article>
        <nav className="mt-6 flex flex-wrap gap-6 text-sm text-text-2">
          <Link href="/legal/privacy" className="hover:text-text-0">
            Политика конфиденциальности
          </Link>
          <Link href="/legal/terms" className="hover:text-text-0">
            Пользовательское соглашение
          </Link>
          <Link href="/support" className="hover:text-text-0">
            Поддержка
          </Link>
        </nav>
      </main>
    </div>
  );
}
