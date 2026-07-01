const BASE_URL = "https://services.leadconnectorhq.com";

export class GHLError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`GHL API error ${status}: ${JSON.stringify(body)}`);
  }
}

export class GHLClient {
  readonly locationId: string;
  private readonly token: string;
  private readonly apiVersion: string;

  constructor() {
    const token = process.env.GHL_API_TOKEN;
    const locationId = process.env.GHL_LOCATION_ID;
    if (!token) throw new Error("GHL_API_TOKEN environment variable is required");
    if (!locationId) throw new Error("GHL_LOCATION_ID environment variable is required");
    this.token = token;
    this.locationId = locationId;
    this.apiVersion = process.env.GHL_API_VERSION || "2021-07-28";
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Version: this.apiVersion,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!res.ok) {
      throw new GHLError(res.status, data);
    }
    return data as T;
  }
}
