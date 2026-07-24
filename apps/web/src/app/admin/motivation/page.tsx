import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MotivationAdminControls } from "@/components/motivation/motivation-admin-controls";
import { MotivationAdminWatchlists } from "@/components/motivation/motivation-admin-watchlists";
import { getProfile } from "@/lib/api";
import {
  getAdminMotivationAuthorWatches,
  getAdminMotivationPosts,
  getAdminMotivationSourceWatches,
} from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function AdminMotivationPage() {
  const [user, posts, authors, sources] = await Promise.all([
    getProfile(),
    getAdminMotivationPosts(),
    getAdminMotivationAuthorWatches(),
    getAdminMotivationSourceWatches(),
  ]);
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "service-admin") redirect("/");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <h1 className="font-display text-3xl font-bold text-text-0">Управление motivation</h1>
        <p className="mt-2 max-w-3xl text-text-1">
          Сначала проверьте точную цитату и пояснение. Изображение создаётся только после одобрения текста и требует отдельного подтверждения перед публикацией.
        </p>
        <MotivationAdminWatchlists authors={authors} sources={sources} />
        <MotivationAdminControls posts={posts} />
      </main>
    </div>
  );
}
