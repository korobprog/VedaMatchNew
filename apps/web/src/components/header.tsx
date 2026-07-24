import Link from "next/link";
import Image from "next/image";
import type { UserProfile } from "@vedamatch/shared";
import { LogoutButton } from "./logout-button";

export function Header({ user }: { user: UserProfile }) {
  return (
    <header className="sticky top-0 z-50 glass border-b border-glass-brd safe-top">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center"
          aria-label="VedaMatch"
        >
          <Image
            src="/logo_tilak.png"
            alt="VedaMatch"
            width={48}
            height={48}
            priority
            className="h-10 w-10 rounded-xl object-contain sm:h-12 sm:w-12"
          />
        </Link>
        <div className="flex items-center gap-3">
          {user.role === "admin" && (
            <Link
              href="/admin/users"
              className="rounded-full border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0 hover:border-magenta/50 transition-colors"
            >
              Админ
            </Link>
          )}
          {(user.role === "admin" || user.role === "service-admin") && (
            <Link href="/admin/motivation" className="rounded-full border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0 hover:border-cyan/50 transition-colors">Motivation</Link>
          )}
          <Link
            href="/self-identification"
            className="rounded-full border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0 hover:border-gold/50 transition-colors"
          >
            <span className="sm:hidden">Опрос</span>
            <span className="hidden sm:inline">Самоидентификация</span>
          </Link>
          <Link href="/profile" className="flex items-center gap-2">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-9 w-9 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-glass text-sm font-semibold text-text-0">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden text-sm font-medium text-text-1 sm:inline">
              {user.name}
            </span>
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
