import { checkIngestUrl, isPrivateAddress } from './ingest-url-guard';

describe('checkIngestUrl', () => {
  it('пропускает обычный https-адрес', () => {
    expect(checkIngestUrl('https://archive.example/kirtan.mp3')).toBeNull();
  });

  it('отбивает не http-схемы', () => {
    expect(checkIngestUrl('file:///etc/passwd')).toBe('scheme_not_allowed');
    expect(checkIngestUrl('ftp://example.org/a.mp3')).toBe('scheme_not_allowed');
    // `data:` целиком помещается в строку и обходит все проверки размера.
    expect(checkIngestUrl('data:audio/mpeg;base64,AAAA')).toBe('scheme_not_allowed');
  });

  it('отбивает литеральные адреса внутренней сети', () => {
    expect(checkIngestUrl('http://127.0.0.1:5432/')).toBe('private_address');
    expect(checkIngestUrl('http://10.0.0.5/a.mp3')).toBe('private_address');
    expect(checkIngestUrl('http://169.254.169.254/latest/meta-data/')).toBe(
      'private_address',
    );
    expect(checkIngestUrl('http://[::1]/a.mp3')).toBe('private_address');
  });

  it('отбивает localhost по имени', () => {
    expect(checkIngestUrl('http://localhost:4000/health')).toBe('private_address');
  });

  it('мусор адресом не считает', () => {
    expect(checkIngestUrl('не адрес')).toBe('malformed');
    expect(checkIngestUrl('')).toBe('malformed');
  });
});

describe('isPrivateAddress', () => {
  it('знает частные диапазоны IPv4', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('0.0.0.0')).toBe(true);
  });

  it('пропускает публичные', () => {
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('знает IPv6: петлю, уникальные локальные и link-local', () => {
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    // IPv4, завёрнутый в IPv6, — обход проверки, если смотреть только на
    // префикс.
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
});

// Ниже — случаи сверх плана. Каждый из них обходит проверку, написанную
// «в лоб»: сравнение имени со строкой `localhost` и десятичный разбор IPv4.
describe('checkIngestUrl: обходные записи того же адреса', () => {
  it('видит петлю в шестнадцатеричной, восьмеричной и короткой записи', () => {
    // `new URL` приводит их все к 127.0.0.1, но разбирать надо и напрямую:
    // проверка не должна зависеть от того, кто нормализовал строку.
    expect(checkIngestUrl('http://0x7f.0.0.1/a.mp3')).toBe('private_address');
    expect(checkIngestUrl('http://0177.0.0.1/a.mp3')).toBe('private_address');
    expect(checkIngestUrl('http://2130706433/a.mp3')).toBe('private_address');
    expect(checkIngestUrl('http://127.1/a.mp3')).toBe('private_address');
  });

  it('видит IPv4 внутри IPv6 после нормализации адреса', () => {
    // `new URL` перепишет это в `[::ffff:a00:1]` — точек в записи не
    // останется, и текстовое сравнение с «10.» промахнётся.
    expect(checkIngestUrl('http://[::ffff:10.0.0.1]/a.mp3')).toBe('private_address');
    expect(checkIngestUrl('http://[::]/a.mp3')).toBe('private_address');
  });

  it('не верит имени перед собакой', () => {
    // Пользовательская часть адреса выглядит как хост, но хост — то, что
    // после `@`.
    expect(checkIngestUrl('http://archive.example@127.0.0.1/a.mp3')).toBe(
      'private_address',
    );
    expect(checkIngestUrl('http://user@localhost/')).toBe('private_address');
  });

  it('видит петлю за завершающей точкой и в поддомене', () => {
    // `localhost.` резолвится туда же, но со строкой `localhost` не совпадает.
    expect(checkIngestUrl('http://localhost./')).toBe('private_address');
    expect(checkIngestUrl('http://api.localhost/a.mp3')).toBe('private_address');
  });

  it('отбивает прочие схемы, а не только перечисленные', () => {
    expect(checkIngestUrl('gopher://example.org/a')).toBe('scheme_not_allowed');
  });

  it('адрес без схемы — мусор, а не http по умолчанию', () => {
    // Иначе «archive.example/a.mp3» тихо превратился бы в поход неизвестно
    // куда.
    expect(checkIngestUrl('archive.example/a.mp3')).toBe('malformed');
    expect(checkIngestUrl('   ')).toBe('malformed');
  });
});

describe('isPrivateAddress: границы диапазонов и прочие непубличные адреса', () => {
  it('держит границы 172.16/12 с обеих сторон', () => {
    expect(isPrivateAddress('172.15.255.255')).toBe(false);
    expect(isPrivateAddress('172.16.0.0')).toBe(true);
    expect(isPrivateAddress('172.31.255.255')).toBe(true);
    expect(isPrivateAddress('172.32.0.0')).toBe(false);
  });

  it('знает NAT провайдера, широковещание и многоадресную рассылку', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('255.255.255.255')).toBe(true);
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
    expect(isPrivateAddress('100.63.255.255')).toBe(false);
  });

  it('разворачивает IPv4 из любой обёртки, а не только из десятичной', () => {
    expect(isPrivateAddress('::ffff:a00:1')).toBe(true);
    expect(isPrivateAddress('64:ff9b::127.0.0.1')).toBe(true);
    // 6to4: адрес шлюза лежит в битах 16–47, и `2002:7f00:1::` — это та же
    // петля, записанная третьим способом.
    expect(isPrivateAddress('2002:7f00:1::')).toBe(true);
    expect(isPrivateAddress('2002:a00:1::1')).toBe(true);
    expect(isPrivateAddress('2002:a9fe:a9fe::')).toBe(true);
    // Публичный шлюз 6to4 остаётся публичным: закрывать надо диапазон, а не
    // префикс целиком.
    expect(isPrivateAddress('2002:808:808::')).toBe(false);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('знает fd-половину уникальных локальных и зону интерфейса', () => {
    expect(isPrivateAddress('fd12:3456::1')).toBe(true);
    expect(isPrivateAddress('fe80::1%eth0')).toBe(true);
    expect(isPrivateAddress('[::1]')).toBe(true);
  });

  it('имя адресом не считает', () => {
    expect(isPrivateAddress('archive.example')).toBe(false);
    expect(isPrivateAddress('')).toBe(false);
    expect(isPrivateAddress('999.1.1.1')).toBe(false);
  });
});
