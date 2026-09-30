import type { NewRewardInput } from '../types';

export const SAMPLE_REWARDS: Array<Omit<NewRewardInput, 'profileIds'>> = [
  { title: 'Choose family movie', cost: 30, icon: { type: 'preset', value: '🎬' } },
  { title: 'Extra game time', cost: 25, icon: { type: 'preset', value: '🎮' } },
  { title: 'Pick dessert', cost: 20, icon: { type: 'preset', value: '🍦' } },
  { title: 'Choose dinner', cost: 35, icon: { type: 'preset', value: '🍕' } },
  { title: 'Trip to the park', cost: 30, icon: { type: 'preset', value: '🛝' } },
  { title: 'Bake together', cost: 40, icon: { type: 'preset', value: '🧁' } },
  { title: 'Stay up 30 minutes late', cost: 45, icon: { type: 'preset', value: '🌙' } },
  { title: 'Choose a family game', cost: 25, icon: { type: 'preset', value: '🧩' } },
  { title: 'New small toy', cost: 75, icon: { type: 'preset', value: '🧸' } },
  { title: 'One-on-one parent time', cost: 40, icon: { type: 'preset', value: '💛' } },
  { title: 'Bike ride adventure', cost: 35, icon: { type: 'preset', value: '🚲' } },
  { title: 'Special outing', cost: 100, icon: { type: 'preset', value: '🎟️' } },
];
