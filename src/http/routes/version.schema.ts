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
