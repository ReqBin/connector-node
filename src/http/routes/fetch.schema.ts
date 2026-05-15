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
