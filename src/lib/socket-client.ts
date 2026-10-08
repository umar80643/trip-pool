"use client";

import { io, Socket } from "socket.io-client";
import { useEffect, useRef } from "react";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/api/socket" });
  }
  return socket;
}

/**
 * Joins the given group's realtime room for the lifetime of the
 * component and wires up a handler map, e.g.:
 *
 *   useGroupRealtime(groupId, {
 *     "expense:created": () => refetchExpenses(),
 *     "settlement:confirmed": () => refetchBalances(),
 *   });
 */
export function useGroupRealtime(groupId: string | undefined, handlers: Record<string, (payload: any) => void>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!groupId) return;
    const s = getSocket();
    s.emit("join", groupId);

    const wrapped: Record<string, (payload: any) => void> = {};
    for (const event of Object.keys(handlersRef.current)) {
      wrapped[event] = (payload: any) => handlersRef.current[event]?.(payload);
      s.on(event, wrapped[event]);
    }

    return () => {
      for (const event of Object.keys(wrapped)) {
        s.off(event, wrapped[event]);
      }
      s.emit("leave", groupId);
    };
  }, [groupId]);
}
