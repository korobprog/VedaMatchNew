import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { AdminChangelogReleases } from "@/components/admin-changelog-releases";
import { AdminChangelogAnnouncements } from "@/components/admin-changelog-announcements";
import { AdminChangelogRoadmap } from "@/components/admin-changelog-roadmap";
import {
  getAdminAnnouncements,
  getAdminReleases,
  getAdminRoadmap,
  getProfile,
} from "@/lib/api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function AdminChangelogPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/changelog");
  if (user.role !== "admin") redirect("/");

  const [releases, announcements, roadmap] = await Promise.all([
    getAdminReleases(),
    getAdminAnnouncements(),
    getAdminRoadmap(),
  ]);
  if (!releases || !announcements || !roadmap) {
    throw new Error("Не удалось загрузить данные страницы «Версия и новости»");
  }

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24 space-y-10">
        <h1 className="font-display text-2xl font-bold text-text-0">
          Версия и новости
        </h1>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            Релизы
          </h2>
          <AdminChangelogReleases releases={releases} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            Новости
          </h2>
          <AdminChangelogAnnouncements announcements={announcements} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            Roadmap
          </h2>
          <AdminChangelogRoadmap items={roadmap} />
        </section>
      </main>
    </div>
  );
}
