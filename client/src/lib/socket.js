import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Created lazily (not connected until something needs it) and shared across
// the app so teacher/student flows reuse one connection per browser tab.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: true, reconnection: true });
  }
  return socket;
}

// Wraps socket.emit(event, payload, cb) as a promise and rejects if the
// server never acks (e.g. it's unreachable) so callers don't hang forever.
export function emitWithAck(event, payload, timeoutMs = 8000) {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The server took too long to respond. Check your connection and try again.')), timeoutMs);
    s.emit(event, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}
