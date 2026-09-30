import type { NewRewardInput, NewTaskInput } from '../types';

export const CLASSROOM_SAMPLE_TASKS: Array<Omit<NewTaskInput, 'profileIds'>> = [
  { title: 'Arrive ready to learn', amount: 5, frequency: 'daily', description: 'Have materials ready and begin the morning routine.', icon: { type: 'preset', value: '🎒' } },
  { title: 'Turn in homework', amount: 8, frequency: 'daily', description: 'Submit completed work in the correct place.', icon: { type: 'preset', value: '📝' } },
  { title: 'Raise your hand', amount: 3, frequency: 'unlimited', description: 'Wait to be called on before speaking.', icon: { type: 'preset', value: '✋' } },
  { title: 'Show active listening', amount: 4, frequency: 'unlimited', description: 'Eyes on the speaker, quiet voice, and thoughtful response.', icon: { type: 'preset', value: '👂' } },
  { title: 'Follow directions', amount: 5, frequency: 'unlimited', description: 'Complete classroom directions the first time.', icon: { type: 'preset', value: '👍' } },
  { title: 'Participate in discussion', amount: 5, frequency: 'unlimited', description: 'Share an idea, answer, or useful question.', icon: { type: 'preset', value: '💬' } },
  { title: 'Help a classmate', amount: 5, frequency: 'unlimited', description: 'Offer respectful and useful help to someone in class.', icon: { type: 'preset', value: '🤝' } },
  { title: 'Use kind words', amount: 3, frequency: 'unlimited', description: 'Speak respectfully to classmates and adults.', icon: { type: 'preset', value: '💛' } },
  { title: 'Clean learning area', amount: 5, frequency: 'daily', description: 'Organize desks, tables, supplies, and floor space.', icon: { type: 'preset', value: '🧹' } },
  { title: 'Line up quietly', amount: 4, frequency: 'unlimited', description: 'Transition safely and quietly with the class.', icon: { type: 'preset', value: '🚶' } },
  { title: 'Complete reading goal', amount: 10, frequency: 'weekly', description: 'Finish the assigned classroom reading goal.', icon: { type: 'preset', value: '📚' }, scheduleDays: [5] },
  { title: 'Classroom job completed', amount: 8, frequency: 'weekly', description: 'Complete the assigned classroom responsibility.', icon: { type: 'preset', value: '🧰' }, scheduleDays: [5] },
];

export const CLASSROOM_SAMPLE_REWARDS: Array<Omit<NewRewardInput, 'profileIds'>> = [
  { title: 'Extra recess', cost: 40, icon: { type: 'preset', value: '🛝' } },
  { title: 'Choose the class game', cost: 35, icon: { type: 'preset', value: '🎲' } },
  { title: 'Teacher helper', cost: 25, icon: { type: 'preset', value: '🧑‍🏫' } },
  { title: 'Class dance party', cost: 50, icon: { type: 'preset', value: '🎉' } },
  { title: 'Pick the brain break', cost: 30, icon: { type: 'preset', value: '🧠' } },
  { title: 'Prize box visit', cost: 45, icon: { type: 'preset', value: '🎁' } },
  { title: 'Read-aloud choice', cost: 30, icon: { type: 'preset', value: '📖' } },
  { title: 'Technology time', cost: 45, icon: { type: 'preset', value: '💻' } },
  { title: 'Choose classroom seats', cost: 60, icon: { type: 'preset', value: '🪑' } },
  { title: 'Homework pass', cost: 75, icon: { type: 'preset', value: '🎫' } },
  { title: 'Classroom music choice', cost: 35, icon: { type: 'preset', value: '🎵' } },
  { title: 'Class celebration', cost: 100, icon: { type: 'preset', value: '🏆' } },
];
