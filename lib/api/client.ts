// All requests go directly to the backend.
// The browser sends the session cookie automatically via credentials: "include"
// because the cookie is stored for 127.0.0.1:8000.
export const API_BASE = "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    public readonly code: string, // e.g. "invalid_request", "unauthorized", "internal_error"
    message: string,
    public readonly status: number, // HTTP status code (e.g. 400, 401, 500)
    public readonly detail?: string // Optional additional info for debugging (e.g. validation errors)
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Helper function to make API calls and handle responses/errors uniformly.
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include", // Include cookies for session authentication
    ...init,
    headers: {
      "Content-Type": "application/json",  // Default to JSON content type
      ...init?.headers,
    },
  });

  // Check if response is JSON; if not, throw an error with status info
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(
      "invalid_response",
      `Expected JSON but got ${contentType || "unknown"} (HTTP ${res.status})`,
      res.status
    );
  }

  // Parse JSON response
  const data = await res.json();

  if (!data.ok) {
    throw new ApiError(
      data.error?.code ?? data.error ?? "unknown_error",
      data.error?.message ?? data.detail ?? data.message ?? `Request failed (${res.status})`,
      res.status,
      data.detail
    );
  }

  return data as T;
}
// Exported API client with typed methods for GET and POST requests.
export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};