// ─── Outgoing (client → server) ───────────────────────────────────────────────

export interface CreateRoomPayload {
  name: string;
  playlist_id: string;
  playlist_name: string;
  playlist_img: string;  // ← dodaj
  rounds: number;
}

export interface JoinRoomPayload {
  name: string;
  code: string;
}

export type ClientMessage =
  | { type: "room.create"; data: CreateRoomPayload }
  | { type: "room.join";   data: JoinRoomPayload }
  | { type: "room.ready";  data: Record<string, never> }
  | { type: "room.start";  data: Record<string, never> }
  | { type: "song.guess";  data: { guess: string } };

// ─── Room state (from backend) ────────────────────────────────────────────────

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
  ready_players: string[];
}

export interface SongResult {
  points: number;
  title: string;
  artist: string;
  img: string | null;
}

// ─── Incoming (server → client) ───────────────────────────────────────────────

export type ServerMessage =
  | { ok: true;  type: "room.updated";       data: { state: RoomState } }
  | { ok: true;  type: "room.started";       data: Record<string, never> }
  | { ok: true;  type: "room.ended";         data: { state: RoomState } }
  | { ok: true;  type: "round.started";      data: { round: number; total_rounds: number; duration: number } }
  | { ok: true;  type: "round.ended";        data: SongResult }
  | { ok: true;  type: "round.audio_config"; data: { sampleRate: number; channels: number } }
  | { ok: true;  type: "round.audio_stop";   data: Record<string, never> }
  | { ok: true;  type: "round.audio_end";    data: Record<string, never> }
  | { ok: true;  type: "song.correct";       data: SongResult }
  | { ok: true;  type: "song.incorrect";     data: Record<string, never> }
  | { ok: false; type?: string; error: { code: string; message: string } };

// ─── Helper ───────────────────────────────────────────────────────────────────

export function buildClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg);
}