/**
 * Чистые правила секции «Уведомления в Telegram» на экране «Аккаунт»
 * (веха 4): что показать в зависимости от того, открыто ли приложение внутри
 * Telegram и заведено ли уже устройство доставки (`GET /notifications/telegram`).
 */

export interface TelegramNotificationsSectionState {
  /** Устройство заведено — показываем тумблер «Получать в Telegram». */
  showToggle: boolean;
  /** Внутри Telegram, устройство ещё не заведено — кнопка запроса доступа. */
  showEnableButton: boolean;
  /** Вне Telegram и не заведено — подсказка вместо кнопки и тумблера. */
  hint: string | null;
}

const OUTSIDE_TELEGRAM_HINT =
  'Откройте VedaMatch в Telegram через @vedamatch_bot, чтобы получать уведомления там.';

export function describeTelegramNotificationsSection(params: {
  inTelegram: boolean;
  connected: boolean;
}): TelegramNotificationsSectionState {
  if (params.connected) {
    return { showToggle: true, showEnableButton: false, hint: null };
  }
  if (params.inTelegram) {
    return { showToggle: false, showEnableButton: true, hint: null };
  }
  return { showToggle: false, showEnableButton: false, hint: OUTSIDE_TELEGRAM_HINT };
}
