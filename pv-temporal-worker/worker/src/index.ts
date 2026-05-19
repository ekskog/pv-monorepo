import http from 'http';
import { NativeConnection, Worker, Runtime, DefaultLogger } from '@temporalio/worker';
import type { Configuration } from 'webpack';

import * as convertActivities from './activities/convertImage';
import * as metadataActivities from './activities/metadataActivity';
import * as persistActivities from './activities/cleanup'; // cleanupBatch activity
import * as reportActivities from './activities/reportProgress';
import * as videoActivities from './activities/uploadVideo';

// 1. Start Health Server Immediately
// Binding to '0.0.0.0' is mandatory for Kubernetes probes to connect
http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/ready') {
    res.writeHead(200);
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3000, '0.0.0.0', () => {
  console.log('✓ Health check server listening on 0.0.0.0:3000');
});

// Suppress SDK info/debug logs
Runtime.install({
  logger: new DefaultLogger('INFO'),
});

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ||
  'temporal-frontend.temporal.svc.cluster.local:7233';
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE;
const TASK_QUEUE = process.env.TASK_QUEUE;

async function run() {
  if (!TEMPORAL_NAMESPACE) throw new Error('TEMPORAL_NAMESPACE environment variable is required');
  if (!TASK_QUEUE) throw new Error('TASK_QUEUE environment variable is required');

  console.log('Connecting to Temporal at:', TEMPORAL_ADDRESS);
  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS });

  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows/index'),
    bundlerOptions: {
      webpackConfigHook: (config: Configuration) => {
        config.infrastructureLogging = { level: 'error' };
        return config;
      },
    },
    // Protects the 1GB RAM limit by forcing sequential activity execution
    maxConcurrentActivityTaskExecutions: 1,
    activities: {
      ...convertActivities,
      ...metadataActivities,
      ...persistActivities,
      ...reportActivities,
      ...videoActivities,
    },
  });

  console.log('✓ Worker ready');
  console.log('🚀 Listening for tasks...');
  await worker.run();
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});