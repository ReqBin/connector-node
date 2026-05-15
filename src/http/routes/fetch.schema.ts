export const fetchAuthErrorResponseSchema = {
  additionalProperties: false,
  properties: {
    error: {
      enum: ['invalid-token', 'missing-token'],
      type: 'string',
    },
    message: { type: 'string' },
  },
  required: ['error', 'message'],
  type: 'object',
} as const

export const fetchValidationErrorResponseSchema = {
  additionalProperties: false,
  properties: {
    error: {
      enum: [
        'invalid-envelope',
        'invalid-method',
        'invalid-url',
        'blocked-host',
        'invalid-header',
        'malformed-json',
        'missing-url',
        'unsupported-scheme',
      ],
      type: 'string',
    },
    message: { type: 'string' },
  },
  required: ['error', 'message'],
  type: 'object',
} as const

const fetchTimingsSchema = {
  additionalProperties: false,
  properties: {
    Connecting: { type: 'number' },
    DNS: { type: 'number' },
    Receiving: { type: 'number' },
    Sending: { type: 'number' },
    TLS: { type: 'number' },
    Total: { type: 'number' },
    Waiting: { type: 'number' },
  },
  required: ['Connecting', 'DNS', 'Receiving', 'Sending', 'TLS', 'Total', 'Waiting'],
  type: 'object',
} as const

const fetchRedirectSchema = {
  additionalProperties: false,
  properties: {
    elapsed: { type: 'number' },
    headers: { type: 'string' },
    redirect_url: { type: 'string' },
    status_code: { type: 'string' },
  },
  required: ['elapsed', 'redirect_url', 'status_code'],
  type: 'object',
} as const

export const fetchSenderResponseSchema = {
  additionalProperties: false,
  properties: {
    Content: { type: 'string' },
    ContentLength: { type: 'number' },
    ContentRaw: { type: 'string' },
    ContentType: { type: 'string' },
    Elapsed: { type: 'number' },
    Headers: { type: 'string' },
    RedirectUrl: { type: 'string' },
    Redirects: {
      items: fetchRedirectSchema,
      type: 'array',
    },
    RedirectsCount: { type: 'number' },
    RedirectsTime: { type: 'number' },
    StatusCode: { type: 'number' },
    StatusDescription: { type: 'string' },
    Success: { type: 'boolean' },
    Timings: fetchTimingsSchema,
    Version: { type: 'string' },
  },
  required: [
    'Content',
    'ContentLength',
    'ContentRaw',
    'ContentType',
    'Elapsed',
    'Headers',
    'RedirectUrl',
    'Redirects',
    'RedirectsCount',
    'RedirectsTime',
    'StatusCode',
    'StatusDescription',
    'Success',
    'Timings',
    'Version',
  ],
  type: 'object',
} as const
