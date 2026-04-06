interface RouterServiceLike {
  getStatus(): Promise<unknown> | unknown;
  getLogs(): string[];
  startRouter(): Promise<unknown> | unknown;
  stopRouter(): Promise<unknown> | unknown;
  testConnection(): Promise<unknown> | unknown;
}

export function getRouterStatus(ccrService: RouterServiceLike): Promise<unknown> | unknown {
  return ccrService.getStatus();
}

export function getRouterLogs(ccrService: RouterServiceLike): string[] {
  return ccrService.getLogs();
}

export function startRouter(ccrService: RouterServiceLike): Promise<unknown> | unknown {
  return ccrService.startRouter();
}

export function stopRouter(ccrService: RouterServiceLike): Promise<unknown> | unknown {
  return ccrService.stopRouter();
}

export function testRouter(ccrService: RouterServiceLike): Promise<unknown> | unknown {
  return ccrService.testConnection();
}
