export const healthResponseSchema = {
  additionalProperties: false,
  properties: {
    status: { const: 'up', type: 'string' },
  },
  required: ['status'],
  type: 'object',
} as const

export const versionResponseSchema = {
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    protocolVersion: { const: 'v1', type: 'string' },
    version: { type: 'string' },
  },
  required: ['name', 'protocolVersion', 'version'],
  type: 'object',
} as const

export const pairRequestSchema = {
  additionalProperties: false,
  properties: {
    code: {
      pattern: '^\\d{6}$',
      type: 'string',
    },
  },
  required: ['code'],
  type: 'object',
} as const

export const pairSuccessResponseSchema = {
  additionalProperties: false,
  properties: {
    token: { type: 'string' },
    tokenType: { const: 'Bearer', type: 'string' },
  },
  required: ['token', 'tokenType'],
  type: 'object',
} as const

export const pairErrorResponseSchema = {
  additionalProperties: false,
  properties: {
    error: {
      enum: ['attempt-limit', 'expired', 'invalid-code'],
      type: 'string',
    },
    message: { type: 'string' },
  },
  required: ['error', 'message'],
  type: 'object',
} as const

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

export const fetchNotImplementedResponseSchema = {
  additionalProperties: false,
  properties: {
    error: { const: 'not-implemented', type: 'string' },
    message: { type: 'string' },
  },
  required: ['error', 'message'],
  type: 'object',
} as const

export const openApiResponseSchema = {
  additionalProperties: true,
  type: 'object',
} as const
