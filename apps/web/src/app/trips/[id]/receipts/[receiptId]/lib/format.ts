export function formatMoney(n: number, currency: string): string {
  return `${n.toLocaleString("ru-RU", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatRub(n: number): string {
  return `${n.toLocaleString("ru-RU", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} RUB`;
}
