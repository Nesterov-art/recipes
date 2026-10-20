export type ShoppingItem = {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  text: string;
  checked: boolean;
};

type ParsedShoppingEntry = {
  name: string;
  quantity?: number;
  unit?: string;
};

type MergeResult = {
  items: ShoppingItem[];
  changedCount: number;
};

type UnitDefinition = {
  unit: string;
  family: 'mass' | 'volume' | 'count';
  factor: number;
};

const UNIT_ALIASES: Record<string, UnitDefinition> = {
  г: { unit: 'г', family: 'mass', factor: 1 },
  гр: { unit: 'г', family: 'mass', factor: 1 },
  грамм: { unit: 'г', family: 'mass', factor: 1 },
  грамма: { unit: 'г', family: 'mass', factor: 1 },
  граммов: { unit: 'г', family: 'mass', factor: 1 },
  g: { unit: 'г', family: 'mass', factor: 1 },
  gram: { unit: 'г', family: 'mass', factor: 1 },
  grams: { unit: 'г', family: 'mass', factor: 1 },
  кг: { unit: 'кг', family: 'mass', factor: 1000 },
  килограмм: { unit: 'кг', family: 'mass', factor: 1000 },
  килограмма: { unit: 'кг', family: 'mass', factor: 1000 },
  килограммов: { unit: 'кг', family: 'mass', factor: 1000 },
  kg: { unit: 'кг', family: 'mass', factor: 1000 },
  мл: { unit: 'мл', family: 'volume', factor: 1 },
  миллилитр: { unit: 'мл', family: 'volume', factor: 1 },
  миллилитра: { unit: 'мл', family: 'volume', factor: 1 },
  миллилитров: { unit: 'мл', family: 'volume', factor: 1 },
  ml: { unit: 'мл', family: 'volume', factor: 1 },
  л: { unit: 'л', family: 'volume', factor: 1000 },
  литр: { unit: 'л', family: 'volume', factor: 1000 },
  литра: { unit: 'л', family: 'volume', factor: 1000 },
  литров: { unit: 'л', family: 'volume', factor: 1000 },
  l: { unit: 'л', family: 'volume', factor: 1000 },
  шт: { unit: 'шт.', family: 'count', factor: 1 },
  штука: { unit: 'шт.', family: 'count', factor: 1 },
  штуки: { unit: 'шт.', family: 'count', factor: 1 },
  штук: { unit: 'шт.', family: 'count', factor: 1 },
  pc: { unit: 'шт.', family: 'count', factor: 1 },
  pcs: { unit: 'шт.', family: 'count', factor: 1 },
};

const NAME_ALIASES: Record<string, string> = {
  яйцо: 'яйцо',
  яйца: 'яйцо',
  яиц: 'яйцо',
  картофель: 'картофель',
  картофеля: 'картофель',
  картофелю: 'картофель',
  картофелем: 'картофель',
  картошка: 'картофель',
  картошки: 'картофель',
  картошке: 'картофель',
  картошку: 'картофель',
  картошкой: 'картофель',
  egg: 'egg',
  eggs: 'egg',
  potato: 'potato',
  potatoes: 'potato',
};

function cleanSpaces(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeUnitKey(value: string) {
  return cleanSpaces(value).toLocaleLowerCase().replace(/\.$/, '');
}

function unitDefinition(unit: string | undefined) {
  if (!unit) return undefined;
  return UNIT_ALIASES[normalizeUnitKey(unit)];
}

function canonicalizeUnit(unit: string | undefined) {
  if (!unit) return undefined;
  const cleaned = cleanSpaces(unit);
  return unitDefinition(cleaned)?.unit ?? cleaned.toLocaleLowerCase();
}

function parseQuantity(value: string) {
  const quantity = Number(value.replace(',', '.'));
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : undefined;
}

function parseAmount(value: string): Omit<ParsedShoppingEntry, 'name'> | null {
  const match = cleanSpaces(value).match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/u);
  if (!match) return null;
  const quantity = parseQuantity(match[1]);
  if (quantity === undefined) return null;
  const unit = canonicalizeUnit(match[2] || undefined);
  return { quantity, ...(unit ? { unit } : {}) };
}

export function normalizeProductName(value: string) {
  const normalized = cleanSpaces(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return NAME_ALIASES[normalized] ?? normalized;
}

export function parseShoppingEntry(value: string): ParsedShoppingEntry | null {
  const text = cleanSpaces(value);
  if (!text) return null;

  const separated = text.match(/^(.*?)\s+(?:—|–|-)\s+(.+)$/u);
  if (separated) {
    const name = cleanSpaces(separated[1]);
    const amount = parseAmount(separated[2]);
    if (name && amount) return { name, ...amount };
  }

  const trailingAmount = text.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)(?:\s+([^\d]+))?$/u);
  if (trailingAmount) {
    const name = cleanSpaces(trailingAmount[1]);
    const quantity = parseQuantity(trailingAmount[2]);
    const unit = canonicalizeUnit(trailingAmount[3]);
    if (name && quantity !== undefined) {
      return { name, quantity, ...(unit ? { unit } : {}) };
    }
  }

  return { name: text };
}

function rounded(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function formatQuantity(value: number) {
  return String(rounded(value)).replace('.', ',');
}

function formatShoppingItem(item: Pick<ShoppingItem, 'name' | 'quantity' | 'unit'>) {
  if (item.quantity === undefined) return item.name;
  return `${item.name} — ${formatQuantity(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`;
}

function makeShoppingItem(
  parsed: ParsedShoppingEntry,
  id: string,
  checked = false,
): ShoppingItem {
  const item: ShoppingItem = {
    id,
    name: cleanSpaces(parsed.name),
    ...(parsed.quantity !== undefined ? { quantity: parsed.quantity } : {}),
    ...(parsed.unit ? { unit: canonicalizeUnit(parsed.unit) } : {}),
    text: '',
    checked,
  };
  item.text = formatShoppingItem(item);
  return item;
}

export function createShoppingItem(value: string, id: string, checked = false) {
  const parsed = parseShoppingEntry(value);
  return parsed ? makeShoppingItem(parsed, id, checked) : null;
}

function areUnitsCompatible(first: string | undefined, second: string | undefined) {
  if (!first && !second) return true;
  if (!first || !second) return false;
  const firstDefinition = unitDefinition(first);
  const secondDefinition = unitDefinition(second);
  if (firstDefinition && secondDefinition) return firstDefinition.family === secondDefinition.family;
  return normalizeUnitKey(first) === normalizeUnitKey(second);
}

function quantityInTargetUnit(quantity: number, sourceUnit: string | undefined, targetUnit: string | undefined) {
  if (!sourceUnit && !targetUnit) return quantity;
  if (!sourceUnit || !targetUnit) return undefined;
  const sourceDefinition = unitDefinition(sourceUnit);
  const targetDefinition = unitDefinition(targetUnit);
  if (!sourceDefinition || !targetDefinition) {
    return normalizeUnitKey(sourceUnit) === normalizeUnitKey(targetUnit) ? quantity : undefined;
  }
  if (sourceDefinition.family !== targetDefinition.family) return undefined;
  return (quantity * sourceDefinition.factor) / targetDefinition.factor;
}

function mergeIntoItem(existing: ShoppingItem, incoming: ParsedShoppingEntry): ShoppingItem | null {
  if (existing.quantity === undefined) {
    if (incoming.quantity === undefined) {
      return existing.checked ? { ...existing, checked: false } : existing;
    }
    const updated = {
      ...existing,
      quantity: incoming.quantity,
      ...(incoming.unit ? { unit: incoming.unit } : {}),
      checked: false,
    };
    return { ...updated, text: formatShoppingItem(updated) };
  }

  if (incoming.quantity === undefined) {
    return existing.checked ? { ...existing, checked: false } : existing;
  }

  if (!areUnitsCompatible(existing.unit, incoming.unit)) return null;
  const converted = quantityInTargetUnit(incoming.quantity, incoming.unit, existing.unit);
  if (converted === undefined) return null;
  const updated = { ...existing, quantity: rounded(existing.quantity + converted), checked: false };
  return { ...updated, text: formatShoppingItem(updated) };
}

function defaultIdFactory(index: number) {
  return `${Date.now()}-${index}-${Math.random()}`;
}

export function mergeShoppingEntries(
  current: ShoppingItem[],
  values: string[],
  idFactory: (index: number) => string = defaultIdFactory,
): MergeResult {
  const items = [...current];
  let changedCount = 0;

  values.forEach((value, inputIndex) => {
    const incoming = parseShoppingEntry(value);
    if (!incoming) return;
    const key = normalizeProductName(incoming.name);
    const matchingIndexes = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => normalizeProductName(item.name) === key)
      .map(({ index }) => index);

    for (const index of matchingIndexes) {
      const merged = mergeIntoItem(items[index], incoming);
      if (!merged) continue;
      if (merged !== items[index]) {
        items[index] = merged;
        changedCount += 1;
      }
      return;
    }

    items.push(makeShoppingItem(incoming, idFactory(inputIndex)));
    changedCount += 1;
  });

  return { items, changedCount };
}

export function updateShoppingItem(item: ShoppingItem, value: string) {
  const parsed = parseShoppingEntry(value);
  return parsed ? makeShoppingItem(parsed, item.id, item.checked) : null;
}

export function reorderShoppingItems(current: ShoppingItem[], orderedIds: string[]) {
  if (current.length !== orderedIds.length) return current;

  const itemsById = new Map(current.map((item) => [item.id, item]));
  const uniqueIds = new Set(orderedIds);
  if (uniqueIds.size !== current.length || orderedIds.some((id) => !itemsById.has(id))) {
    return current;
  }

  if (current.every((item, index) => item.id === orderedIds[index])) return current;
  return orderedIds.map((id) => itemsById.get(id)!);
}

export function orderShoppingItems(items: ShoppingItem[], completedLast: boolean) {
  if (!completedLast) return items;
  return [
    ...items.filter((item) => !item.checked),
    ...items.filter((item) => item.checked),
  ];
}

export function migrateShoppingItems(value: unknown): ShoppingItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    if (typeof entry === 'string') {
      const migrated = createShoppingItem(entry, `legacy-${index}`);
      return migrated ? [migrated] : [];
    }
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : `legacy-${index}`;
    const checked = typeof item.checked === 'boolean' ? item.checked : false;

    if (typeof item.name === 'string') {
      const name = cleanSpaces(item.name);
      if (!name) return [];
      const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity)
        ? item.quantity
        : undefined;
      const unit = typeof item.unit === 'string' ? canonicalizeUnit(item.unit) : undefined;
      return [makeShoppingItem({ name, ...(quantity !== undefined ? { quantity } : {}), ...(unit ? { unit } : {}) }, id, checked)];
    }

    if (typeof item.text === 'string') {
      const migrated = createShoppingItem(item.text, id, checked);
      return migrated ? [migrated] : [];
    }

    return [];
  });
}
