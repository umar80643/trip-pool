import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Throws a 401 ApiError if there's no signed-in user; otherwise returns their id. */
export async function requireUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new ApiError(401, "You must be signed in.");
  }
  return session.user.id;
}

/**
 * Throws 403 if the user isn't a member of the group. Returns the
 * membership row (so callers can check `.role === "admin"`).
 */
export async function requireGroupMember(userId: string, groupId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  if (!membership) {
    throw new ApiError(403, "You are not a member of this group.");
  }
  return membership;
}

export function requireAdmin(membership: { role: string }) {
  if (membership.role !== "admin") {
    throw new ApiError(403, "Only a group admin can do this.");
  }
}
