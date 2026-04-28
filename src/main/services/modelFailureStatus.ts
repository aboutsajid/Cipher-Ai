export interface ModelFailureStatus {
  count: number;
  blacklisted: boolean;
  hardFailuresUntilBlacklist: number;
  transientFailuresUntilBlacklist: number;
}

export function buildModelFailureStatus(options: {
  count: number;
  blacklisted: boolean;
  hardFailureThreshold: number;
  transientFailureThreshold: number;
}): ModelFailureStatus {
  const { count, blacklisted, hardFailureThreshold, transientFailureThreshold } = options;
  return {
    count,
    blacklisted,
    hardFailuresUntilBlacklist: Math.max(0, hardFailureThreshold - count),
    transientFailuresUntilBlacklist: Math.max(0, transientFailureThreshold - count)
  };
}
