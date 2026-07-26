export function scheduleAbort(
  controller: AbortController,
  timeoutMs: number,
): ReturnType<typeof setTimeout> {
  return setTimeout(controller.abort.bind(controller), timeoutMs);
}
