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
