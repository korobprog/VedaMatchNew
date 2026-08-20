import Link from "next/link";
import { redirect } from "next/navigation";
import type { MotivationReelDto, MotivationReelStage } from "@vedamatch/shared";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { splitQuoteAndExplanation } from "@/components/motivation/quote-text";
import { getProfile } from "@/lib/api";
import { getMotivationCurrentEvent, getMyMotivationReels } from "@/lib/motivation-api";
import { PostcardButton } from "@/components/motivation/postcard-button";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

const stageLabels: Record<MotivationReelStage, { text: string; tone: string }> = {
  ai_review: { text: "Проверка", tone: "bg-magenta/10 text-magenta border-magenta/40" },
  admin_review: { text: "Ждёт администратора", tone: "bg-gold/10 text-gold border-gold/40" },
  rejected: { text: "Отклонён", tone: "bg-magenta/10 text-magenta border-magenta/40" },
  generating: { text: "Рисуем картинку", tone: "bg-magenta/10 text-magenta border-magenta/40" },
  image_review: { text: "Кадр на проверке", tone: "bg-gold/10 text-gold border-gold/40" },
  failed: { text: "Сбой генерации", tone: "bg-magenta/10 text-magenta border-magenta/40" },
  published: { text: "Опубликован", tone: "bg-cyan/10 text-cyan border-cyan/40" },
};

export default async function MyReelsPage() {
  const [user, reels, event] = await Promise.all([
    getProfile(),
    getMyMotivationReels(),
    getMotivationCurrentEvent(),
  ]);
  if (!user) redirectToLogin("/motivation/my");
  if (!user.spiritualStage) redirect("/self-identification");
  const isAdmin = user.role === "admin" || user.role === "service-admin";
  const items = reels ?? [];

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-2 py-4 pb-24 sm:px-4">
        <MotivationTopBar
          active="studio"
          isAdmin={isAdmin}
          title="Студия"
          action={{ href: "/motivation/create", label: "+ Создать" }}
        />
        {items.length === 0 ? (
          <div className="glass mt-4 rounded-2xl p-8 text-center text-text-1">
            <p className="font-display text-lg text-text-0">В студии пока пусто</p>
            <p className="mt-2 text-sm">Создайте первый: своя мысль или фрагмент из книги — и картинка к нему.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((reel) => (
              <li key={reel.id} className="space-y-2">
                <ReelCard reel={reel} />
                {reel.stage === "published" && (
                  <div className="pl-1">
                    <PostcardButton postId={reel.post.id} event={event} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function ReelCard({ reel }: { reel: MotivationReelDto }) {
  const { quote } = splitQuoteAndExplanation(reel.post.text);
  const label = stageLabels[reel.stage];
  const href =
    reel.stage === "published"
      ? `/motivation?post=${reel.post.slug}`
      : `/motivation/create?reel=${reel.id}`;
  return (
    <Link href={href} className="glass flex gap-4 rounded-2xl p-4 transition hover:bg-glass">
      {reel.post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={reel.post.imageUrl} alt="" className="h-24 w-20 flex-none rounded-xl object-cover" />
      ) : (
        <div aria-hidden="true" className="h-24 w-20 flex-none rounded-xl bg-bg-2" />
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${label.tone}`}>{label.text}</span>
          <span className="text-xs text-text-2">
            {new Date(reel.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
          </span>
          {reel.post.sourceVerified && <span className="text-xs text-cyan">источник проверен</span>}
        </div>
        <p className="line-clamp-3 font-display text-sm text-text-0">{quote}</p>
        {reel.stage === "rejected" && reel.reason && <p className="mt-1 line-clamp-2 text-xs text-text-1">{reel.reason}</p>}
        {/* Реквизиты живут в мастере: здесь только повод туда зайти. */}
        {reel.fundingNotice && (
          <p className="mt-1 line-clamp-2 text-xs text-gold">Генерация приостановлена — нужна поддержка</p>
        )}
      </div>
    </Link>
  );
}
