import {
  buildNotification,
  commentsWord,
  formatMoneyMinor,
  nightsWord,
  toExcerpt,
  travelDecisionTitle,
  WELLNESS_CHECK_REASON_TEXT,
} from './notification-copy';

describe('buildNotification · уведомления «Работ» ведут в саму задачу', () => {
  // Раньше все четыре вели на доску, и человек искал названную задачу
  // глазами среди полусотни чужих карточек.
  it('поручение открывает поручённую задачу', () => {
    expect(
      buildNotification({
        name: 'work.task.assigned',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        spaceName: 'VedaMatch',
        actorName: 'Санкаршан',
        columnName: 'В работе',
        statusMark: 'in_progress',
      }),
    ).toMatchObject({ url: '/work/planner/space-1?task=VED-42' });
  });

  it('комментарий открывает задачу, к которой его написали', () => {
    expect(
      buildNotification({
        name: 'work.task.commented',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        actorName: 'Санкаршан',
        excerpt: 'Посмотрите ещё раз',
        commentCount: 1,
        columnName: 'Тестирование',
        statusMark: 'testing',
      }),
    ).toMatchObject({ url: '/work/planner/space-1?task=VED-42' });
  });

  it('возврат в работу открывает возвращённую задачу', () => {
    expect(
      buildNotification({
        name: 'work.task.returned',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        columnName: 'На доработку',
        actorName: 'Санкаршан',
        statusMark: 'rework',
      }),
    ).toMatchObject({ url: '/work/planner/space-1?task=VED-42' });
  });

  it('переезд по колонкам открывает переехавшую задачу', () => {
    expect(
      buildNotification({
        name: 'work.task.status-changed',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        fromColumnName: 'В работе',
        toColumnName: 'Тестирование',
        actorName: 'Санкаршан',
        statusMark: 'testing',
      }),
    ).toMatchObject({ url: '/work/planner/space-1?task=VED-42' });
  });
});

/**
 * VED-320: смена статуса задачи — одна обновляющаяся строка в ленте. Ветку
 * задаёт подписчик: издатель сообщил факт переезда, а как новость ляжет в
 * ленту, решается здесь.
 */
describe('buildNotification · ветка смены статуса в ленте', () => {
  const base = {
    recipientId: 'u1',
    spaceId: 'space-1',
    taskKey: 'VED-42',
    taskTitle: 'Починить ссылки',
    actorName: 'Санкаршан',
  } as const;
  const thread = 'work-status:/work/planner/space-1?task=VED-42';

  it('переезд и возврат — одна ветка на задачу', () => {
    const moved = buildNotification({
      ...base,
      name: 'work.task.status-changed',
      fromColumnName: 'В работе',
      toColumnName: 'Тестирование',
      statusMark: 'testing',
    });
    const returned = buildNotification({
      ...base,
      name: 'work.task.returned',
      columnName: 'На доработку',
      statusMark: 'rework',
    });
    expect(moved.threadKey).toBe(thread);
    expect(returned.threadKey).toBe(thread);
  });

  it('комментарий и поручение — свои строки, без ветки', () => {
    // Вопрос в комментарии не должен пропасть из ленты оттого, что карточку
    // следом передвинули.
    const commented = buildNotification({
      ...base,
      name: 'work.task.commented',
      excerpt: 'Проверь, пожалуйста',
      commentCount: 1,
      columnName: 'Тестирование',
      statusMark: 'testing',
    });
    const assigned = buildNotification({
      ...base,
      name: 'work.task.assigned',
      spaceName: 'VedaMatch',
      columnName: 'В работе',
      statusMark: 'in_progress',
    });
    expect(commented.threadKey).toBeUndefined();
    expect(assigned.threadKey).toBeUndefined();
  });
});

/**
 * VED-298: комментарий и перенос, сделанные одним человеком в одно окно,
 * приезжают одним событием. Формулировку из двух частей собирает подписчик —
 * издатель прислал факт: колонки, текст реплики и их число.
 */
describe('buildNotification · склейка комментария с переездом', () => {
  const move = {
    name: 'work.task.status-changed',
    recipientId: 'u1',
    spaceId: 'space-1',
    taskKey: 'VED-42',
    taskTitle: 'Починить ссылки',
    fromColumnName: 'В работе',
    toColumnName: 'Тестирование',
    actorName: 'Санкаршан',
    statusMark: 'testing',
  } as const;

  it('перенесли молча — текст прежний, без хвоста', () => {
    expect(buildNotification(move).body).toBe(
      'Санкаршан: «Починить ссылки» — из «В работе»',
    );
  });

  it('перенесли со словами — реплика дописана к переезду', () => {
    expect(
      buildNotification({
        ...move,
        commentExcerpt: 'Проверьте, пожалуйста',
        commentCount: 1,
      }).body,
    ).toBe(
      'Санкаршан: «Починить ссылки» — из «В работе». Комментарий: Проверьте, пожалуйста',
    );
  });

  it('несколько реплик за окно — счёт словом, а не цифрой рядом', () => {
    expect(
      buildNotification({
        ...move,
        commentExcerpt: 'И ещё вот это',
        commentCount: 3,
      }).body,
    ).toContain('3 комментария: И ещё вот это');
  });

  it('возврат из «готово» несёт причину', () => {
    expect(
      buildNotification({
        name: 'work.task.returned',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        columnName: 'На доработку',
        actorName: 'Санкаршан',
        commentExcerpt: 'Не открывается на телефоне',
        commentCount: 1,
        statusMark: 'rework',
      }).body,
    ).toContain('Комментарий: Не открывается на телефоне');
  });

  it('пачка реплик без переноса — заголовок говорит сколько их', () => {
    expect(
      buildNotification({
        name: 'work.task.commented',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        actorName: 'Санкаршан',
        excerpt: 'Последняя мысль',
        commentCount: 2,
        columnName: 'Тестирование',
        statusMark: 'testing',
      }),
    ).toMatchObject({
      title: 'VED-42: 2 комментария',
      body: 'Санкаршан: Последняя мысль',
    });
  });

  it('одиночная реплика читается как раньше', () => {
    expect(
      buildNotification({
        name: 'work.task.commented',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        actorName: 'Санкаршан',
        excerpt: 'Посмотрите ещё раз',
        commentCount: 1,
        columnName: 'Тестирование',
        statusMark: 'testing',
      }).title,
    ).toBe('VED-42: новый комментарий');
  });
});

describe('commentsWord', () => {
  it.each([
    [1, '1 комментарий'],
    [2, '2 комментария'],
    [5, '5 комментариев'],
    [11, '11 комментариев'],
    [21, '21 комментарий'],
    [102, '102 комментария'],
  ])('%i — «%s»', (count, expected) => {
    expect(commentsWord(count)).toBe(expected);
  });
});

/**
 * VED-272, VED-320: одна и та же задача возвращается в ленту после каждой смены
 * статуса, и пометка отвечает на вопрос «а что там теперь», не открывая
 * карточку.
 *
 * С VED-320 пометку считает «Работа» и присылает кодом в событии: пока её
 * разбирали здесь по названию колонки, два списка синонимов — свой у ленты и
 * свой у доски — отвечали по-разному, и человек видел «Тестирование» в
 * уведомлении рядом с «На доработку» в планировщике.
 */
describe('buildNotification · пометка состояния у уведомлений «Работы»', () => {
  const returned = {
    name: 'work.task.returned',
    recipientId: 'u1',
    spaceId: 'space-1',
    taskKey: 'VED-42',
    taskTitle: 'Починить ссылки',
    actorName: 'Санкаршан',
  } as const;

  it('переезд несёт код состояния из события, а не из названия колонки', () => {
    expect(
      buildNotification({
        name: 'work.task.status-changed',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        fromColumnName: 'В работе',
        toColumnName: 'Тестерование',
        actorName: 'Санкаршан',
        statusMark: 'testing',
      }),
    ).toMatchObject({ mark: 'testing' });
  });

  it('возврат несёт то состояние, в которое вернули', () => {
    // Из «Выполнено» возвращают не только «на доработку»: вернуть могут и в
    // «Тестерование», и тогда пометка обязана сказать именно это.
    expect(
      buildNotification({
        ...returned,
        columnName: 'Тестерование',
        statusMark: 'testing',
      }),
    ).toMatchObject({ mark: 'testing' });
    expect(
      buildNotification({
        ...returned,
        columnName: 'На доработку',
        statusMark: 'rework',
      }),
    ).toMatchObject({ mark: 'rework' });
  });

  it('колонку называет пометка, а не слова уведомления', () => {
    // VED-351: «Задачу вернули в работу» стояло в заголовке при любом исходе,
    // и рядом с пометкой «Тестерование» читалось как недоделанная работа над
    // самой пометкой. Вписать сюда настоящую колонку — полумера: пометка
    // показывает состояние на сейчас (VED-320), карточка уедет дальше, и
    // заголовок разойдётся с ней снова. Поэтому имя колонки живёт в одном
    // месте — в пометке.
    const news = buildNotification({
      ...returned,
      columnName: 'Тестерование',
      statusMark: 'testing',
    });
    expect(news.title).toBe('Задачу вернули');
    expect(news.body).not.toContain('Тестерование');
    expect(news.mark).toBe('testing');
  });

  it('переезд тоже не называет колонку, куда уехали, словами', () => {
    const news = buildNotification({
      name: 'work.task.status-changed',
      recipientId: 'u1',
      spaceId: 'space-1',
      taskKey: 'VED-42',
      taskTitle: 'Починить ссылки',
      fromColumnName: 'В работе',
      toColumnName: 'Выполнено',
      actorName: 'Санкаршан',
      statusMark: 'done',
    });
    expect(news.title).toBe('VED-42: сменился статус');
    expect(news.body).not.toContain('Выполнено');
    // Откуда уехали — сказано про прошлое, и прошлым останется.
    expect(news.body).toContain('из «В работе»');
    expect(news.mark).toBe('done');
  });

  it('незнакомая колонка оставляет уведомление без пометки', () => {
    expect(
      buildNotification({
        name: 'work.task.commented',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        actorName: 'Санкаршан',
        excerpt: 'Посмотрите ещё раз',
        commentCount: 1,
        columnName: 'Бэклог',
        statusMark: null,
      }),
    ).toMatchObject({ mark: null });
  });

  it('поручение и комментарий несут пометку так же', () => {
    expect(
      buildNotification({
        name: 'work.task.assigned',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        spaceName: 'VedaMatch',
        actorName: 'Санкаршан',
        columnName: 'В работе',
        statusMark: 'in_progress',
      }),
    ).toMatchObject({ mark: 'in_progress' });
    expect(
      buildNotification({
        name: 'work.task.commented',
        recipientId: 'u1',
        spaceId: 'space-1',
        taskKey: 'VED-42',
        taskTitle: 'Починить ссылки',
        actorName: 'Санкаршан',
        excerpt: 'Посмотрите ещё раз',
        commentCount: 1,
        columnName: 'Выполнено',
        statusMark: 'done',
      }),
    ).toMatchObject({ mark: 'done' });
  });
});
describe('buildNotification', () => {
  it('показывает имя отправителя и начало сообщения', () => {
    expect(
      buildNotification({
        name: 'union.chat.message-sent',
        recipientId: 'u1',
        senderName: 'Вринда',
        body: 'Харе Кришна, как ваша садхана?',
        requestId: 'r1',
      }),
    ).toEqual({
      title: 'Вринда',
      body: 'Харе Кришна, как ваша садхана?',
      url: '/union/chats/r1',
      tag: 'chat:r1',
      category: 'chat',
    });
  });

  it('ведёт автора в студию, где с кадром можно работать', () => {
    // `/m/<slug>` сделана для внешних ссылок и незалогиненных: посмотреть
    // можно, сделать нельзя. Автор приходит по уведомлению доводить рилс.
    expect(
      buildNotification({
        name: 'motivation.reel.published',
        recipientId: 'u1',
        reelId: 'reel-1',
        slug: 'reel-abc',
      }),
    ).toMatchObject({
      url: '/motivation/create?reel=reel-1',
      category: 'motivation',
    });
  });

  it('о готовом ролике зовёт в студию тем же тегом, что и кадр', () => {
    // Тег общий по рилсу: плашка о ролике заменяет прежнюю, а не ложится
    // второй по тому же посту.
    expect(
      buildNotification({
        name: 'motivation.video.ready',
        recipientId: 'u1',
        reelId: 'reel-1',
      }),
    ).toMatchObject({
      title: 'Ролик готов',
      url: '/motivation/create?reel=reel-1',
      tag: 'motivation-reel:reel-1',
      category: 'motivation',
    });
  });

  it('администратора о приёмке ведёт в очередь, а не в студию автора', () => {
    expect(
      buildNotification({
        name: 'motivation.video.review',
        recipientId: 'admin-1',
        reelId: 'reel-1',
      }),
    ).toMatchObject({
      title: 'Ролик ждёт приёмки',
      url: '/admin/motivation/queue',
      // Свой тег: приёмка и готовность — разные плашки у разных людей.
      tag: 'motivation-video-review:reel-1',
    });
  });

  it('после отказа ведёт в мастер: там причина и правка текста', () => {
    expect(
      buildNotification({
        name: 'motivation.reel.rejected',
        recipientId: 'u1',
        reelId: 'reel-1',
        reason: 'Реклама платных курсов',
      }),
    ).toMatchObject({ url: '/motivation/create?reel=reel-1' });
  });

  it('схлопывает сообщения одного чата общим тегом', () => {
    const first = buildNotification({
      name: 'union.chat.message-sent',
      recipientId: 'u1',
      senderName: 'Вринда',
      body: 'раз',
      requestId: 'r1',
    });
    const second = buildNotification({
      name: 'union.chat.message-sent',
      recipientId: 'u1',
      senderName: 'Вринда',
      body: 'два',
      requestId: 'r1',
    });

    expect(first.tag).toBe(second.tag);
  });

  it('ведёт запрос контакта в раздел запросов справочника', () => {
    expect(
      buildNotification({
        name: 'contacts.request.received',
        recipientId: 'u1',
        senderName: 'Вринда',
      }),
    ).toEqual({
      title: 'Запрос контакта',
      body: 'Вринда просит способ связаться',
      url: '/contacts/requests',
      tag: 'contacts-requests',
      category: 'connections',
    });
  });

  it('ведёт открытые контакты на карточку того, кто их открыл', () => {
    const content = buildNotification({
      name: 'contacts.request.accepted',
      recipientId: 'u1',
      senderName: 'Вринда',
      ownerUserId: 'owner-1',
    });

    expect(content.url).toBe('/contacts/users/owner-1');
    // Формулировки без рода: User.gender необязателен.
    expect(content.body).toBe('Теперь вы видите способы связи с Вринда');
  });

  it('ведёт входящую заявку в список заявок', () => {
    expect(
      buildNotification({
        name: 'union.connection.requested',
        recipientId: 'u1',
        senderName: 'Мадхава',
      }),
    ).toEqual({
      title: 'Новая заявка',
      body: 'Мадхава хочет познакомиться',
      url: '/union/connections',
      tag: 'connections',
      category: 'connections',
    });
  });

  it('о принятой заявке пишет без указания рода', () => {
    const content = buildNotification({
      name: 'union.connection.accepted',
      recipientId: 'u1',
      senderName: 'Лалита',
      companionId: 'u2',
    });

    expect(content.body).toBe('Теперь вы можете общаться с Лалита');
    expect(content.body).not.toContain('(а)');
    // Не `/union/chats/<id заявки>`: беседу заводит «Общение» со своим
    // идентификатором, и по заявке её у новой пары не найти.
    expect(content.url).toBe('/chat/with/u2');
  });

  it('ведёт ответ поддержки в тикет пользователя, а не в гостевой трекер', () => {
    expect(
      buildNotification({
        name: 'support.ticket.replied',
        recipientId: 'u1',
        ticketId: 't3',
      }),
    ).toEqual({
      title: 'Ответ поддержки',
      body: 'Поддержка ответила на ваше обращение',
      url: '/support/t3',
      tag: 'support:t3',
      category: 'support',
    });
  });

  it('показывает готовую фразу дня транзитов', () => {
    expect(
      buildNotification({
        name: 'astro.transit.digest-ready',
        recipientId: 'u1',
        excerpt: 'Луна сегодня проходит вашу седьмую бхаву.',
      }),
    ).toEqual({
      title: 'Персональный день',
      body: 'Луна сегодня проходит вашу седьмую бхаву.',
      url: '/astro/chart',
      tag: 'astro-transit',
      category: 'transits',
    });
  });

  it('схлопывает дайджесты одного дня общим тегом', () => {
    // Один тег на пользователя: пересчёт того же дня заменяет уведомление,
    // а не плодит второе рядом со старым.
    const first = buildNotification({
      name: 'astro.transit.digest-ready',
      recipientId: 'u1',
      excerpt: 'Вариант A',
    });
    const second = buildNotification({
      name: 'astro.transit.digest-ready',
      recipientId: 'u1',
      excerpt: 'Вариант B',
    });

    expect(first.tag).toBe(second.tag);
  });
});

describe('вакансии', () => {
  it('отклик ведёт автора в воронку и схлопывается по предложению', () => {
    const first = buildNotification({
      name: 'vacancies.response.created',
      recipientId: 'author',
      offerId: 'o1',
      offerTitle: 'Повар в кафе',
      offerKind: 'work',
      responseId: 'r1',
      responderId: 'u2',
      responderName: 'Ишвара дас',
      message: 'Готов выйти с понедельника',
    });
    expect(first).toEqual({
      title: 'Отклик на предложение',
      body: 'Ишвара дас — «Повар в кафе»: Готов выйти с понедельника',
      url: '/vacancies/o1/responses',
      tag: 'vacancy-responses:o1',
      category: 'work',
    });
    const second = buildNotification({
      name: 'vacancies.response.created',
      recipientId: 'author',
      offerId: 'o1',
      offerTitle: 'Повар в кафе',
      offerKind: 'work',
      responseId: 'r2',
      responderId: 'u3',
      responderName: 'Гопал',
      message: null,
    });
    expect(second.tag).toBe(first.tag);
    expect(second.body).toBe('Гопал — «Повар в кафе»');
  });

  it('отказ — без причины, диалог ведёт к предложению', () => {
    const declined = buildNotification({
      name: 'vacancies.response.status-changed',
      recipientId: 'u2',
      offerId: 'o1',
      offerTitle: 'Помощь на кухне',
      offerKind: 'seva',
      responseId: 'r1',
      authorId: 'author',
      status: 'declined',
    });
    expect(declined.title).toBe('По отклику отказ');
    expect(declined.body).toBe('служение «Помощь на кухне»');
    expect(declined.url).toBe('/vacancies/responses');

    const dialog = buildNotification({
      name: 'vacancies.response.status-changed',
      recipientId: 'u2',
      offerId: 'o1',
      offerTitle: 'Помощь на кухне',
      offerKind: 'seva',
      responseId: 'r1',
      authorId: 'author',
      status: 'in_dialog',
    });
    expect(dialog.url).toBe('/vacancies/o1');
  });

  it('закрытие предложения говорит, что человек найден', () => {
    expect(
      buildNotification({
        name: 'vacancies.offer.closed',
        recipientId: 'u2',
        offerId: 'o1',
        offerTitle: 'Перевезти книги',
        offerKind: 'task',
        responseId: 'r1',
        authorId: 'author',
      }),
    ).toMatchObject({
      title: 'Предложение закрыто',
      body: 'задача «Перевезти книги» — человек найден',
      category: 'work',
    });
  });
});

describe('приветствие новому участнику', () => {
  it('обращается по имени и ведёт на приветственный экран', () => {
    expect(
      buildNotification({
        name: 'portal.welcome',
        recipientId: 'u-1',
        recipientName: 'Маму Тхакур дас',
      }),
    ).toMatchObject({
      title: 'Добро пожаловать, Маму Тхакур дас!',
      url: '/welcome',
      category: 'announcements',
    });
  });

  it('печатает имя как дали, своего не подбирает', () => {
    const content = buildNotification({
      name: 'portal.welcome',
      recipientId: 'u-2',
      recipientName: 'Сита',
    });

    expect(content.title).toContain('Сита');
    expect(content.body).not.toContain('Сита');
  });
});

describe('toExcerpt', () => {
  it('оставляет короткое сообщение как есть и схлопывает пробелы', () => {
    expect(toExcerpt('  Харе   Кришна  ')).toBe('Харе Кришна');
  });

  it('обрезает длинное сообщение до 120 символов с многоточием', () => {
    const excerpt = toExcerpt('я'.repeat(200));

    expect(excerpt).toHaveLength(120);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('nightsWord', () => {
  it('склоняет ночи по-русски', () => {
    expect(nightsWord(1)).toBe('1 ночь');
    expect(nightsWord(2)).toBe('2 ночи');
    expect(nightsWord(5)).toBe('5 ночей');
    expect(nightsWord(21)).toBe('21 ночь');
    expect(nightsWord(22)).toBe('22 ночи');
  });

  it('не спотыкается на 11–14, где последняя цифра врёт', () => {
    expect(nightsWord(11)).toBe('11 ночей');
    expect(nightsWord(12)).toBe('12 ночей');
    expect(nightsWord(14)).toBe('14 ночей');
  });
});

describe('travelDecisionTitle', () => {
  it('называет решение без рода: у пола может не быть значения', () => {
    for (const status of [
      'accepted',
      'declined',
      'checked_in',
      'completed',
    ] as const) {
      const title = travelDecisionTitle(status);
      expect(title).not.toMatch(/(ла|лся)\b/);
      expect(title.length).toBeGreaterThan(0);
    }
  });
});

/**
 * Групповой звонок в беседе (VED-293, этап 3). Проверяем не только слова:
 * адрес и тег здесь — решения, от которых зависит, увидит ли человек
 * уведомление вообще.
 */
describe('групповой звонок в беседе', () => {
  const event = {
    name: 'chat.group-call-started',
    recipientId: 'user-1',
    conversationTitle: 'Вайшнавы Москвы',
    conversationId: 'conv-1',
    callId: 'room-1',
    starterName: 'Радха',
  } as const;

  it('называет беседу и того, кто зовёт', () => {
    expect(buildNotification(event)).toEqual({
      title: 'Вайшнавы Москвы',
      body: 'Радха зовёт в групповой звонок',
      url: '/chat/conv-1',
      tag: 'group-call:room-1',
      // Категория «Звонки», а не «Сообщения» (VED-361): зов в комнату
      // выключается тем же тумблером, что входящий и пропущенный.
      category: 'calls',
    });
  });

  it('пишет без рода: пол у User необязателен', () => {
    // «начал/начала» потребовало бы знать пол — его у портала может не быть.
    expect(buildNotification(event).body).not.toMatch(/начал|позвал/);
  });

  it('ведёт в беседу без параметра звонка', () => {
    // `?call=` глушится в приложении (`call-push-guard.ts`), а любой
    // параметр ломает подавление показа в `sw.js` (сравнение с pathname).
    expect(buildNotification(event).url).not.toContain('?');
  });

  it('тег не начинается с «call:» — это не входящий вызов', () => {
    // По `call:` service worker рисует «Ответить/Отклонить» и держит
    // уведомление на экране; комнате это не нужно.
    expect(buildNotification(event).tag.startsWith('call:')).toBe(false);
  });

  it('схлопывает волны об одном звонке общим тегом', () => {
    const second = buildNotification({ ...event, recipientId: 'user-2' });
    expect(second.tag).toBe(buildNotification(event).tag);
  });

  it('разные комнаты не схлопываются в одну строку', () => {
    expect(buildNotification({ ...event, callId: 'room-2' }).tag).not.toBe(
      buildNotification(event).tag,
    );
  });
});

/**
 * VED-298: «если уведомление о комментарии не имеет своего статуса, добавь ей
 * цветной статус Комментарий». Значок вида новости едет отдельно от
 * состояния задачи — переезд карточки переписывает состояние, а комментарий
 * остаётся комментарием.
 */
describe('buildNotification · значок «Комментарий»', () => {
  const base = {
    recipientId: 'u1',
    spaceId: 'space-1',
    taskKey: 'VED-42',
    taskTitle: 'Починить ссылки',
    actorName: 'Санкаршан',
  } as const;

  it('комментарий к задаче вне колонок состояния несёт «Комментарий»', () => {
    const content = buildNotification({
      ...base,
      name: 'work.task.commented',
      excerpt: 'Посмотрите ещё раз',
      commentCount: 1,
      columnName: 'ВДОХНОВЕНИЕ.',
      statusMark: null,
    });
    expect(content).toMatchObject({ mark: null, markFallback: 'comment' });
  });

  it('у комментария к задаче с состоянием значок — состояние, запасной не мешает', () => {
    const content = buildNotification({
      ...base,
      name: 'work.task.commented',
      excerpt: 'Посмотрите ещё раз',
      commentCount: 2,
      columnName: 'Тестерование',
      statusMark: 'testing',
    });
    expect(content).toMatchObject({ mark: 'testing', markFallback: 'comment' });
  });

  it('смена статуса, возврат и поручение «Комментарием» не становятся', () => {
    const moved = buildNotification({
      ...base,
      name: 'work.task.status-changed',
      fromColumnName: 'Тестерование',
      toColumnName: 'ВДОХНОВЕНИЕ.',
      // Перенос с приложенным комментарием — это перенос: побеждает он.
      commentExcerpt: 'Вернул в раздел',
      commentCount: 1,
      statusMark: null,
    });
    const returned = buildNotification({
      ...base,
      name: 'work.task.returned',
      columnName: 'РАЗНОЕ.',
      statusMark: null,
    });
    const assigned = buildNotification({
      ...base,
      name: 'work.task.assigned',
      spaceName: 'VedaMatch',
      columnName: 'РАЗНОЕ.',
      statusMark: null,
    });
    expect(moved.markFallback).toBeUndefined();
    expect(returned.markFallback).toBeUndefined();
    expect(assigned.markFallback).toBeUndefined();
  });
});

describe('buildNotification · решение по карточке «Здоровья» (VED-384)', () => {
  const base = {
    name: 'wellness.product.checked' as const,
    recipientId: 'u-1',
    productId: 'p-1',
    barcode: '3017620422003',
    productName: 'Nutella паста ореховая',
    decidedBy: 'ai' as const,
    refined: [] as Array<'name' | 'brand' | 'ingredients'>,
    reasons: [] as never[],
    comment: null,
  };

  it('принято ИИ — ведёт на карточку по штрихкоду', () => {
    const content = buildNotification({ ...base, outcome: 'accepted' });
    expect(content.title).toBe('Продукт добавлен в базу');
    expect(content.body).toContain('«Nutella паста ореховая»');
    expect(content.body).toContain('нашли в открытых источниках');
    expect(content.url).toBe('/wellness/products/3017620422003');
    expect(content.category).toBe('support');
    expect(content.tag).toBe('wellness-product:p-1');
  });

  it('уточнено — перечисляет, что поправили', () => {
    const content = buildNotification({
      ...base,
      outcome: 'refined',
      refined: ['name', 'ingredients'],
    });
    expect(content.title).toBe('Продукт добавлен с уточнениями');
    expect(content.body).toContain('уточнили название, состав');
  });

  it('передано человеку — называет причину словами, не кодом', () => {
    const content = buildNotification({
      ...base,
      outcome: 'review',
      reasons: ['not_found'],
    });
    expect(content.title).toBe('Продукт на проверке у модератора');
    expect(content.body).toBe(
      '«Nutella паста ореховая»: товар не нашёлся в открытых источниках. Модератор посмотрит сам — ответ придёт сюда же.',
    );
    expect(content.body).not.toContain('not_found');
    expect(content.url).toBe('/wellness/history');
  });

  it('отклонено ИИ — с причиной', () => {
    const content = buildNotification({
      ...base,
      outcome: 'rejected',
      reasons: ['not_food'],
    });
    expect(content.title).toBe('Продукт не добавлен');
    expect(content.body).toBe(
      '«Nutella паста ореховая»: это не продукт питания.',
    );
  });

  it('отклонено модератором — его словами', () => {
    const content = buildNotification({
      ...base,
      outcome: 'rejected',
      decidedBy: 'moderator',
      comment: 'На снимке таблица калорийности, а не состав',
    });
    expect(content.body).toBe(
      '«Nutella паста ореховая»: На снимке таблица калорийности, а не состав',
    );
  });

  it('принято модератором — говорит, кто проверил', () => {
    const content = buildNotification({
      ...base,
      outcome: 'accepted',
      decidedBy: 'moderator',
    });
    expect(content.body).toContain('проверил модератор');
  });

  it('у каждой причины есть формулировка', () => {
    for (const text of Object.values(WELLNESS_CHECK_REASON_TEXT)) {
      expect(text.length).toBeGreaterThan(5);
    }
  });
});

describe('buildNotification · часы сверх нормы (VED-459)', () => {
  const base = {
    recipientId: 'lead',
    requestId: 'r1',
    spaceId: 's1',
    spaceName: 'Сайт ашрама',
    taskKey: 'SA-1',
    taskTitle: 'Вёрстка',
    minutesPerDay: 90,
    fromDay: '2026-09-28',
    toDay: '2026-10-02',
  };

  it('ведущему — кто, сколько в день, за какие дни и по какой задаче', () => {
    const copy = buildNotification({
      ...base,
      name: 'work.overtime.requested',
      actorName: 'Радха',
    });
    expect(copy.title).toBe('Просят часы сверх нормы');
    expect(copy.body).toBe(
      'Радха: 1 ч 30 мин в день, с 28 сентября по 2 октября · SA-1 «Вёрстка»',
    );
    expect(copy.url).toBe('/work/planner/s1?task=SA-1');
    expect(copy.category).toBe('work');
  });

  it('решение — одобрено или нет, с пояснением ведущего', () => {
    const approved = buildNotification({
      ...base,
      name: 'work.overtime.decided',
      recipientId: 'radha',
      actorName: 'Маму',
      decision: 'approved',
      fromDay: '2026-09-28',
      toDay: '2026-09-28',
      note: '',
    });
    expect(approved.title).toBe('Часы сверх нормы одобрены');
    expect(approved.body).toBe('Маму: 1 ч 30 мин в день, 28 сентября');

    const rejected = buildNotification({
      ...base,
      name: 'work.overtime.decided',
      recipientId: 'radha',
      actorName: 'Маму',
      decision: 'rejected',
      note: 'бюджет кончился',
      taskKey: null,
      taskTitle: null,
    });
    expect(rejected.title).toBe('Часы сверх нормы не одобрены');
    expect(rejected.body).toContain('— бюджет кончился');
    expect(rejected.url).toBe('/work/planner/s1');
  });
});

describe('buildNotification · выплаты (VED-460)', () => {
  const base = {
    periodId: 'p1',
    spaceId: 's1',
    spaceName: 'Сайт ашрама',
    fromDay: '2026-09-19',
    toDay: '2026-09-25',
    currency: 'RUB',
  };

  it('сумма словами до копейки и знак валюты', () => {
    expect(formatMoneyMinor(2_475_000, 'RUB').replace(/\s/g, ' ')).toBe(
      '24 750 ₽',
    );
    expect(formatMoneyMinor(1_050, 'USD').replace(/\s/g, ' ')).toBe('10,50 $');
  });

  it('ведущему — итог доски, исполнителю — его сумма', () => {
    const lead = buildNotification({
      ...base,
      name: 'work.payout.closed',
      recipientId: 'lead',
      amountMinor: 2_475_000,
      role: 'lead',
    });
    expect(lead.title).toBe('Период подбит');
    expect(lead.body.replace(/\s/g, ' ')).toBe(
      '«Сайт ашрама», 19–25 сентября: к оплате 24 750 ₽',
    );
    expect(lead.url).toBe('/work/planner/s1?payouts=1');

    const executor = buildNotification({
      ...base,
      name: 'work.payout.closed',
      recipientId: 'g',
      amountMinor: 705_000,
      role: 'executor',
    });
    expect(executor.title).toBe('Вам к выплате');
    expect(executor.body.replace(/\s/g, ' ')).toBe(
      '7 050 ₽ за 19–25 сентября — «Сайт ашрама»',
    );
    const acrossMonths = buildNotification({
      ...base,
      toDay: '2026-10-02',
      fromDay: '2026-09-28',
      name: 'work.payout.paid',
      recipientId: 'g',
      amountMinor: 100,
    });
    expect(acrossMonths.body).toContain('28 сентября — 2 октября');
  });

  it('оплата отмечена', () => {
    const paid = buildNotification({
      ...base,
      name: 'work.payout.paid',
      recipientId: 'g',
      amountMinor: 705_000,
    });
    expect(paid.title).toBe('Выплата отмечена оплаченной');
  });
});

describe('buildNotification · напоминание об оплате (VED-461)', () => {
  it('сколько и сколько дней ждёт', () => {
    const copy = buildNotification({
      name: 'work.payout.reminder',
      recipientId: 'lead',
      periodId: 'p1',
      spaceId: 's1',
      spaceName: 'Сайт ашрама',
      fromDay: '2026-09-19',
      toDay: '2026-09-25',
      amountMinor: 2_475_000,
      currency: 'RUB',
      daysSinceClose: 21,
    });
    expect(copy.title).toBe('Период не оплачен');
    expect(copy.body.replace(/\s/g, ' ')).toBe(
      '«Сайт ашрама», 19–25 сентября: 24 750 ₽ ждут оплаты 21 день',
    );
  });
});
