// Второй уровень каталога Рынка. `sectionSlug` разрешается в id при сиде.
// `position` уникален внутри раздела и задаёт порядок в навигации.
// Категории с `prohibited: true` не выдаются в форме создания объявления —
// они существуют, чтобы модерация могла переложить в них уже поданное и
// показать продавцу причину. Список запрещённого продублирован константой
// в market-listing-validate.ts (сид не импортируется в рантайм модуля).
const marketCategories = [
  // Книги и печать
  { sectionSlug: 'books', slug: 'scriptures', titleRu: 'Писания и комментарии', titleEn: 'Scriptures and commentaries', position: 1 },
  { sectionSlug: 'books', slug: 'biographies', titleRu: 'Жизнеописания', titleEn: 'Biographies', position: 2 },
  { sectionSlug: 'books', slug: 'childrens-books', titleRu: 'Детские книги', titleEn: "Children's books", position: 3 },
  { sectionSlug: 'books', slug: 'audiobooks', titleRu: 'Аудиокниги и лекции', titleEn: 'Audiobooks and lectures', position: 4 },
  { sectionSlug: 'books', slug: 'calendars', titleRu: 'Календари и постеры', titleEn: 'Calendars and posters', position: 5 },

  // Для алтаря и практики
  { sectionSlug: 'devotional', slug: 'deities', titleRu: 'Божества и алтари', titleEn: 'Deities and altars', position: 1 },
  { sectionSlug: 'devotional', slug: 'japa-malas', titleRu: 'Чётки и сумочки', titleEn: 'Japa malas and bead bags', position: 2 },
  { sectionSlug: 'devotional', slug: 'incense', titleRu: 'Благовония и масла', titleEn: 'Incense and oils', position: 3 },
  { sectionSlug: 'devotional', slug: 'instruments', titleRu: 'Мриданги, караталы, фисгармонии', titleEn: 'Mridangas, kartals, harmoniums', position: 4 },
  { sectionSlug: 'devotional', slug: 'puja-items', titleRu: 'Предметы для пуджи', titleEn: 'Puja items', position: 5 },
  { sectionSlug: 'devotional', slug: 'tulasi', titleRu: 'Туласи и уход за ней', titleEn: 'Tulasi and care', position: 6 },

  // Одежда и украшения
  { sectionSlug: 'clothing', slug: 'mens-clothing', titleRu: 'Мужская одежда', titleEn: "Men's clothing", position: 1 },
  { sectionSlug: 'clothing', slug: 'womens-clothing', titleRu: 'Женская одежда', titleEn: "Women's clothing", position: 2 },
  { sectionSlug: 'clothing', slug: 'kids-clothing', titleRu: 'Детская одежда', titleEn: "Kids' clothing", position: 3 },
  { sectionSlug: 'clothing', slug: 'fabrics', titleRu: 'Ткани и фурнитура', titleEn: 'Fabrics and haberdashery', position: 4 },
  { sectionSlug: 'clothing', slug: 'jewellery', titleRu: 'Украшения', titleEn: 'Jewellery', position: 5 },
  { sectionSlug: 'clothing', slug: 'leather-goods', titleRu: 'Изделия из кожи', titleEn: 'Leather goods', position: 6, prohibited: true },

  // Продукты и прасад
  { sectionSlug: 'food', slug: 'sweets', titleRu: 'Сладости и выпечка', titleEn: 'Sweets and baking', position: 1 },
  { sectionSlug: 'food', slug: 'spices', titleRu: 'Специи и приправы', titleEn: 'Spices and seasonings', position: 2 },
  { sectionSlug: 'food', slug: 'dairy', titleRu: 'Молочное и гхи', titleEn: 'Dairy and ghee', position: 3 },
  { sectionSlug: 'food', slug: 'groceries', titleRu: 'Крупы, бакалея, чай', titleEn: 'Grains, groceries, tea', position: 4 },
  { sectionSlug: 'food', slug: 'ready-meals', titleRu: 'Готовые блюда и прасад', titleEn: 'Ready meals and prasadam', position: 5 },
  { sectionSlug: 'food', slug: 'meat-fish-eggs', titleRu: 'Мясо, рыба, яйца', titleEn: 'Meat, fish, eggs', position: 6, prohibited: true },
  { sectionSlug: 'food', slug: 'alcohol-tobacco', titleRu: 'Алкоголь и табак', titleEn: 'Alcohol and tobacco', position: 7, prohibited: true },

  // Здоровье и аюрведа
  { sectionSlug: 'health', slug: 'ayurvedic-remedies', titleRu: 'Аюрведические средства', titleEn: 'Ayurvedic remedies', position: 1 },
  { sectionSlug: 'health', slug: 'herbs', titleRu: 'Травы и сборы', titleEn: 'Herbs and blends', position: 2 },
  { sectionSlug: 'health', slug: 'cosmetics', titleRu: 'Натуральная косметика', titleEn: 'Natural cosmetics', position: 3 },
  { sectionSlug: 'health', slug: 'massage', titleRu: 'Массаж и телесные практики', titleEn: 'Massage and bodywork', position: 4 },
  { sectionSlug: 'health', slug: 'yoga-equipment', titleRu: 'Инвентарь для йоги', titleEn: 'Yoga equipment', position: 5 },

  // Ручная работа и мастерские
  { sectionSlug: 'handmade', slug: 'ceramics', titleRu: 'Керамика и посуда', titleEn: 'Ceramics and tableware', position: 1 },
  { sectionSlug: 'handmade', slug: 'woodwork', titleRu: 'Дерево и резьба', titleEn: 'Woodwork and carving', position: 2 },
  { sectionSlug: 'handmade', slug: 'textile-crafts', titleRu: 'Текстиль и вышивка', titleEn: 'Textile and embroidery', position: 3 },
  { sectionSlug: 'handmade', slug: 'paintings', titleRu: 'Живопись и графика', titleEn: 'Paintings and graphics', position: 4 },
  { sectionSlug: 'handmade', slug: 'custom-orders', titleRu: 'Изделия на заказ', titleEn: 'Custom-made items', position: 5 },

  // Услуги
  { sectionSlug: 'services', slug: 'catering', titleRu: 'Кейтеринг и повара', titleEn: 'Catering and cooks', position: 1 },
  { sectionSlug: 'services', slug: 'design', titleRu: 'Дизайн и полиграфия', titleEn: 'Design and print', position: 2 },
  { sectionSlug: 'services', slug: 'it-services', titleRu: 'ИТ, сайты, приложения', titleEn: 'IT, websites, apps', position: 3 },
  { sectionSlug: 'services', slug: 'photo-video', titleRu: 'Фото и видео', titleEn: 'Photo and video', position: 4 },
  { sectionSlug: 'services', slug: 'repair', titleRu: 'Ремонт и мастера', titleEn: 'Repair and handymen', position: 5 },
  { sectionSlug: 'services', slug: 'transport', titleRu: 'Перевозки и доставка', titleEn: 'Transport and delivery', position: 6 },
  { sectionSlug: 'services', slug: 'legal-finance', titleRu: 'Юридические и бухгалтерские', titleEn: 'Legal and accounting', position: 7 },
  { sectionSlug: 'services', slug: 'ceremonies', titleRu: 'Проведение церемоний', titleEn: 'Ceremonies', position: 8 },
  { sectionSlug: 'services', slug: 'translation', titleRu: 'Переводы и редактура', titleEn: 'Translation and editing', position: 9 },

  // Обучение
  { sectionSlug: 'education', slug: 'sanskrit', titleRu: 'Санскрит и языки', titleEn: 'Sanskrit and languages', position: 1 },
  { sectionSlug: 'education', slug: 'scripture-study', titleRu: 'Изучение писаний', titleEn: 'Scripture study', position: 2 },
  { sectionSlug: 'education', slug: 'music-lessons', titleRu: 'Музыка и киртан', titleEn: 'Music and kirtan', position: 3 },
  { sectionSlug: 'education', slug: 'cooking-classes', titleRu: 'Кулинарные курсы', titleEn: 'Cooking classes', position: 4 },
  { sectionSlug: 'education', slug: 'yoga-classes', titleRu: 'Йога и практики', titleEn: 'Yoga and practices', position: 5 },
  { sectionSlug: 'education', slug: 'professional-courses', titleRu: 'Профессиональные курсы', titleEn: 'Professional courses', position: 6 },

  // Дом и быт
  { sectionSlug: 'home', slug: 'furniture', titleRu: 'Мебель', titleEn: 'Furniture', position: 1 },
  { sectionSlug: 'home', slug: 'kitchenware', titleRu: 'Кухонная утварь', titleEn: 'Kitchenware', position: 2 },
  { sectionSlug: 'home', slug: 'decor', titleRu: 'Декор и текстиль', titleEn: 'Decor and textiles', position: 3 },
  { sectionSlug: 'home', slug: 'garden', titleRu: 'Сад и растения', titleEn: 'Garden and plants', position: 4 },
  { sectionSlug: 'home', slug: 'electronics', titleRu: 'Техника и электроника', titleEn: 'Appliances and electronics', position: 5 },

  // Разное
  { sectionSlug: 'other', slug: 'giveaway', titleRu: 'Отдам даром', titleEn: 'Giveaway', position: 1 },
  { sectionSlug: 'other', slug: 'wanted', titleRu: 'Куплю / ищу', titleEn: 'Wanted', position: 2 },
  { sectionSlug: 'other', slug: 'misc', titleRu: 'Прочее', titleEn: 'Miscellaneous', position: 3 },
];

module.exports = { marketCategories };
