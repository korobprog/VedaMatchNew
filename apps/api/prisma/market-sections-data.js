// Верхний уровень каталога Рынка. Только сид и админ: на разделах и категориях
// висят фильтры выдачи, пользовательский дрейф таксономии их ломает.
const marketSections = [
  {
    slug: 'books',
    titleRu: 'Книги и печать',
    titleEn: 'Books and print',
    iconKey: 'book-open',
    position: 1,
  },
  {
    slug: 'devotional',
    titleRu: 'Для алтаря и практики',
    titleEn: 'Altar and practice',
    iconKey: 'flame',
    position: 2,
  },
  {
    slug: 'clothing',
    titleRu: 'Одежда и украшения',
    titleEn: 'Clothing and jewellery',
    iconKey: 'shirt',
    position: 3,
  },
  {
    slug: 'food',
    titleRu: 'Продукты и прасад',
    titleEn: 'Food and prasadam',
    iconKey: 'utensils',
    position: 4,
  },
  {
    slug: 'health',
    titleRu: 'Здоровье и аюрведа',
    titleEn: 'Health and Ayurveda',
    iconKey: 'heart-pulse',
    position: 5,
  },
  {
    slug: 'handmade',
    titleRu: 'Ручная работа и мастерские',
    titleEn: 'Handmade and workshops',
    iconKey: 'hammer',
    position: 6,
  },
  {
    slug: 'services',
    titleRu: 'Услуги',
    titleEn: 'Services',
    iconKey: 'briefcase',
    position: 7,
  },
  {
    slug: 'education',
    titleRu: 'Обучение',
    titleEn: 'Education',
    iconKey: 'graduation-cap',
    position: 8,
  },
  {
    slug: 'home',
    titleRu: 'Дом и быт',
    titleEn: 'Home and living',
    iconKey: 'home',
    position: 9,
  },
  {
    slug: 'other',
    titleRu: 'Разное',
    titleEn: 'Other',
    iconKey: 'package',
    position: 10,
  },
];

module.exports = { marketSections };
