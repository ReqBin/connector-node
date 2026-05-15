export const healthResponseSchema = {
  additionalProperties: false,
  properties: {
    status: { const: 'up', type: 'string' },
  },
  required: ['status'],
  type: 'object',
} as const
