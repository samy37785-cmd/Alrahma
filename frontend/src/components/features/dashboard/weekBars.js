/* Weekly activity: last 7 days, aggregate completedAt from ALL enrolled courses */
export function buildWeekBars(allProgressData) {
  const today = new Date();
  const days  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return { date: d.toDateString(), label: ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()], count: 0, isToday: i === 6 };
  });

  for (const progressData of (allProgressData || [])) {
    (progressData?.completedAt || []).forEach((ts) => {
      const s = new Date(ts).toDateString();
      const slot = days.find((d) => d.date === s);
      if (slot) slot.count++;
    });
  }
  return days;
}
