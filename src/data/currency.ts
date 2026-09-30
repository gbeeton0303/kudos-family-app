import type { CurrencyType, StorageType } from '../types';

export const CURRENCY_META: Record<CurrencyType, { label: string; singular: string; icon: string; color: string }> = {
  stars: { label: 'Stars', singular: 'Star', icon: '★', color: '#F3A83B' },
  marbles: { label: 'Marbles', singular: 'Marble', icon: '●', color: '#4E9FE6' },
  points: { label: 'Points', singular: 'Point', icon: '✦', color: '#7868E6' },
  coins: { label: 'Coins', singular: 'Coin', icon: '🪙', color: '#E8A72E' },
  dollars: { label: 'Dollars', singular: 'Dollar', icon: '$', color: '#43A05A' },
};

export const STORAGE_META: Record<StorageType, { label: string; icon: string; description: string }> = {
  glassJar: { label: 'Glass jar', icon: '🫙', description: 'Watch the jar fill from the bottom.' },
  piggyBank: { label: 'Piggy bank', icon: '🐷', description: 'Save each earned reward in a friendly bank.' },
  treasureChest: { label: 'Treasure chest', icon: '▣', description: 'Watch earned currency pile up inside a treasure chest.' },
};

export function currencyWord(type: CurrencyType, amount: number) {
  const meta = CURRENCY_META[type];
  return amount === 1 ? meta.singular : meta.label;
}

export function formatCurrency(type: CurrencyType, amount: number, includeIcon = true) {
  const meta = CURRENCY_META[type];
  return `${includeIcon ? `${meta.icon} ` : ''}${amount} ${currencyWord(type, amount)}`;
}
