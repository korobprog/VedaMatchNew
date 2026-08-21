// Справочник городов портала. Названия и алиасы — наши, координаты и страна
// пришли из OpenStreetMap (ODbL) по латинскому запросу: кириллицей часть
// святых мест там не находится вовсе. Файл собран скриптом, но правится
// руками — добавить город значит дописать строку и прогнать `pnpm seed`.
//
// `aliases` — всё, по чему город должен находиться, в нижнем регистре:
// русское имя, латинское, исторические и разговорные варианты. Поиск идёт
// по началу любого из них, поэтому «мая» находит Маяпур.

const geoCities = [
  {
    "city": "Маяпур",
    "country": "Индия",
    "weight": 100,
    "lat": 23.4234,
    "lon": 88.3908,
    "displayName": "Маяпур, Западная Бенгалия, Индия",
    "aliases": [
      "маяпур",
      "mayapur",
      "майяпур",
      "шридхам маяпур"
    ]
  },
  {
    "city": "Навадвипа",
    "country": "Индия",
    "weight": 100,
    "lat": 23.4087,
    "lon": 88.3658,
    "displayName": "Навадвипа, Западная Бенгалия, Индия",
    "aliases": [
      "навадвипа",
      "nabadwip",
      "navadwip",
      "navadvipa",
      "навадвип"
    ]
  },
  {
    "city": "Вриндаван",
    "country": "Индия",
    "weight": 100,
    "lat": 27.5754,
    "lon": 77.6938,
    "displayName": "Вриндаван, Уттар-Прадеш, Индия",
    "aliases": [
      "вриндаван",
      "vrindavan",
      "vrindavana",
      "вриндавана"
    ]
  },
  {
    "city": "Матхура",
    "country": "Индия",
    "weight": 100,
    "lat": 27.4956,
    "lon": 77.6856,
    "displayName": "Матхура, Уттар-Прадеш, Индия",
    "aliases": [
      "матхура",
      "mathura",
      "матура"
    ]
  },
  {
    "city": "Говардхан",
    "country": "Индия",
    "weight": 100,
    "lat": 27.4973,
    "lon": 77.4612,
    "displayName": "Говардхан, Уттар-Прадеш, Индия",
    "aliases": [
      "говардхан",
      "govardhan",
      "говардхана"
    ]
  },
  {
    "city": "Гокула",
    "country": "Индия",
    "weight": 100,
    "lat": 27.4391,
    "lon": 77.7204,
    "displayName": "Гокула, Уттар-Прадеш, Индия",
    "aliases": [
      "гокула",
      "gokul",
      "гокул"
    ]
  },
  {
    "city": "Джаганнатха-Пури",
    "country": "Индия",
    "weight": 100,
    "lat": 19.8076,
    "lon": 85.8253,
    "displayName": "Джаганнатха-Пури, Одиша, Индия",
    "aliases": [
      "джаганнатха-пури",
      "puri",
      "пури",
      "джаганнатха пури"
    ]
  },
  {
    "city": "Дварака",
    "country": "Индия",
    "weight": 100,
    "lat": 22.2425,
    "lon": 68.9671,
    "displayName": "Дварака, Гуджарат, Индия",
    "aliases": [
      "дварака",
      "dwarka",
      "дварка"
    ]
  },
  {
    "city": "Тирупати",
    "country": "Индия",
    "weight": 90,
    "lat": 13.6316,
    "lon": 79.4232,
    "displayName": "Тирупати, Андхра-Прадеш, Индия",
    "aliases": [
      "тирупати",
      "tirupati"
    ]
  },
  {
    "city": "Харидвар",
    "country": "Индия",
    "weight": 90,
    "lat": 29.9384,
    "lon": 78.1453,
    "displayName": "Харидвар, Уттаракханд, Индия",
    "aliases": [
      "харидвар",
      "haridwar"
    ]
  },
  {
    "city": "Ришикеш",
    "country": "Индия",
    "weight": 90,
    "lat": 30.1087,
    "lon": 78.2916,
    "displayName": "Ришикеш, Уттаракханд, Индия",
    "aliases": [
      "ришикеш",
      "rishikesh"
    ]
  },
  {
    "city": "Варанаси",
    "country": "Индия",
    "weight": 90,
    "lat": 25.3356,
    "lon": 83.0076,
    "displayName": "Варанаси, Уттар-Прадеш, Индия",
    "aliases": [
      "варанаси",
      "varanasi",
      "бенарес"
    ]
  },
  {
    "city": "Праяградж",
    "country": "Индия",
    "weight": 90,
    "lat": 25.4381,
    "lon": 81.8338,
    "displayName": "Праяградж, Уттар-Прадеш, Индия",
    "aliases": [
      "праяградж",
      "prayagraj",
      "аллахабад",
      "allahabad"
    ]
  },
  {
    "city": "Дели",
    "country": "Индия",
    "weight": 80,
    "lat": 28.6665,
    "lon": 77.217,
    "displayName": "Дели, Дели, Индия",
    "aliases": [
      "дели",
      "delhi",
      "нью-дели",
      "new delhi"
    ]
  },
  {
    "city": "Калькутта",
    "country": "Индия",
    "weight": 80,
    "lat": 22.5726,
    "lon": 88.3639,
    "displayName": "Калькутта, Западная Бенгалия, Индия",
    "aliases": [
      "калькутта",
      "kolkata",
      "колката"
    ]
  },
  {
    "city": "Мумбаи",
    "country": "Индия",
    "weight": 80,
    "lat": 19.055,
    "lon": 72.8692,
    "displayName": "Мумбаи, Махараштра, Индия",
    "aliases": [
      "мумбаи",
      "mumbai",
      "бомбей",
      "bombay"
    ]
  },
  {
    "city": "Ченнаи",
    "country": "Индия",
    "weight": 80,
    "lat": 13.0837,
    "lon": 80.2702,
    "displayName": "Ченнаи, Тамилнад, Индия",
    "aliases": [
      "ченнаи",
      "chennai",
      "мадрас"
    ]
  },
  {
    "city": "Бангалор",
    "country": "Индия",
    "weight": 80,
    "lat": 12.9768,
    "lon": 77.5901,
    "displayName": "Бангалор, Карнатака, Индия",
    "aliases": [
      "бангалор",
      "bengaluru",
      "bangalore"
    ]
  },
  {
    "city": "Джайпур",
    "country": "Индия",
    "weight": 80,
    "lat": 26.9155,
    "lon": 75.819,
    "displayName": "Джайпур, Раджастхан, Индия",
    "aliases": [
      "джайпур",
      "jaipur"
    ]
  },
  {
    "city": "Катманду",
    "country": "Непал",
    "weight": 80,
    "lat": 27.7083,
    "lon": 85.3206,
    "displayName": "Катманду, Багмати-Прадеш, Непал",
    "aliases": [
      "катманду",
      "kathmandu"
    ]
  },
  {
    "city": "Москва",
    "country": "Россия",
    "weight": 70,
    "lat": 55.6256,
    "lon": 37.6064,
    "displayName": "Москва, Москва, Россия",
    "aliases": [
      "москва",
      "moscow",
      "moskva"
    ]
  },
  {
    "city": "Санкт-Петербург",
    "country": "Россия",
    "weight": 70,
    "lat": 59.9607,
    "lon": 30.1587,
    "displayName": "Санкт-Петербург, Санкт-Петербург, Россия",
    "aliases": [
      "санкт-петербург",
      "saint petersburg",
      "спб",
      "питер",
      "ленинград"
    ]
  },
  {
    "city": "Новосибирск",
    "country": "Россия",
    "weight": 60,
    "lat": 55.0288,
    "lon": 82.9227,
    "displayName": "Новосибирск, Новосибирская область, Россия",
    "aliases": [
      "новосибирск",
      "novosibirsk"
    ]
  },
  {
    "city": "Екатеринбург",
    "country": "Россия",
    "weight": 60,
    "lat": 56.8382,
    "lon": 60.6008,
    "displayName": "Екатеринбург, Свердловская область, Россия",
    "aliases": [
      "екатеринбург",
      "yekaterinburg",
      "ekaterinburg"
    ]
  },
  {
    "city": "Казань",
    "country": "Россия",
    "weight": 60,
    "lat": 55.7946,
    "lon": 49.1115,
    "displayName": "Казань, Татарстан, Россия",
    "aliases": [
      "казань",
      "kazan"
    ]
  },
  {
    "city": "Нижний Новгород",
    "country": "Россия",
    "weight": 60,
    "lat": 56.3265,
    "lon": 44.0051,
    "displayName": "Нижний Новгород, Нижегородская область, Россия",
    "aliases": [
      "нижний новгород",
      "nizhny novgorod"
    ]
  },
  {
    "city": "Самара",
    "country": "Россия",
    "weight": 60,
    "lat": 53.1956,
    "lon": 50.1015,
    "displayName": "Самара, Самарская область, Россия",
    "aliases": [
      "самара",
      "samara"
    ]
  },
  {
    "city": "Челябинск",
    "country": "Россия",
    "weight": 60,
    "lat": 55.1598,
    "lon": 61.4026,
    "displayName": "Челябинск, Челябинская область, Россия",
    "aliases": [
      "челябинск",
      "chelyabinsk"
    ]
  },
  {
    "city": "Омск",
    "country": "Россия",
    "weight": 60,
    "lat": 54.9914,
    "lon": 73.3715,
    "displayName": "Омск, Омская область, Россия",
    "aliases": [
      "омск",
      "omsk"
    ]
  },
  {
    "city": "Ростов-на-Дону",
    "country": "Россия",
    "weight": 60,
    "lat": 47.261,
    "lon": 39.7249,
    "displayName": "Ростов-на-Дону, Ростовская область, Россия",
    "aliases": [
      "ростов-на-дону",
      "rostov-on-don",
      "ростов на дону"
    ]
  },
  {
    "city": "Уфа",
    "country": "Россия",
    "weight": 60,
    "lat": 54.7261,
    "lon": 55.9475,
    "displayName": "Уфа, Башкортостан, Россия",
    "aliases": [
      "уфа",
      "ufa"
    ]
  },
  {
    "city": "Красноярск",
    "country": "Россия",
    "weight": 60,
    "lat": 56.0091,
    "lon": 92.8726,
    "displayName": "Красноярск, Красноярский край, Россия",
    "aliases": [
      "красноярск",
      "krasnoyarsk"
    ]
  },
  {
    "city": "Пермь",
    "country": "Россия",
    "weight": 60,
    "lat": 58.0109,
    "lon": 56.2319,
    "displayName": "Пермь, Пермский край, Россия",
    "aliases": [
      "пермь",
      "perm"
    ]
  },
  {
    "city": "Воронеж",
    "country": "Россия",
    "weight": 60,
    "lat": 51.68,
    "lon": 39.1837,
    "displayName": "Воронеж, Воронежская область, Россия",
    "aliases": [
      "воронеж",
      "voronezh"
    ]
  },
  {
    "city": "Волгоград",
    "country": "Россия",
    "weight": 60,
    "lat": 48.7082,
    "lon": 44.5153,
    "displayName": "Волгоград, Волгоградская область, Россия",
    "aliases": [
      "волгоград",
      "volgograd"
    ]
  },
  {
    "city": "Краснодар",
    "country": "Россия",
    "weight": 60,
    "lat": 45.0352,
    "lon": 38.9772,
    "displayName": "Краснодар, Краснодарский край, Россия",
    "aliases": [
      "краснодар",
      "krasnodar"
    ]
  },
  {
    "city": "Сочи",
    "country": "Россия",
    "weight": 60,
    "lat": 43.5855,
    "lon": 39.7231,
    "displayName": "Сочи, Краснодарский край, Россия",
    "aliases": [
      "сочи",
      "sochi"
    ]
  },
  {
    "city": "Владивосток",
    "country": "Россия",
    "weight": 60,
    "lat": 43.1151,
    "lon": 131.8856,
    "displayName": "Владивосток, Приморский край, Россия",
    "aliases": [
      "владивосток",
      "vladivostok"
    ]
  },
  {
    "city": "Калининград",
    "country": "Россия",
    "weight": 60,
    "lat": 54.7046,
    "lon": 20.4566,
    "displayName": "Калининград, Калининградская область, Россия",
    "aliases": [
      "калининград",
      "kaliningrad"
    ]
  },
  {
    "city": "Минск",
    "country": "Беларусь",
    "weight": 60,
    "lat": 53.9025,
    "lon": 27.5618,
    "displayName": "Минск, Беларусь",
    "aliases": [
      "минск",
      "minsk"
    ]
  },
  {
    "city": "Киев",
    "country": "Украина",
    "weight": 60,
    "lat": 50.45,
    "lon": 30.5241,
    "displayName": "Киев, Украина",
    "aliases": [
      "киев",
      "kyiv",
      "kiev"
    ]
  },
  {
    "city": "Алматы",
    "country": "Казахстан",
    "weight": 60,
    "lat": 43.2364,
    "lon": 76.9457,
    "displayName": "Алматы, Казахстан",
    "aliases": [
      "алматы",
      "almaty",
      "алма-ата"
    ]
  },
  {
    "city": "Астана",
    "country": "Казахстан",
    "weight": 60,
    "lat": 51.116,
    "lon": 71.4677,
    "displayName": "Астана, Астана, Казахстан",
    "aliases": [
      "астана",
      "astana",
      "нур-султан"
    ]
  },
  {
    "city": "Ташкент",
    "country": "Узбекистан",
    "weight": 60,
    "lat": 41.3123,
    "lon": 69.2787,
    "displayName": "Ташкент, Узбекистан",
    "aliases": [
      "ташкент",
      "tashkent"
    ]
  },
  {
    "city": "Тбилиси",
    "country": "Грузия",
    "weight": 60,
    "lat": 41.6935,
    "lon": 44.8014,
    "displayName": "Тбилиси, Грузия",
    "aliases": [
      "тбилиси",
      "tbilisi"
    ]
  },
  {
    "city": "Ереван",
    "country": "Армения",
    "weight": 60,
    "lat": 40.1777,
    "lon": 44.5126,
    "displayName": "Ереван, Армения",
    "aliases": [
      "ереван",
      "yerevan"
    ]
  },
  {
    "city": "Баку",
    "country": "Азербайджан",
    "weight": 60,
    "lat": 40.3756,
    "lon": 49.8328,
    "displayName": "Баку, Азербайджан",
    "aliases": [
      "баку",
      "baku"
    ]
  },
  {
    "city": "Бишкек",
    "country": "Кыргызстан",
    "weight": 60,
    "lat": 42.8761,
    "lon": 74.6037,
    "displayName": "Бишкек, Кыргызстан",
    "aliases": [
      "бишкек",
      "bishkek"
    ]
  },
  {
    "city": "Рига",
    "country": "Латвия",
    "weight": 60,
    "lat": 56.9494,
    "lon": 24.1052,
    "displayName": "Рига, Латвия",
    "aliases": [
      "рига",
      "riga"
    ]
  },
  {
    "city": "Вильнюс",
    "country": "Литва",
    "weight": 60,
    "lat": 54.687,
    "lon": 25.2829,
    "displayName": "Вильнюс, Вильнюсский уезд, Литва",
    "aliases": [
      "вильнюс",
      "vilnius"
    ]
  },
  {
    "city": "Таллин",
    "country": "Эстония",
    "weight": 60,
    "lat": 59.4372,
    "lon": 24.7573,
    "displayName": "Таллин, Эстония",
    "aliases": [
      "таллин",
      "tallinn",
      "таллинн"
    ]
  },
  {
    "city": "Кишинёв",
    "country": "Молдова",
    "weight": 60,
    "lat": 47.0245,
    "lon": 28.8323,
    "displayName": "Кишинёв, Молдова",
    "aliases": [
      "кишинёв",
      "chisinau",
      "кишинев"
    ]
  }
];

module.exports = { geoCities };
