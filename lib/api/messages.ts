// ─── Outgoing (client → server) ───────────────────────────────────────────────

// Data needed to create a room or join a room, sent from the client to the server via WebSocket messages.
export interface CreateRoomPayload {
  name: string;
  playlist_id: string;
  rounds: number;
}
// Data needed to join a room, sent from the client to the server via WebSocket messages.
export interface JoinRoomPayload {
  name: string;
  code: string;
}

export type ClientMessage =
  | { type: "room.create"; data: CreateRoomPayload }
  | { type: "room.join";   data: JoinRoomPayload };

// ─── Incoming (server → client) ───────────────────────────────────────────────

export interface RoomState {
  code: string;
  host_name: string;
  members: string[];
  scoreboard: Record<string, number>;
  playlist_name: string;
  playlist_img: string;
  started: boolean;
  rounds: number;
  current_round: number;
}

export interface SongResult {
  points: number;
  title: string;
  artist: string;
  img: string;
}

export type ServerMessage =
  | { type: "room.updated";       ok: true;  data: { state: RoomState } }
  | { type: "room.started";       ok: true;  data: Record<string, never> }
  | { type: "room.ended";         ok: true;  data: { state: RoomState } }
  | { type: "room.round_started"; ok: true;  data: Record<string, never> }
  | { type: "room.round_ended";   ok: true;  data: SongResult }
  | { type: "song.correct";       ok: true;  data: SongResult }
  | { type: "song.incorrect";     ok: true;  data: Record<string, never> }
  | { type: "error";              ok: false; error: { code: string; message: string } };

// ─── Helper ───────────────────────────────────────────────────────────────────

export function buildClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg);
}