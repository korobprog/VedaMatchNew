"use client";

import { useId, useState } from "react";
import { buildTransferPurpose, MAX_TRANSFER_PURPOSE } from "@/lib/donate";
import { DONATE_PURPOSES } from "@/lib/donate-content";
import { CopyField } from "./copy-field";

/**
 * «Подпишите назначение перевода» (VED-11).
 *
 * Человек выбирает цель и, если хочет, подписывается — страница показывает
 * готовую строку для поля «назначение платежа» и даёт её скопировать. Форма
 * ничего не отправляет на сервер: перевод человек делает в своём банке, а нам
 * нужна только подписанная строка в выписке, иначе поступление безымянное и
 * непонятно, на что оно пришло.
 */
export function TransferPurposeForm() {
  const [purposeId, setPurposeId] = useState(DONATE_PURPOSES[0].id);
  const [donorName, setDonorName] = useState("");
  const groupId = useId();
  const nameId = `${groupId}-name`;

  const purpose =
    DONATE_PURPOSES.find((item) => item.id === purposeId) ?? DONATE_PURPOSES[0];
  // В выписку идёт `transfer`, а не подпись пункта: в списке человек читает
  // «Благодарность разработчикам», в банк уходит формулировка целиком.
  const line = buildTransferPurpose({
    purposeText: purpose.transfer,
    donorName,
  });

  return (
    <div className="glass rounded-2xl border border-glass-brd p-5">
      <fieldset className="border-0 p-0">
        <legend className="mb-3 text-sm font-semibold text-text-0">
          Цель перевода
        </legend>
        <div className="space-y-2">
          {DONATE_PURPOSES.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 transition-colors hover:bg-bg-2"
            >
              <input
                type="radio"
                name={groupId}
                value={item.id}
                checked={item.id === purposeId}
                onChange={() => setPurposeId(item.id)}
                className="mt-1 size-4 shrink-0 accent-magenta"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text-0">
                  {item.label}
                </span>
                <span className="block text-xs text-text-1">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor={nameId} className="block text-sm font-semibold text-text-0">
          Как вас подписать
        </label>
        <p id={`${nameId}-hint`} className="mt-1 text-xs text-text-1">
          Необязательно. Оставьте пустым — и перевод останется анонимным, мы всё
          равно увидим цель.
        </p>
        <input
          id={nameId}
          type="text"
          value={donorName}
          onChange={(event) => setDonorName(event.target.value)}
          aria-describedby={`${nameId}-hint`}
          maxLength={MAX_TRANSFER_PURPOSE}
          placeholder="Имя или духовное имя"
          className="mt-2 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-text-0">
          Вставьте это в назначение платежа
        </p>
        <CopyField label="Назначение платежа" value={line} mono={false} />
      </div>
    </div>
  );
}
