/**
 * Публичные настройки пожертвований на клиенте (VED-380).
 *
 * Кнопка «Поддержать» рисуется только при включённых пожертвованиях и
 * непустых реквизитах, а знает об этом сервер. Раньше каждая такая кнопка
 * спрашивала его сама и до ответа не рисовала ничего — в панели горячих
 * клавиш это читалось как поломка: одиннадцать плиток появлялись сразу, а
 * двенадцатая догоняла их через сетевой круг.
 *
 * Поэтому две вещи. Первая — ответ помнится на весь сеанс страницы и
 * спрашивается один раз, сколько бы кнопок его ни ждало. Вторая — пока
 * ответа нет, состояние честно называется «не знаем», и кнопка решает сама,
 * чем занять это время; исчезать она не обязана.
 *
 * Ошибку не запоминаем: «сервер не ответил» — это не «пожертвования
 * выключены», и следующее открытие панели спросит заново.
 */

"use client";

import { useEffect, useState } from "react";
import type { DonationSettingsDto } from "@vedamatch/shared";
import { API_URL } from "./http-client";

/** `undefined` — ещё не знаем; иначе ответ сервера. */
export type DonationSettingsState = DonationSettingsDto | undefined;

/** Что рисовать на месте кнопки «Поддержать». */
export type DonateTileView =
  /** Реквизиты есть — та самая шторка. */
  | "sheet"
  /** Пожертвования выключены — кнопки нет вовсе. */
  | "hidden"
  /** Ответа ещё нет — плитка на месте и ведёт на страницу с реквизитами. */
  | "pending";

/**
 * Решение отделено от загрузки: именно его проверяет тест, и именно оно
 * отвечает за то, что плитка не мигает. «Не знаем» — это `pending`, а не
 * `hidden`: пустое место в сетке хуже плитки, которая ведёт чуть дальше.
 */
export function donateTileView(
  donation: DonationSettingsState,
): DonateTileView {
  if (donation === undefined) return "pending";
  return donation.enabled && donation.requisites.length > 0
    ? "sheet"
    : "hidden";
}

let cache: DonationSettingsState;
let inflight: Promise<DonationSettingsState> | null = null;

/** Что уже известно — без похода на сервер и без ожидания. */
export function readDonationSettings(): DonationSettingsState {
  return cache;
}

/** Только для тестов: сеанс страницы начинается с чистого листа. */
export function resetDonationSettings(): void {
  cache = undefined;
  inflight = null;
}

async function request(): Promise<DonationSettingsState> {
  try {
    const response = await fetch(`${API_URL}/billing/donation`, {
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    return (await response.json()) as DonationSettingsDto;
  } catch {
    return undefined;
  }
}

/**
 * Спросить сервер, если ещё не спрашивали. Второй и десятый вызов подхватят
 * тот же запрос, а не заведут свой.
 */
export function loadDonationSettings(): Promise<DonationSettingsState> {
  if (cache !== undefined) return Promise.resolve(cache);
  inflight ??= request().then((donation) => {
    // Запоминаем только ответ: пустота осталась бы «выключено навсегда».
    if (donation !== undefined) cache = donation;
    inflight = null;
    return donation;
  });
  return inflight;
}

/**
 * Настройки для кнопки. Уже известное отдаётся первым же рендером — кнопка
 * при следующем открытии панели появляется вместе со всеми, а не догоняет.
 */
export function useDonationSettings(): DonationSettingsState {
  const [donation, setDonation] = useState<DonationSettingsState>(
    readDonationSettings,
  );

  useEffect(() => {
    if (donation !== undefined) return;
    let alive = true;
    void loadDonationSettings().then((next) => {
      if (alive && next !== undefined) setDonation(next);
    });
    return () => {
      alive = false;
    };
  }, [donation]);

  return donation;
}
