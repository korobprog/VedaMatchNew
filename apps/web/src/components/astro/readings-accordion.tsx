"use client";

import { useState } from "react";
import type {
  AstroFeatureKey,
  AstroReadingsDto,
  AstroSectionState,
} from "@vedamatch/shared";
import { AstroReadingError, generateAstroReading } from "@/lib/astro-client-api";

/**
 * Разборы карты. Разделы генерируются лениво, по одному, по раскрытию: человек,
 * посмотревший только обзор, не оплачивает остальные семь.
 */

const FEATURE_LABELS: Record<AstroFeatureKey, string> = {
  graha_signs: "знаки грах",
  moon_nakshatra: "накшатра Луны",
  dasha: "периоды даш",
  lagna: "лагна",
  houses: "бхавы",
  daily_transits: "транзиты",
};

function blockedMessage(section: AstroSectionState): string {
  switch (section.blockedBy) {
    case "requires_data":
      return `Нужно уточнить данные рождения — для этого раздела не хватает: ${section.requires
        .map((feature) => FEATURE_LABELS[feature])
        .join(", ")}.`;
    case "quota_exhausted":
      return "Дневная квота разборов исчерпана. Уже готовые разделы остаются доступны, новые — завтра.";
    case "ai_unavailable":
      return "Разборы временно недоступны. Карта и расчёты работают как обычно.";
    default:
      return "";
  }
}

function SectionCard({
  initial,
  onQuotaSpent,
}: {
  initial: AstroSectionState;
  onQuotaSpent: () => void;
}) {
  const [section, setSection] = useState(initial);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    const next = !open;
    setOpen(next);
    if (!next || section.text || loading || !section.available) return;

    setLoading(true);
    setError(null);
    try {
      const generated = await generateAstroReading(section.section);
      setSection(generated);
      onQuotaSpent();
    } catch (cause) {
      setError(
        cause instanceof AstroReadingError
          ? cause.message
          : "Не удалось получить разбор",
      );
    } finally {
      setLoading(false);
    }
  }

  const blocked = section.blockedBy !== null;

  return (
    <div className="border-b border-black/10 dark:border-white/15">
      <button
        type="button"
        onClick={reveal}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="font-medium">{section.title}</span>
        <span className="text-sm text-black/50 dark:text-white/50">
          {section.text ? "готово" : blocked ? "недоступно" : "открыть"}
        </span>
      </button>

      {open && (
        <div className="pb-4 text-sm leading-relaxed">
          {loading && <p className="text-black/60 dark:text-white/60">Готовим разбор…</p>}
          {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
          {!loading && !error && section.text && (
            <div className="space-y-3 whitespace-pre-line">{section.text}</div>
          )}
          {!loading && !error && !section.text && blocked && (
            <p className="text-black/60 dark:text-white/60">
              {blockedMessage(section)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ReadingsAccordion({ initial }: { initial: AstroReadingsDto }) {
  const [readingsLeft, setReadingsLeft] = useState(initial.quota.readingsLeft);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Разбор карты</h2>
        <p className="text-sm text-black/55 dark:text-white/55">
          {initial.quota.aiAvailable
            ? `Осталось сегодня: ${readingsLeft} из ${initial.quota.readingsPerDay}`
            : "Разборы временно недоступны"}
        </p>
      </div>

      <div className="mt-2">
        {initial.sections.map((section) => (
          <SectionCard
            key={section.section}
            initial={section}
            onQuotaSpent={() => setReadingsLeft((left) => Math.max(0, left - 1))}
          />
        ))}
      </div>

      <p className="mt-4 text-xs text-black/45 dark:text-white/45">
        Тексты составлены ИИ по рассчитанной карте. Расчёт детерминирован, а
        толкование — лишь одно из возможных: относитесь к нему как к поводу
        подумать, а не как к предсказанию.
      </p>
    </div>
  );
}
