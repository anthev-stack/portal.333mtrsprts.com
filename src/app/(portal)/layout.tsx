import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { PortalMain } from "@/components/portal/portal-main";
import { PortalSidebar } from "@/components/portal/sidebar";
import { PortalTopBar } from "@/components/portal/top-bar";

export const dynamic = "force-dynamic";

function isDatabaseUnavailableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "PrismaClientInitializationError") return true;
  return /P1001|Can't reach database|ECONNREFUSED|Timed out fetching a new connection/i.test(
    e.message,
  );
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  let user: {
    name: string;
    imageUrl: string | null;
    internalEmail: string;
    role: "STAFF" | "ADMIN";
  } | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        name: true,
        imageUrl: true,
        internalEmail: true,
        role: true,
      },
    });
  } catch (e) {
    console.error("PortalLayout database error", e);
    if (isDatabaseUnavailableError(e)) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <div className="max-w-md space-y-4 rounded-xl border bg-card p-6 text-left shadow-sm">
            <h1 className="text-center text-lg font-semibold tracking-tight">Database unavailable</h1>
            <p className="text-sm text-muted-foreground">
              Prisma could not open a connection. Fix <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> so it points at a running PostgreSQL
              instance, then run migrations and reload.
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Docker:</strong> install Docker Desktop, then in this project run{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">docker compose up -d db</code> and set{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> to the value in{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.example</code> (localhost:5432).
              </li>
              <li>
                <strong className="text-foreground">Prisma Accelerate / prisma+postgres URL:</strong> the tunnel or
                linked database must be running; otherwise switch to a normal{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">postgresql://…</code> URL for local dev.
              </li>
              <li>
                After Postgres is up:{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">npx prisma migrate deploy</code>
              </li>
            </ul>
          </div>
        </div>
      );
    }
    throw e;
  }

  if (!user) {
    redirect("/login");
  }

  const initialMe = {
    name: user.name,
    imageUrl: user.imageUrl,
    internalEmail: user.internalEmail,
    role: user.role,
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden md:flex">
        <PortalSidebar role={user.role} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <PortalTopBar initialMe={initialMe} />
        <PortalMain>{children}</PortalMain>
      </div>
    </div>
  );
}
