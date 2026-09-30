import { NextResponse } from "next/server";
import { z } from "zod";
import { ProductSuggestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const patchSchema = z.object({
  status: z.nativeEnum(ProductSuggestionStatus).optional(),
  staffNote: z.string().optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

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

  const existing = await prisma.productSuggestion.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.productSuggestion.update({
    where: { id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.staffNote !== undefined
        ? { staffNote: parsed.data.staffNote.trim() || null }
        : {}),
    },
  });

  return NextResponse.json({ suggestion: updated });
}
