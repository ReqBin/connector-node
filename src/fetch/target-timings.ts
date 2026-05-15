import type { ConnectorTimings, TargetFetchTimings } from './types.js'

export interface TargetTimingSnapshot {
  bodyEndedAt?: number
  phases?: Partial<TargetFetchTimings>
  responseReceivedAt: number
  startedAt: number
}

export function createTargetTimings({
  bodyEndedAt,
  phases = {},
  responseReceivedAt,
  startedAt,
}: TargetTimingSnapshot): TargetFetchTimings {
  const endedAt = bodyEndedAt ?? responseReceivedAt

  return {
    connectingMs: phases.connectingMs ?? 0,
    dnsMs: phases.dnsMs ?? 0,
    receivingMs: endedAt - responseReceivedAt,
    sendingMs: phases.sendingMs ?? 0,
    tlsMs: phases.tlsMs ?? 0,
    totalMs: endedAt - startedAt,
    waitingMs: phases.waitingMs ?? responseReceivedAt - startedAt,
  }
}

export function emptyTargetTimings(): TargetFetchTimings {
  return {
    connectingMs: 0,
    dnsMs: 0,
    receivingMs: 0,
    sendingMs: 0,
    tlsMs: 0,
    totalMs: 0,
    waitingMs: 0,
  }
}

export function mapTargetTimingsToConnector(timings: TargetFetchTimings): ConnectorTimings {
  return {
    Connecting: timings.connectingMs / 1000,
    DNS: timings.dnsMs / 1000,
    Receiving: timings.receivingMs / 1000,
    Sending: timings.sendingMs / 1000,
    TLS: timings.tlsMs / 1000,
    Total: timings.totalMs / 1000,
    Waiting: timings.waitingMs / 1000,
  }
}
