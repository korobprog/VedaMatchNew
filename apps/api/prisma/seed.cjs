const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Разделы библиотеки и каталог Рынка администратор правит из админки
// (названия, описания, иконки, порядок). Сид запускается при каждом старте
// контейнера, поэтому по умолчанию он такие строки только создаёт, а не
// перезаписывает — иначе правки админа молча терялись бы на первом рестарте.
// Чтобы принудительно «освежить» тексты из файлов данных, запустите сид с
// SEED_REFRESH_ADMIN_EDITABLE=1.
const refreshAdminEditable = process.env.SEED_REFRESH_ADMIN_EDITABLE === '1';

/** upsert для строк, которые может править администратор. */
async function upsertAdminEditable(model, where, fields) {
  if (refreshAdminEditable) {
    return model.upsert({ where, update: fields, create: fields });
  }
  const existing = await model.findUnique({ where });
  if (existing) return existing;
  return model.create({ data: fields });
}

/**
 * Приведение названия к виду, по которому ищут дубли. Копия того, что делает
 * сервис Библиотеки: сид его исходников не подключает — см. комментарий у
 * корней ниже.
 */
function normalizeSeedTitle(value) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const { libraryRoots } = require('./library-roots-data.js');
const { contactsTags } = require('./contacts-tags-data.js');
const { marketSections } = require('./market-sections-data.js');
const { marketCategories } = require('./market-categories-data.js');
const { noticeRubrics } = require('./notice-rubrics-data.js');
const { musicCategories } = require('./music-categories-data.js');
const { geoCities } = require('./geo-cities-data.js');
const { wellnessIngredients } = require('./wellness-ingredients-data.js');
const { wellnessRecipes } = require('./wellness-recipes-data.js');

const services = [
  {
    slug: 'union',
    name: 'Знакомства',
    description:
      'Осознанные знакомства и сотрудничество: семья, дружба, служение, проекты',
    url: '/union',
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'vedabase',
    name: 'Библиотека',
    description:
      'Архив развивающей и духовной литературы ведического канона и не только',
    url: '/vedabase',
    status: 'active',
    category: 'knowledge',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'motivation',
    name: 'Вдохновение',
    description: 'Мудрость в афоризмах и шлоках на каждый день',
    url: '/motivation',
    status: 'active',
    category: 'lifestyle',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'library',
    name: 'Образование',
    description:
      'Общая база полезных материалов: статьи, видео, книги, курсы и каналы',
    url: '/library',
    status: 'active',
    category: 'knowledge',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'astro',
    name: 'Астрология',
    description:
      'Ведическая карта рождения с разбором и совместимость по звёздам',
    url: '/astro',
    // active: карта, разборы и совместимость (гуна-милан) работают и покрыты
    // тестами. Ежедневный персональный день по транзитам (Э6) ещё не готов —
    // когда появится, стоит дополнить описание, а не менять статус повторно.
    status: 'active',
    category: 'knowledge',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'market',
    name: 'Рынок',
    description:
      'Коммерческие объявления и услуги в благости: товары, книги, мастерские, помощь',
    url: '/market',
    // active: витрина, каталог, фильтры, избранное и кабинет продавца готовы
    // и покрыты тестами. Корзина, заявки и чат — фаза 2, статуса не меняют.
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'chat',
    name: 'Общение',
    description:
      'Личные диалоги, группы и каналы общин: переписка со всеми, кого встретили на портале',
    url: '/chat',
    // active: личные диалоги, запросы, группы, каналы, вложения и живой
    // поток событий готовы и покрыты тестами.
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'music',
    name: 'Музыка',
    nameEn: 'Music',
    description:
      'Киртаны, бхаджаны и записи с программ: каталог, плейлисты и плеер на весь портал',
    url: '/music',
    // coming_soon: этап 0 — каркас модуля и схема. Сервис включается
    // ('active') после этапа 6, когда каталог наполнен и работает плеер;
    // до тех пор карточка в портале показывает «Скоро» и никуда не ведёт.
    status: 'coming_soon',
    category: 'lifestyle',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'work',
    name: 'Работа',
    nameEn: 'Work',
    description:
      'Совместные дела: планировщик задач на канбан-доске, рабочие среды и приглашение своих',
    url: '/work',
    // active: витрина раздела, Планировщик со средами, досками, задачами и
    // приглашением по ссылке готовы и покрыты тестами. Вложения, живой поток
    // и «Мой день» — следующие этапы, статуса не меняют. Соседние разделы
    // (Вакансии, Услуги) показывают «Скоро» внутри самой витрины.
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'notices',
    name: 'Объявления',
    description:
      'Некоммерческие объявления: отдам даром, нужны руки, попутчики, программы ятр',
    url: '/notices',
    // active: доска, отклики, благодарности и модерация жалоб готовы и
    // покрыты тестами. Карта и календарь — следующий этап, статуса не меняют.
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'wellness',
    name: 'Здоровье',
    description:
      'Сканер состава: за секунду видно, есть ли в продукте мясо, желатин, лук или чеснок',
    // В коде и маршрутах сервис зовётся `wellness`: имя `health` занято
    // техническим liveness-эндпоинтом для Docker HEALTHCHECK.
    url: '/wellness',
    // coming_soon: справочник и сканер готовы, база продуктов пуста, а
    // корзина с рецептами ещё заделы.
    status: 'coming_soon',
    category: 'lifestyle',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
];

async function main() {
  await prisma.$transaction(async (transaction) => {
    await transaction.service.deleteMany({
      where: {
        OR: [
          { slug: 'gitabase' },
          { name: 'VedaMatch Union Gitabase' },
          { slug: 'devotee-space' },
          // Справочник переехал в «Общение» разделом «Люди»; отдельной
          // карточки у него больше нет. Права администраторов сервиса
          // перенесены на chat миграцией 20260822200000_contacts_into_chat.
          { slug: 'contacts' },
        ],
      },
    });
    for (const service of services) {
      // Название, английское название, описание, иконка и порядок — контент
      // каталога: их правит администратор (админка → каталог сервисов), и
      // сид не имеет права возвращать их к значениям из кода. Иначе любой
      // рестарт контейнера api (SEED_ON_START=1) переименовывал бы сервис
      // обратно и возвращал стёртую подпись.
      //
      // Остальное — поведение, а не контент: статус, адрес, категория и
      // видимость по этапам едут вместе с релизом и обновляются всегда.
      const { name, nameEn, description, iconUrl, sortOrder, ...behaviour } =
        service;
      void name;
      void nameEn;
      void description;
      void iconUrl;
      void sortOrder;
      await transaction.service.upsert({
        where: { slug: service.slug },
        update: refreshAdminEditable ? service : behaviour,
        create: service,
      });
    }
    // Разделы Библиотеки стали корнями дерева категорий: отдельной модели
    // `LibrarySection` больше нет. Корень — та же категория, у которой нет
    // родителя и пустой путь.
    //
    // `normalizedRu/En` заполняются здесь, а не берутся из сервиса: сид —
    // отдельная точка входа и исходников не подключает, а без этих полей
    // дубль рубрики верхнего уровня не находился бы поиском похожих.
    for (const root of libraryRoots) {
      await upsertAdminEditable(
        transaction.libraryCategory,
        { slug: root.slug },
        {
          ...root,
          parentId: null,
          path: '',
          normalizedRu: normalizeSeedTitle(root.titleRu),
          normalizedEn: normalizeSeedTitle(root.titleEn),
        },
      );
    }
    // Пользовательские теги сюда не попадают: upsert идёт по slug, а список
    // системных фиксирован, поэтому повторный прогон только освежает названия
    // и порядок и никогда не удаляет то, что завели через модерацию.
    for (const tag of contactsTags) {
      await transaction.contactsTag.upsert({
        where: { slug: tag.slug },
        update: tag,
        create: tag,
      });
    }
    // Каталог Рынка фиксирован: разделы и категории заводит только сид и админ.
    // Сид не трогает объявления, привязанные к категории, и (без флага
    // SEED_REFRESH_ADMIN_EDITABLE) не перезаписывает то, что правил админ.
    const marketSectionIdBySlug = new Map();
    for (const section of marketSections) {
      const saved = await upsertAdminEditable(
        transaction.marketSection,
        { slug: section.slug },
        section,
      );
      marketSectionIdBySlug.set(saved.slug, saved.id);
    }
    for (const category of marketCategories) {
      const sectionId = marketSectionIdBySlug.get(category.sectionSlug);
      if (!sectionId) {
        throw new Error(
          `market category "${category.slug}" references unknown section "${category.sectionSlug}"`,
        );
      }
      const { sectionSlug, prohibited, ...fields } = category;
      void sectionSlug;
      void prohibited;
      await upsertAdminEditable(
        transaction.marketCategory,
        { sectionId_slug: { sectionId, slug: category.slug } },
        { ...fields, sectionId },
      );
    }
    // Рубрики доски объявлений. `position` берётся из порядка в файле, чтобы
    // не держать номер отдельным полем и не рассинхронизировать его правкой.
    for (const [index, rubric] of noticeRubrics.entries()) {
      const fields = { ...rubric, position: index, isSystem: true };
      await transaction.noticeRubric.upsert({
        where: { slug: rubric.slug },
        update: fields,
        create: fields,
      });
    }

    // Разделы каталога Музыки. `position` — из порядка в файле, как у рубрик
    // доски: держать номер отдельным полем значит однажды его рассинхронить.
    for (const [index, category] of musicCategories.entries()) {
      const fields = { ...category, position: index };
      await transaction.musicCategory.upsert({
        where: { slug: category.slug },
        update: fields,
        create: fields,
      });
    }

    // Справочник ингредиентов «Здоровья» перезаписывается целиком: на нём
    // держится вердикт сканера, и правка алиаса в файле обязана доехать до
    // базы, а не остаться рядом со старым значением.
    for (const ingredient of wellnessIngredients) {
      const fields = {
        nameRu: ingredient.nameRu,
        nameEn: ingredient.nameEn,
        aliases: ingredient.aliases,
        class: ingredient.class,
        severity: ingredient.severity,
        eNumber: ingredient.eNumber ?? null,
        noteRu: ingredient.noteRu ?? null,
      };
      await transaction.wellnessIngredient.upsert({
        where: { key: ingredient.key },
        update: fields,
        create: { key: ingredient.key, ...fields },
      });
    }

    // Рецепты «Здоровья». Текст в файле — свой, не перепечатка книг, поэтому
    // он и есть источник истины: правка в файле обязана доехать до базы.
    for (const recipe of wellnessRecipes) {
      const { ingredients, ...fields } = recipe;
      const saved = await transaction.wellnessRecipe.upsert({
        where: { slug: recipe.slug },
        update: { ...fields, status: 'published' },
        create: { ...fields, status: 'published' },
      });
      await transaction.wellnessRecipeIngredient.deleteMany({
        where: { recipeId: saved.id },
      });
      await transaction.wellnessRecipeIngredient.createMany({
        data: ingredients.map((item, index) => ({
          recipeId: saved.id,
          nameRu: item.nameRu,
          amountRu: item.amountRu ?? null,
          position: index,
        })),
      });
    }

    // Справочник городов перезаписывается целиком: файл — источник истины,
    // и правка алиаса в нём обязана доехать до базы, а не остаться рядом
    // со старым значением.
    for (const city of geoCities) {
      await transaction.geoCity.upsert({
        where: { city_country: { city: city.city, country: city.country } },
        update: city,
        create: city,
      });
    }

    // Профили, заполненные до справочника, держат написание внешнего
    // геокодера: «Mayapur, India» там, где справочник теперь говорит
    // «Маяпур, Индия». Фильтр по городу сравнивает строки, поэтому такие
    // соседи друг друга не видят — приводим их к канону.
    const [{ count: canonicalized }] = await transaction.$queryRaw`
      WITH updated AS (
        UPDATE "User" u
        SET "homeLocation" = jsonb_set(
          jsonb_set(
            jsonb_set(
              (u."homeLocation")::jsonb,
              '{city}',
              to_jsonb(g."city")
            ),
            '{country}',
            to_jsonb(g."country")
          ),
          '{displayName}',
          to_jsonb(g."displayName")
        )
        FROM "GeoCity" g
        WHERE u."homeLocation" IS NOT NULL
          AND lower(u."homeLocation"->>'city') = ANY (g."aliases")
          AND u."homeLocation"->>'city' IS DISTINCT FROM g."city"
        RETURNING u.id
      )
      SELECT count(*)::int AS count FROM updated
    `;
    if (canonicalized > 0) {
      console.log(`Canonicalized city in ${canonicalized} profiles`);
    }
  });
  console.log(
    `Seeded ${services.length} services, ${libraryRoots.length} library roots, ${contactsTags.length} contacts tags, ${marketSections.length} market sections, ${marketCategories.length} market categories ${noticeRubrics.length} notice rubrics, ${musicCategories.length} music categories, ${wellnessIngredients.length} wellness ingredients, ${wellnessRecipes.length} wellness recipes and ${geoCities.length} cities`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
