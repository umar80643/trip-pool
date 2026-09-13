import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  currency: z.string().length(3).default("USD"),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ groups });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const parsed = createGroupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const group = await prisma.group.create({
      data: {
        name: parsed.data.name,
        currency: parsed.data.currency,
        members: { create: { userId, role: "admin" } },
      },
      include: { members: true },
    });

    emitToGroup(group.id, "group:created", { group });
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
