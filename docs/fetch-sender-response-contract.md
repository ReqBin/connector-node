# Fetch Sender Response Contract

`POST /v1/fetch` returns the ReqBin sender response shape used by the browser
client and ReqBin server. Connector-side validation and target transport
failures still return HTTP `200` with `Success: false` where the request reached
the connector and could be represented as a sender response.

## Top-Level Fields

| Field | Type | Semantics |
| --- | --- | --- |
| `Success` | boolean | `true` when the connector completed the target request, even for non-2xx target statuses. |
| `Version` | string | Sender response protocol version. Currently `"1.1"`. |
| `StatusCode` | string | Final target status code as text, for example `"200"` or `"412"`. Connector-side failures use `"0"`. |
| `StatusDescription` | string | Final target reason phrase or Node standard phrase. Connector-side failures use `"Error"` unless a more specific description is available. |
| `Headers` | string | Final target response headers as a CRLF-delimited block. Raw target header casing, order, and duplicates are preserved when the Node transport exposes them. |
| `Content` | string | Decoded body for text-like MIME types. Empty for binary or non-text bodies. |
| `ContentRaw` | string | Base64-encoded response body. |
| `ContentLength` | number | Final target response body byte length. |
| `ContentType` | string | Final target `content-type` header value, or empty string. |
| `Elapsed` | number | Final hop elapsed milliseconds from issuing the final target request to finishing the final body read. Redirect time is excluded. |
| `Timings` | object | Final hop timing fields in seconds. |
| `RedirectUrl` | string | Kept for ReqBin compatibility. The connector returns an empty string. |
| `Redirects` | array | Redirect history entries in request order. |
| `RedirectsCount` | number | Number of redirect entries. |
| `RedirectsTime` | number | Sum of redirect entry `elapsed` values in milliseconds. |

## Redirect Entries

Each redirect entry describes the request that received the redirect response,
not the destination request that followed it.

| Field | Type | Semantics |
| --- | --- | --- |
| `elapsed` | number | Per-hop elapsed milliseconds from sending that request to receiving the redirect response headers. |
| `headers` | string | Redirect response headers as a CRLF-delimited block. Raw target header casing, order, and duplicates are preserved when available. |
| `method` | string | HTTP method used for that redirect-producing request. |
| `redirect_url` | string | Source URL of the redirect-producing request. |
| `status_code` | string | Redirect response status code as text, for example `"301"` or `"308"`. |
| `timings` | object | Per-hop timing fields in seconds. |

Redirect following uses browser-like method/body behavior:

- `301`, `302`, and `303` convert non-`GET`/`HEAD` requests to `GET` and drop
  body headers;
- `307` and `308` preserve the method and body;
- relative `Location` values are resolved against the current URL;
- the default redirect limit is `10`.

## Timing Fields

`Timings` and redirect `timings` use seconds to match ReqBin server responses:

| Field | Source |
| --- | --- |
| `DNS` | Node socket `lookup` duration when emitted. |
| `Connecting` | TCP connect duration when emitted. |
| `TLS` | TLS handshake duration for HTTPS when emitted. |
| `Sending` | Time from connection readiness to request finish. |
| `Waiting` | Time from request finish to response headers, or request start to response headers when finish is unavailable. |
| `Receiving` | Time from response headers to completed body read. Redirect entries receive headers only, so this is usually `0`. |
| `Total` | Total elapsed seconds for the same hop. |

The transport uses a monotonic high-resolution clock. Phases not exposed by the
Node socket lifecycle, for example reused cached connections, are returned as
`0` instead of being guessed.

## Example

```json
{
  "Content": "",
  "ContentLength": 0,
  "ContentRaw": "",
  "ContentType": "",
  "Elapsed": 84,
  "Headers": "Connection: close\r\nContent-Length: 0\r\n",
  "RedirectUrl": "",
  "Redirects": [
    {
      "elapsed": 167,
      "headers": "Location: https://download.com\r\n",
      "method": "GET",
      "redirect_url": "http://download.com/",
      "status_code": "308",
      "timings": {
        "Connecting": 0.02,
        "DNS": 0.01,
        "Receiving": 0,
        "Sending": 0,
        "TLS": 0,
        "Total": 0.167,
        "Waiting": 0.137
      }
    }
  ],
  "RedirectsCount": 1,
  "RedirectsTime": 167,
  "StatusCode": "412",
  "StatusDescription": "Precondition Failed",
  "Success": true,
  "Timings": {
    "Connecting": 0.001,
    "DNS": 0,
    "Receiving": 0.000001,
    "Sending": 0.000001,
    "TLS": 0.08,
    "Total": 0.084,
    "Waiting": 0.003
  },
  "Version": "1.1"
}
```
