// Рубрики доски объявлений. Данные, а не enum: тематика растёт постоянно, и
// каждое добавление миграцией было бы тупиком — см. docs/notices-service-plan.md.
//
// `kinds` — виды, в которых рубрика предлагается в форме. Пустой массив
// означает «во всех»: «разное» уместно и в просьбе, и в предложении.
// Порядок в массиве задаёт `position`, отдельной колонки в файле нет —
// её проще не рассинхронизировать, если не хранить.

const noticeRubrics = [
  {
    slug: 'giveaway',
    kinds: ['offer'],
    nameRu: 'Отдам даром',
    nameEn: 'Free to a good home',
  },
  {
    slug: 'looking-for-gift',
    kinds: ['request'],
    nameRu: 'Приму в дар',
    nameEn: 'Looking for a gift',
  },
  {
    slug: 'prasadam-kitchen',
    kinds: ['offer', 'request'],
    nameRu: 'Прасад и кухня',
    nameEn: 'Prasadam and kitchen',
  },
  {
    slug: 'housing',
    kinds: ['offer', 'request'],
    nameRu: 'Жильё и соседи',
    nameEn: 'Housing and roommates',
  },
  {
    slug: 'rides',
    kinds: ['offer', 'request'],
    nameRu: 'Транспорт и попутчики',
    nameEn: 'Rides and travel companions',
  },
  {
    slug: 'lost-found',
    kinds: ['offer', 'request'],
    nameRu: 'Потерял и нашёл',
    nameEn: 'Lost and found',
  },
  {
    slug: 'seva',
    kinds: ['offer', 'request'],
    nameRu: 'Служение и волонтёры',
    nameEn: 'Seva and volunteers',
  },
  {
    slug: 'need-hands',
    kinds: ['request'],
    nameRu: 'Нужна помощь',
    nameEn: 'Need a hand',
  },
  {
    slug: 'teaching',
    kinds: ['offer', 'request'],
    nameRu: 'Обучение и наставничество',
    nameEn: 'Teaching and mentoring',
  },
  {
    slug: 'books-sadhana',
    kinds: ['offer', 'request'],
    nameRu: 'Книги и садхана-инвентарь',
    nameEn: 'Books and sadhana items',
  },
  {
    slug: 'programs',
    kinds: ['event'],
    nameRu: 'Программы и киртаны',
    nameEn: 'Programs and kirtans',
  },
  {
    slug: 'pilgrimage',
    kinds: ['event', 'offer', 'request'],
    nameRu: 'Паломничество и поездки',
    nameEn: 'Pilgrimage and trips',
  },
  {
    slug: 'community-news',
    kinds: ['info', 'event'],
    nameRu: 'Объявления общины',
    nameEn: 'Community announcements',
  },
  {
    slug: 'other',
    kinds: [],
    nameRu: 'Разное',
    nameEn: 'Other',
  },
];

module.exports = { noticeRubrics };
