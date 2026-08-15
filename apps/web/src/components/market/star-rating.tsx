"use client";

import { Star } from "lucide-react";

/** Показ оценки. Половинок нет: шкала целая, и рисовать 4.33 звезды значит
 *  обещать точность, которой в оценке «от 1 до 5» не бывает. */
export function StarRating({
  value,
  size = 16,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const filled = Math.round(value);
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`${value} из 5`}
      title={`${value} из 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden
          width={size}
          height={size}
          className={star <= filled ? "fill-gold text-gold" : "text-text-2"}
        />
      ))}
    </span>
  );
}

/** Выбор оценки в форме. Радиокнопки, а не звёзды на onClick: так работает
 *  клавиатура и скринридер, а внешне остаётся тот же ряд звёзд. */
export function StarRatingInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-1 block text-sm text-text-2">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className="cursor-pointer"
            title={`${star} из 5`}
          >
            <input
              type="radio"
              name="rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <Star
              aria-hidden
              width={28}
              height={28}
              className={
                star <= value
                  ? "fill-gold text-gold"
                  : "text-text-2 hover:text-gold"
              }
            />
            <span className="sr-only">{star}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
