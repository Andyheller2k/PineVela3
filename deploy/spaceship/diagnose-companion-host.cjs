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
var import_node_path = __toESM(require("node:path"), 1);
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

// scripts/companionHostDiagnostic.ts
var import_node_net2 = require("node:net");
function hostDiagnosticPlan(args) {
  if (args.length === 0) return ["public_models", "authenticated_models"];
  if (args.length === 1 && args[0] === "--network-identity")
    return ["public_models", "authenticated_models", "network_identity"];
  throw new Error("invalid_options");
}
function hostDiagnosticRequest(kind, key) {
  if (!["public_models", "authenticated_models", "network_identity"].includes(kind)) throw new Error("invalid_request");
  const identity = kind === "network_identity";
  const options = {
    protocol: "https:",
    hostname: identity ? "api.ipify.org" : "api.groq.com",
    path: identity ? "/" : "/openai/v1/models",
    method: "GET",
    headers: {
      ...COMPANION_PROVIDER_HEADERS,
      Accept: identity ? "text/plain" : "application/json",
      ...kind === "authenticated_models" ? { Authorization: `Bearer ${key}` } : {}
    },
    ...identity ? { agent: false, family: 4 } : {}
  };
  return { options, deadlineMs: identity ? 6e3 : 1e4, bodyLimit: identity ? 128 : 65536 };
}
function hostDiagnosticKey(environment, file) {
  const hasEnvironmentKey = Object.hasOwn(environment, "GROQ_API_KEY");
  const hasFileKey = Object.hasOwn(file, "GROQ_API_KEY");
  const key = hasEnvironmentKey ? environment.GROQ_API_KEY : file.GROQ_API_KEY;
  return {
    key,
    metadata: {
      keySource: hasEnvironmentKey ? "process_environment" : hasFileKey ? ".env" : "missing",
      keyConfigured: typeof key === "string" && /^[A-Za-z0-9_-]{16,1000}$/.test(key),
      environmentOverridesDifferentFileKey: Boolean(environment.GROQ_API_KEY && file.GROQ_API_KEY && environment.GROQ_API_KEY !== file.GROQ_API_KEY)
    }
  };
}
function hostDiagnosticRay(value) {
  return typeof value === "string" && /^[a-f0-9]{16}(?:-[A-Z]{3})?$/.test(value) ? value : void 0;
}
function hostDiagnosticTransport(socket, ray) {
  const connection = socket;
  const family = connection?.remoteFamily;
  const cfRay = hostDiagnosticRay(ray);
  return {
    tlsAuthorized: connection?.authorized === true,
    ...family === "IPv4" || family === "IPv6" ? { addressFamily: family } : {},
    ...cfRay ? { cfRay } : {}
  };
}
function hostDiagnosticPublicIPv4(value) {
  if (typeof value !== "string" || (0, import_node_net2.isIP)(value) !== 4) return void 0;
  const [a, b, c] = value.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113) return void 0;
  return value;
}
function hostDiagnosticIdentity(status, body) {
  const httpStatus = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
  const publicIPv4 = httpStatus === 200 && body.length <= 128 ? hostDiagnosticPublicIPv4(body.toString("utf8").trim()) : void 0;
  return {
    httpStatus,
    ...publicIPv4 ? { publicIPv4 } : { failure: "network_identity_unavailable" },
    scope: "Observed by api.ipify.org; destination-dependent NAT may differ for Groq. No ASN or country is inferred."
  };
}

// scripts/diagnose-companion-host.ts
async function check(kind, key) {
  return new Promise((resolve) => {
    const started = Date.now();
    const { options, deadlineMs, bodyLimit } = hostDiagnosticRequest(kind, key);
    const request = import_node_https2.default.get({
      ...options,
      ...kind !== "network_identity" ? { agent: companionAgent } : {},
      signal: AbortSignal.timeout(deadlineMs)
    }, (response) => {
      let bytes = 0;
      const chunks = [];
      const transport = hostDiagnosticTransport(response.socket, response.headers["cf-ray"]);
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > bodyLimit) response.destroy();
        else chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        const result = {
          ...kind === "network_identity" ? hostDiagnosticIdentity(response.statusCode, body) : companionProviderDiagnostic(response.statusCode, response.headers["content-type"], body),
          ...transport,
          elapsedMs: Date.now() - started
        };
        if (kind !== "network_identity" && response.statusCode === 200) {
          try {
            result.modelAvailable = JSON.parse(body.toString("utf8"))?.data?.some((model) => model?.id === "openai/gpt-oss-20b") === true;
          } catch {
            result.modelAvailable = false;
          }
        }
        resolve(result);
      });
      const interrupted = () => resolve({
        ...transport,
        failure: bytes > bodyLimit ? "response_too_large" : "response_interrupted",
        elapsedMs: Date.now() - started
      });
      response.on("error", interrupted);
      response.on("aborted", interrupted);
    });
    request.on("error", (error) => {
      const code = error.code || "";
      const allowed = [
        "EAI_AGAIN",
        "ENOTFOUND",
        "ETIMEOUT",
        "ETIMEDOUT",
        "ECONNRESET",
        "ECONNREFUSED",
        "ENETUNREACH",
        "EHOSTUNREACH",
        "ABORT_ERR",
        "ERR_TLS_CERT_ALTNAME_INVALID",
        "CERT_HAS_EXPIRED",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
      ];
      resolve({ failure: allowed.includes(code) ? code : "connection_failed", elapsedMs: Date.now() - started });
    });
  });
}
function backendDiagnostic() {
  const bundle = import_node_path.default.resolve("dist-supabase-backend/supabase-server.mjs");
  let fd;
  try {
    fd = import_node_fs.default.openSync(bundle, import_node_fs.default.constants.O_RDONLY | import_node_fs.default.constants.O_NOFOLLOW | import_node_fs.default.constants.O_NONBLOCK);
    const stat = import_node_fs.default.fstatSync(fd);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) return { bundlePresent: true, inspected: false };
    const text = import_node_fs.default.readFileSync(fd, "utf8");
    return {
      bundlePresent: true,
      inspected: true,
      applicationHeadersCurrent: text.includes("PineVela-Companion/1.0"),
      rejectionReasonsCurrent: text.includes("network_access_denied")
    };
  } catch {
    return { bundlePresent: import_node_fs.default.existsSync(bundle), inspected: false };
  } finally {
    if (fd !== void 0) import_node_fs.default.closeSync(fd);
  }
}
async function main() {
  const base = { diagnosticVersion: 4, checkedAtUtc: (/* @__PURE__ */ new Date()).toISOString(), node: process.versions.node };
  let configuration;
  let stage = "options";
  try {
    const plan = hostDiagnosticPlan(process.argv.slice(2));
    stage = "configuration";
    let saved = {};
    let environmentFile = "missing_or_unreadable";
    try {
      saved = import_dotenv.default.parse(import_node_fs.default.readFileSync(".env"));
      environmentFile = "readable";
    } catch {
    }
    const configured = hostDiagnosticKey(process.env, saved);
    configuration = {
      ...configured.metadata,
      environmentFile,
      applicationRootDetected: import_node_fs.default.existsSync("app.cjs") && import_node_fs.default.existsSync("dist-supabase-backend/supabase-server.mjs")
    };
    if (!configured.metadata.keyConfigured || !configured.key) throw new Error("configuration_unavailable");
    const backend = backendDiagnostic();
    stage = "requests";
    const unauthenticated = await check(plan[0], configured.key);
    const authenticated = await check(plan[1], configured.key);
    const networkIdentity = plan.includes("network_identity") ? await check("network_identity", configured.key) : void 0;
    const conclusion = unauthenticated.httpStatus === 403 && authenticated.httpStatus === 403 ? "both_requests_forbidden" : authenticated.httpStatus === 200 ? "model_catalog_accessible" : authenticated.httpStatus === 401 ? "configured_key_rejected" : authenticated.httpStatus === 403 ? "authenticated_request_forbidden" : "connection_not_established";
    console.log(JSON.stringify({
      ...base,
      configuration,
      backend,
      unauthenticated,
      authenticated,
      ...networkIdentity ? { networkIdentity } : {},
      conclusion
    }));
  } catch {
    console.log(JSON.stringify({
      ...base,
      ...configuration ? { configuration } : {},
      failure: stage === "options" ? "invalid_options" : stage === "configuration" ? "configuration_unavailable" : "diagnostic_unavailable",
      instruction: "Run from the PineVela application directory with its existing private environment. Optional flag: --network-identity."
    }));
    process.exitCode = 1;
  } finally {
    companionAgent.destroy();
  }
}
void main();
