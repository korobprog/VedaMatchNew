import { MotivationModerationService } from './motivation-moderation.service';

/**
 * Уведомления видеостадии. Раньше их не было вовсе: ролик собирался, вставал
 * в очередь на приёмку — и об этом не узнавал ни администратор, ни автор.
 */
describe('MotivationModerationService.notifyVideoReady', () => {
  function build() {
    const emit = jest.fn();
    const service = new MotivationModerationService(
      {} as never,
      {
        emit,
      } as never,
    );
    return { service, emit };
  }

  it('шлёт автору событие о принятом ролике', () => {
    const { service, emit } = build();

    service.notifyVideoReady({
      id: 'post-1',
      origin: 'user',
      authorUserId: 'author-1',
    });

    expect(emit).toHaveBeenCalledWith('motivation.video.ready', {
      name: 'motivation.video.ready',
      recipientId: 'author-1',
      reelId: 'post-1',
    });
  });

  it('молчит про редакционные посты: у них нет автора, которому писать', () => {
    const { service, emit } = build();

    service.notifyVideoReady({
      id: 'post-1',
      origin: 'editorial',
      authorUserId: null,
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it('молчит, если автор не проставлен', () => {
    const { service, emit } = build();

    service.notifyVideoReady({
      id: 'post-1',
      origin: 'user',
      authorUserId: null,
    });

    expect(emit).not.toHaveBeenCalled();
  });
});
