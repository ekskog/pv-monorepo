export default class SSEService {
  constructor(apiService, jobId, onUpdate, onError) {
    this.apiService = apiService;
    this.jobId = jobId;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.eventSource = null;
    this.timeoutId = null;
  }

  start() {
    const sseUrl = this.apiService.getProcessingStatusUrl(this.jobId);
    this.eventSource = new EventSource(sseUrl);

    this.eventSource.onopen = () => {
      console.log("✅ SSE connection opened");
    };

    this.eventSource.onmessage = (event) => {
      console.log("📨 Raw SSE message:", event.data);
      try {
        const data = JSON.parse(event.data);
        this.onUpdate(data);
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    this.eventSource.onerror = (error) => {
      if (this.eventSource.readyState === EventSource.CLOSED) {
        console.log("✅ SSE connection closed by server (expected)");
      } else {
        console.error("❌ SSE connection error:", error);
        this.onError?.(error);
      }
    };

    this.timeoutId = setTimeout(() => this.stop(), 600000); // 10 minutes max
  }

  stop() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
