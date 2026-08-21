import Link from "next/link";
import type {
  UnionCompatibilityCriterion,
  UnionRecommendation,
} from "@vedamatch/shared";
import { ActivityBadge } from "./activity-badge";
import { ContactList } from "./contact-list";
import { ProfileDetailsList } from "./profile-details-list";
import { ConnectionActions } from "./connection-actions";
import { intentionLabels, yearsSuffix } from "./labels";
import { RecommendationPhotoCarousel } from "./recommendation-photo-carousel";
import { ReportBlockMenu } from "./report-block-menu";
import { PhotoVerifiedBadge, VerifiedBadge } from "./verified-badge";

const criterionLabels: Record<UnionCompatibilityCriterion, string> = {
  intentions: "Цели знакомства",
  stage: "Духовный этап",
  lifestyle: "Образ жизни",
  interests: "Интересы",
  values: "Ценности",
  location: "Локация",
  format: "Формат общения",
};

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

        {/* top-7 — ниже полосок-индикаторов карусели фото */}
        <div className="absolute right-3 top-7 flex flex-col items-end gap-2">
          {!preview && (
            <span className="rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-1 text-sm font-bold text-white shadow-[0_0_16px_var(--vm-glow-magenta)]">
              {compatibility.total}%
            </span>
          )}
          {user.isVerifiedDevotee && <VerifiedBadge variant="overlay" />}
          {user.isPhotoVerified && <PhotoVerifiedBadge variant="overlay" />}
        </div>

        <div className="absolute left-3 top-7">
          <ActivityBadge activity={user.activity} variant="overlay" />
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
            <Link
              href={`/astro/compatibility?with=${user.id}`}
              className="block text-center text-xs text-text-2 underline underline-offset-4 hover:text-text-1"
            >
              Проверить совместимость по звёздам
            </Link>
            <ReportBlockMenu userId={user.id} userName={user.name} />
          </div>
        )}
      </div>
    </article>
  );
}
