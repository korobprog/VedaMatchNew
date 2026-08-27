// Разделы каталога Музыки. Только сид и админ: на категориях висят чипы
// фильтра в витрине, и пользовательский дрейф таксономии их ломает.
//
// Набор ровно тот, что в мокапах сервиса. Он намеренно короткий: пять чипов
// помещаются в строку и на телефоне, а «разное» на старте не заводится —
// пустой раздел-свалка притягивает всё, что лень разобрать.
//
// `position` берётся из порядка в этом файле, как у рубрик доски.
const musicCategories = [
  { slug: 'kirtan', title: 'Киртан', titleEn: 'Kirtan' },
  { slug: 'bhajan', title: 'Бхаджан', titleEn: 'Bhajan' },
  { slug: 'mantra', title: 'Мантра', titleEn: 'Mantra' },
  { slug: 'guru-puja', title: 'Гуру-пуджа', titleEn: 'Guru-puja' },
  { slug: 'instrumental', title: 'Инструментал', titleEn: 'Instrumental' },
];

module.exports = { musicCategories };
