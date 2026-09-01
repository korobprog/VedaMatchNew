import type { UserProfile } from "@vedamatch/shared";

/**
 * Нужно ли увести человека в мастер приветствия. Условие одно на все
 * страницы, которые его проверяют: разъехавшись, они начали бы гонять
 * человека между главной и мастером по кругу.
 *
 * Этап пути — то, без чего портал не знает, что показывать. Пол — то, без
 * чего Знакомства не показывают человека никому: он появился в мастере
 * позже, поэтому у старых аккаунтов его нет и мастер их догоняет.
 */
export function needsWelcome(user: {
  spiritualStage: UserProfile["spiritualStage"];
  gender: UserProfile["gender"];
}): boolean {
  return !user.spiritualStage || !user.gender;
}

export type WelcomeStep = "Знакомство" | "Город" | "Фото" | "Этап пути";

/**
 * Какие шаги показать этому человеку. Новичку — все: он ничего ещё не
 * заполнял. Старому аккаунту без пола — только «Знакомство»: город, фото и
 * этап пути у него уже есть, и гонять его по ним заново значит предложить
 * переписать анкету, которую он проходил.
 *
 * Живёт рядом с `needsWelcome`, а не в самом мастере: страница `/welcome` —
 * серверный компонент, и вызвать функцию из модуля с `"use client"` она не
 * может, падая на рендере с «Attempted to call welcomeSteps() from the
 * server».
 */
export function welcomeSteps(user: {
  spiritualStage: UserProfile["spiritualStage"];
}): WelcomeStep[] {
  if (!user.spiritualStage) return ["Знакомство", "Город", "Фото", "Этап пути"];
  return ["Знакомство"];
}
