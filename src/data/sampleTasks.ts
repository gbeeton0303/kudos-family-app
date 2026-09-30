import type { NewTaskInput } from '../types';

export const SAMPLE_TASKS: Array<Omit<NewTaskInput, 'profileIds'>> = [
  { title: 'Daily chore chart', amount: 10, frequency: 'daily', description: 'Complete the chores assigned on today’s chore chart.', icon: { type: 'preset', value: '✓' } },
  { title: 'Make the bed', amount: 5, frequency: 'daily', description: 'Straighten blankets and arrange pillows.', icon: { type: 'preset', value: '🛏️' } },
  { title: 'Brush teeth - morning', amount: 3, frequency: 'daily', description: 'Brush for two minutes in the morning.', icon: { type: 'preset', value: 'task:brush-teeth-morning' } },
  { title: 'Brush teeth - night', amount: 3, frequency: 'daily', description: 'Brush for two minutes before bed.', icon: { type: 'preset', value: 'task:brush-teeth-night' } },
  { title: 'Read for 20 minutes', amount: 10, frequency: 'daily', description: 'Read independently or with a parent.', icon: { type: 'preset', value: '📚' } },
  { title: 'Finish homework', amount: 10, frequency: 'daily', description: 'Complete and pack away schoolwork.', icon: { type: 'preset', value: '✏️' } },
  { title: 'Feed the pet', amount: 5, frequency: 'daily', description: 'Provide food and fresh water.', icon: { type: 'preset', value: '🐶' } },
  { title: 'Put toys away', amount: 5, frequency: 'daily', description: 'Return toys and games to their places.', icon: { type: 'preset', value: '🧸' } },
  { title: 'Help set the table', amount: 5, frequency: 'daily', description: 'Bring dishes and utensils to the table.', icon: { type: 'preset', value: '🍽️' } },
  { title: 'Do a kind act', amount: 4, frequency: 'unlimited', description: 'Recognize helpful or encouraging choices.', icon: { type: 'preset', value: '💛' } },
  { title: 'Use kind words', amount: 2, frequency: 'unlimited', description: 'Celebrate respectful and thoughtful language.', icon: { type: 'preset', value: '😊' } },
  { title: 'Wash hands', amount: 2, frequency: 'unlimited', description: 'Wash hands thoroughly with soap and water.', icon: { type: 'preset', value: 'task:wash-hands' } },
  { title: 'Clean bedroom', amount: 20, frequency: 'weekly', description: 'Tidy surfaces, clothes, floor, and belongings.', icon: { type: 'preset', value: 'task:clean-bedroom' } },
  { title: 'Take out recycling', amount: 8, frequency: 'weekly', description: 'Collect and move recycling to the proper bin.', icon: { type: 'preset', value: '♻️' } },
  { title: 'Organize closet', amount: 25, frequency: 'weekly', description: 'Sort clothing, shoes, and items that no longer fit.', icon: { type: 'preset', value: '👕' } },
];
