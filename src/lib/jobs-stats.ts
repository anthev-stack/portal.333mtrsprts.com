export type JobAssignmentStatusStr =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "UNABLE"
  | "WAIVED";

export type JobProgressStats = {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  unable: number;
  waived: number;
  pctNotStarted: number;
  pctInProgress: number;
  pctCompleted: number;
  pctUnable: number;
  pctWaived: number;
};

/** Progress payload for reminder-only jobs (not counted in org metrics). */
export const EMPTY_JOB_PROGRESS: JobProgressStats = {
  total: 0,
  notStarted: 0,
  inProgress: 0,
  completed: 0,
  unable: 0,
  waived: 0,
  pctNotStarted: 0,
  pctInProgress: 0,
  pctCompleted: 0,
  pctUnable: 0,
  pctWaived: 0,
};

export function progressFromAssignments(
  assignments: { status: JobAssignmentStatusStr }[],
): JobProgressStats {
  const total = assignments.length;
  if (total === 0) {
    return {
      total: 0,
      notStarted: 0,
      inProgress: 0,
      completed: 0,
      unable: 0,
      waived: 0,
      pctNotStarted: 0,
      pctInProgress: 0,
      pctCompleted: 0,
      pctUnable: 0,
      pctWaived: 0,
    };
  }
  let notStarted = 0;
  let inProgress = 0;
  let completed = 0;
  let unable = 0;
  let waived = 0;
  for (const a of assignments) {
    if (a.status === "NOT_STARTED") notStarted += 1;
    else if (a.status === "IN_PROGRESS") inProgress += 1;
    else if (a.status === "COMPLETED") completed += 1;
    else if (a.status === "UNABLE") unable += 1;
    else if (a.status === "WAIVED") waived += 1;
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  return {
    total,
    notStarted,
    inProgress,
    completed,
    unable,
    waived,
    pctNotStarted: pct(notStarted),
    pctInProgress: pct(inProgress),
    pctCompleted: pct(completed),
    pctUnable: pct(unable),
    pctWaived: pct(waived),
  };
}
