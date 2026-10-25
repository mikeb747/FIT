/**
 * Generates the default activity name dynamically based on the day of the week
 * the activity was started (e.g. "Friday Strength & Conditioning").
 */
export const getDefaultActivityName = (dateInput?: Date | number | null): string => {
  const date = typeof dateInput === 'number'
    ? new Date(dateInput)
    : (dateInput instanceof Date ? dateInput : new Date());

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[date.getDay()] || 'Friday';
  return `${dayName} Strength & Conditioning`;
};
