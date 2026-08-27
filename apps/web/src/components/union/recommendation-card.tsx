import Link from "next/link";
import type { UnionRecommendation } from "@vedamatch/shared";
import { gunaMilanMaxFor } from "@vedamatch/shared";
import { ActivityBadge } from "./activity-badge";
import { DecisionBadge } from "./decision-badge";
import { ContactList } from "./contact-list";
import { ProfileDetailsList } from "./profile-details-list";
import { ConnectionActions } from "./connection-actions";
import {
  criterionLabels,
  intentionLabels,
  intentionTypes,
  yearsSuffix,
} from "./labels";
import { RecommendationPhotoCarousel } from "./recommendation-photo-carousel";
import { ReportBlockMenu } from "./report-block-menu";
import { PhotoVerifiedBadge, VerifiedBadge } from "./verified-badge";

/**
 * Звёзды — вход в сверку карт. Своя фигура, а не общая с витриной лендинга:
 * компоненты чужого модуля сюда не тянутся, общее дублируется — см.
 * docs/service-module-contract.md.
 */
function StarsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6l1.7 4.2 4.5.3-3.4 2.9 1 4.4-3.8-2.4-3.8 2.4 1-4.4-3.4-2.9 4.5-.3z" />
      <path d="M18.4 14.6l.8 1.9 2 .2-1.5 1.3.5 2-1.8-1.1-1.8 1.1.5-2-1.5-1.3 2-.2z" />
    </svg>
  );
}

const stageLabels: Record<string, string> = {
  seeker: "Ищущий",
  practitioner: "Практикующий основы",
  yogi: "Йог",
  devotee: "Преданный",
};

/**
 * Карточка человека в ленте знакомств: фото во всю ширину, поверх — имя и матч.
 *
 * `preview` — та же карточка, но показанная человеку про него самого («как вас
 * видят»). Совместимость с собой бессмысленна, а связаться с собой нельзя,
 * поэтому и процент, и действия в этом режиме сняты: остаётся ровно то, ради
 * чего превью и заведено — как выглядит анкета чужими глазами.
 */
export function RecommendationCard({
  item,
  preview = false,
}: {
  item: UnionRecommendation;
  preview?: boolean;
}) {
  const { user, profile, compatibility } = item;
  const subtitle =
    [
      user.age != null ? `${user.age} ${yearsSuffix(user.age)}` : null,
      user.city,
      user.spiritualStage ? stageLabels[user.spiritualStage] : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—";

  return (
    <article className="glass flex flex-col overflow-hidden rounded-3xl border border-glass-brd transition hover:border-magenta/40">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-bg-2">
        {user.photos.length > 0 ? (
          <RecommendationPhotoCarousel
            photos={user.photos}
            userName={user.name}
            variant="cover"
          />
        ) : user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-magenta/25 to-[#B23EFF]/25 font-display text-6xl font-bold text-text-0"
            data-testid="recommendation-initials"
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}

        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

        {/*
          Обе колонки — в одном ряду, а не двумя накладками с отступами
          навстречу друг другу. Отступ пришлось бы подбирать под самую широкую
          пилюлю справа, и он всё равно врал бы: «Проверен» шире «Фото», а
          состав значков у каждой анкеты свой. В общем ряду правая колонка
          занимает сколько нужно, левая забирает остаток и обрезается по нему —
          наехать друг на друга они не могут по устройству.

          Отступ сверху считается от той же базы, что и полоски-индикаторы
          карусели: они стоят на max(0.75rem, safe-area) и вместе со счётчиком
          «1/3» занимают 21px. Фиксированный top-7 был на 2px выше их нижнего
          края — процент упирался в счётчик. Плюс 1.75rem даёт 7px воздуха и не
          съедет, если у устройства есть вырез.
        */}
        <div className="absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+1.75rem)] flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col items-start gap-2 overflow-hidden">
            <ActivityBadge
              activity={user.activity}
              lastSeenAt={user.lastSeenAt}
              variant="overlay"
            />
            {/* «Показать всех» возвращает отсмотренных в общий список — без
                пометки они неотличимы от тех, кого человек ещё не видел. */}
            <DecisionBadge decision={item.myDecision} variant="overlay" />
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {!preview && (
              <span className="rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-1 text-sm font-bold text-white shadow-[0_0_16px_var(--vm-glow-magenta)]">
                {compatibility.total}%
              </span>
            )}
            {user.isVerifiedDevotee && <VerifiedBadge variant="overlay" />}
            {user.isPhotoVerified && <PhotoVerifiedBadge variant="overlay" />}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          <Link
            href={`/union/users/${user.id}`}
            className="pointer-events-auto block truncate font-display text-lg font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] hover:underline"
          >
            {user.name}
          </Link>
          <p className="truncate text-sm text-white/85 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {profile.intentions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.intentions.map((intention) => (
              <span
                key={intention.type}
                className="rounded-full border border-glass-brd bg-bg-1 px-2.5 py-1 text-xs text-text-1"
              >
                {intentionLabels[intention.type]} {intention.weight}%
              </span>
            ))}
          </div>
        )}

        {profile.status && (
          <p className="text-sm font-medium text-text-0">“{profile.status}”</p>
        )}

        {profile.about && (
          <p className="line-clamp-3 text-sm text-text-1">{profile.about}</p>
        )}

        <ProfileDetailsList details={profile} />

        {user.contacts && <ContactList contacts={user.contacts} />}

        {!preview && (
        <details className="text-sm">
          <summary className="cursor-pointer text-magenta">
            Почему {compatibility.total}%?
          </summary>
          <dl className="mt-3 space-y-2">
            {compatibility.breakdown.map((row) => (
              <div key={row.criterion} className="flex items-center gap-3">
                <dt className="w-32 shrink-0 text-xs text-text-2">
                  {criterionLabels[row.criterion]}
                </dt>
                <dd className="flex flex-1 items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-2">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-magenta to-[#B23EFF]"
                      style={{ width: `${row.score}%` }}
                    />
                  </span>
                  <span className="w-9 text-right text-xs font-medium text-text-0">
                    {row.score}%
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
        )}

        {!preview && (
          <div className="mt-auto space-y-3 pt-1">
            <ConnectionActions userId={user.id} connection={item.connection} />
            {/*
              Сверка карт по звёздам. Цель выбирается здесь же и уходит в
              адрес: от неё зависит, какие куты пойдут в расчёт, и спрашивать
              об этом уже на чужой странице — лишний шаг.

              `details`, а не всплывающее меню на состоянии: карточка —
              серверный компонент, и раскрытие тут родное браузеру, без
              гидратации и без ловушек с фокусом.
            */}
            <details className="group text-center">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 transition hover:border-gold/50 hover:text-text-0">
                <StarsIcon />
                Совместимость по звёздам
              </summary>
              <ul className="mt-2 space-y-0.5 text-left">
                {intentionTypes.map((intention) => (
                  <li key={intention}>
                    <Link
                      href={`/astro/compatibility?with=${user.id}&purpose=${intention}`}
                      className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-text-1 transition hover:bg-glass hover:text-text-0"
                    >
                      <span>{intentionLabels[intention]}</span>
                      {/* Потолок цели — то, чем расчёты и различаются. */}
                      <span className="shrink-0 font-mono text-[10px] text-text-2">
                        до {gunaMilanMaxFor(intention)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
            <ReportBlockMenu userId={user.id} userName={user.name} />
          </div>
        )}
      </div>
    </article>
  );
}
