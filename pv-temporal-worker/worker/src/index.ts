// force worker rebuild to fix temporal connection issues 18/03/2026
import { NativeConnection, Worker, Runtime, DefaultLogger } from '@temporalio/worker';
import type { Configuration } from 'webpack';

import * as convertActivities from './activities/convertImage';
import * as metadataActivities from './activities/metadataActivity';
import * as persistActivities from './activities/persistToMinio'; // kept for cleanupBatch
import * as reportActivities from './activities/reportProgress';

// Suppress SDK info/debug logs — only WARN and above will appear in pod logs
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

  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS });

  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows/image-batch-workflow'),
    bundlerOptions: {
      webpackConfigHook: (config: Configuration) => {
        config.infrastructureLogging = { level: 'error' }; // suppresses asset/module logs
        return config;
      },
    },
    activities: {
      ...convertActivities,
      ...metadataActivities,
      ...persistActivities, // still needed for cleanupBatch
      ...reportActivities,
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