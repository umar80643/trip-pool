/**
 * The Socket.io server instance is attached to the Node `global` object by
 * src/server/dev-server.js (see that file for why a custom server is
 * needed at all: Next.js API routes alone can't hold a persistent WS
 * server). API routes call emitToGroup() after any mutation so every
 * connected client in that group updates live — see the "Real-Time Sync"
 * requirement in the project brief.
 *
 * If no socket server is attached (e.g. running `next build` in an
 * environment without the custom server, or in tests), this is a silent
 * no-op rather than a crash.
 */
import type { Server as SocketIOServer } from "socket.io";

declare global {
  // eslint-disable-next-line no-var
  var __tripPoolIO: SocketIOServer | undefined;
}

export function emitToGroup(groupId: string, event: string, payload: unknown) {
  const io = global.__tripPoolIO;
  if (!io) return;
  io.to(`group:${groupId}`).emit(event, payload);
}
