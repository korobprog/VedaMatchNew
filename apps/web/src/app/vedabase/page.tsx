import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";
import { getVedabaseLibrary } from "@/lib/vedabase-api";
import { profileMaterialFilters } from "@/lib/material-filters";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { LibraryShelf } from "@/components/vedabase/shelf/library-shelf";

export default async function VedabasePage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/vedabase");

  const library = await getVedabaseLibrary();
  if (!library) redirectToLogin("/vedabase");

  // Полка начинает с «Фильтров материалов» портала; дальше выбор — на ней.
  const filters = profileMaterialFilters(user);

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <LibraryShelf
        userId={user.id}
        books={library.books}
        initialFilters={{ stages: filters.stages, lineages: filters.lineages }}
        stage={user.spiritualStage ?? null}
      />
    </div>
  );
}
