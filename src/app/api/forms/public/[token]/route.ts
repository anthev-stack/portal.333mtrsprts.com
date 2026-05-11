import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const form = await prisma.form.findUnique({
    where: { shareToken: token },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!form.isPublic) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.json({
    form: {
      id: form.id,
      title: form.title,
      description: form.description,
      fields: form.fields,
    },
  });
}

const submitSchema = z.record(z.string(), z.string());

export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const form = await prisma.form.findUnique({
    where: { shareToken: token },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const answers = parsed.data;
  const session = await getSession();

  if (!form.isPublic && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  for (const field of form.fields) {
    const v = answers[field.id];
    if (field.required && (!v || !String(v).trim())) {
      return NextResponse.json(
        { error: `Missing: ${field.label}` },
        { status: 400 },
      );
    }
  }

  const response = await prisma.formResponse.create({
    data: {
      formId: form.id,
      userId: session?.id,
      answers: {
        create: form.fields
          .map((f) => {
            const value = answers[f.id];
            if (value === undefined || value === "") return null;
            return {
              fieldId: f.id,
              value: String(value),
            };
          })
          .filter((x): x is { fieldId: string; value: string } => x !== null),
      },
    },
  });

  return NextResponse.json({ id: response.id });
}
