# Epic: Corporate-Ready ReqBin Connector Server

## Purpose

Build a production-quality local ReqBin connector agent for corporate environments.
The connector runs on the user's machine, accepts requests from the ReqBin web
client, sends HTTP(S) requests from the local network context, and returns
responses in the shape the ReqBin client can parse.

The current JavaScript prototype is not the target architecture. The new server
should be implemented in TypeScript with Fastify, generated OpenAPI
documentation, explicit security defaults, structured logs, correlation-id
tracking, and meaningful 100% test coverage for new behavior.

## Current Implementation Snapshot

This document is the implementation plan and acceptance baseline. As of the
current MVP implementation:

- the server is TypeScript + Fastify with route files split by endpoint;
- `@webquarx/design-patterns` is used for route registration and the `/v1/fetch`
  Chain of Responsibility;
- OpenAPI is generated from route schemas and exported to `docs/openapi.json`
  through `npm run openapi:export`;
- supported runtime endpoints are `GET /health`, `GET /version`,
  `GET /openapi.json`, `POST /v1/pair`, and `POST /v1/fetch`;
- legacy `POST /proxy` is intentionally not implemented;
- CLI flags include `--host`, `--port`, `--allow-origin`, `--dev`, `--no-auth`,
  `--request-timeout-ms`, `--request-body-limit-bytes`,
  `--response-body-limit-bytes`, `--max-redirects`, `--help`, and `--version`;
- pairing uses a terminal-displayed six-digit code, short expiration,
  attempt limiting, and memory-only tokens;
- request logs are written to stdout as JSON with `correlationId`, method, URL,
  status code, and elapsed time; target lifecycle, validation failure, and
  stripped-header warning logs are emitted without payloads or credentials;
- target request/response body limits default to `5MB`;
- the Fastify incoming envelope limit allows the JSON wrapper around the `5MB`
  target body while the target body limit remains enforced by the fetch command;
- target request timeout defaults to five minutes;
- metadata/link-local target blocks are implemented; general allow/deny lists
  remain out of scope for the MVP;
- redirects are followed manually up to `10`, each redirect records its own
  elapsed/timing object, and the final response reports total elapsed time.
- push/PR CI validates lint, typecheck, 100% coverage, build, and generated
  OpenAPI freshness.

Timing implementation note:

- the default transport uses Node `http`/`https` socket lifecycle events to
  collect DNS, TCP connect, TLS, sending, waiting, receiving, and total timing
  data where those events are emitted. Cached/reused socket phases or otherwise
  unavailable phases are returned as `0` rather than guessed.

## Product Context

The client currently has a Local Server submit route. The existing client code
uses:

- health check: `GET http://localhost:7070/health`
- current submit endpoint: `POST http://localhost:7070/proxy`
- health-check timeout in the client: `3000ms`
- developer command: `npx -y -p @reqbin/connector reqbin-agent`

The new connector will not preserve legacy `/proxy` behavior for the MVP. The
client will migrate to the stable versioned API separately.

## Target API

### `GET /health`

Purpose: lightweight process reachability check.

Response `200 application/json`:

```json
{
  "status": "up"
}
```

Requirements:

- must not require pairing token authentication;
- must pass CORS for allowed ReqBin origins;
- must respond quickly and avoid network or target checks;
- should include `correlation-id` response header when the request provides one
  or when the server generates one.

### `GET /version`

Purpose: expose connector and protocol versions for diagnostics.

Response `200 application/json`:

```json
{
  "name": "@reqbin/connector",
  "version": "x.y.z",
  "protocolVersion": "v1"
}
```

Requirements:

- must not expose filesystem paths, environment values, tokens, or local
  machine details;
- must not require pairing token authentication unless product/security later
  requires it;
- should read package version from a build-safe source.

### `POST /v1/fetch`

Purpose: perform one HTTP(S) request from the local machine and return a ReqBin
sender response.

Request:

- optional header: `correlation-id`. When absent, the connector generates one
  and returns it in the response;
- required auth header after pairing is enabled: `Authorization: Bearer <token>`;
- content type: `application/json`;
- body shape should support the current client `ApiRequest` envelope:

```json
{
  "json": "{\"method\":\"GET\",\"url\":\"https://example.com\",\"idnUrl\":\"https://example.com\",\"headers\":\"Accept: application/json\\n\",\"contentType\":\"NOBODY\",\"content\":\"\"}",
  "sessionId": "client-session-id",
  "deviceId": "client-device-id"
}
```

The decoded `json` payload is the request contract. Important fields:

- `method`: HTTP method, normalized to uppercase;
- `url` / `idnUrl`: target URL, with `idnUrl` preferred when present;
- `headers`: newline-separated header block from the ReqBin client;
- `contentType`: ReqBin content type marker, e.g. `NOBODY`, `JSON`, `XML`,
  `URLENCODED`, `CUSTOM`;
- `content`: request body payload from the client;
- `auth`: existing client-side auth metadata. The connector should not log it.

Response `200 application/json` for successful target transport, including
non-2xx upstream statuses:

```json
{
  "Success": true,
  "Version": "1.1",
  "StatusCode": 200,
  "StatusDescription": "OK",
  "Headers": "content-type: application/json\n",
  "Content": "{\"ok\":true}",
  "ContentRaw": "eyJvayI6dHJ1ZX0=",
  "ContentLength": 11,
  "ContentType": "application/json",
  "Elapsed": 42,
  "Timings": {
    "Connecting": 0,
    "DNS": 0,
    "Receiving": 0,
    "Sending": 0,
    "TLS": 0,
    "Total": 0.042,
    "Waiting": 0
  }
}
```

Response for connector-side validation or target transport failure should still
use a stable sender-response-like body where practical, with `Success: false`,
`StatusCode: 0`, `StatusDescription: "Error"` or a more specific description,
and a short `Content` error message. Do not include secrets or full target
payloads in error messages.

Binary handling:

- return `ContentRaw` as base64 when the target body is binary or not safely
  decodable as text;
- return `Content` as decoded text for text-like MIME types;
- compute `ContentLength` in bytes, not JavaScript string length.

`ContentRaw` is optional for text responses in the MVP because the client
already supports optional `ContentRaw`. Binary or not-safely-decodable responses
must include `ContentRaw`.

### `/proxy`

Legacy endpoint. Do not implement `/proxy` in the new connector MVP. If a later
client migration requires a compatibility window, add it as a separate approved
story with explicit tests and deprecation notes.

## Security Model

Default mode must be safe for corporate machines.

Required defaults:

- bind to `127.0.0.1` by default, not all interfaces;
- use CORS allowlist, never wildcard CORS in production/default mode;
- allow origins:
  - `https://beta.reqbin.com`;
  - `https://reqbin.com`;
  - local development origins only when explicitly enabled;
- require pairing/token auth for `POST /v1/fetch`;
- never log request bodies, response bodies, auth headers, cookies, bearer
  tokens, API keys, or subscription tokens;
- validate target scheme as `http:` or `https:` only;
- apply target host/IP policy before sending the request;
- reject metadata and link-local endpoints such as `169.254.169.254` and
  IPv6 `fe80::/10`;
- enforce request body limit, default `5MB`;
- enforce response body limit, default `5MB`;
- enforce target request timeout, default `300000ms` / five minutes;
- strip or block unsafe forwarded headers such as `host`, `content-length`,
  connection-hop headers, and connector auth headers.

Host/IP policy:

- the connector exists to reach local/private resources;
- allow/deny target lists are not part of the MVP;
- public, private, local, and corporate network targets are allowed by default
  as long as they use `http:` or `https:`;
- metadata and link-local endpoints are blocked by default as a built-in safety
  block, not as a general allow/deny-list feature;
- the safety block exists to prevent local proxy access to cloud instance
  metadata and other host-local infrastructure endpoints that are not normal
  API debugging targets.

Pairing model:

- pairing should use a short-lived six-digit code shown out-of-band by the
  local agent, for example in terminal startup output;
- the browser UI asks the user to enter that code and exchanges it for a bearer
  token;
- the connector must not expose an unauthenticated endpoint that returns the
  current pairing code, because that would let any allowed origin pair without
  user participation;
- pairing codes should expire quickly, for example after five minutes;
- pairing attempts should be rate-limited;
- paired tokens are stored in memory only for the MVP;
- in-memory token values should still be generated as high-entropy bearer
  tokens and must not be logged;
- persistent token storage and token hashing are later stories;
- users can revoke/reset memory-only pairing by restarting the connector for the
  MVP;
- `--no-auth` can exist only as an explicit development flag and must be visible
  in logs/startup output.

Suggested pairing endpoints:

- `POST /v1/pair`: accepts a user-entered code and returns a bearer token when
  the code is valid, unexpired, and attempt limits are not exceeded;
- `POST /v1/pair/reset`: authenticated or CLI-backed reset, not part of the
  first implementation unless explicitly planned.

Resolved MVP decisions:

- pairing code is shown in terminal output only;
- pairing token storage is memory-only;
- `/version` is public;
- browser-side token storage is handled by the client migration plan.

## CLI And Configuration

The npm binary remains:

```bash
reqbin-agent
```

Required CLI/config options:

- `--port <number>`: default `7070`;
- `--host <host>`: default `127.0.0.1`;
- `--allow-origin <origin>`: repeatable allowlist extension;
- `--dev`: allow local development origins and developer-friendly logs;
- `--no-auth`: disable pairing/token auth for local development only;
- `--request-timeout-ms <number>`: default `300000`;
- `--request-body-limit-bytes <number>`: default `5242880`;
- `--response-body-limit-bytes <number>`: default `5242880`;
- `--version`;
- `--help`.

Environment variables can mirror CLI options where useful, but CLI should be
explicit and testable. CLI parsing must reject invalid ports, invalid origins,
invalid byte limits, and unsafe combinations where practical.

## Logging And Correlation ID

All incoming requests must accept a `correlation-id` header.

Fastify should be configured with:

- `requestIdHeader: "correlation-id"`;
- `requestIdLogLabel: "correlationId"`;
- Pino JSON logging by default;
- redaction for authorization, cookies, tokens, and sensitive request fields.

Behavior:

- if `correlation-id` is present, use it as the Fastify request id;
- if absent, generate one and continue;
- include `correlation-id` in responses;
- pass the id through service commands and error mapping;
- log request start/finish, validation failures, target request start/finish,
  target status, elapsed time, and sanitized error class.

Logs are written to stdout as JSON. File logging is not part of the MVP.

Do not log:

- target request body;
- target response body;
- user auth values;
- `Authorization`, `Cookie`, `Set-Cookie`, `X-Token`, API keys, or passwords.

## Architecture

Use TypeScript and keep server construction separate from listener startup.

Suggested structure:

```txt
src/
  app.ts
  server.ts
  index.ts
  cli/
    parseCliArgs.ts
    runCli.ts
  config/
    ConnectorConfig.ts
    resolveConnectorConfig.ts
  http/
    createFastifyApp.ts
    registerCors.ts
    registerSwagger.ts
    routes/
      health.route.ts
      version.route.ts
      fetch.route.ts
  fetch/
    commands/
      FetchRequestCommand.ts
      ParseFetchPayloadCommand.ts
      ValidateTargetUrlCommand.ts
      BuildTargetFetchOptionsCommand.ts
      ExecuteTargetFetchCommand.ts
      MapTargetResponseCommand.ts
    types.ts
  security/
    originPolicy.ts
    tokenAuth.ts
    targetPolicy.ts
    headerPolicy.ts
  observability/
    correlationId.ts
    loggerRedaction.ts
  openapi/
    exportOpenApi.ts
```

Keep route handlers thin:

- read validated input;
- resolve command/config dependencies;
- execute command or chain;
- send result.

Use `@webquarx/design-patterns` intentionally:

- `Command` for cohesive operations with constructor-injected dependencies;
- `ChainOfResponsibility` for the `/v1/fetch` pipeline where each step has one
  reason to change;
- `Invoker` may be used when its command execution model fits, including its
  task-level `timeout`, `retries`, and concurrency limits;
- do not force `Invoker` into the target HTTP request path if it makes
  cancellation, streaming, or error mapping less explicit;
- target fetch timeout still needs `AbortController` or an equivalent transport
  cancellation mechanism even if `Invoker.limit({ timeout })` is used, because
  the underlying network operation must be aborted;
- response and request byte limits are transport/body-reading concerns, not
  `Invoker` concerns;
- retries must be opt-in and method-aware. Do not retry unsafe methods such as
  `POST`, `PUT`, `PATCH`, or `DELETE` by default;
- one top-level command/service class per file;
- avoid broad "manager" classes.

Suggested `/v1/fetch` chain:

1. parse `ApiRequest.json`;
2. validate method and target URL;
3. validate target policy;
4. sanitize/normalize outbound headers;
5. build outbound fetch options;
6. execute target request with timeout and byte limits;
7. follow redirects manually and record redirect hop metadata;
8. map target response to ReqBin sender response;
9. map known connector failures to stable error response.

Redirect handling:

- use manual redirect handling instead of relying on `fetch` with automatic
  redirect following when redirect metadata is required;
- send target requests with manual redirect behavior;
- for each `3xx` response with `Location`, record status code, headers,
  resolved redirect URL, and elapsed milliseconds for that hop;
- resolve relative `Location` values against the current URL;
- enforce a configurable maximum redirect count;
- preserve method/body semantics according to HTTP redirect behavior before
  implementation; this needs a focused test plan for 301, 302, 303, 307, and
  308;
- use browser-like redirect behavior;
- default maximum redirect count is `10`;
- map final response and redirect chain into `Redirects`, `RedirectsCount`,
  `RedirectsTime`, and `RedirectUrl`.

Timing model:

- `Elapsed` should represent total elapsed milliseconds for the full request,
  including redirects;
- each redirect entry should include its own elapsed milliseconds;
- `RedirectsTime` should be the sum of redirect hop elapsed values;
- `Timings.Total` should be reported in seconds for compatibility with the
  existing client parser;
- DNS, TCP connect, TLS, sending, waiting, and receiving timings cannot be
  measured accurately through standard Node `fetch` alone;
- detailed timings are a product requirement. The implementation should use the
  most capable practical Node transport layer, lower-level `http`/`https` hooks,
  or `undici` diagnostics when available, rather than defaulting to simple
  `fetch` if that would discard timing phases;
- timing fields that still cannot be measured accurately should be returned as
  `0` and documented as unavailable rather than guessed.

## OpenAPI Documentation

Use `@fastify/swagger` in dynamic mode with route schemas as the source of
truth. The generated OpenAPI JSON must be publishable as documentation.

Requirements:

- expose or export OpenAPI for `GET /health`, `GET /version`, `POST /v1/fetch`;
- document auth requirements for `/v1/fetch`;
- document `correlation-id` header;
- document allowed error response shape;
- include examples for health, version, successful fetch, validation failure,
  and target transport failure;
- add a script that writes the generated spec to a stable file, for example
  `docs/openapi.json` or `openapi/reqbin-connector-v1.json`;
- keep generated OpenAPI current on push through validation or CI;
- do not add Swagger UI for the MVP.

## TypeScript, Linting, Formatting, Tests

Use the client repo as the baseline:

- TypeScript strict enough to avoid silencing type errors;
- Vitest for unit/integration tests;
- V8 coverage provider;
- ESLint 9 style from the client repo where practical;
- npm remains the connector package manager. Yarn Classic conventions from the
  client can guide script names and validation expectations, but this repo
  should not migrate to Yarn for the MVP.

Required scripts after environment setup:

- `lint`;
- `typecheck`;
- `test`;
- `test:run`;
- `test:coverage`;
- `build`;
- OpenAPI export script.

Coverage:

- enforce 100% statements, branches, functions, and lines for new TypeScript
  source;
- do not write brittle tests that only mirror implementation details;
- test observable behavior, public contracts, security decisions, and error
  mapping.

Fastify testing:

- construct the app with `createFastifyApp(config)`;
- use `app.inject()` for route tests;
- avoid binding real ports in unit/integration tests unless a test explicitly
  validates listener startup.

## Epic Stories

### Story 1: Prepare TypeScript Fastify Project Baseline

As a maintainer, I want the connector repo to have a TypeScript/Fastify build
and validation baseline so every later server change is typed, linted, tested,
and covered.

Acceptance criteria:

- TypeScript config exists and typecheck script passes;
- Fastify app can be created without listening on a port;
- CLI startup remains separate from app construction;
- Vitest is configured;
- coverage thresholds are set to 100%;
- lint and formatting rules are aligned with the client repo where practical;
- no runtime behavior beyond a minimal app shell is implemented in this story.

Validation:

- `typecheck`;
- `lint`;
- `test:coverage`;
- `build`.

### Story 2: Add Health And Version Endpoints

As the ReqBin client, I want `/health` and `/version` so I can detect the local
connector and show diagnostics.

Acceptance criteria:

- `GET /health` returns `{ "status": "up" }`;
- `GET /version` returns package name, package version, and protocol version;
- both endpoints include/propagate `correlation-id`;
- both endpoints have Fastify schemas and generated OpenAPI entries;
- tests cover status, body, headers, CORS behavior, and OpenAPI presence.

Validation:

- focused route tests;
- OpenAPI generation test or snapshot;
- `test:coverage`.

### Story 3: Implement CORS Origin Policy

As a corporate security owner, I want the connector to accept browser requests
only from approved ReqBin origins so arbitrary websites cannot use the local
agent as a network bridge.

Acceptance criteria:

- wildcard CORS is not used by default;
- default allowed origins include `https://beta.reqbin.com` and
  `https://reqbin.com`;
- local development origins are allowed only in dev mode or explicit config;
- `--allow-origin` extends the allowlist;
- preflight requests return expected CORS headers only for allowed origins;
- denied origins do not receive permissive CORS headers;
- tests cover allowed, denied, absent, and dev origins.

Validation:

- focused CORS policy unit tests;
- Fastify inject preflight tests;
- `test:coverage`.

### Story 4: Add Correlation ID And Structured Logging

As an operator, I want every request to carry a correlation id through logs and
responses so support can trace what happened without logging sensitive data.

Acceptance criteria:

- Fastify uses `correlation-id` as request id header;
- logs use `correlationId` field;
- responses include `correlation-id`;
- missing `correlation-id` is generated by the server and returned in the
  response;
- logger redaction covers auth/cookie/token fields;
- tests verify request id propagation and missing-id generation.

Validation:

- logger/config unit tests;
- route tests for header behavior;
- `test:coverage`.

### Story 5: Add Token Auth And Pairing Flow

As a corporate user, I want the connector to require an explicit paired client
token so a random browser page cannot submit requests through the local agent.

Acceptance criteria:

- connector generates a short-lived six-digit pairing code;
- pairing code is shown out-of-band by the local agent, not fetched
  automatically by the browser UI;
- `POST /v1/pair` exchanges a valid pairing code for a bearer token;
- invalid, expired, and over-attempt pairing codes fail safely;
- `/v1/fetch` requires `Authorization: Bearer <token>` by default;
- invalid/missing tokens fail before target network access;
- `--no-auth` disables auth only when explicitly configured;
- startup logs clearly indicate auth-disabled mode;
- token validation is isolated behind an interface for future persistent pairing;
- token storage is memory-only for the MVP;
- persistent token storage and token hashing are later stories;
- no token values are logged;
- tests cover valid pairing, invalid code, expired code, attempt limit, valid
  token, invalid token, missing token, and no-auth mode.

Validation:

- auth policy unit tests;
- pairing route tests;
- `/v1/fetch` auth route tests proving failed auth does not call target fetch;
- `test:coverage`.

### Story 6: Implement Stable `/v1/fetch` Request Parsing

As the ReqBin client, I want to send the existing `ApiRequest` envelope to the
connector so the server can decode and validate the target request safely.

Acceptance criteria:

- endpoint accepts `{ json: string }` envelope;
- decoded payload supports `content`, not legacy-only `body`;
- malformed outer JSON and malformed inner JSON return stable validation
  failures;
- method is validated;
- target URL is selected from `idnUrl` then `url`;
- request body is included only when method and content type permit it;
- tests cover valid payload, missing URL, malformed JSON, invalid method,
  unsupported scheme, and `content` handling.

Validation:

- parser command tests;
- route validation tests;
- `test:coverage`.

### Story 7: Implement Target URL And Header Security Policy

As a corporate security owner, I want target URLs and outbound headers validated
before the connector sends anything to protect the local machine and network.

Acceptance criteria:

- only `http:` and `https:` targets are allowed;
- public, private, local, and corporate network targets are allowed by default;
- metadata and link-local endpoint safety block is explicit and tested;
- unsafe headers are blocked or stripped;
- connector auth/correlation headers are not forwarded to the target unless
  explicitly allowed by policy;
- rejected requests return stable error response without target network access;
- tests cover blocked schemes, blocked hosts, allowed hosts, blocked headers,
  and case-insensitive header handling.

Validation:

- target policy unit tests;
- header policy unit tests;
- `/v1/fetch` tests proving blocked requests do not call fetch;
- `test:coverage`.

### Story 8: Execute Target Fetch With Timeout And Limits

As a user, I want the connector to send the HTTP request from my machine while
still enforcing timeout and size limits.

Acceptance criteria:

- target fetch uses configured timeout, default `300000ms`;
- transport timeout aborts the underlying network operation;
- `Invoker.limit({ timeout })` may wrap command execution only if it does not
  replace explicit transport cancellation;
- request body limit is enforced before target fetch, default `5MB`;
- response body limit is enforced while reading the response, default `5MB`;
- timeout maps to a stable connector error response;
- DNS/network/fetch failures map to stable connector error response;
- retries are disabled by default and must not happen for unsafe methods unless
  a later story explicitly enables method-aware retry policy;
- tests cover success, timeout, network failure, oversized request body, and
  oversized response body.

Validation:

- command tests with mocked fetch;
- route tests for mapped errors;
- `test:coverage`.

### Story 9: Follow Redirects And Record Timings

As the ReqBin client, I want redirect chains represented explicitly so response
history can show where the local request went and how long redirects took.

Acceptance criteria:

- target fetch follows redirects manually up to a configured maximum;
- default maximum redirect count is `10`;
- redirect entries include status code, redirect URL, headers, and per-hop
  elapsed milliseconds;
- relative `Location` headers are resolved against the current URL;
- browser-like redirect method/body behavior is covered for 301, 302, 303, 307,
  and 308;
- redirect loops and max-redirect overflow map to stable connector errors;
- `Redirects`, `RedirectsCount`, `RedirectsTime`, and `RedirectUrl` are
  populated consistently;
- `Elapsed` includes the whole redirect chain;
- `Timings.Total` is populated in seconds;
- detailed timing fields use the maximum practical fidelity available from the
  selected transport layer;
- unsupported detailed timing fields are returned as `0` and documented.

Validation:

- redirect service tests;
- `/v1/fetch` integration tests with mocked redirect responses;
- `test:coverage`.

### Story 10: Map Target Response To ReqBin Sender Response

As the ReqBin client, I want connector responses to parse through the existing
response pipeline so history, body display, headers, and status behavior remain
consistent.

Acceptance criteria:

- response body includes required sender response fields;
- `ContentLength` is byte length;
- text responses populate `Content`;
- binary responses populate `ContentRaw` base64;
- headers are serialized in the existing header-block format;
- non-2xx target statuses return HTTP 200 from connector with
  `Success: false` or status-derived success according to the agreed sender
  contract;
- tests cover text, JSON, empty body, binary, non-2xx, missing content type, and
  header serialization.

Validation:

- mapper unit tests;
- `/v1/fetch` integration tests;
- optional compatibility test using a client-like parser fixture;
- `test:coverage`.

### Story 11: Generate And Publish OpenAPI

As maintainers and client developers, we want a generated OpenAPI document so
the connector contract can be published and reviewed.

Acceptance criteria:

- route schemas generate OpenAPI through `@fastify/swagger`;
- export script writes a deterministic OpenAPI JSON file;
- generated spec includes endpoints, headers, auth, request body, responses,
  and examples;
- CI/validation can verify the spec generation path;
- README points users to the generated spec.

Validation:

- OpenAPI export test or deterministic generation check;
- `build`;
- `test:coverage`.

### Story 12: Harden CLI Startup

As a user, I want a predictable CLI with safe defaults and clear errors so I can
run the connector locally without accidentally exposing it.

Acceptance criteria:

- `reqbin-agent` starts the TypeScript-built server;
- default host is `127.0.0.1`;
- default port is `7070`;
- CLI validates host, port, origins, timeout, and limit values;
- `SIGINT` and `SIGTERM` shut down cleanly;
- startup output includes listening URL, auth mode, allowed origins, and docs
  path/spec export hint;
- tests cover CLI parsing and config resolution.

Validation:

- CLI parser tests;
- startup unit tests where practical;
- manual smoke command after implementation;
- `test:coverage`.

### Story 13: Update README And Operational Docs

As a corporate developer or admin, I want clear docs for installing, running,
pairing, configuring CORS/auth, and troubleshooting the connector.

Acceptance criteria:

- README explains default safe mode;
- README includes install and run commands;
- README documents endpoints;
- README documents CLI flags and env variables;
- README explains correlation id and log safety;
- README explains dev-only `--no-auth`;
- README links to OpenAPI output;
- docs do not include real tokens or secrets.

Validation:

- documentation review;
- no source validation required for docs-only changes unless docs tooling is
  introduced.

## Environment Preparation Plan

Before implementing stories, prepare the repository in small commit-sized steps.
Do not implement the full server and split commits after the fact. Each step
needs an approved intent, focused tests where practical, implementation,
targeted validation, self-review, and one small semantic commit before moving
to the next step.

Commit discipline:

- start each implementation step with a one-sentence intent;
- identify expected files and validation before editing;
- prefer tests first when behavior is clear;
- do not mix dependency setup, refactors, endpoint behavior, security policy,
  docs, and OpenAPI output in one commit unless inseparable;
- if implementation would duplicate non-trivial logic, stop and inspect whether
  a refactor-first step is needed;
- refactor-first steps must preserve behavior and have their own tests and
  commit;
- after each commit, review that commit's diff for correctness, security,
  missing tests, and documentation impact;
- do not proceed to the next story while Blocking, High, or Medium review
  findings remain unresolved or explicitly deferred.

### Step 1: Add npm Dependency Baseline

Goal: keep npm as the connector package manager and add the initial approved
dependency baseline intentionally.

Decision inputs:

- current connector package has no lockfile and no dependencies;
- client repo uses Yarn Classic, but the connector will stay npm-based for the
  MVP;
- npm package publishing already exists in GitHub Actions;
- dependency changes affect install, CI, and publish workflow.

Output:

- npm lockfile is generated intentionally;
- initial dependencies are added:
  - `fastify`;
  - `@fastify/swagger`;
  - optional `@fastify/cors` if CORS is not implemented directly;
  - `typescript`;
  - `vitest`;
  - V8 coverage package if needed by the selected Vitest version;
  - `eslint` and matching TypeScript ESLint packages;
  - `@types/node`;
  - `@webquarx/design-patterns`.

Validation:

- dependency install succeeds;
- `npm test` still runs;
- lockfile is generated intentionally.

### Step 2: Add TypeScript Build Baseline

Goal: create the minimum TypeScript source/build setup without implementing
feature behavior.

Expected files:

- `tsconfig.json`;
- `src/**/*.ts` entry points;
- package scripts for `build` and `typecheck`;
- package `exports`/`bin` updated for built output.

Validation:

- `typecheck`;
- `build`.

### Step 3: Add Test And Coverage Baseline

Goal: make Vitest the default test runner and enforce 100% coverage for new
TypeScript source.

Expected files:

- `vitest.config.ts`;
- test setup if needed;
- one minimal app construction test.

Validation:

- `test:coverage`.

### Step 4: Add Lint And Formatting Baseline

Goal: align lint/format conventions with the client repo where practical.

Expected files:

- ESLint config;
- ignore patterns for `dist`, `coverage`, generated OpenAPI if needed;
- scripts for `lint` and optional `lint:fix`.

Validation:

- `lint`;
- `typecheck`.

### Step 5: Add Fastify App Factory Skeleton

Goal: establish the route-registration shape, config object, logger config, and
testable app factory before adding endpoint behavior.

Expected files:

- `createFastifyApp`;
- connector config types;
- empty or minimal route registration;
- app lifecycle tests using `app.inject()`.

Validation:

- focused app factory tests;
- `test:coverage`;
- `typecheck`;
- `lint`.

### Step 6: Add OpenAPI Generation Skeleton

Goal: prove that Fastify route schemas can produce a deterministic OpenAPI
document.

Expected files:

- swagger registration module;
- OpenAPI export script;
- placeholder spec output decision documented.

Validation:

- OpenAPI export command;
- OpenAPI-focused test;
- `test:coverage`.

### Step 7: Review Environment Baseline Before Feature Work

Goal: verify the repo is ready for story implementation.

Checklist:

- dependency policy approved;
- TypeScript builds;
- lint passes;
- tests and coverage pass;
- CLI entry strategy is clear;
- OpenAPI generation path is clear;
- no unrelated generated files are committed;
- implementation stories can start one at a time.
