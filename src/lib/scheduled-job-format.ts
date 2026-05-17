export const DAY_OF_WEEK_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type ScheduledJobFrequencyStr = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";

export function formatScheduledJobSummary(schedule: {
  frequency: ScheduledJobFrequencyStr;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  isActive: boolean;
}): string {
  if (!schedule.isActive) return "Paused";

  if (schedule.frequency === "WEEKLY" && schedule.dayOfWeek != null) {
    return `Every ${DAY_OF_WEEK_LABELS[schedule.dayOfWeek]}`;
  }
  if (schedule.frequency === "FORTNIGHTLY" && schedule.dayOfWeek != null) {
    return `Every 2 weeks on ${DAY_OF_WEEK_LABELS[schedule.dayOfWeek]}`;
  }
  if (schedule.frequency === "MONTHLY" && schedule.dayOfMonth != null) {
    return `Monthly on day ${schedule.dayOfMonth}`;
  }
  return schedule.frequency;
}
