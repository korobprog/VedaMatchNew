import {
  checkFetchUrl,
  comparableUrl,
  htmlToText,
  isPublicAddress,
  isSiteRoot,
  pageMentionsBarcode,
  sourceSite,
} from './source-check';

describe('checkFetchUrl — куда серверу можно идти по слову ИИ', () => {
  it.each([
    'https://world.openfoodfacts.org/product/3017620422003',
    'http://shop.example.ru/item?id=1',
    'https://shop.example.ru:443/item',
  ])('пускает обычную страницу %s', (url) => {
    expect(checkFetchUrl(url)).toBeNull();
  });

  it.each([
    ['не адрес', 'malformed'],
    ['file:///etc/passwd', 'scheme_not_allowed'],
    ['ftp://example.org/x', 'scheme_not_allowed'],
    ['https://user:pass@example.org/', 'credentials'],
    ['https://example.org:8080/', 'port_not_allowed'],
    ['http://127.0.0.1/', 'ip_literal'],
    ['http://0x7f.0.0.1/', 'ip_literal'],
    ['http://2130706433/', 'ip_literal'],
    ['http://[::1]/', 'ip_literal'],
    ['http://169.254.169.254/latest/meta-data', 'ip_literal'],
    ['http://localhost/', 'internal_name'],
    ['http://postgres:5432/', 'port_not_allowed'],
    ['http://redis/', 'internal_name'],
    ['http://api.internal/', 'internal_name'],
    ['http://printer.local/', 'internal_name'],
  ])('не пускает %s (%s)', (url, reason) => {
    expect(checkFetchUrl(url)).toBe(reason);
  });
});

describe('isPublicAddress — то, во что резолвится имя', () => {
  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '2a00:1450:4010:c05::64'])(
    'публичный %s',
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  );

  it.each([
    '10.0.0.5',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1%eth0',
    'ff02::1',
    '::ffff:10.0.0.1',
    '::ffff:a00:1',
    '64:ff9b::10.0.0.1',
    '2002:7f00:1::',
    'не адрес',
  ])('внутренний или непонятный %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it('IPv4 внутри IPv6 с публичным адресом — публичный', () => {
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
  });
});

describe('htmlToText', () => {
  it('выбрасывает скрипты и стили вместе с цифрами в них', () => {
    const html =
      '<html><head><style>.a{color:red}</style><script>var ean="3017620422003"</script></head>' +
      '<body><h1>Паста</h1><p>Состав: сахар</p></body></html>';
    const text = htmlToText(html);
    expect(text).toBe('Паста Состав: сахар');
    expect(text).not.toContain('3017620422003');
  });

  it('разметку JSON-LD сохраняет — там магазины держат gtin13', () => {
    const html =
      '<script type="application/ld+json">{"gtin13":"3017620422003"}</script><p>Паста</p>';
    expect(htmlToText(html)).toContain('3017620422003');
  });

  it('раскрывает сущности и склеивает пробелы', () => {
    expect(
      htmlToText('<p>Соль&nbsp;&amp;&#32;перец &#x421;</p>\n\n<!-- x -->'),
    ).toBe('Соль & перец С');
  });
});

describe('pageMentionsBarcode', () => {
  const code = '4607017099360';

  it('находит код как отдельное число', () => {
    expect(pageMentionsBarcode(`Штрихкод: ${code}. Вес 350 г`, code)).toBe(
      true,
    );
  });

  it('склеивает код, разбитый пробелами и дефисами', () => {
    expect(pageMentionsBarcode('EAN 4 607017 099360', code)).toBe(true);
    expect(pageMentionsBarcode('EAN 4-607017-099360', code)).toBe(true);
  });

  it('код внутри длинного числа — это другой номер', () => {
    expect(pageMentionsBarcode(`Артикул 9${code}1`, code)).toBe(false);
  });

  it('нет кода — нет подтверждения', () => {
    expect(pageMentionsBarcode('Паста ореховая, 350 г', code)).toBe(false);
  });

  it('UPC-A и тот же код в GTIN-13 с ведущим нулём — один товар', () => {
    expect(
      pageMentionsBarcode('UPC 012345678905', '12345678905'.padStart(12, '0')),
    ).toBe(true);
    expect(pageMentionsBarcode('UPC 036000291452', '0036000291452')).toBe(true);
    expect(pageMentionsBarcode('EAN 0036000291452', '036000291452')).toBe(true);
  });

  it('не штрихкод — не ищем вовсе (иначе регулярка из мусора)', () => {
    expect(pageMentionsBarcode('abc', '.*')).toBe(false);
  });
});

describe('sourceSite — независимость источников', () => {
  it('поддомены одного магазина — один сайт', () => {
    expect(sourceSite('https://www.shop.ru/a')).toBe('shop.ru');
    expect(sourceSite('https://m.shop.ru/b')).toBe('shop.ru');
  });

  it('зоны вида .com.ru и .co.uk — три метки', () => {
    expect(sourceSite('https://www.tesco.co.uk/p/1')).toBe('tesco.co.uk');
    expect(sourceSite('https://shop.example.com.ru/p')).toBe('example.com.ru');
  });

  it('битый адрес — нет сайта', () => {
    expect(sourceSite('мусор')).toBeNull();
  });
});

describe('isSiteRoot', () => {
  it('главная страница — не источник о товаре (так ИИ ответил в пробе)', () => {
    expect(isSiteRoot('https://barcodenest.com/')).toBe(true);
    expect(isSiteRoot('https://barcodenest.com')).toBe(true);
  });

  it('страница товара и поиск по сайту — не главная', () => {
    expect(isSiteRoot('https://barcodenest.com/docs/')).toBe(false);
    expect(isSiteRoot('https://shop.ru/?q=3017620422003')).toBe(false);
  });

  it('битый адрес считается главной — не засчитывается', () => {
    expect(isSiteRoot('мусор')).toBe(true);
  });
});

describe('comparableUrl', () => {
  it('без якоря, меток кампаний и слеша на конце', () => {
    expect(
      comparableUrl('https://shop.ru/p/1/?utm_source=openai&id=5#reviews'),
    ).toBe('https://shop.ru/p/1/?id=5');
    expect(comparableUrl('https://shop.ru/p/1/')).toBe('https://shop.ru/p/1');
  });

  it('битый адрес — null', () => {
    expect(comparableUrl('мусор')).toBeNull();
  });
});
