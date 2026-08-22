import { PeopleAdminTabs } from "@/components/chat/people/admin/admin-tabs";
import { PeopleTagEditor } from "@/components/chat/people/admin/tag-editor";
import { getContactsAdminStats, getContactsAdminTags } from "@/lib/api";

export const metadata = {
  title: "Общение: люди — теги",
  robots: { index: false, follow: false },
};

export default async function AdminContactsPage() {
  const [stats, tags] = await Promise.all([
    getContactsAdminStats(),
    getContactsAdminTags(),
  ]);

  return (
    <>
      <PeopleAdminTabs active="tags" />

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Карточек в справочнике" value={stats.profiles.active} />
          <Tile label="Сняты администрацией" value={stats.profiles.pending} />
          <Tile label="Скрыты самими" value={stats.profiles.hidden} />
          <Tile label="Обращений ждут ответа" value={stats.requests.pending} />
        </div>
      )}

      <p className="mb-4 max-w-3xl text-sm text-text-1">
        Теги — то, по чему справочник ищут. Системные приезжают сидом: их можно
        переименовать и переставить, но не удалить — вернутся при следующем
        запуске. Заведённые здесь удаляются вместе со связями на карточках.
      </p>

      <PeopleTagEditor tags={tags ?? []} />
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      <p className="font-mono text-2xl font-semibold text-text-0">{value}</p>
      <p className="mt-1 text-sm text-text-1">{label}</p>
    </div>
  );
}
