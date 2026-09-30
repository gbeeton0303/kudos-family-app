import type { ProfileColorKey, ProfilePattern } from '../types';

export const PROFILE_COLOR_OPTIONS: ProfileColorKey[] = ['blue', 'pink', 'red', 'green', 'gold', 'yellow', 'purple', 'teal'];
export const PROFILE_PATTERN_OPTIONS: ProfilePattern[] = ['solid', 'striped', 'polka'];

export const PROFILE_COLOR_META: Record<ProfileColorKey, { label: string; color: string; soft: string }> = {
  blue: { label: 'Blue', color: '#3977D5', soft: '#E8F1FF' },
  pink: { label: 'Pink', color: '#DE5B98', soft: '#FCEAF3' },
  red: { label: 'Red', color: '#D95050', soft: '#FCEBEC' },
  green: { label: 'Green', color: '#35A66F', soft: '#E7F8EF' },
  gold: { label: 'Gold', color: '#C88C17', soft: '#FFF1D2' },
  yellow: { label: 'Yellow', color: '#D3AD14', soft: '#FFF8CF' },
  purple: { label: 'Purple', color: '#7868E6', soft: '#EFECFF' },
  teal: { label: 'Teal', color: '#269D98', soft: '#E5F7F6' },
};

export const PROFILE_PATTERN_META: Record<ProfilePattern, { label: string; description: string }> = {
  solid: { label: 'Solid', description: 'A clean single-color accent.' },
  striped: { label: 'Striped', description: 'Playful diagonal accent stripes.' },
  polka: { label: 'Polka dot', description: 'A cheerful dotted accent pattern.' },
};

export function getProfileAccent(key: ProfileColorKey) {
  return PROFILE_COLOR_META[key].color;
}

export function getProfileSoftColor(key: ProfileColorKey) {
  return PROFILE_COLOR_META[key].soft;
}
