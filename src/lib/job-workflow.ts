/**
 * True when no assignee still has active work (not started / in progress) and at least one person
 * finished the task. Used for admin archive + reject-completion gates.
 */
export function jobReadyForAdminFinalize(job: {
  assignToEveryone: boolean;
  assignments: { status: string }[];
}): boolean {
  const list = job.assignments;
  if (list.length === 0) return false;
  if (job.assignToEveryone) {
    const stillActive = list.some(
      (a) => a.status === "NOT_STARTED" || a.status === "IN_PROGRESS",
    );
    const hasCompleted = list.some((a) => a.status === "COMPLETED");
    return !stillActive && hasCompleted;
  }
  return list.every((a) => a.status === "COMPLETED");
}
