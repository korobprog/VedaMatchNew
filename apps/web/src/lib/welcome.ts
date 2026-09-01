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
