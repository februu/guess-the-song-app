// ─── Outgoing (client → server) ───//

// These are the messages that the client can send to the server through the WebSocket connection
export interface CreateRoomPayload {
  name: string;
  playlist_id: string;
  playlist_name: string;
  playlist_img: string;  
  rounds: number;
}

// Payload for joining a room, includes the player's name and the room code they want to join
export interface JoinRoomPayload {
  name: string;
  code: string;
}

// The different types of messages that the client can send to the server
export type ClientMessage =
  | { type: "room.create"; data: CreateRoomPayload }
  | { type: "room.join";   data: JoinRoomPayload }
  | { type: "room.ready";  data: Record<string, never> }
  | { type: "room.start";  data: Record<string, never> }
  | { type: "song.guess";  data: { guess: string } };

// ─── Room state (from backend) ───//

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
  is_last_round: boolean;
}

// ─── Incoming (server → client) ───//

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

// ─── Helper ───//

// Helper function to build a ClientMessage object and convert it to a JSON string for sending through the WebSocket
export function buildClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg);
}