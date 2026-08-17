import {
  NOTICE_DESCRIPTION_MAX_LENGTH,
  NOTICE_TITLE_MAX_LENGTH,
} from '@vedamatch/shared';
import { NOTICE_VALIDATION_MESSAGES, validateNotice } from './notice-validate';

const offer = {
  kind: 'offer' as const,
  rubricSlug: 'giveaway',
  titleRu: 'Отдам холодильник',
};

const create = { isCreate: true };
const patch = { isCreate: false };

describe('validateNotice: создание', () => {
  it('пропускает заполненное объявление', () => {
    expect(validateNotice(offer, create)).toBeNull();
  });

  it('требует вид, рубрику и заголовок', () => {
    expect(validateNotice({ ...offer, kind: null }, create)).toBe(
      'kind_invalid',
    );
    expect(validateNotice({ ...offer, rubricSlug: '  ' }, create)).toBe(
      'rubric_required',
    );
    expect(validateNotice({ ...offer, titleRu: '  ' }, create)).toBe(
      'title_required',
    );
  });

  it('одного заголовка из пары достаточно', () => {
    expect(
      validateNotice(
        { ...offer, titleRu: null, titleEn: 'Free fridge' },
        create,
      ),
    ).toBeNull();
  });

  it('ловит длинные поля', () => {
    expect(
      validateNotice(
        { ...offer, titleRu: 'я'.repeat(NOTICE_TITLE_MAX_LENGTH + 1) },
        create,
      ),
    ).toBe('title_too_long');
    expect(
      validateNotice(
        {
          ...offer,
          descriptionRu: 'я'.repeat(NOTICE_DESCRIPTION_MAX_LENGTH + 1),
        },
        create,
      ),
    ).toBe('description_too_long');
  });
});

describe('validateNotice: правка', () => {
  it('пустой патч ничего не ломает', () => {
    expect(validateNotice({}, patch)).toBeNull();
  });

  it('но переданный пустой заголовок отвергается', () => {
    expect(validateNotice({ titleRu: '', titleEn: '' }, patch)).toBe(
      'title_required',
    );
  });
});

describe('validateNotice: событие', () => {
  const event = {
    kind: 'event' as const,
    rubricSlug: 'programs',
    titleRu: 'Воскресная программа',
    startsAt: '2026-09-01T14:00:00.000Z',
    timeZone: 'Europe/Moscow',
  };

  it('пропускает событие с датой и поясом', () => {
    expect(validateNotice(event, create)).toBeNull();
  });

  it('требует дату начала', () => {
    expect(validateNotice({ ...event, startsAt: null }, create)).toBe(
      'event_start_required',
    );
  });

  it('требует пояс рядом с датой', () => {
    // «18:00» без пояса ничего не значит для участника из другого города.
    expect(validateNotice({ ...event, timeZone: null }, create)).toBe(
      'event_timezone_required',
    );
  });

  it('не пускает конец раньше начала', () => {
    expect(
      validateNotice({ ...event, endsAt: '2026-08-01T14:00:00.000Z' }, create),
    ).toBe('event_end_before_start');
  });

  it('пояс требуется и у обычного объявления, если задана дата', () => {
    expect(
      validateNotice(
        { ...offer, startsAt: '2026-09-01T14:00:00.000Z' },
        create,
      ),
    ).toBe('event_timezone_required');
  });
});

describe('validateNotice: онлайн и видимость', () => {
  it('онлайн-встреча без ссылки не проходит', () => {
    expect(validateNotice({ ...offer, isOnline: true }, create)).toBe(
      'online_url_required',
    );
  });

  it('ссылка должна быть http(s)', () => {
    expect(
      validateNotice(
        { ...offer, isOnline: true, onlineUrl: 'javascript:alert(1)' },
        create,
      ),
    ).toBe('online_url_invalid');
    expect(
      validateNotice(
        { ...offer, isOnline: true, onlineUrl: 'https://meet.example/x' },
        create,
      ),
    ).toBeNull();
  });

  it('«только моей общине» без общины — объявление, которое никто не увидит', () => {
    expect(validateNotice({ ...offer, audience: 'my_community' }, create)).toBe(
      'community_audience_requires_community',
    );
    expect(
      validateNotice(
        { ...offer, audience: 'my_community', communityId: 'c1' },
        create,
      ),
    ).toBeNull();
  });

  it('половина координаты хуже отсутствующей', () => {
    expect(
      validateNotice(
        { ...offer, location: { city: 'Москва', lat: 55.75, lon: Number.NaN } },
        create,
      ),
    ).toBe('location_invalid');
  });
});

describe('сообщения об ошибках', () => {
  it('есть на каждый код: наружу коды не отдаются', () => {
    for (const [code, message] of Object.entries(NOTICE_VALIDATION_MESSAGES)) {
      expect(message).toBeTruthy();
      expect(message).not.toBe(code);
    }
  });
});
