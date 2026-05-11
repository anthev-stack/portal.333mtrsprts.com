import { NextResponse } from "next/server";
import { z } from "zod";
import { FormFieldType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const forms = await prisma.form.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { responses: true, fields: true } },
    },
  });

  return NextResponse.json({ forms });
}

const fieldSchema = z.object({
  type: z.nativeEnum(FormFieldType),
  label: z.string().min(1),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
  fields: z.array(fieldSchema).min(1),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const form = await prisma.$transaction(async (tx) => {
    const f = await tx.form.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        isPublic: parsed.data.isPublic ?? false,
        creatorId: session.id,
      },
    });

    await tx.formField.createMany({
      data: parsed.data.fields.map((field, order) => ({
        formId: f.id,
        order,
        type: field.type,
        label: field.label,
        required: field.required ?? false,
        options:
          field.options && field.options.length > 0
            ? field.options
            : undefined,
      })),
    });

    return tx.form.findUniqueOrThrow({
      where: { id: f.id },
      include: { fields: { orderBy: { order: "asc" } } },
    });
  });

  return NextResponse.json({ form });
}
