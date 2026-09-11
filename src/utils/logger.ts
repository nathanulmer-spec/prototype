const ts = () => new Date().toISOString();

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(`[${ts()}] INFO  ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[${ts()}] WARN  ${msg}`, meta ?? ""),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(`[${ts()}] ERROR ${msg}`, meta ?? ""),
};
