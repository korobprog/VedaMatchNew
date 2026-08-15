import type { MarketReviewListResponse } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";
import { ReportButton } from "./report-dialog";
import { StarRating } from "./star-rating";

export function ReviewList({
  reviews,
  locale,
  labels,
}: {
  reviews: MarketReviewListResponse;
  locale: Locale;
  labels: { title: string; empty: string; average: string; count: string };
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg font-semibold text-text-0">
          {labels.title}
        </h2>
        {reviews.total > 0 && (
          <>
            <StarRating value={reviews.ratingAvg} />
            <span className="text-sm text-text-1">{reviews.ratingAvg}</span>
            <span className="text-sm text-text-2">
              {labels.count.replace("{count}", String(reviews.total))}
            </span>
          </>
        )}
      </div>

      {reviews.total === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          {labels.empty}
        </p>
      ) : (
        <>
          {/* Разбивка по звёздам: одна пятёрка и одна единица дают ту же
              среднюю, что две тройки, но говорят о продавце совсем другое. */}
          <ul className="glass mb-3 rounded-2xl border border-glass-brd p-4">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reviews.breakdown[String(star)] ?? 0;
              const share = reviews.total ? (count / reviews.total) * 100 : 0;
              return (
                <li key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-text-2">{star}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-glass-brd/40">
                    <span
                      className="block h-full rounded-full bg-gold"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                  <span className="w-6 text-right text-text-2">{count}</span>
                </li>
              );
            })}
          </ul>

          <ul className="space-y-3">
            {reviews.items.map((review) => (
              <li
                key={review.id}
                className="glass rounded-2xl border border-glass-brd p-4"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <StarRating value={review.rating} size={14} />
                  <span className="text-sm text-text-0">
                    {review.author?.name ?? "—"}
                  </span>
                  <span className="text-xs text-text-2">
                    {new Date(review.createdAt).toLocaleDateString(locale)}
                  </span>
                  <span className="ml-auto">
                    <ReportButton targetKind="review" targetId={review.id} />
                  </span>
                </div>
                {review.body && (
                  <p className="whitespace-pre-line text-sm text-text-1">
                    {review.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
