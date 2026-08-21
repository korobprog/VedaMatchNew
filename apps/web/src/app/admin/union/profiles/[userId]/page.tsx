import Link from "next/link";
import { notFound } from "next/navigation";
import { UnionAdminTabs } from "@/components/union/admin/admin-tabs";
import { UnionProfileVisibilityForm } from "@/components/union/admin/profile-visibility-form";
import { intentionLabels } from "@/components/union/labels";
import { formatDate, stageLabels } from "@/lib/admin-labels";
import { getUnionAdminProfile } from "@/lib/union-api";

export const metadata = {
  title: "Анкета знакомств",
  robots: { index: false, follow: false },
};

const CONTACT_MODE: Record<string, string> = {
  requests: "заявки от всех",
  mutual_only: "только взаимные симпатии",
};

const FORMAT: Record<string, string> = {
  online: "онлайн",
  offline: "очно",
  any: "неважно",
};

export default async function AdminUnionProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const profile = await getUnionAdminProfile(userId);
  if (!profile) notFound();

  return (
    <>
      <UnionAdminTabs active="profiles" />

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-text-0">
            {profile.name}
          </h2>
          <p className="mt-0.5 text-sm text-text-2">{profile.email}</p>
        </div>
        <Link
          href={`/admin/users/${profile.userId}`}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0"
        >
          Карточка аккаунта
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section title="Анкета">
            <Field label="О себе" value={profile.about} multiline />
            <Field label="Статус" value={profile.status} />
            <Field label="Семейное положение" value={profile.familyStatus} />
            <Field label="Формат" value={FORMAT[profile.format] ?? profile.format} />
            <Field label="Языки" value={profile.languages.join(", ")} />
            <Field label="Интересы" value={profile.interests.join(", ")} />
            <Field label="Ценности" value={profile.values.join(", ")} />
            <Field label="Навыки" value={profile.skills.join(", ")} />
            <Field
              label="Цели"
              value={profile.intentions
                .map(
                  (intention) =>
                    `${intentionLabels[intention.type]} — ${intention.weight}%`,
                )
                .join(", ")}
            />
          </Section>

          <Section title="Настройки">
            <Field
              label="Кто может писать"
              value={CONTACT_MODE[profile.contactMode] ?? profile.contactMode}
            />
            <Field
              label="Только подтверждённые преданные"
              value={profile.requestsFromVerifiedOnly ? "да" : "нет"}
            />
            <Field
              label="Приватность"
              value={
                profile.privacy
                  ? Object.entries(profile.privacy)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(" · ")
                  : null
              }
            />
          </Section>

          <Section title="Активность">
            <Field
              label="Просмотрено анкет"
              value={String(profile.activity.swipesMade)}
            />
            <Field
              label="Получено симпатий"
              value={String(profile.activity.likesReceived)}
            />
            <Field
              label="Заявок отправлено / получено"
              value={`${profile.activity.requestsSent} / ${profile.activity.requestsReceived}`}
            />
            <Field
              label="Знакомств состоялось"
              value={String(profile.activity.matches)}
            />
            <Field
              label="Сообщений написано"
              value={String(profile.activity.messagesSent)}
            />
          </Section>
        </div>

        <aside className="space-y-6">
          <UnionProfileVisibilityForm
            userId={profile.userId}
            isActive={profile.isActive}
          />

          <div className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
            <h2 className="mb-2 font-display font-semibold text-text-0">
              Коротко
            </h2>
            <p>Этап: {profile.spiritualStage ? stageLabels[profile.spiritualStage] : "—"}</p>
            <p>Город: {profile.city ?? "—"}</p>
            <p>Фотографий: {profile.photosCount}</p>
            <p>Открытых жалоб: {profile.openReports}</p>
            {profile.accountBlocked && <p>Аккаунт закрыт администрацией</p>}
            <p className="mt-2 text-text-2">
              Был в сети: {formatDate(profile.lastSeenAt)}
            </p>
            <p className="text-text-2">
              Анкета создана: {formatDate(profile.createdAt)}
            </p>
          </div>

          {profile.openReports > 0 && (
            <p className="text-sm text-text-1">
              <Link
                href="/admin/reports"
                className="underline underline-offset-2 hover:text-text-0"
              >
                Открыть жалобы на этого человека
              </Link>
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <h2 className="mb-3 font-display font-semibold text-text-0">{title}</h2>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-sm text-text-2">{label}</dt>
      <dd
        className={`text-sm text-text-0 ${multiline ? "whitespace-pre-line" : ""}`}
      >
        {value && value.length > 0 ? value : "—"}
      </dd>
    </div>
  );
}
