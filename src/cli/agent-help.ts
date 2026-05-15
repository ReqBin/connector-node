import type { ConnectorInfo } from '../http/connector-info.js'

export function formatAgentHelp(): string {
  return [
    'Usage: reqbin-agent [options]',
    '',
    'Options:',
    '  -p, --port <number>                 Listen port. Defaults to 7070 or PORT.',
    '  --host <host>                       Listen host. Defaults to 127.0.0.1.',
    '  --allow-origin <origin>             Extend browser CORS allowlist. Repeatable.',
    '  --dev                               Allow local development browser origins.',
    '  --no-auth                           Disable pairing auth for local development.',
    '  --request-timeout-ms <number>       Target request timeout. Defaults to 300000.',
    '  --request-body-limit-bytes <number> Target request body limit. Defaults to 5242880.',
    '  --response-body-limit-bytes <number> Target response body limit. Defaults to 5242880.',
    '  --max-redirects <number>            Target redirect limit. Defaults to 10.',
    '  --version                           Print version.',
    '  --help                              Print help.',
  ].join('\n')
}

export function formatAgentVersion(connectorInfo: ConnectorInfo): string {
  return `${connectorInfo.name} ${connectorInfo.version}`
}
