export default class WorkflowStatusService {
  constructor(apiService, workflowId, onUpdate, onError, options = {}) {
    this.apiService = apiService;
    this.workflowId = workflowId;
    this.onUpdate = onUpdate;
    this.onError = onError;

    this.pollIntervalMs = options.pollIntervalMs || 2000;
    this.slowPollIntervalMs = options.slowPollIntervalMs || 4000;
    this.slowModeAfterMs = options.slowModeAfterMs || 30000;
    this.maxDurationMs = options.maxDurationMs || 15 * 60 * 1000;

    this.startedAtMs = 0;
    this.stopped = true;
    this.timerId = null;
    this.consecutiveErrors = 0;
  }

  static isTerminalStatus(status) {
    return [
      "COMPLETED",
      "FAILED",
      "TIMED_OUT",
      "TERMINATED",
      "CANCELED",
      "CANCELLED",
    ].includes(status);
  }

  start() {
    if (!this.workflowId || !this.stopped) {
      return;
    }

    this.stopped = false;
    this.startedAtMs = Date.now();
    this.pollOnce();
  }

  stop() {
    this.stopped = true;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  scheduleNextPoll() {
    if (this.stopped) {
      return;
    }

    const elapsed = Date.now() - this.startedAtMs;
    if (elapsed > this.maxDurationMs) {
      this.onError?.(new Error("Workflow status polling timed out"));
      this.stop();
      return;
    }

    const interval =
      elapsed > this.slowModeAfterMs
        ? this.slowPollIntervalMs
        : this.pollIntervalMs;

    this.timerId = setTimeout(() => this.pollOnce(), interval);
  }

  async pollOnce() {
    if (this.stopped) {
      return;
    }

    try {
      const payload = await this.apiService.getBulkWorkflowStatus(this.workflowId);
      this.consecutiveErrors = 0;

      // Endpoint may briefly return null when workflow metadata has not propagated yet.
      if (!payload) {
        this.scheduleNextPoll();
        return;
      }

      this.onUpdate?.(payload);

      if (WorkflowStatusService.isTerminalStatus(payload?.status)) {
        this.stop();
        return;
      }
    } catch (error) {
      this.consecutiveErrors += 1;
      this.onError?.(error);

      // Stop on repeated failures to avoid infinite noisy loops.
      if (this.consecutiveErrors >= 5) {
        this.stop();
        return;
      }
    }

    this.scheduleNextPoll();
  }
}
