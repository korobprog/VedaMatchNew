import Link from "next/link";
import Image from "next/image";
import type { UserProfile } from "@vedamatch/shared";
import { LogoutButton } from "./logout-button";

export function Header({ user }: { user: UserProfile }) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center"
          aria-label="VedaMatch"
        >
          <Image
            src="/logo_tilak.png"
            alt="VedaMatch"
            width={64}
            height={64}
            priority
            className="h-10 w-10 rounded-xl object-contain sm:h-12 sm:w-12"
          />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/self-identification"
            className="rounded-full border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 sm:text-sm dark:border-amber-900 dark:text-amber-200 dark:hover:bg-amber-950"
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
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden text-sm font-medium text-zinc-700 sm:inline dark:text-zinc-300">
              {user.name}
            </span>
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
