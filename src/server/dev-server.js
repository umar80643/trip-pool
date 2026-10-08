// Custom server: Next.js API routes alone can't hold a persistent
// WebSocket connection (each request is a fresh serverless-style
// invocation), so real-time sync needs a long-lived Node process that
// hosts both the Next.js request handler AND a Socket.io server side by
// side. In production this typically means deploying to a Node host
// (Vercel + a separate small WS service, or a platform like Railway/
// Render/Fly that keeps a process running) rather than Vercel's default
// serverless functions — see README.md "Real-time deployment note".
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { getToken } = require("next-auth/jwt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT || "3000", 10);

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    path: "/api/socket",
  });

  // Stash the io instance on `global` so API route handlers (which run
  // in the same process) can broadcast via src/lib/realtime-emit.ts
  // without needing a separate pub/sub layer. If you scale to multiple
  // server instances, swap this for the Socket.io Redis adapter instead
  // — a single in-process `global` reference only works for one node.
  global.__tripPoolIO = io;

  // Every socket must present a valid NextAuth session cookie to connect at
  // all — group data (chat, expenses, saved places) must never reach an
  // unauthenticated client. socket.request is the raw HTTP upgrade request,
  // so next-auth's getToken() can read its session cookie the same way an
  // API route would.
  io.use(async (socket, next) => {
    try {
      const token = await getToken({ req: socket.request, secret: process.env.NEXTAUTH_SECRET });
      if (!token?.userId) return next(new Error("Unauthorized"));
      socket.data.userId = token.userId;
      socket.data.userName = token.name ?? "Someone";
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    // Client emits `join` with the groupId(s) they want live updates for
    // right after connecting (see src/lib/socket-client.ts). Membership is
    // re-checked here — a group id is not a secret, so anyone could try to
    // join any room, but only actual members are allowed into it.
    socket.on("join", async (groupId) => {
      if (typeof groupId !== "string") return;
      const membership = await prisma.groupMember.findUnique({
        where: { userId_groupId: { userId: socket.data.userId, groupId } },
      });
      if (membership) socket.join(`group:${groupId}`);
    });

    socket.on("leave", (groupId) => {
      if (typeof groupId === "string") socket.leave(`group:${groupId}`);
    });

    // Lightweight "someone is typing an expense" presence signal —
    // purely ephemeral, not persisted, just re-broadcast to the room.
    // The display name comes from the authenticated session, not the
    // client payload, so this can't be used to spoof another member.
    socket.on("activity", ({ groupId, action }) => {
      if (typeof groupId !== "string" || !socket.rooms.has(`group:${groupId}`)) return;
      if (typeof action !== "string" || action.length > 200) return;
      socket.to(`group:${groupId}`).emit("activity", { userName: socket.data.userName, action });
    });
  });

  server.listen(port, () => {
    console.log(`> TripPool ready on http://localhost:${port}`);
  });
});
