// force rebuild on 04/03/2026 15:30
require("dotenv").config();
const config = require("./config"); // defaults to ./config/index.js

// Debug namespaces
const debug = require("debug");
const debugServer = debug("pv:server");
const debugSSE = debug("pv:server:sse");
const debugDB = debug("pv:server:database");
const debugUpload = debug("pv:server:upload");

// temporal integration
const { Connection, Client: TemporalClient } = require("@temporalio/client");

const express = require("express");
const cors = require("cors");
const app = express();
const PORT = config.server.port;

// Middleware - Log all incoming requests BEFORE CORS
app.use((req, res, next) => {
  /*
  debugServer('🔍 Incoming request from origin:', req.headers.origin);
  debugServer('🔍 Request method:', req.method);
  debugServer('🔍 Request path:', req.path);
  */
  next();
});

// Middleware
app.use(cors(config.cors));

// Log successful CORS checks
app.use((req, res, next) => {
  // console.log('✅ Request passed CORS check');
  next();
});

// Keep JSON/urlencoded limits small - large file uploads use multipart/multer (disk streaming)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Import and Initialize services and dependencies

// Temporal Client Configuration
let temporalClient;

async function initTemporal() {
  try {
    const connection = await Connection.connect({
      address: config.temporal.address,
    });
    temporalClient = new TemporalClient({
      connection,
      namespace: config.temporal.namespace,
    });
    debugServer("✓ Temporal Client initialized");
  } catch (err) {
    debugServer(`Temporal initialization error: ${err.message}`);
    temporalClient = null;
  }
}

// Getter passed to routes so they always read the current client reference,
// even after a reconnect.
const getTemporalClient = () => temporalClient;

// Reconnect loop — if Temporal was down at startup or drops later,
// retry every 30 s so the routes recover without a pod restart.
async function startTemporalReconnectLoop() {
  setInterval(async () => {
    if (temporalClient) return; // already connected
    debugServer("Temporal reconnect attempt...");
    await initTemporal();
    if (temporalClient) {
      debugServer("✓ Temporal Client reconnected");
    }
  }, 30000);
}

// Minio Client Configuration

const { Client: MinioClient } = require("minio");
// MinIO Client Configuration
let minioClient;
try {
  minioClient = new MinioClient({
    endPoint: config.minio.endpoint,
    port: parseInt(config.minio.port),
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
  });
} catch (err) {
  debugServer(
    `[server.js LINE 39]: MinIO client initialization error: ${err.message}`,
  );
  minioClient = null;
}

// Separate client whose endpoint is the public hostname so that presigned URLs
// are signed with the correct host (AWS SigV4 includes Host in the HMAC).
let publicMinioClient = null;
if (config.minio.publicUrl) {
  try {
    const pub = new URL(config.minio.publicUrl);
    const isHttps = pub.protocol === "https:";
    const port = pub.port ? parseInt(pub.port) : (isHttps ? 443 : 80);
    publicMinioClient = new MinioClient({
      endPoint: pub.hostname,
      port,
      useSSL: isHttps,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
    debugServer(`✓ Public MinIO signing client → ${config.minio.publicUrl}`);
  } catch (err) {
    debugServer(`Public MinIO client init error: ${err.message}`);
  }
}
const UploadService = require("./services/upload-service");
const uploadService = new UploadService(minioClient);

// Import authentication components
const database = require("./services/database-service");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const healthRoutes = require("./routes/health");
const albumRoutes = require("./routes/albums");
const statRoutes = require("./routes/stats");
const temporalRoutes = require("./routes/temporalUploads"); // Added this for the new Temporal route
const videoUploadRoutes = require("./routes/videoUpload");

// Store pending jobs by job ID (used by upload/album routes)
const pendingJobs = new Map();

// SSE functionality moved to a dedicated service
const sseService = require("./services/sse-service");
const { attachSseRoutes, sendSSEEvent, persistProgress, getProgress } =
  sseService;

// Background processing function for asynchronous uploads with SSE updates
async function processFilesInBackground(
  files,
  bucketName,
  folderPath,
  startTime,
  jobId,
) {
  debugUpload(
    `[server.js (110)] Starting background processing for job ${jobId} with ${files.length} files`,
  );

  try {
    const uploadResults = [];
    const errors = [];
    const totalFiles = files.length;

    // Send initial starting event
    sendSSEEvent(jobId, "started", {
      status: "started",
      message: `Starting to process ${totalFiles} files...`,
      progress: {
        current: 0,
        total: totalFiles,
        percentage: 0,
        uploaded: 0,
        failed: 0,
      },
    });

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      debugServer(
        `Processing file ${i + 1}/${totalFiles}: ${file.originalname}`,
      );
      try {
        // Process the individual file
        const result = await uploadService.processAndUploadFile(
          file,
          bucketName,
          folderPath,
          file.originalname,
        );
        uploadResults.push(result);
        debugServer(`Successfully processed: ${file.originalname}`);

        // Send progress update after each successful file upload
        const progressPercent = Math.round(((i + 1) / totalFiles) * 100);
        sendSSEEvent(jobId, "progress", {
          status: "processing",
          message: `Successfully processed ${file.originalname}`,
          progress: {
            current: i + 1,
            total: totalFiles,
            percentage: progressPercent,
            lastUploaded: file.originalname,
            uploaded: uploadResults.length,
            failed: errors.length,
          },
        });
      } catch (error) {
        debugUpload(
          `[server.js (160)] Error processing file ${file.originalname}: ${error.message}`,
        );
        errors.push({
          filename: file.originalname,
          error: error.message,
        });

        // Send progress update even for failed files
        const progressPercent = Math.round(((i + 1) / totalFiles) * 100);
        sendSSEEvent(jobId, "progress", {
          status: "processing",
          message: `Failed to process ${file.originalname}: ${error.message}`,
          progress: {
            current: i + 1,
            total: totalFiles,
            percentage: progressPercent,
            lastFailed: file.originalname,
            uploaded: uploadResults.length,
            failed: errors.length,
          },
        });
      }

      // Small delay to ensure event ordering and prevent overwhelming the client
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const processingTime = Date.now() - startTime;
    debugUpload(
      `[server.js (148)] Processing completed in ${processingTime}ms. Success: ${uploadResults.length}, Failed: ${errors.length}`,
    );

    // Update database
    try {
      await database.incrementFileCounter(uploadResults.length, folderPath);
      debugUpload(
        `[server.js (152)] Updated file counter for ${folderPath} by ${uploadResults.length}`,
      );
    } catch (dbError) {
      debugUpload(
        `[server.js (154)] Error updating file counter: ${dbError.message}`,
      );
    }

    // Determine final status and send completion event
    let finalStatus, finalMessage;
    if (errors.length === 0) {
      finalStatus = "success";
      finalMessage = `All ${totalFiles} files processed successfully!`;
    } else if (uploadResults.length === 0) {
      finalStatus = "failed";
      finalMessage = `All ${totalFiles} files failed to process. Please check the files and try again.`;
    } else {
      finalStatus = "partial";
      finalMessage = `${uploadResults.length} files processed successfully, ${errors.length} failed.`;
    }

    sendSSEEvent(jobId, "complete", {
      status: finalStatus,
      message: finalMessage,
      results: {
        uploaded: uploadResults.length,
        failed: errors.length,
        processingTime: processingTime,
        total: totalFiles,
      },
      errors: errors.length > 0 ? errors : undefined,
    });

    debugUpload(
      `[server.js (173)] Sent completion event for job ${jobId}, status: ${finalStatus}`,
    );

    // Schedule connection cleanup - give client time to receive the completion event
    setTimeout(() => {
      debugSSE(
        `[server.js (177)] Cleaning up SSE connections for job ${jobId}`,
      );
    }, 10000); // Reduced from 5 minutes to 10 seconds since job is complete
  } catch (error) {
    const errorTime = Date.now() - startTime;
    debugUpload(
      `[server.js (182)] Background processing failed after ${errorTime}ms:`,
      error.message,
    );

    // Send error completion message
    sendSSEEvent(jobId, "complete", {
      status: "error",
      message: `Processing failed: ${error.message}`,
      error: error.message,
      results: {
        uploaded: 0,
        failed: 0,
        processingTime: errorTime,
        total: files.length,
      },
    });

    // Clean up connections after error
    setTimeout(() => {
      debugSSE(
        `[server.js (196)] Cleaning up SSE connections after error for job ${jobId}`,
      );
    }, 5000);
  }
}

// SSE endpoint - for monitoring upload progress
// Attach SSE routes (processing-status) and wire up pending-job starter
attachSseRoutes(app, {
  pendingJobs,
  onStartPendingJob: (files, bucketName, folderPath, startTime, jobId) => {
    processFilesInBackground(
      files,
      bucketName,
      folderPath,
      startTime,
      jobId,
    ).catch((error) => {
      debugSSE(
        `[server.js] Error starting background processing for job ${jobId}: ${error.message}`,
      );
    });
  },
});

// Start server with database initialization
async function startServer() {
  try {
    // Initialize database connection
    let connectionPool = await initializeDatabase();
    await initTemporal();
    startTemporalReconnectLoop();

    // Warm the Temporal gRPC channel to avoid cold-start timeouts in health checks
    try {
      if (
        healthRoutes &&
        typeof healthRoutes.warmTemporalChannel === "function"
      ) {
        healthRoutes.warmTemporalChannel(temporalClient);
      }
    } catch (err) {
      debugServer("warmTemporalChannel invocation failed:", err.message);
    }

    // Add a startup dependency check to log the status of external services
    async function checkAllDependencies() {
      const results = {};

      // MinIO
      results.minio = false;
      try {
        if (minioClient) {
          await Promise.race([
            minioClient.bucketExists(config.minio.bucketName),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 3000),
            ),
          ]);

          // mount routes that depend on MinIO only if the bucket is accessible
          app.use(
            "/",
            albumRoutes(minioClient, { pendingJobs, processFilesInBackground, publicMinioClient }),
          );
          app.use("/", statRoutes(minioClient));

          results.minio = true;
        }
      } catch (e) {
        debugServer("Dependency check: MinIO failed:", e.message || e);
      }

      // Database
      results.database = false;
      try {
        results.database = Boolean(await database.isHealthy());
      } catch (e) {
        debugServer("Dependency check: Database failed:", e.message || e);
      }

      // Temporal
      results.temporal = false;
      try {
        if (temporalClient) {
          const TEMPORAL_TIMEOUT_MS = 4000;
          await Promise.race([
            temporalClient.workflowService.describeNamespace({
              namespace: config.temporal?.namespace || "default",
            }),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Temporal gRPC timeout after ${TEMPORAL_TIMEOUT_MS} ms`,
                    ),
                  ),
                TEMPORAL_TIMEOUT_MS,
              ),
            ),
          ]);
          results.temporal = true;
        }
      } catch (e) {
        debugServer("Dependency check: Temporal failed:", e.message || e);
      }

      // Converter
      results.converter = false;
      try {
        if (config.converter && config.converter.url) {
          const timeout = Math.min(
            parseInt(config.converter.timeout, 10) || 4000,
            4000,
          );
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);
          try {
            const r = await fetch(`${config.converter.url}/health`, {
              signal: controller.signal,
            });
            results.converter = Boolean(r && r.ok);
          } finally {
            clearTimeout(timer);
          }
        }
      } catch (e) {
        debugServer("Dependency check: Converter failed:", e.message || e);
      }

      // Log a compact status summary
      debugServer("Dependency status at startup: ", results);
      return results;
    }

    app.use("/auth", authRoutes);
    app.use("/user", userRoutes);

    const deps = await checkAllDependencies();
    try {
      const dependencyStatus = require("./services/dependency-status");
      if (dependencyStatus && typeof dependencyStatus.set === "function") {
        dependencyStatus.set(deps);
      }
    } catch (e) {
      debugServer(
        "Failed to persist startup dependency status:",
        e.message || e,
      );
    }

    app.use("/bulk", temporalRoutes(getTemporalClient, config, { sendSSEEvent, persistProgress, getProgress }));
    app.use("/video", videoUploadRoutes(minioClient, { getTemporalClient }));
    app.use("/", healthRoutes(minioClient, temporalClient));

    //debugServer(`[server.js] Database initialized successfully`);
    // Start HTTP server
    app.listen(PORT, () => {
      const k8sService = config.kubernetes.serviceName;
      const k8sNamespace = config.kubernetes.namespace || "pv";
      debugServer(`Starting pv ${new Date()}...`);
      debugServer(`> pv API server running on port ${config.server.port}`);
    });
  } catch (error) {
    //debugServer(`[server.js] Failed to start server:`, error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  //debugServer(`[server.js] Shutting down server...`);
  if (config.auth.mode) {
    await database.close();
  }
  process.exit(0);
});

async function initializeDatabase() {
  try {
    await database.initialize();
  } catch (error) {
    debugDB(`[(262)] Database initialization failed:`, error.message);
  }
}

// Start the server
startServer();
