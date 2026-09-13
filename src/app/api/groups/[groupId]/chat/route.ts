import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

const PAGE_SIZE = 50;

/**
 * GET /api/groups/:groupId/chat[?before=ISO-timestamp]
 *
 * Returns up to PAGE_SIZE messages, newest-first internally but returned in
 * chronological order for easy rendering. Pass `before` (an earlier
 * message's createdAt) to page further back in history.
 */
export async function GET(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const { searchParams } = new URL(req.url);
    const before = searchParams.get("before");

    const messages = await prisma.chatMessage.findMany({
      where: {
        groupId: params.groupId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    });

    return NextResponse.json({ messages: messages.reverse(), hasMore: messages.length === PAGE_SIZE });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = sendMessageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const message = await prisma.chatMessage.create({
      data: { groupId: params.groupId, userId, content: parsed.data.content },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    emitToGroup(params.groupId, "chat:message", { message });
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
