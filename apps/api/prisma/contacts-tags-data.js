// Стартовая таксономия справочника. Вынесена из seed.ts/seed.cjs, чтобы оба
// сида читали один и тот же список и не разъезжались между собой.
//
// sortOrder задан вручную и нумеруется заново внутри каждого kind: порядок
// в UI смысловой (сначала то, что чаще ищут), алфавит его ломает.
// slug — латиницей и навсегда: по нему идёт upsert и на него будут ссылаться
// ссылки-фильтры вида /contacts?tag=pujari.

/** @type {Array<{slug: string, kind: 'service'|'profession'|'skill'|'interest', nameRu: string}>} */
const contactsTagsSource = [
  // Служение в общине.
  { kind: 'service', slug: 'pujari', nameRu: 'пуджари' },
  { kind: 'service', slug: 'kirtan-leader', nameRu: 'ведущий киртана' },
  { kind: 'service', slug: 'prasadam-cook', nameRu: 'повар-прасадарий' },
  { kind: 'service', slug: 'preacher', nameRu: 'проповедник' },
  { kind: 'service', slug: 'sankirtan', nameRu: 'книгоноша (санкиртан)' },
  { kind: 'service', slug: 'mentor', nameRu: 'наставник' },
  { kind: 'service', slug: 'festival-organizer', nameRu: 'организатор фестивалей' },
  { kind: 'service', slug: 'teacher', nameRu: 'преподаватель' },
  { kind: 'service', slug: 'translator', nameRu: 'переводчик' },

  // Профессия «в миру».
  { kind: 'profession', slug: 'ayurveda', nameRu: 'аюрведа' },
  { kind: 'profession', slug: 'astrologer', nameRu: 'астролог' },
  { kind: 'profession', slug: 'lawyer', nameRu: 'юрист' },
  { kind: 'profession', slug: 'doctor', nameRu: 'врач' },
  { kind: 'profession', slug: 'it', nameRu: 'IT' },
  { kind: 'profession', slug: 'design', nameRu: 'дизайн' },
  { kind: 'profession', slug: 'musician', nameRu: 'музыкант' },
  { kind: 'profession', slug: 'driver', nameRu: 'водитель' },
  { kind: 'profession', slug: 'photographer', nameRu: 'фотограф' },
  { kind: 'profession', slug: 'accountant', nameRu: 'бухгалтер' },
  { kind: 'profession', slug: 'builder', nameRu: 'строитель' },
  { kind: 'profession', slug: 'tutor', nameRu: 'репетитор' },

  // Навык: то, чем человек может помочь разово, без статуса профессии.
  { kind: 'skill', slug: 'web-development', nameRu: 'веб-разработка' },
  { kind: 'skill', slug: 'copywriting', nameRu: 'копирайтинг' },
  { kind: 'skill', slug: 'video-editing', nameRu: 'видеомонтаж' },
  { kind: 'skill', slug: 'sanskrit', nameRu: 'санскрит' },
  { kind: 'skill', slug: 'vocals', nameRu: 'вокал' },
  { kind: 'skill', slug: 'mridanga', nameRu: 'игра на мриданге' },
  { kind: 'skill', slug: 'harmonium', nameRu: 'игра на фисгармонии' },
  { kind: 'skill', slug: 'cooking', nameRu: 'кулинария' },
  { kind: 'skill', slug: 'sewing', nameRu: 'шитьё' },
  { kind: 'skill', slug: 'repair', nameRu: 'ремонт' },

  // Интерес: повод познакомиться, а не предложение услуги.
  { kind: 'interest', slug: 'pilgrimage', nameRu: 'паломничества' },
  { kind: 'interest', slug: 'kirtan-mela', nameRu: 'киртан-мела' },
  { kind: 'interest', slug: 'vedic-philosophy', nameRu: 'ведическая философия' },
  { kind: 'interest', slug: 'yoga', nameRu: 'йога' },
  { kind: 'interest', slug: 'gardening', nameRu: 'садоводство' },
  { kind: 'interest', slug: 'family-festivals', nameRu: 'семейные фестивали' },
  { kind: 'interest', slug: 'book-distribution', nameRu: 'книгораспространение' },
  { kind: 'interest', slug: 'go-seva', nameRu: 'го-сева (защита коров)' },
];

// sortOrder считается от позиции внутри своего kind, чтобы при вставке тега
// в середину списка не пришлось вручную перенумеровывать хвост.
const kindCounters = {};
const contactsTags = contactsTagsSource.map((tag) => {
  const next = (kindCounters[tag.kind] ?? 0) + 1;
  kindCounters[tag.kind] = next;
  return {
    slug: tag.slug,
    kind: tag.kind,
    nameRu: tag.nameRu,
    isSystem: true,
    sortOrder: next,
  };
});

module.exports = { contactsTags };
