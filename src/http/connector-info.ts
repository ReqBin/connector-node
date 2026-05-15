import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface ConnectorInfo {
  name: string
  protocolVersion: string
  version: string
}

export interface ConnectorPackageJson {
  name?: unknown
  version?: unknown
}

const packageJsonRelativePaths = [
  '../../package.json',
  '../../../package.json',
] as const

export function readConnectorPackageJson(
  relativePaths: readonly string[] = packageJsonRelativePaths,
  baseUrl = import.meta.url,
): ConnectorPackageJson {
  for (const relativePath of relativePaths) {
    try {
      return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, baseUrl)), 'utf8')) as ConnectorPackageJson
      /* v8 ignore next 3 -- compiled dist and source tests resolve package.json from different relative paths. */
    } catch {
      continue
    }
  }

  /* v8 ignore start -- package metadata is required in both source and published package layouts. */
  throw new Error('Unable to read connector package metadata.')
}
/* v8 ignore stop */

function readString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return fallback
}

export function createConnectorInfo(packageJson: ConnectorPackageJson): ConnectorInfo {
  return {
    name: readString(packageJson.name, '@reqbin/connector'),
    protocolVersion: 'v1',
    version: readString(packageJson.version, '0.0.0'),
  }
}

export function createDefaultConnectorInfo(): ConnectorInfo {
  return createConnectorInfo(readConnectorPackageJson())
}
