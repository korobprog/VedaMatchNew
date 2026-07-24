import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { AdminUserStageForm } from "@/components/admin-user-stage-form";
import { getAdminUser, getProfile } from "@/lib/api";
import { actorLabels, formatBool, formatDate, roleLabels, stageLabels, verificationLabels } from "@/lib/admin-labels";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { cn } from "@/lib/utils";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getProfile();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "admin") redirect("/");

  const detail = await getAdminUser(id);
  if (!detail) throw new Error("Пользователь не найден");

  const profile = detail.profile;

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={currentUser} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <Link href="/admin/users" className="mb-4 inline-flex text-sm font-medium text-text-1 hover:text-magenta">
          ← К списку пользователей
        </Link>

        <div className="glass rounded-2xl border border-glass-brd p-6 mb-6">
          <div className="flex flex-wrap items-start gap-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={profile.name} className="h-16 w-16 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-glass text-xl font-semibold text-text-0">
                {profile.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold text-text-0">{profile.name}</h1>
              <p className="text-text-1">{profile.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>{roleLabels[profile.role]}</Badge>
                {profile.spiritualStage && <Badge>{stageLabels[profile.spiritualStage]}</Badge>}
                {profile.devoteeVerificationStatus && (
                  <Badge tone={profile.devoteeVerificationStatus === "confirmed" ? "green" : "amber"}>
                    {verificationLabels[profile.devoteeVerificationStatus]}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Section title="Профиль">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="ID" value={profile.id} />
                <Info label="Роль" value={roleLabels[profile.role]} />
                <Info label="Создан" value={formatDate(profile.createdAt)} />
                <Info label="Обновлён" value={formatDate(profile.updatedAt)} />
                <Info label="Последняя анкета" value={formatDate(profile.lastSelfIdentificationAt)} />
                <Info label="Город" value={profile.homeLocation?.city} />
                <Info label="Страна" value={profile.homeLocation?.country} />
                <Info label="Координаты" value={profile.homeLocation ? `${profile.homeLocation.lat}, ${profile.homeLocation.lon}` : null} />
              </dl>
              <JsonBlock title="Соцсети" value={profile.socialLinks} />
              <JsonBlock title="Мессенджеры" value={profile.messengers} />
            </Section>

            <Section title="Духовный этап">
              <dl className="grid gap-3 sm:grid-cols-3">
                <Info label="Текущий этап" value={profile.spiritualStage ? stageLabels[profile.spiritualStage] : null} />
                <Info label="Статус подтверждения" value={profile.devoteeVerificationStatus ? verificationLabels[profile.devoteeVerificationStatus] : null} />
                <Info label="Последняя анкета" value={formatDate(profile.lastSelfIdentificationAt)} />
              </dl>
            </Section>

            <Section title="Анкета">
              {detail.latestSelfIdentificationResponse ? (
                <div className="space-y-3">
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <Info label="Дата" value={formatDate(detail.latestSelfIdentificationResponse.createdAt)} />
                    <Info label="Определённый этап" value={stageLabels[detail.latestSelfIdentificationResponse.detectedStage]} />
                    <Info label="Статус" value={detail.latestSelfIdentificationResponse.verificationStatus ? verificationLabels[detail.latestSelfIdentificationResponse.verificationStatus] : null} />
                  </dl>
                  <JsonBlock title="Ответы" value={detail.latestSelfIdentificationResponse.answers} />
                </div>
              ) : (
                <Empty>Пользователь ещё не проходил самоидентификацию.</Empty>
              )}
            </Section>

            <Section title="Заявка наставника">
              {detail.mentorRequest ? (
                <div className="space-y-4">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Info label="Статус" value={verificationLabels[detail.mentorRequest.status]} />
                    <Info label="Создана" value={formatDate(detail.mentorRequest.createdAt)} />
                    <Info label="Наставник" value={detail.mentorRequest.mentorName} />
                    <Info label="Телефон" value={detail.mentorRequest.mentorPhone} />
                    <Info label="Email" value={detail.mentorRequest.mentorEmail} />
                    <Info label="Город / община" value={detail.mentorRequest.cityOrCommunity} />
                    <Info label="Как давно знает" value={detail.mentorRequest.knownDuration} />
                    <Info label="Знает лично" value={formatBool(detail.mentorRequest.knowsPersonally)} />
                    <Info label="Регулярная практика" value={formatBool(detail.mentorRequest.confirmsRegularPractice)} />
                    <Info label="Служение" value={formatBool(detail.mentorRequest.confirmsService)} />
                    <Info label="Духовное имя" value={formatBool(detail.mentorRequest.confirmsSpiritualName)} />
                    <Info label="Связь с общиной" value={formatBool(detail.mentorRequest.confirmsCommunityConnection)} />
                    <Info label="Рекомендует статус" value={formatBool(detail.mentorRequest.recommendsDevoteeStatus)} />
                    <Info label="Проверена" value={formatDate(detail.mentorRequest.adminReviewedAt)} />
                  </dl>
                  <TextBlock title="Характеристика" value={detail.mentorRequest.userCharacterReference} />
                  <TextBlock title="Комментарий администратора" value={detail.mentorRequest.adminNote} />
                </div>
              ) : (
                <Empty>Заявки наставника пока нет.</Empty>
              )}
            </Section>

            <Section title="История">
              {detail.stageHistory.length > 0 ? (
                <div className="space-y-3">
                  {detail.stageHistory.map((item) => (
                    <div key={item.id} className="glass rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-text-0">
                          {item.oldStage ? stageLabels[item.oldStage] : "—"} → {stageLabels[item.newStage]}
                        </p>
                        <span className="text-xs text-text-2">{formatDate(item.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm text-text-1">
                        {actorLabels[item.actor]} · {item.verificationStatus ? verificationLabels[item.verificationStatus] : "без статуса"}
                      </p>
                      {item.reason && <p className="mt-2 text-sm text-text-1">{item.reason}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>История изменений пока пустая.</Empty>
              )}
            </Section>

            <Section title="Доступ к сервисам">
              {detail.availableServices.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {detail.availableServices.map((service) => (
                    <div key={service.id} className="glass rounded-xl border border-glass-brd p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-text-0">{service.name}</h3>
                          <p className="mt-1 text-sm text-text-1">{service.description}</p>
                        </div>
                        <Badge tone={service.status === "active" ? "green" : "amber"}>{service.status}</Badge>
                      </div>
                      {service.requiresDevoteeVerification && <p className="mt-2 text-xs text-magenta">Требует подтверждённого статуса преданного</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>Нет доступных сервисов.</Empty>
              )}
            </Section>
          </div>

          <aside className="space-y-6">
            <AdminUserStageForm
              userId={profile.id}
              isSelf={currentUser.id === profile.id}
              initialStage={profile.spiritualStage}
              initialStatus={profile.devoteeVerificationStatus}
            />
            <div className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
              <p className="font-medium text-text-0">Безопасность</p>
              <p className="mt-2">При изменении этапа создаётся запись в истории. Сброс подтверждённого статуса требует отдельного подтверждения.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl border border-glass-brd p-6">
      <h2 className="mb-4 font-display text-lg font-semibold text-text-0">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-sm text-text-2">{label}</dt>
      <dd className="break-words font-medium text-text-0">{value ? String(value) : "—"}</dd>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="mt-4 glass rounded-xl p-4 text-sm">
      <summary className="cursor-pointer font-medium text-text-0">{title}</summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-text-1">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function TextBlock({ title, value }: { title: string; value: string | null }) {
  return (
    <div>
      <p className="mb-1 text-sm text-text-2">{title}</p>
      <p className="glass rounded-xl p-3 text-sm text-text-1">{value || "—"}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="glass rounded-xl p-4 text-sm text-text-1">{children}</div>;
}

function Badge({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "green" }) {
  const classes = {
    amber: "bg-gold/20 text-gold border border-gold/30",
    green: "bg-cyan/20 text-cyan border border-cyan/30",
  }[tone];
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", classes)}>{children}</span>;
}
