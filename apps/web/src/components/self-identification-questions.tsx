"use client";

import type { SelfIdentificationAnswers } from "@vedamatch/shared";
import { fieldClassName } from "@/components/ui/input";

/**
 * Вопросы анкеты самоидентификации. Вынесены отдельно, потому что задаются в
 * двух местах: в мастере после регистрации и на странице повторного
 * прохождения. Формулировки обязаны совпадать до буквы — этап считается по
 * ответам, и разошедшийся текст означал бы, что человек отвечает на разные
 * вопросы в зависимости от того, откуда зашёл.
 */
export const DEFAULT_ANSWERS: SelfIdentificationAnswers = {
  interest: "beginning",
  regularPractice: "none",
  currentFocus: "curiosity",
  hasMentor: false,
  hasCommunity: false,
  hasSpiritualName: false,
  participatesInService: false,
  wantsRecommendations: true,
};

export function SelfIdentificationQuestions({
  answers,
  onChange,
}: {
  answers: SelfIdentificationAnswers;
  onChange: (answers: SelfIdentificationAnswers) => void;
}) {
  return (
    <div className="space-y-5">
      <SelectField
        label="Как бы вы описали свой интерес к самоосознанию?"
        value={answers.interest}
        onChange={(interest) => onChange({ ...answers, interest })}
        options={[
          ["beginning", "Только начинаю интересоваться"],
          ["learning", "Изучаю основы и пробую применять"],
          ["deepening", "Хочу углублять регулярную практику"],
          ["devotional_service", "Живу практикой, служением и общиной"],
        ]}
      />
      <SelectField
        label="Есть ли у вас регулярная духовная практика?"
        value={answers.regularPractice}
        onChange={(regularPractice) => onChange({ ...answers, regularPractice })}
        options={[
          ["none", "Пока нет"],
          ["sometimes", "Иногда"],
          ["daily", "Ежедневно"],
          ["strict_daily", "Строго и ежедневно"],
        ]}
      />
      <SelectField
        label="Что вам сейчас ближе всего?"
        value={answers.currentFocus}
        onChange={(currentFocus) => onChange({ ...answers, currentFocus })}
        options={[
          ["curiosity", "Понять, подходит ли мне этот путь"],
          ["basic_practice", "Освоить базовую практику"],
          ["deep_practice", "Углубить практику"],
          ["service_community", "Служение и жизнь в общине"],
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxField
          label="Есть наставник"
          checked={answers.hasMentor}
          onChange={(hasMentor) => onChange({ ...answers, hasMentor })}
        />
        <CheckboxField
          label="Есть связь с общиной"
          checked={answers.hasCommunity}
          onChange={(hasCommunity) => onChange({ ...answers, hasCommunity })}
        />
        <CheckboxField
          label="Есть духовное имя"
          checked={answers.hasSpiritualName}
          onChange={(hasSpiritualName) =>
            onChange({ ...answers, hasSpiritualName })
          }
        />
        <CheckboxField
          label="Участвую в служении"
          checked={answers.participatesInService}
          onChange={(participatesInService) =>
            onChange({ ...answers, participatesInService })
          }
        />
        <CheckboxField
          label="Хочу получать рекомендации по развитию"
          checked={answers.wantsRecommendations}
          onChange={(wantsRecommendations) =>
            onChange({ ...answers, wantsRecommendations })
          }
        />
      </div>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-text-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={`${fieldClassName} py-3`}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-glass-brd p-3 text-sm text-text-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-magenta"
      />
      {label}
    </label>
  );
}
