import type {
  UnionChildrenStatus,
  UnionDiet,
  UnionEducationLevel,
  UnionHousing,
  UnionIncomeLevel,
  UnionProfileDetails,
  UnionProfileFieldKey,
  UnionRegulativePrinciple,
  UnionSpiritualEducation,
} from '@vedamatch/shared';

/**
 * Словари анкеты Знакомств — перенос `apps/web/src/components/union/dictionaries.ts`.
 *
 * Значения тегов (языки, интересы, ценности, навыки, питомцы) — это не
 * подписи, а данные: они уходят на сервер и сравниваются с чужими анкетами
 * при подсчёте совместимости. Поэтому они обязаны совпадать с сайтом
 * буква в букву, иначе «йога» из приложения и «йога» с сайта разойдутся в
 * процент. Правка — в обоих файлах разом.
 */

export interface UnionTagOption {
  value: string;
  label: string;
}

export interface UnionSkillCategory {
  title: string;
  options: UnionTagOption[];
}

const tag = (label: string): UnionTagOption => ({ value: label, label });

export const UNION_LANGUAGE_OPTIONS: UnionTagOption[] = [
  'русский',
  'английский',
  'украинский',
  'испанский',
  'немецкий',
  'французский',
  'хинди',
  'бенгали',
  'санскрит',
  'другое',
].map(tag);

export const UNION_SKILL_CATEGORIES: UnionSkillCategory[] = [
  {
    title: 'IT / цифровые',
    options: [
      'программирование',
      'дизайн',
      'маркетинг',
      'SMM',
      'видео / монтаж',
      'копирайтинг',
      'управление проектами',
    ].map(tag),
  },
  {
    title: 'Образование',
    options: ['преподавание', 'наставничество', 'организация курсов', 'переводы'].map(tag),
  },
  {
    title: 'Служение / проекты',
    options: [
      'организация мероприятий',
      'волонтёрство',
      'кухня / прасад',
      'музыка / киртан',
      'администрирование',
      'фандрайзинг',
    ].map(tag),
  },
  {
    title: 'Быт / ремесло',
    options: ['строительство', 'ремонт', 'кулинария', 'сад / ферма', 'медицина / здоровье'].map(tag),
  },
];

export const UNION_SKILL_OPTIONS: UnionTagOption[] = UNION_SKILL_CATEGORIES.flatMap(
  (category) => category.options,
);

export const UNION_INTEREST_OPTIONS: UnionTagOption[] = [
  'философия',
  'йога',
  'медитация',
  'киртан',
  'ведическая культура',
  'здоровый образ жизни',
  'путешествия',
  'семья',
  'служение',
  'бизнес',
  'образование',
  'психология',
  'аюрведа',
  'экология',
  'творчество',
  'музыка',
  'чтение',
  'паломничества',
  'ретриты',
].map(tag);

export const UNION_VALUE_OPTIONS: UnionTagOption[] = [
  'духовное развитие',
  'честность',
  'служение',
  'семья',
  'верность',
  'простота',
  'ответственность',
  'доброта',
  'чистота',
  'уважение',
  'совместная практика',
  'община',
  'осознанность',
  'забота о людях',
  'развитие проектов',
].map(tag);

export const UNION_PET_OPTIONS: UnionTagOption[] = [
  'кошка',
  'собака',
  'корова',
  'птицы',
  'другие питомцы',
  'нет питомцев',
  'хочу завести',
].map(tag);

export const UNION_DIET_LABELS: Record<UnionDiet, string> = {
  vegetarian: 'вегетарианство',
  vegan: 'веганство',
  prasadam_only: 'только прасад',
  transitioning: 'перехожу на вегетарианство',
  not_vegetarian: 'не вегетарианец',
};

export const UNION_PRINCIPLE_LABELS: Record<UnionRegulativePrinciple, string> = {
  no_meat: 'не ем мясо, рыбу и яйца',
  no_intoxicants: 'не употребляю интоксикации',
  no_gambling: 'не играю в азартные игры',
  no_illicit_sex: 'следую целомудрию',
};

export const UNION_CHILDREN_LABELS: Record<UnionChildrenStatus, string> = {
  none_want: 'нет, хочу',
  none_not_want: 'нет, не хочу',
  none_undecided: 'нет, пока не решил(а)',
  have_living_with: 'есть, живут со мной',
  have_living_apart: 'есть, живут отдельно',
};

export const UNION_EDUCATION_LABELS: Record<UnionEducationLevel, string> = {
  school: 'среднее',
  vocational: 'среднее специальное',
  incomplete_higher: 'неоконченное высшее',
  higher: 'высшее',
  academic_degree: 'учёная степень',
};

export const UNION_SPIRITUAL_EDUCATION_LABELS: Record<UnionSpiritualEducation, string> = {
  none: 'пока не учился(ась)',
  temple_courses: 'курсы при храме / бхакти-врикша',
  bhakti_shastri: 'Бхакти-шастри',
  bhakti_vaibhava: 'Бхакти-вайбхава',
  bhakti_vedanta: 'Бхакти-веданта',
  other: 'другое',
};

export const UNION_HOUSING_LABELS: Record<UnionHousing, string> = {
  own_place: 'своё жильё',
  rent: 'снимаю',
  with_parents: 'с родителями',
  with_relatives: 'с родственниками',
  community: 'в общине преданных',
  temple_ashram: 'при храме / в ашраме',
};

export const UNION_INCOME_LABELS: Record<UnionIncomeLevel, string> = {
  basic_needs_hard: 'на основное не всегда хватает',
  basic_needs: 'хватает на основное',
  basic_and_rest: 'хватает на основное и отдых',
  comfortable: 'могу позволить многое',
  prefer_not_say: 'предпочитаю не указывать',
};

/** Подписи полей анкеты — для прогресса заполнения и подсказки «что дальше». */
export const UNION_FIELD_LABELS: Record<UnionProfileFieldKey, string> = {
  photos: 'Фото',
  about: 'О себе',
  status: 'Статус',
  intentions: 'Цель знакомства',
  languages: 'Знание языков',
  interests: 'Интересы',
  values: 'Ценности',
  skills: 'Навыки',
  familyStatus: 'Семейный статус',
  childrenStatus: 'Дети',
  diet: 'Питание',
  regulativePrinciples: 'Регулирующие принципы',
  heightCm: 'Рост',
  education: 'Образование',
  spiritualEducation: 'Духовное образование',
  housing: 'Жилищные условия',
  income: 'Материальная обеспеченность',
};

/** Семейный статус — свободная строка на сервере, но выбирается из списка. */
export const UNION_FAMILY_STATUS_OPTIONS: readonly string[] = [
  'свободен / свободна',
  'в отношениях',
  'женат / замужем',
  'разведен / разведена',
  'вдовец / вдова',
  'монах / монахиня',
  'предпочитаю не указывать',
];

export interface DetailRow {
  label: string;
  value: string;
}

/**
 * Заполненные поля блока «О человеке»; пустые не показываем вовсе — строка
 * «Дети: —» ничего не сообщает, а место занимает (`profile-details-list.tsx`).
 */
export function profileDetailRows(details: UnionProfileDetails): DetailRow[] {
  const rows: [string, string | null][] = [
    ['Рост', details.heightCm ? `${details.heightCm} см` : null],
    ['Дети', details.childrenStatus ? UNION_CHILDREN_LABELS[details.childrenStatus] : null],
    ['Питание', details.diet ? UNION_DIET_LABELS[details.diet] : null],
    [
      'Регулирующие принципы',
      details.regulativePrinciples.length > 0
        ? details.regulativePrinciples.map((principle) => UNION_PRINCIPLE_LABELS[principle]).join(', ')
        : null,
    ],
    ['Образование', details.education ? UNION_EDUCATION_LABELS[details.education] : null],
    [
      'Духовное образование',
      details.spiritualEducation ? UNION_SPIRITUAL_EDUCATION_LABELS[details.spiritualEducation] : null,
    ],
    ['Жилищные условия', details.housing ? UNION_HOUSING_LABELS[details.housing] : null],
    ['Достаток', details.income ? UNION_INCOME_LABELS[details.income] : null],
    ['Домашние животные', details.pets.length > 0 ? details.pets.join(', ') : null],
  ];
  return rows
    .filter((row): row is [string, string] => row[1] !== null)
    .map(([label, value]) => ({ label, value }));
}
