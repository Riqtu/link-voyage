import { Types } from 'mongoose';

export type TripPackChecklistEmbeddedRow = {
  _id: Types.ObjectId;
  kind: 'line' | 'group';
  title: string;
  done: boolean;
  sortOrder: number;
  parentItemId?: Types.ObjectId;
  quantity?: number;
  quantityUnit?: string;
};

type PackLinePreset = {
  title: string;
  quantity?: number;
  quantityUnit?: string;
};

type PackSectionPreset = {
  title: string;
  items: readonly PackLinePreset[];
};

/**
 * Шаблон чеклиста: секции (group) и подпункты (line с parent).
 * Порядок секций задаёт полем sortOrder у корней; у строк — свой порядок внутри секции.
 */
const TRIP_PACK_CHECKLIST_PRESET: readonly PackSectionPreset[] = [
  {
    title: 'Документы и деньги',
    items: [
      { title: 'Паспорт / загран или удостоверение личности' },
      { title: 'Банковские карты и немного нужной наличности' },
    ],
  },
  {
    title: 'Техника и связь',
    items: [
      { title: 'Телефон и зарядка' },
      { title: 'Powerbank при длительном дне без розетки' },
      { title: 'Наушники' },
      { title: 'Адаптер или переходник для розеток (если другой тип)' },
    ],
  },
  {
    title: 'Здоровье',
    items: [
      { title: 'Повседневная аптечка (обезболивающее, пластырь и т.п.)' },
      { title: 'Личные лекарства по назначению' },
    ],
  },
  {
    title: 'Гигиена',
    items: [
      { title: 'Щётка, паста, дезодорант / мыло по привычке' },
      { title: 'Солнцезащита или после солнца (по сезону)' },
    ],
  },
  {
    title: 'Одежда и обувь',
    items: [
      {
        title: 'Сменное нижнее бельё под дни поездки',
        quantity: 4,
        quantityUnit: 'шт',
      },
      { title: 'Футболки, топы, рубашки', quantity: 4, quantityUnit: 'шт' },
      { title: 'Носки', quantity: 5, quantityUnit: 'пар' },
      { title: 'Верхняя одежда по погоде' },
      { title: 'Удобная и сменная обувь' },
    ],
  },
  {
    title: 'В дорогу и быт',
    items: [
      { title: 'Ключи от дома / машины' },
      { title: 'Бутылка для воды или термофляга' },
      { title: 'Зонт или компактный дождевик' },
    ],
  },
];

export function embedDefaultTripPackChecklist(): TripPackChecklistEmbeddedRow[] {
  const rows: TripPackChecklistEmbeddedRow[] = [];
  let rootOrder = 0;

  for (const section of TRIP_PACK_CHECKLIST_PRESET) {
    const groupId = new Types.ObjectId();
    rows.push({
      _id: groupId,
      kind: 'group',
      title: section.title,
      done: false,
      sortOrder: rootOrder++,
    });

    let lineOrder = 0;
    for (const item of section.items) {
      let qty: number | undefined =
        typeof item.quantity === 'number' && Number.isFinite(item.quantity)
          ? item.quantity
          : undefined;
      const quantityUnitRaw =
        typeof item.quantityUnit === 'string' ? item.quantityUnit.trim() : '';
      let quantityUnit: string | undefined =
        quantityUnitRaw.length > 0 && quantityUnitRaw.length <= 12
          ? quantityUnitRaw
          : undefined;

      if (qty != null && quantityUnit == null) {
        qty = undefined;
      }
      if (quantityUnit != null && qty == null) {
        quantityUnit = undefined;
      }

      rows.push({
        _id: new Types.ObjectId(),
        kind: 'line',
        title: item.title,
        done: false,
        sortOrder: lineOrder++,
        parentItemId: groupId,
        ...(qty != null ? { quantity: qty } : {}),
        ...(quantityUnit != null ? { quantityUnit } : {}),
      });
    }
  }

  return rows;
}
