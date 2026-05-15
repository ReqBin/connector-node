export const correlationIdHeaderSchema = {
  additionalProperties: true,
  properties: {
    'correlation-id': {
      type: 'string',
    },
  },
  type: 'object',
} as const
