import { NextResponse } from "next/server";
import { z } from "zod";
import { FormFieldType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const fieldSchema = z.object({
  id: z.string().optional(),
  type: z.nativeEnum(FormFieldType),
  label: z.string().min(1),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  fields: z.array(fieldSchema).optional(),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { order: "asc" } },
      _count: { select: { responses: true } },
    },
  });

  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ form });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const form = await prisma.$transaction(async (tx) => {
      const data = parsed.data;
      await tx.form.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          ...(data.isPublic !== undefined ? { isPublic: data.isPublic } : {}),
        },
      });

      if (data.fields) {
        const responseCount = await tx.formResponse.count({
          where: { formId: id },
        });
        if (responseCount > 0) {
          throw new Error("FORM_HAS_RESPONSES");
        }
        await tx.formField.deleteMany({ where: { formId: id } });
        await tx.formField.createMany({
          data: data.fields.map((field, order) => ({
            formId: id,
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
      }

      return tx.form.findUniqueOrThrow({
        where: { id },
        include: { fields: { orderBy: { order: "asc" } } },
      });
    });

    return NextResponse.json({ form });
  } catch (e) {
    if (e instanceof Error && e.message === "FORM_HAS_RESPONSES") {
      return NextResponse.json(
        {
          error:
            "Cannot change form fields after responses exist. Duplicate the form instead.",
        },
        { status: 400 },
      );
    }
    throw e;
  }
}
