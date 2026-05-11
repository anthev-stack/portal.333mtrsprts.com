"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  progressFromAssignments,
  type JobAssignmentStatusStr,
  type JobProgressStats,
} from "@/lib/jobs-stats";
import { jobReadyForAdminFinalize } from "@/lib/job-workflow";
import { PORTAL_JOBS_OPEN_COUNT_EVENT } from "@/lib/jobs-open-count";

type Me = { id: string; name: string; role: "STAFF" | "ADMIN" };
type StaffUser = { id: string; name: string; internalEmail: string; role: string };

type Assignment = {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "UNABLE" | "WAIVED";
  unableReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  user: StaffUser;
};

type Job = {
  id: string;
  title: string;
  instructions: string;
  assignToEveryone: boolean;
  archivedAt: string | null;
  adminRejectionReason: string | null;
  isReminder?: boolean;
  createdAt: string;
  createdBy: { id: string; name: string; internalEmail: string };
  assignments: Assignment[];
  progress: JobProgressStats;
};

async function refreshJobsOpenCount() {
  const res = await fetch("/api/jobs/open-count", { credentials: "include" });
  if (!res.ok) return;
  const data = (await res.json()) as { count?: number };
  if (typeof data.count === "number") {
    window.dispatchEvent(
      new CustomEvent(PORTAL_JOBS_OPEN_COUNT_EVENT, { detail: { count: data.count } }),
    );
  }
}

/** Personal reminder (self-assigned); omitted from org progress aggregate and job-count badge. */
function isReminderJob(job: Job) {
  if (job.isReminder === true) return true;
  return (
    !job.assignToEveryone &&
    job.assignments.length === 1 &&
    job.assignments[0]?.user.id === job.createdBy.id
  );
}

/** Assign-to-everyone: who started/claimed once others are WAIVED. */
function assignEveryoneClaimer(job: Job): { name: string; userId: string } | null {
  if (!job.assignToEveryone) return null;
  if (!job.assignments.some((a) => a.status === "WAIVED")) return null;
  const claimer = job.assignments.find(
    (a) =>
      a.status === "IN_PROGRESS" ||
      a.status === "COMPLETED" ||
      a.status === "UNABLE",
  );
  if (!claimer) return null;
  return { name: claimer.user.name, userId: claimer.user.id };
}

function jobCardAssignmentSuffix(job: Job, viewerUserId: string | undefined): string {
  if (!job.assignToEveryone) return " · Selected staff";
  const claimer = assignEveryoneClaimer(job);
  if (claimer) {
    if (viewerUserId && claimer.userId === viewerUserId) return " · You've claimed this job";
    return ` · Claimed by ${claimer.name}`;
  }
  return " · Assigned to everyone";
}

/** Active tab: lists under Assigned to me (hidden from main grid). Assign-to-everyone stays on main until this user starts. */
function jobInActivePersonalQueue(job: Job, userId: string): boolean {
  const mine = job.assignments.find((a) => a.user.id === userId);
  if (!mine || mine.status === "WAIVED" || mine.status === "COMPLETED") return false;
  if (job.assignToEveryone && mine.status === "NOT_STARTED") return false;
  return true;
}

function formatJobCardCreatedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

async function parseApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  if (text) {
    try {
      const data = JSON.parse(text) as { error?: unknown };
      if (typeof data.error === "string" && data.error.trim()) return data.error.trim();
    } catch {
      /* ignore */
    }
  }
  return `${fallback} (HTTP ${res.status}).`;
}

/** Admin-only: all active assignments combined; not started shows as empty track (no fill). */
function OverallAssignmentsProgressBar({ p }: { p: JobProgressStats }) {
  if (p.total === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {p.notStarted > 0 && (
          <div
            className="h-full shrink-0 bg-transparent"
            style={{ width: `${(p.notStarted / p.total) * 100}%` }}
            title={`Not started ${p.notStarted}`}
          />
        )}
        {p.inProgress > 0 && (
          <div
            className="h-full shrink-0 bg-orange-500 transition-all"
            style={{ width: `${(p.inProgress / p.total) * 100}%` }}
            title={`In progress ${p.inProgress}`}
          />
        )}
        {p.completed > 0 && (
          <div
            className="h-full shrink-0 bg-green-600 transition-all"
            style={{ width: `${(p.completed / p.total) * 100}%` }}
            title={`Done ${p.completed}`}
          />
        )}
        {p.unable > 0 && (
          <div
            className="h-full shrink-0 bg-red-500 transition-all"
            style={{ width: `${(p.unable / p.total) * 100}%` }}
            title={`Unable ${p.unable}`}
          />
        )}
        {p.waived > 0 && (
          <div
            className="h-full shrink-0 bg-muted-foreground/30 transition-all"
            style={{ width: `${(p.waived / p.total) * 100}%` }}
            title={`Released ${p.waived}`}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full border border-muted-foreground/35 bg-transparent" /> Not
          started {p.notStarted}
        </span>
        {" · "}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-orange-500" /> In progress {p.inProgress}
        </span>
        {" · "}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-green-600" /> Done {p.completed}
        </span>
        {p.unable > 0 ? (
          <>
            {" · "}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-red-500" /> Unable {p.unable}
            </span>
          </>
        ) : null}
        {p.waived > 0 ? (
          <>
            {" · "}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-muted-foreground/35" /> Released {p.waived}
            </span>
          </>
        ) : null}
        {" · "}
        {p.total} total
      </p>
    </div>
  );
}

type JobRollup = "not_started" | "in_progress" | "unable" | "done";

function jobCardRollupStatus(job: Job): JobRollup {
  if (job.archivedAt != null) return "done";
  const hasUnable = job.assignments.some((a) => a.status === "UNABLE");
  if (hasUnable) return "unable";
  if (jobReadyForAdminFinalize({ assignToEveryone: job.assignToEveryone, assignments: job.assignments })) {
    return "done";
  }
  const touched = job.assignments.some(
    (a) =>
      a.status === "IN_PROGRESS" ||
      a.status === "COMPLETED" ||
      a.status === "WAIVED",
  );
  if (touched) return "in_progress";
  return "not_started";
}

function jobRollupTitle(roll: JobRollup): string {
  switch (roll) {
    case "not_started":
      return "Job status: not started";
    case "in_progress":
      return "Job status: in progress";
    case "unable":
      return "Job status: unable to complete (at least one assignee)";
    case "done":
      return "Job status: done (assignee work finished)";
    default:
      return "Job status";
  }
}

function jobRollupShortLabel(roll: JobRollup): string {
  switch (roll) {
    case "not_started":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "unable":
      return "Unable to complete";
    case "done":
      return "Done (assignee work finished)";
    default:
      return "";
  }
}

function JobRollupDot({ job }: { job: Job }) {
  if (isReminderJob(job)) {
    return (
      <span
        title="Personal reminder"
        className="inline-block size-3 shrink-0 rounded-full border-2 border-blue-700 bg-blue-600 transition-colors"
      />
    );
  }
  const roll = jobCardRollupStatus(job);
  return (
    <span
      title={jobRollupTitle(roll)}
      className={cn(
        "inline-block size-3 shrink-0 rounded-full border-2 transition-colors",
        roll === "done" && "border-green-700 bg-green-600",
        roll === "in_progress" && "border-orange-600 bg-orange-500",
        roll === "unable" && "border-red-700 bg-red-500",
        roll === "not_started" && "border-muted-foreground/45 bg-transparent",
      )}
    />
  );
}

function statusLabel(s: Assignment["status"]) {
  switch (s) {
    case "NOT_STARTED":
      return "Not started";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "UNABLE":
      return "Unable to complete";
    case "WAIVED":
      return "Released (Job claimed)";
    default:
      return s;
  }
}

/** Text next to the status dot: your assignment if you have one, otherwise overall job status. */
function jobCardStatusBadgeText(job: Job, mine: Assignment | null) {
  if (mine) return statusLabel(mine.status);
  return jobRollupShortLabel(jobCardRollupStatus(job));
}

export default function JobsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [scope, setScope] = useState<"active" | "archived">("active");
  const [detail, setDetail] = useState<Job | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createInstructions, setCreateInstructions] = useState("");
  const [createEveryone, setCreateEveryone] = useState(true);
  const [createSelectedIds, setCreateSelectedIds] = useState<Set<string>>(new Set());

  const [editOpen, setEditOpen] = useState(false);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editInstructions, setEditInstructions] = useState("");

  const [unableOpen, setUnableOpen] = useState(false);
  const [unableJobId, setUnableJobId] = useState<string | null>(null);
  const [unableReason, setUnableReason] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  /** When admin opens a job from "Assigned to me", use staff-style actions (Start / Done / Unable). */
  const [detailView, setDetailView] = useState<"admin" | "assignee">("admin");

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderInstructions, setReminderInstructions] = useState("");

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [resolveUnableAssignmentId, setResolveUnableAssignmentId] = useState<string | null>(null);
  const [resolveUnableSolution, setResolveUnableSolution] = useState("");

  const isAdmin = me?.role === "ADMIN";

  /** Open work on Active, or completed personal reminders on Completed (reminders never use the main grid). */
  const jobsAssignedToMe = useMemo(() => {
    if (!me) return [];
    if (scope === "active") {
      return jobs.filter((j) => jobInActivePersonalQueue(j, me.id));
    }
    if (scope === "archived") {
      return jobs.filter(
        (j) =>
          isReminderJob(j) &&
          j.archivedAt != null &&
          j.assignments.some((a) => a.user.id === me.id),
      );
    }
    return [];
  }, [jobs, me, scope]);

  /** Main grid: team / others' work. On Active, omit jobs that only appear under Assigned to me. */
  const mainJobsList = useMemo(() => {
    return jobs.filter((j) => {
      if (isReminderJob(j)) return false;
      if (!me || scope !== "active") return true;
      if (jobInActivePersonalQueue(j, me.id)) return false;
      return true;
    });
  }, [jobs, me, scope]);

  const aggregateProgress = useMemo((): JobProgressStats | null => {
    if (scope !== "active") return null;
    const slots: { status: JobAssignmentStatusStr }[] = [];
    for (const job of jobs) {
      if (isReminderJob(job)) continue;
      for (const a of job.assignments) {
        if (a.status === "WAIVED") continue;
        slots.push({ status: a.status as JobAssignmentStatusStr });
      }
    }
    const p = progressFromAssignments(slots);
    if (p.total === 0) return null;
    return p;
  }, [jobs, scope]);

  const loadJobs = useCallback(async (listScope: "active" | "archived") => {
    setJobsLoading(true);
    try {
      const res = await fetch(`/api/jobs?scope=${encodeURIComponent(listScope)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast.error(await parseApiError(res, "Could not load jobs"));
        return;
      }
      const data = (await res.json()) as { jobs: Job[] };
      setJobs(data.jobs);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadStaff = useCallback(async () => {
    const res = await fetch("/api/staff", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { users: StaffUser[] };
    setStaffUsers(data.users);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        setInitializing(false);
        return;
      }
      const data = (await res.json()) as { user: Me };
      setMe(data.user);
      if (data.user.role === "ADMIN") await loadStaff();
      setInitializing(false);
    })();
  }, [loadStaff]);

  useEffect(() => {
    if (!me) return;
    void loadJobs(scope);
  }, [me, scope, loadJobs]);

  useEffect(() => {
    if (!me) return;
    void refreshJobsOpenCount();
  }, [me]);

  const myAssignment = useCallback(
    (job: Job) => job.assignments.find((a) => a.user.id === me?.id) ?? null,
    [me?.id],
  );

  async function openDetail(job: Job, mode?: "admin" | "assignee") {
    const nextMode = mode ?? (isAdmin ? "admin" : "assignee");
    setDetailView(nextMode);
    const res = await fetch(`/api/jobs/${job.id}`, { credentials: "include" });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not open job"));
      return;
    }
    const data = (await res.json()) as { job: Job };
    setDetail(data.job);
  }

  async function postStatus(jobId: string, body: object) {
    const res = await fetch(`/api/jobs/${jobId}/status`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not update status"));
      return false;
    }
    const data = (await res.json()) as { job: Job };
    if (data.job.archivedAt != null && scope === "active") {
      setJobs((prev) => prev.filter((j) => j.id !== data.job.id));
      setDetail((d) => (d?.id === data.job.id ? null : d));
      toast.success(isReminderJob(data.job) ? "Reminder moved to Completed" : "Updated");
    } else {
      setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)));
      setDetail((d) => (d?.id === data.job.id ? data.job : d));
      toast.success("Updated");
    }
    void refreshJobsOpenCount();
    return true;
  }

  async function restoreReminderJob(jobId: string) {
    const res = await fetch(`/api/jobs/${jobId}/restore-reminder`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not restore reminder"));
      return;
    }
    const data = (await res.json()) as { job: Job };
    if (scope === "archived") {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } else {
      setJobs((prev) => [data.job, ...prev.filter((j) => j.id !== data.job.id)]);
    }
    setDetail((d) => (d?.id === jobId ? null : d));
    toast.success("Reminder restored to Active");
    void refreshJobsOpenCount();
  }

  async function archiveJob(jobId: string) {
    const res = await fetch(`/api/jobs/${jobId}/archive`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not complete job"));
      return;
    }
    toast.success("Job moved to Completed");
    setDetail(null);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    void refreshJobsOpenCount();
  }

  async function submitResolveUnable() {
    if (!detail || !resolveUnableAssignmentId || !resolveUnableSolution.trim()) {
      toast.error("Please add guidance for the assignee");
      return;
    }
    const res = await fetch(`/api/jobs/${detail.id}/resolve-unable`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assignmentId: resolveUnableAssignmentId,
        solution: resolveUnableSolution.trim(),
      }),
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not resume job"));
      return;
    }
    const data = (await res.json()) as { job: Job };
    setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)));
    setDetail((d) => (d?.id === data.job.id ? data.job : d));
    setResolveUnableAssignmentId(null);
    setResolveUnableSolution("");
    toast.success("Assignee set back to In progress; guidance added to instructions");
    void refreshJobsOpenCount();
  }

  async function rejectJobCompletion(jobId: string) {
    if (!rejectNote.trim()) {
      toast.error("Please add a note for the team");
      return;
    }
    const res = await fetch(`/api/jobs/${jobId}/reject-completion`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: rejectNote.trim() }),
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not update job"));
      return;
    }
    const data = (await res.json()) as { job: Job };
    setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)));
    setDetail((d) => (d?.id === data.job.id ? data.job : d));
    setRejectOpen(false);
    setRejectNote("");
    toast.success("Job sent back to the team");
    void refreshJobsOpenCount();
  }

  async function submitCreate() {
    if (!createTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!createInstructions.trim()) {
      toast.error("Instructions are required");
      return;
    }
    const assigneeUserIds = [...createSelectedIds];
    if (!createEveryone && assigneeUserIds.length === 0) {
      toast.error("Select at least one person, or assign to everyone");
      return;
    }
    const res = await fetch("/api/jobs", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: createTitle.trim(),
        instructions: createInstructions.trim(),
        assignToEveryone: createEveryone,
        ...(createEveryone ? {} : { assigneeUserIds }),
      }),
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not create job"));
      return;
    }
    setCreateOpen(false);
    setCreateTitle("");
    setCreateInstructions("");
    setCreateEveryone(true);
    setCreateSelectedIds(new Set());
    toast.success("Job created");
    if (scope !== "active") setScope("active");
    else await loadJobs("active");
    void refreshJobsOpenCount();
  }

  async function submitReminder() {
    if (!reminderTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!reminderInstructions.trim()) {
      toast.error("Instructions are required");
      return;
    }
    const res = await fetch("/api/jobs", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: reminderTitle.trim(),
        instructions: reminderInstructions.trim(),
        selfReminder: true,
      }),
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not create reminder"));
      return;
    }
    setReminderOpen(false);
    setReminderTitle("");
    setReminderInstructions("");
    toast.success("Reminder created");
    if (scope !== "active") setScope("active");
    else await loadJobs("active");
    void refreshJobsOpenCount();
  }

  async function submitEdit() {
    if (!editJob) return;
    const res = await fetch(`/api/jobs/${editJob.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim(),
        instructions: editInstructions.trim(),
      }),
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not save"));
      return;
    }
    const data = (await res.json()) as { job: Job };
    setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)));
    setDetail((d) => (d?.id === data.job.id ? data.job : d));
    setEditOpen(false);
    setEditJob(null);
    toast.success("Job updated");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/jobs/${deleteTarget.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await parseApiError(res, "Could not delete"));
      return;
    }
    setJobs((prev) => prev.filter((j) => j.id !== deleteTarget.id));
    setDetail((d) => (d?.id === deleteTarget.id ? null : d));
    setDeleteTarget(null);
    toast.success(isReminderJob(deleteTarget) ? "Reminder deleted" : "Job deleted");
    void refreshJobsOpenCount();
  }

  function openEdit(job: Job) {
    setEditJob(job);
    setEditTitle(job.title);
    setEditInstructions(job.instructions);
    setEditOpen(true);
  }

  if (initializing || !me) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Create tasks, assign your team or everyone, and track completion."
              : "Start work when you are ready, then mark done or flag if you cannot complete a task."}
          </p>
        </div>
        {(isAdmin || me.role === "STAFF") && (
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button
                onClick={() => {
                  setCreateOpen(true);
                  void loadStaff();
                }}
              >
                Create job
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setReminderOpen(true)}>
              Create reminder
            </Button>
          </div>
        )}
      </div>

      <Tabs
        value={scope}
        onValueChange={(v) => setScope(v as typeof scope)}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value={scope} className="mt-4 space-y-6 outline-none">
          {jobsLoading && (
            <p className="text-sm text-muted-foreground">Updating job list…</p>
          )}
          {scope === "active" && aggregateProgress && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Progress across all active jobs</CardTitle>
                <CardDescription className="text-xs">
                  Same colours as job cards: not started (empty track), in progress orange, done green, unable red.
                  Personal reminders are excluded. Released teammates are excluded. Archived jobs are excluded.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OverallAssignmentsProgressBar p={aggregateProgress} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {mainJobsList.map((job) => {
              const mine = myAssignment(job);
              const archived = job.archivedAt != null;
              return (
                <Card key={job.id} className="shadow-sm">
                  <CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="min-w-0 flex-1 text-base leading-snug">{job.title}</CardTitle>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <JobRollupDot job={job} />
                        <Badge variant="secondary">{jobCardStatusBadgeText(job, mine)}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created by {job.createdBy.name}
                      {jobCardAssignmentSuffix(job, me?.id)}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void openDetail(job, isAdmin ? "admin" : undefined)}
                      >
                        {isAdmin ? "View & manage" : "View job"}
                      </Button>
                      {isAdmin && !archived && (
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(job)}>
                          Edit
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteTarget(job)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                    <time
                      className="shrink-0 text-xs tabular-nums text-muted-foreground"
                      dateTime={job.createdAt}
                      title={new Date(job.createdAt).toLocaleString()}
                    >
                      {formatJobCardCreatedDate(job.createdAt)}
                    </time>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {jobsAssignedToMe.length > 0 && (
            <div className="space-y-3 border-t pt-8">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Assigned to me</h2>
                <p className="text-sm text-muted-foreground">
                  {scope === "active"
                    ? isAdmin
                      ? "Personal reminders and other work where you are an assignee — reminders only appear here, not in the main list."
                      : "Personal reminders and other work that still needs your attention — reminders only appear here."
                    : "Completed personal reminders. Restore one to move it back to Active."}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {jobsAssignedToMe.map((job) => {
                  const mine = myAssignment(job);
                  return (
                    <Card key={`mine-${job.id}`} className="shadow-sm">
                      <CardHeader className="space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <CardTitle className="min-w-0 flex-1 text-base leading-snug">{job.title}</CardTitle>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                            <JobRollupDot job={job} />
                            {isReminderJob(job) ? (
                              <Badge variant="secondary">Reminder</Badge>
                            ) : (
                              <Badge variant="secondary">{jobCardStatusBadgeText(job, mine)}</Badge>
                            )}
                          </div>
                        </div>
                        {!isReminderJob(job) && (
                          <p className="text-xs text-muted-foreground">
                            Created by {job.createdBy.name}
                            {jobCardAssignmentSuffix(job, me?.id)}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openDetail(job, "assignee")}
                          >
                            {isReminderJob(job) ? "View reminder" : "View job"}
                          </Button>
                          {scope === "archived" && isReminderJob(job) && (mine || isAdmin) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void restoreReminderJob(job.id)}
                            >
                              Restore
                            </Button>
                          )}
                          {scope === "archived" && isReminderJob(job) && mine && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteTarget(job)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                        <time
                          className="shrink-0 text-xs tabular-nums text-muted-foreground"
                          dateTime={job.createdAt}
                          title={new Date(job.createdAt).toLocaleString()}
                        >
                          {formatJobCardCreatedDate(job.createdAt)}
                        </time>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {mainJobsList.length === 0 && jobsAssignedToMe.length === 0 && !jobsLoading && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {scope === "archived"
                  ? isAdmin
                    ? "No completed jobs yet. When every assignee has marked done, use Mark job as completed on the job to archive it here."
                    : "No completed jobs in your history yet."
                  : isAdmin
                    ? "No active jobs yet. Create one to assign work to the team."
                    : "No active jobs assigned to you."}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!detail}
        onOpenChange={(o) => {
          if (!o) {
            setDetail(null);
            setDetailView("admin");
            setRejectOpen(false);
            setRejectNote("");
            setResolveUnableAssignmentId(null);
            setResolveUnableSolution("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-xl" showCloseButton>
          {detail &&
            (() => {
              const mineRow = myAssignment(detail);
              const showAdminPanel = isAdmin && detailView === "admin";
              const jobArchived = detail.archivedAt != null;
              const showAssigneeActions =
                mineRow &&
                (!isAdmin || detailView === "assignee") &&
                !jobArchived &&
                mineRow.status !== "WAIVED";
              const readyForAdmin = jobReadyForAdminFinalize({
                assignToEveryone: detail.assignToEveryone,
                assignments: detail.assignments,
              });
              const hasUnableAssignment = detail.assignments.some((a) => a.status === "UNABLE");
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>{detail.title}</DialogTitle>
                    <DialogDescription>
                      Assigned by {detail.createdBy.name} ({detail.createdBy.internalEmail})
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    {jobArchived && (
                      <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        This job is completed and archived. It no longer appears in Active or in the overall progress
                        bar.
                      </p>
                    )}
                    {jobArchived && isReminderJob(detail) && (mineRow || isAdmin) && (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => void restoreReminderJob(detail.id)}>
                          Restore
                        </Button>
                        {mineRow && (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => setDeleteTarget(detail)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                    {isAdmin && detailView === "assignee" && (
                      <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        You are viewing this job as an assignee. Use{" "}
                        <span className="font-medium text-foreground">View and manage</span> on the main job card for
                        full team progress and editing.
                      </p>
                    )}
                    {showAdminPanel && (
                      <div className="flex items-center gap-2">
                        <JobRollupDot job={detail} />
                        <span className="text-xs text-muted-foreground">
                          {isReminderJob(detail)
                            ? "Reminder"
                            : jobRollupShortLabel(jobCardRollupStatus(detail))}
                        </span>
                      </div>
                    )}
                    {!jobArchived && detail.adminRejectionReason && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                        <p className="font-medium text-foreground">Not completed — admin note</p>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {detail.adminRejectionReason}
                        </p>
                      </div>
                    )}
                    {showAdminPanel && !jobArchived && hasUnableAssignment && !isReminderJob(detail) && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                        <p className="font-medium text-foreground">Unable to complete</p>
                        <p className="mt-1 text-muted-foreground">
                          An assignee could not finish this job. Add guidance below to put them back to In progress
                          (appended to instructions), or delete the job from the list or using the button here.
                        </p>
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteTarget(detail)}
                          >
                            Delete job
                          </Button>
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Instructions</p>
                      <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-foreground">
                        {detail.instructions}
                      </div>
                    </div>
                    {showAdminPanel && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Assignees</p>
                        <ScrollArea className="h-48 rounded-md border">
                          <ul className="divide-y p-0 text-sm">
                            {detail.assignments.map((a) => (
                              <li key={a.id} className="flex flex-col gap-0.5 px-3 py-2">
                                <span className="font-medium">{a.user.name}</span>
                                <span className="text-xs text-muted-foreground">{a.user.internalEmail}</span>
                                <div className="flex flex-col gap-2 pt-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">{statusLabel(a.status)}</Badge>
                                    {a.status === "UNABLE" && a.unableReason && (
                                      <span className="text-xs text-destructive">
                                        Reason: {a.unableReason}
                                      </span>
                                    )}
                                    {a.status === "WAIVED" && (
                                      <span className="text-xs text-muted-foreground">
                                        Someone else started this shared job.
                                      </span>
                                    )}
                                  </div>
                                  {!jobArchived && a.status === "UNABLE" && !isReminderJob(detail) && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="w-fit"
                                      onClick={() => {
                                        setResolveUnableAssignmentId(a.id);
                                        setResolveUnableSolution("");
                                      }}
                                    >
                                      Provide solution and resume
                                    </Button>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </ScrollArea>
                      </div>
                    )}
                    {showAdminPanel && !jobArchived && readyForAdmin && !isReminderJob(detail) && (
                      <div className="space-y-3 border-t pt-3">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" onClick={() => void archiveJob(detail.id)}>
                            Mark job as completed
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setRejectNote("");
                              setRejectOpen(true);
                            }}
                          >
                            Not completed
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Archive when the work is verified. Use Not completed to send the job back with a note so
                          assignees can fix it and mark done again.
                        </p>
                      </div>
                    )}
                    {showAssigneeActions && (
                      <div className="flex flex-col gap-2 border-t pt-2">
                        {!isReminderJob(detail) && mineRow.status === "UNABLE" && (
                          <p className="text-xs text-muted-foreground">
                            You marked this job as unable to complete. An admin will review and may add guidance; you
                            will be set back to In progress when they respond.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                        {isReminderJob(detail) &&
                          (mineRow.status === "NOT_STARTED" || mineRow.status === "IN_PROGRESS") && (
                            <Button
                              type="button"
                              onClick={() => void postStatus(detail.id, { action: "complete" })}
                            >
                              Mark as done
                            </Button>
                          )}
                        {!isReminderJob(detail) && mineRow.status === "NOT_STARTED" && (
                          <Button
                            type="button"
                            onClick={() => void postStatus(detail.id, { action: "start" })}
                          >
                            Start
                          </Button>
                        )}
                        {!isReminderJob(detail) && mineRow.status === "IN_PROGRESS" && (
                          <Button
                            type="button"
                            onClick={() => void postStatus(detail.id, { action: "complete" })}
                          >
                            Mark as done
                          </Button>
                        )}
                        {!isReminderJob(detail) &&
                          (mineRow.status === "NOT_STARTED" || mineRow.status === "IN_PROGRESS") && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setUnableJobId(detail.id);
                                setUnableReason("");
                                setUnableOpen(true);
                              }}
                            >
                              Unable to complete
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle>Create job</DialogTitle>
            <DialogDescription>Create a task and choose who it applies to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="job-title">Title</Label>
              <Input
                id="job-title"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Short title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-inst">Instructions</Label>
              <Textarea
                id="job-inst"
                value={createInstructions}
                onChange={(e) => setCreateInstructions(e.target.value)}
                rows={6}
                placeholder="What needs to be done?"
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Assign to everyone</p>
                <p className="text-xs text-muted-foreground">All portal users get this job.</p>
              </div>
              <Switch checked={createEveryone} onCheckedChange={setCreateEveryone} />
            </div>
            {!createEveryone && (
              <div className="space-y-2">
                <Label>Staff members</Label>
                <ScrollArea className="h-48 rounded-md border p-2">
                  <div className="space-y-2 pr-2">
                    {staffUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50"
                      >
                        <Checkbox
                          checked={createSelectedIds.has(u.id)}
                          onCheckedChange={(c) => {
                            setCreateSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (c === true) next.add(u.id);
                              else next.delete(u.id);
                              return next;
                            });
                          }}
                        />
                        <span className="text-sm">
                          {u.name}{" "}
                          <span className="text-muted-foreground">({u.internalEmail})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitCreate()}>
              Create job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle>Create reminder</DialogTitle>
            <DialogDescription>
              A simple note for yourself: mark it done when finished and it moves to Completed; you can restore it to
              Active from there. Reminders stay out of the team progress total and sidebar job count, and use a Reminder
              badge with a blue status dot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rem-title">Title</Label>
              <Input
                id="rem-title"
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder="What to remember"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rem-inst">Notes</Label>
              <Textarea
                id="rem-inst"
                value={reminderInstructions}
                onChange={(e) => setReminderInstructions(e.target.value)}
                rows={5}
                placeholder="Details…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReminderOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitReminder()}>
              Create reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Edit job</DialogTitle>
            <DialogDescription>Update title and instructions. Assignments are unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-inst">Instructions</Label>
              <Textarea
                id="edit-inst"
                rows={6}
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitEdit()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resolveUnableAssignmentId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setResolveUnableAssignmentId(null);
            setResolveUnableSolution("");
          }
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Provide solution and resume</DialogTitle>
            <DialogDescription>
              Your message is appended to the job instructions. The assignee returns to In progress so they can continue
              or mark done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolve-unable-solution">Guidance for the assignee</Label>
            <Textarea
              id="resolve-unable-solution"
              value={resolveUnableSolution}
              onChange={(e) => setResolveUnableSolution(e.target.value)}
              rows={5}
              placeholder="Explain how to proceed or what changed…"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResolveUnableAssignmentId(null);
                setResolveUnableSolution("");
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitResolveUnable()}>
              Save and resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unableOpen} onOpenChange={setUnableOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Unable to complete</DialogTitle>
            <DialogDescription>
              Explain what blocked you. The person who assigned this job will be notified.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={unableReason}
            onChange={(e) => setUnableReason(e.target.value)}
            rows={5}
            placeholder="Reason…"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUnableOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!unableJobId || !unableReason.trim()) {
                  toast.error("Please enter a reason");
                  return;
                }
                const ok = await postStatus(unableJobId, {
                  action: "unable",
                  reason: unableReason.trim(),
                });
                if (ok) {
                  setUnableOpen(false);
                  setUnableJobId(null);
                  setUnableReason("");
                }
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={(o) => {
          setRejectOpen(o);
          if (!o) setRejectNote("");
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Mark as not completed</DialogTitle>
            <DialogDescription>
              Add a note for assignees. All assignments reset to Not started so they can redo the work and mark done
              again.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={5}
            placeholder="What still needs to be fixed or completed?"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!detail) return;
                void rejectJobCompletion(detail.id);
              }}
            >
              Send back to team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget && isReminderJob(deleteTarget) ? "Delete reminder?" : "Delete job?"}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget && isReminderJob(deleteTarget)
                ? "This removes your reminder permanently. This cannot be undone."
                : "This removes the job and all assignment records. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
