/** Capitalizes the first letter of every word for visible UI titles. */
export function toDisplayTitle(value: string): string {
  return value.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[’'][A-Za-z]+)?/g, (word) =>
    `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
  );
}
