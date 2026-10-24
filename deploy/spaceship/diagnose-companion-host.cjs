var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/diagnose-companion-host.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_https2 = __toESM(require("node:https"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);

// supabase/companionProvider.ts
var COMPANION_PROVIDER_HEADERS = Object.freeze({
  Accept: "application/json",
  "User-Agent": "PineVela-Companion/1.0"
});
var providerCodes = /* @__PURE__ */ new Set([
  "invalid_api_key",
  "model_not_found",
  "model_decommissioned",
  "permission_denied",
  "model_permission_blocked_org",
  "model_permission_blocked_project",
  "unsupported_country_region_territory",
  "tool_use_failed"
]);
var edgeCodes = /* @__PURE__ */ new Set([1005, 1006, 1007, 1008, 1009, 1010, 1013, 1020]);
var providerTypes = /* @__PURE__ */ new Set(["invalid_request_error", "permissions_error", "permission_error", "authentication_error"]);
var rejectionReasons = /* @__PURE__ */ new Map([
  ["forbidden", "forbidden"],
  ["access denied. please check your network settings.", "network_access_denied"]
]);
function companionProviderDiagnostic(status, contentType, body) {
  const httpStatus = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
  const format = typeof contentType === "string" && /^application\/json(?:;|$)/i.test(contentType) ? "json" : typeof contentType === "string" && /^text\/html(?:;|$)/i.test(contentType) ? "html" : "other";
  let providerCode, providerType, reason, edgeCode;
  if (body.length <= 65536) {
    const text = body.toString("utf8");
    if (format === "json") {
      try {
        const error = JSON.parse(text)?.error;
        const code = error?.code;
        if (typeof code === "string" && providerCodes.has(code)) providerCode = code;
        if (typeof error?.type === "string" && providerTypes.has(error.type)) providerType = error.type;
        if (httpStatus === 403 && typeof error?.message === "string" && error.message.length <= 100)
          reason = rejectionReasons.get(error.message.trim().toLowerCase());
      } catch {
      }
    } else if (httpStatus === 403) {
      const code = Number(text.match(/\berror(?:\s+code)?\s*:\s*(\d{4})\b/i)?.[1]);
      if (edgeCodes.has(code)) edgeCode = code;
    }
  }
  return {
    httpStatus,
    format,
    ...providerCode ? { providerCode } : {},
    ...providerType ? { providerType } : {},
    ...reason ? { reason } : {},
    ...edgeCode ? { edgeCode } : {}
  };
}

// supabase/companionConnection.ts
var import_promises = require("node:dns/promises");
var import_node_net = require("node:net");
var import_node_https = __toESM(require("node:https"), 1);

// resourceSecurity.ts
var import_node_async_hooks = require("node:async_hooks");
var ResourceLimitError = class extends Error {
  constructor(status = 429, retryAfter = 60, message = "Too many requests. Please wait before trying again.") {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
};
var WorkPool = class {
  constructor(maximum, waiting) {
    this.maximum = maximum;
    this.waiting = waiting;
    this.active = 0;
    this.queue = [];
  }
  async run(work) {
    if (this.active >= this.maximum) {
      if (this.queue.length >= this.waiting) throw new ResourceLimitError(503, 2, "Server processing is busy. Please try again shortly.");
      await new Promise((resolve) => this.queue.push(resolve));
    } else this.active++;
    try {
      return await work();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
};
var workContext = new import_node_async_hooks.AsyncLocalStorage();

// accountSecurity.ts
var SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
var passwordWorkers = new WorkPool(2, 8);

// paystackProvider.ts
var requests = new WorkPool(6, 24);

// supabase/db.ts
var import_pg = require("pg");

// supabase/companionConnection.ts
var resolver = new import_promises.Resolver({ timeout: 700, tries: 1 });
var cached = [];
var expires = 0;
var resolving;
async function addresses() {
  if (cached.length && expires > Date.now()) return cached;
  if (!resolving) resolving = resolveAddresses().then((records) => {
    const valid = records.filter((r) => (0, import_node_net.isIPv4)(r.address)).slice(0, 4);
    if (!valid.length) throw Object.assign(new Error("Provider DNS unavailable"), { code: "ENOTFOUND" });
    cached = valid;
    expires = Date.now() + Math.max(0, Math.min(60, ...valid.map((r) => r.ttl))) * 1e3;
    return valid;
  }).finally(() => {
    resolving = void 0;
  });
  return resolving;
}
async function resolveAddresses() {
  let timer;
  try {
    return await Promise.race([
      resolver.resolve4("api.groq.com", { ttl: true }).catch(async () => {
        const records = await (0, import_promises.lookup)("api.groq.com", { family: 4, all: true });
        return records.map((r) => ({ address: r.address, ttl: 5 }));
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Provider DNS timed out"), { code: "ETIMEOUT" })), 6e3);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
var companionAddressLookup = (hostname, options, callback) => {
  if (hostname !== "api.groq.com") {
    callback(Object.assign(new Error("Unsupported provider host"), { code: "ENOTFOUND" }), "", 4);
    return;
  }
  void addresses().then((records) => {
    if (options.all) callback(null, records.map((r) => ({ address: r.address, family: 4 })));
    else callback(null, records[0].address, 4);
  }, (error) => callback(error, "", 4));
};
var companionAgent = new import_node_https.default.Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2, lookup: companionAddressLookup });

// scripts/diagnose-companion-host.ts
async function check(authenticated, key) {
  return new Promise((resolve) => {
    const started = Date.now();
    const request = import_node_https2.default.get({
      hostname: "api.groq.com",
      path: "/openai/v1/models",
      agent: companionAgent,
      headers: { ...COMPANION_PROVIDER_HEADERS, ...authenticated ? { Authorization: `Bearer ${key}` } : {} },
      signal: AbortSignal.timeout(1e4)
    }, (response) => {
      let bytes = 0;
      const chunks = [];
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 65536) response.destroy();
        else chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        const result = { ...companionProviderDiagnostic(response.statusCode, response.headers["content-type"], body), elapsedMs: Date.now() - started };
        if (response.statusCode === 200) {
          try {
            result.modelAvailable = JSON.parse(body.toString("utf8"))?.data?.some((model) => model?.id === "openai/gpt-oss-20b") === true;
          } catch {
            result.modelAvailable = false;
          }
        }
        resolve(result);
      });
      response.on("error", () => resolve({ failure: "response_interrupted" }));
      response.on("aborted", () => resolve({ failure: bytes > 65536 ? "response_too_large" : "response_interrupted" }));
    });
    request.on("error", (error) => {
      const code = error.code || "";
      const allowed = ["EAI_AGAIN", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ABORT_ERR"];
      resolve({ failure: allowed.includes(code) ? code : "connection_failed", elapsedMs: Date.now() - started });
    });
  });
}
async function main() {
  try {
    let saved = {};
    try {
      saved = import_dotenv.default.parse(import_node_fs.default.readFileSync(".env"));
    } catch {
    }
    const key = process.env.GROQ_API_KEY || saved.GROQ_API_KEY;
    if (!key || !/^[A-Za-z0-9_-]{16,1000}$/.test(key)) throw new Error("configuration_unavailable");
    const unauthenticated = await check(false, key);
    const authenticated = await check(true, key);
    const conclusion = unauthenticated.httpStatus === 403 && authenticated.httpStatus === 403 ? "both_requests_forbidden" : authenticated.httpStatus === 200 ? "model_catalog_accessible" : authenticated.httpStatus === 401 ? "configured_key_rejected" : authenticated.httpStatus === 403 ? "authenticated_request_forbidden" : "connection_not_established";
    console.log(JSON.stringify({ diagnosticVersion: 3, unauthenticated, authenticated, conclusion }));
  } catch {
    console.log(JSON.stringify({ diagnosticVersion: 3, failure: "configuration_unavailable", instruction: "Run from the PineVela application directory with its existing private environment." }));
    process.exitCode = 1;
  } finally {
    companionAgent.destroy();
  }
}
void main();
