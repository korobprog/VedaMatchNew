import { describeIceServerForLog, normalizeIceServers } from './ice-server-normalize';

const REAL_RESPONSE = [
  { urls: ['stun:turn.vedamatch.ru:3478'] },
  { urls: ['stun:stun.l.google.com:19302'] },
  {
    urls: [
      'turn:turn.vedamatch.ru:3478?transport=udp',
      'turn:turn.vedamatch.ru:3478?transport=tcp',
      'turns:turn.vedamatch.ru:5349?transport=tcp',
    ],
    username: 'u123',
    credential: 'c456',
  },
];

describe('normalizeIceServers', () => {
  it('разворачивает многосхемную TURN-запись в отдельные записи по одному URL', () => {
    const result = normalizeIceServers(REAL_RESPONSE);
    expect(result).toEqual([
      { urls: ['stun:turn.vedamatch.ru:3478'] },
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['turn:turn.vedamatch.ru:3478?transport=udp'], username: 'u123', credential: 'c456' },
      { urls: ['turn:turn.vedamatch.ru:3478?transport=tcp'], username: 'u123', credential: 'c456' },
      { urls: ['turns:turn.vedamatch.ru:5349?transport=tcp'], username: 'u123', credential: 'c456' },
    ]);
  });

  it('у stun-записей username/credential не появляются, даже если бы сервер их прислал', () => {
    const result = normalizeIceServers([{ urls: ['stun:x:3478'], username: 'u', credential: 'c' }]);
    expect(result).toEqual([{ urls: ['stun:x:3478'] }]);
  });

  it('дублирующиеся URL схлопываются в одну запись', () => {
    const result = normalizeIceServers([
      { urls: ['stun:x:3478'] },
      { urls: ['stun:x:3478'] },
    ]);
    expect(result).toEqual([{ urls: ['stun:x:3478'] }]);
  });

  it('пустой список серверов даёт пустой список', () => {
    expect(normalizeIceServers([])).toEqual([]);
  });

  it('запись без urls вовсе (пустой массив) ничего не добавляет', () => {
    expect(normalizeIceServers([{ urls: [] }])).toEqual([]);
  });
});

describe('describeIceServerForLog', () => {
  it('схема/транспорт/факт учётки без хоста, порта и значений', () => {
    const [, , udp, tcp, tls] = normalizeIceServers(REAL_RESPONSE);
    expect(describeIceServerForLog(udp)).toEqual({
      scheme: 'turn',
      transport: 'udp',
      hasUsername: true,
      hasCredential: true,
    });
    expect(describeIceServerForLog(tcp)).toEqual({
      scheme: 'turn',
      transport: 'tcp',
      hasUsername: true,
      hasCredential: true,
    });
    expect(describeIceServerForLog(tls)).toEqual({
      scheme: 'turns',
      transport: 'tcp',
      hasUsername: true,
      hasCredential: true,
    });
  });

  it('stun без ?transport= — transport null, учётки нет', () => {
    const [stun] = normalizeIceServers(REAL_RESPONSE);
    expect(describeIceServerForLog(stun)).toEqual({
      scheme: 'stun',
      transport: null,
      hasUsername: false,
      hasCredential: false,
    });
  });
});
