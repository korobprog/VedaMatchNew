import { describeTelegramNotificationsSection } from './telegram-notifications-state';

describe('describeTelegramNotificationsSection', () => {
  it('устройство заведено — тумблер, без кнопки и подсказки', () => {
    expect(
      describeTelegramNotificationsSection({ inTelegram: true, connected: true }),
    ).toEqual({ showToggle: true, showEnableButton: false, hint: null });

    expect(
      describeTelegramNotificationsSection({ inTelegram: false, connected: true }),
    ).toEqual({ showToggle: true, showEnableButton: false, hint: null });
  });

  it('внутри Telegram, не заведено — кнопка «Разрешить боту писать мне»', () => {
    expect(
      describeTelegramNotificationsSection({ inTelegram: true, connected: false }),
    ).toEqual({ showToggle: false, showEnableButton: true, hint: null });
  });

  it('вне Telegram, не заведено — подсказка открыть бота', () => {
    const result = describeTelegramNotificationsSection({
      inTelegram: false,
      connected: false,
    });
    expect(result.showToggle).toBe(false);
    expect(result.showEnableButton).toBe(false);
    expect(result.hint).toContain('@vedamatch_bot');
  });
});
