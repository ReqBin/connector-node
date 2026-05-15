# @reqbin/connector

Local Node.js agent that lets the ReqBin browser client submit HTTP(S) requests from the user's local network context.

## Install

```bash
npm i -g @reqbin/connector
```

Development from this repo:

```bash
npm install
npm run build
npm start
```

## Run

```bash
reqbin-agent
```

Safe defaults:

- listens on `127.0.0.1:7070`;
- allows CORS only for `https://reqbin.com` and `https://beta.reqbin.com`;
- requires terminal-code pairing before `POST /v1/fetch`;
- stores paired bearer tokens in memory only;
- blocks metadata and link-local targets such as `169.254.169.254` and IPv6 `fe80::/10`;
- writes JSON logs to stdout without request bodies, response bodies, tokens, cookies, or auth headers.

Startup output includes endpoint URLs and, when auth is enabled, a short-lived six-digit pairing code:

```json
{
  "event": "reqbin.connector.started",
  "authDisabled": false,
  "host": "127.0.0.1",
  "healthUrl": "http://localhost:7070/health",
  "versionUrl": "http://localhost:7070/version",
  "fetchUrl": "http://localhost:7070/v1/fetch",
  "openApiUrl": "http://localhost:7070/openapi.json",
  "pairingCode": "123456",
  "pairingExpiresAt": "2026-05-14T22:00:00.000Z"
}
```

## CLI

```bash
reqbin-agent --port 7070
```

Options:

- `--port <number>` / `-p <number>`: listen port. Defaults to `7070` or `PORT`.
- `--host <host>`: listen host. Defaults to `127.0.0.1`.
- `--allow-origin <origin>`: extend the CORS allowlist. Repeatable.
- `--dev`: allow local development browser origins.
- `--no-auth`: disable pairing/token auth for local development only.
- `--request-timeout-ms <number>`: target request timeout. Default `300000`.
- `--request-body-limit-bytes <number>`: target request body limit. Default `5242880`.
- `--response-body-limit-bytes <number>`: target response body limit. Default `5242880`.
- `--max-redirects <number>`: redirect limit. Default `10`.
- `--help`, `--version`.

## Endpoints

- `GET /health`: public reachability check. Returns `{ "status": "up" }`.
- `GET /version`: public connector metadata.
- `GET /openapi.json`: generated OpenAPI document.
- `POST /v1/pair`: exchanges the terminal pairing code for a bearer token.
- `POST /v1/fetch`: authenticated ReqBin request execution endpoint.

The legacy `POST /proxy` endpoint is not implemented.

`POST /v1/fetch` accepts the ReqBin request envelope:

```json
{
  "json": "{\"method\":\"GET\",\"url\":\"https://example.com\",\"headers\":\"Accept: application/json\\n\",\"contentType\":\"NOBODY\",\"content\":\"\"}",
  "sessionId": "optional-client-session",
  "deviceId": "optional-client-device"
}
```

## Correlation ID And Logs

All routes accept `correlation-id`. If it is missing, the server generates one and returns it in the response header.

Each request logs start/finish JSON events to stdout with `correlationId`, method, sanitized path, `hasQuery`, status code, and elapsed time. The fetch pipeline also logs target request start/finish/failure, validation failures, and stripped forwarded-header warnings. Payloads, query values, and credentials are intentionally not logged.

## Redirects And Timings

Target redirects are followed manually with browser-like method/body behavior and a default limit of `10`. Each redirect entry includes its own elapsed time and timing object.

Timing fields are returned in the existing ReqBin sender response shape. The default Node transport records DNS, TCP connect, TLS, sending, waiting, receiving, and total timings where the Node socket lifecycle exposes those phases. Cached/reused socket phases that are not emitted by Node are returned as `0` rather than guessed.

The exact `/v1/fetch` response contract is documented in [docs/fetch-sender-response-contract.md](docs/fetch-sender-response-contract.md).

## OpenAPI

The generated spec is available at runtime:

```text
http://localhost:7070/openapi.json
```

Regenerate the checked-in spec:

```bash
npm run openapi:export
```

The generated file is [docs/openapi.json](docs/openapi.json).

## Validation

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run openapi:check
```
