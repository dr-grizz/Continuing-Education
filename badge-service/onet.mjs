// Based on the official O*NET v2 Node.js samples (MIT), with bounded requests,
// a private server key, shared caching and explicit public response fields.
// https://github.com/onetcenter/web-services-v2-samples/tree/main/nodejs
const codePattern = /^\d{2}-\d{4}\.\d{2}$/;
const string = (value, max = 2000) =>
  typeof value === "string" && value.length <= max;
export class OnetError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}
export class OnetService {
  constructor({
    apiKey = process.env.ONET_API_KEY || "",
    fetcher = fetch,
    now = Date.now,
  } = {}) {
    this.apiKey = apiKey.trim();
    this.fetcher = fetcher;
    this.now = now;
    this.cache = new Map();
    this.pending = new Map();
    this.requests = [];
    this.day = "";
    this.daily = 0;
    this.blockedUntil = 0;
  }
  get configured() {
    return Boolean(this.apiKey);
  }
  status() {
    return {
      configured: this.configured,
      source: "O*NET Web Services",
      attributionUrl: "https://services.onetcenter.org/",
      publicPath: "/skills",
      message: this.configured
        ? "O*NET API access is configured."
        : "O*NET API access is not configured. Imported skills and BLS statistics remain available.",
    };
  }
  async call(path, query = {}) {
    if (!this.configured) throw new OnetError(this.status().message);
    if (
      !/^(about|online\/search|mnm\/careers\/\d{2}-\d{4}\.\d{2}\/job_outlook)$/.test(
        path,
      )
    )
      throw new OnetError("Unsupported O*NET request.", 400);
    const url = new URL(path, "https://api-v2.onetcenter.org/");
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, String(value));
    const key = url.href,
      current = this.now(),
      cached = this.cache.get(key);
    if (cached && cached.expires > current)
      return structuredClone(cached.value);
    if (this.pending.has(key))
      return structuredClone(await this.pending.get(key));
    // Per-process ceiling, below the published 5 requests/second. Multi-instance
    // deployments must additionally coordinate a shared provider limit.
    this.requests = this.requests.filter((time) => current - time < 1000);
    const day = new Date(current).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.daily = 0;
    }
    if (
      this.requests.length >= 4 ||
      this.daily >= 49000 ||
      current < this.blockedUntil
    )
      throw new OnetError(
        "O*NET is busy. Wait a moment before trying again.",
        429,
      );
    this.requests.push(current);
    this.daily++;
    const operation = (async () => {
      try {
        const response = await this.fetcher(url.href, {
          method: "GET",
          headers: {
            "X-API-Key": this.apiKey,
            Accept: "application/json",
            "User-Agent": "Continuing-Education/0.1 (O*NET v2 integration)",
          },
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          if (response.status === 429) {
            const seconds = Number(response.headers.get("retry-after"));
            this.blockedUntil =
              this.now() +
              (Number.isFinite(seconds) && seconds > 0
                ? Math.min(seconds, 3600) * 1000
                : 1000);
          }
          await response.body?.cancel();
          throw new OnetError(
            response.status === 401 || response.status === 403
              ? "O*NET rejected the configured API credentials. Contact the portal administrator."
              : response.status === 422 || response.status === 404
                ? "O*NET has no information for this request."
                : "O*NET is temporarily unavailable. Try again later.",
            response.status === 429 ? 429 : 503,
          );
        }
        if (!response.body) throw new Error("Empty response");
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > 1024 * 1024) throw new Error("Response too large");
          chunks.push(Buffer.from(chunk));
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          data.error
        )
          throw new Error("Invalid response");
        const value = { data, retrievedAt: new Date(this.now()).toISOString() };
        if (this.cache.size >= 400)
          this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { expires: this.now() + 86400000, value });
        return value;
      } catch (error) {
        if (error instanceof OnetError) throw error;
        throw new OnetError(
          "O*NET information could not be retrieved. Imported reference data remains available.",
        );
      }
    })();
    this.pending.set(key, operation);
    try {
      return structuredClone(await operation);
    } finally {
      this.pending.delete(key);
    }
  }
  async search(body) {
    if (!string(body?.query, 100) || body.query.trim().length < 2)
      throw new OnetError("Enter 2–100 characters to search occupations.", 400);
    const { data, retrievedAt } = await this.call("online/search", {
      keyword: body.query.trim(),
      start: 1,
      end: 10,
    });
    if (data.occupation !== undefined && !Array.isArray(data.occupation))
      throw new OnetError("O*NET returned an unexpected occupation list.");
    const occupations = (data.occupation || []).slice(0, 10).map((item) => {
      if (!item || !codePattern.test(item.code) || !string(item.title, 500))
        throw new OnetError("O*NET returned an unexpected occupation record.");
      return {
        code: item.code,
        title: item.title,
        url: `https://www.onetonline.org/link/summary/${item.code}`,
      };
    });
    return {
      occupations,
      limit: 10,
      retrievedAt,
      source: "O*NET Web Services",
      attributionUrl: "https://services.onetcenter.org/",
    };
  }
  async outlook(code) {
    if (!codePattern.test(code || ""))
      throw new OnetError("Choose a valid O*NET occupation code.", 400);
    const { data, retrievedAt } = await this.call(
      `mnm/careers/${code}/job_outlook`,
    );
    if (
      !string(data.outlook?.category, 100) ||
      !string(data.outlook?.description)
    )
      throw new OnetError("O*NET returned an unexpected outlook record.");
    const bright = data.bright_outlook || [];
    if (
      !Array.isArray(bright) ||
      bright.length > 20 ||
      bright.some(
        (item) => !item || !string(item.title, 500) || !string(item.code, 100),
      )
    )
      throw new OnetError("O*NET returned unexpected outlook criteria.");
    return {
      code,
      outlook: data.outlook,
      brightOutlook: bright.map((item) => ({
        code: item.code,
        title: item.title,
      })),
      region: "US",
      regionName: "United States",
      retrievedAt,
      source: "O*NET Web Services",
      attributionUrl: "https://services.onetcenter.org/",
      url: `https://www.mynextmove.org/profile/summary/${code}`,
    };
  }
}
