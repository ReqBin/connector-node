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

export const openApiResponseSchema = {
  additionalProperties: true,
  type: 'object',
} as const
