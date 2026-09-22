import {
  notificationSwitchCopy,
  notificationSwitchValues,
  notificationSwitchesHint,
} from './notification-switch-copy';

/**
 * VED-361, пункт «честные тексты»: из настройки должно быть понятно, что
 * именно выключается и что при этом останется работать. Разойдись эта
 * формулировка с правилом доставки — человек снова будет ждать звонка,
 * которого нет, или бояться выключить переписку.
 */

function note(params: { chat: boolean; calls: boolean }, key: 'chat' | 'calls') {
  const row = notificationSwitchCopy(params).find((item) => item.key === key);
  if (!row) throw new Error(`нет тумблера ${key}`);
  return row.note;
}

describe('notificationSwitchCopy', () => {
  it('два тумблера, звонки — вторым', () => {
    expect(
      notificationSwitchCopy({ chat: true, calls: true }).map((row) => row.key),
    ).toEqual(['chat', 'calls']);
  });

  it('включённые «Сообщения» обещают, что звонки продолжат звонить', () => {
    expect(note({ chat: true, calls: true }, 'chat')).toContain(
      'перестанут приходить сообщения, звонки продолжат звонить',
    );
  });

  it('включённые «Звонки» обещают, что сообщения продолжат приходить', () => {
    expect(note({ chat: true, calls: true }, 'calls')).toContain(
      'перестанут звонить звонки, сообщения продолжат приходить',
    );
  });

  it('включённые «Звонки» прямо говорят про беззвучную беседу', () => {
    // Это и есть обещание карточки: заглушить болтливую беседу и всё равно
    // услышать вызов.
    expect(note({ chat: true, calls: true }, 'calls')).toContain(
      'даже если беседа без звука',
    );
  });

  it('выключенные «Сообщения» не выглядят как тишина целиком', () => {
    expect(note({ chat: false, calls: true }, 'chat')).toContain(
      'Звонки при этом звонят',
    );
  });

  it('выключенные «Звонки» не выглядят как потеря переписки', () => {
    expect(note({ chat: true, calls: false }, 'calls')).toContain(
      'Сообщения при этом приходят',
    );
  });

  it('у каждого тумблера своя подпись для скринридера', () => {
    const rows = notificationSwitchCopy({ chat: true, calls: true });
    const labels = rows.map((row) => row.accessibilityLabel);
    // Одного слова «Звонки» скринридеру мало: вне экрана оно звучит как
    // «позвонить», а не «уведомлять о звонках».
    expect(labels).toEqual([
      'Уведомления о сообщениях',
      'Уведомления о звонках',
    ]);
    expect(new Set(labels).size).toBe(2);
  });

  it('состояния различимы: текст меняется вместе с тумблером', () => {
    expect(note({ chat: true, calls: true }, 'chat')).not.toBe(
      note({ chat: false, calls: true }, 'chat'),
    );
    expect(note({ chat: true, calls: true }, 'calls')).not.toBe(
      note({ chat: true, calls: false }, 'calls'),
    );
  });
});

describe('notificationSwitchesHint', () => {
  it('включённые уведомления объясняют смысл двух тумблеров', () => {
    expect(notificationSwitchesHint(true)).toContain('порознь');
  });

  it('выключённые целиком — говорим, что молчит всё, и что настройки целы', () => {
    const hint = notificationSwitchesHint(false);
    expect(hint).toContain('не придёт ни сообщение, ни звонок');
    expect(hint).toContain('сохранены');
  });
});

describe('notificationSwitchValues', () => {
  it('сервер прислал оба поля — берём как есть', () => {
    expect(notificationSwitchValues({ chat: true, calls: false })).toEqual({
      chat: true,
      calls: false,
    });
  });

  it('сервер старше сборки: звонки повторяют «Сообщения», а не гаснут', () => {
    // До VED-361 звонки шли под категорией «Сообщения»: это и есть правда
    // такого сервера. Показать выключённые «Звонки» значило бы соврать.
    expect(notificationSwitchValues({ chat: true })).toEqual({
      chat: true,
      calls: true,
    });
    expect(notificationSwitchValues({ chat: false })).toEqual({
      chat: false,
      calls: false,
    });
  });
});
