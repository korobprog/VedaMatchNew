"use client";

import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { Iris } from "@/components/landing/Iris";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      
      <div className="glass relative z-10 w-full max-w-sm rounded-3xl border border-glass-brd p-8 text-center">
        <div className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-bg-2 flex items-center justify-center">
          <Iris size={64} glow />
        </div>
        
        <h1 className="font-display text-2xl font-bold text-text-0 mb-2">
          VedaMatch
        </h1>
        <p className="mb-8 text-sm text-text-1">
          Единый вход во все сервисы экосистемы
        </p>
        
        <a
          href={`${API_URL}/auth/google`}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white/10 border border-glass-brd py-3 text-sm font-medium text-text-0 transition hover:bg-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
            />
          </svg>
          Войти через Google
        </a>
      </div>
    </div>
  );
}
