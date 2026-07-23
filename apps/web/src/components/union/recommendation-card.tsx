import type { UnionCompatibilityCriterion, UnionRecommendation } from "@vedamatch/shared";
import { ConnectionActions } from "./connection-actions";
import { intentionLabels } from "./labels";
import { RecommendationPhotoCarousel } from "./recommendation-photo-carousel";

const criterionLabels: Record<UnionCompatibilityCriterion, string> = {
  intentions: "Цели знакомства",
  stage: "Духовный этап",
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

export function RecommendationCard({ item }: { item: UnionRecommendation }) {
  const { user, profile, compatibility } = item;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center gap-4">
        {user.photos.length > 0 ? (
          <RecommendationPhotoCarousel photos={user.photos} userName={user.name} />
        ) : user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-14 w-14 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200"
            data-testid="recommendation-initials"
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
            {user.name}
          </p>
          <p className="text-sm text-zinc-500">
            {[
              user.city,
              user.spiritualStage ? stageLabels[user.spiritualStage] : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <span className="rounded-full bg-amber-600 px-3 py-1 text-sm font-semibold text-white">
          {compatibility.total}%
        </span>
      </div>

      {profile.about && (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{profile.about}</p>
      )}

      {profile.intentions.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {profile.intentions.map((intention) => (
            <span
              key={intention.type}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {intentionLabels[intention.type]} {intention.weight}%
            </span>
          ))}
        </div>
      )}

      {user.contacts && (
        <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <p className="mb-2 font-medium">Контакты открыты</p>
          <div className="space-y-1">
            {Object.entries(user.contacts.messengers).map(([key, value]) =>
              value ? (
                <p key={key}>
                  <span className="font-medium">{key}:</span> {value}
                </p>
              ) : null,
            )}
            {Object.entries(user.contacts.socialLinks).map(([key, value]) =>
              value ? (
                <p key={key}>
                  <span className="font-medium">{key}:</span> {value}
                </p>
              ) : null,
            )}
          </div>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-amber-700 dark:text-amber-400">
          Почему {compatibility.total}%?
        </summary>
        <dl className="mt-3 space-y-2">
          {compatibility.breakdown.map((row) => (
            <div key={row.criterion} className="flex items-center gap-3">
              <dt className="w-40 shrink-0 text-zinc-500">
                {criterionLabels[row.criterion]}
              </dt>
              <dd className="flex flex-1 items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <span
                    className="block h-full rounded-full bg-amber-500"
                    style={{ width: `${row.score}%` }}
                  />
                </span>
                <span className="w-10 text-right font-medium text-zinc-900 dark:text-zinc-100">
                  {row.score}%
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <ConnectionActions userId={user.id} connection={item.connection} />
      </div>
    </div>
  );
}
