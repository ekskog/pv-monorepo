// force worker rebuild to fix temporal connection issues 18/03/2026

import { NativeConnection, Worker } from '@temporalio/worker';
import * as convertActivities from './activities/convertImage';
import * as metadataActivities from './activities/metadataActivity';
import * as persistActivities from './activities/persistToMinio'; // kept for cleanupBatch
import * as reportActivities from './activities/reportProgress';

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ||
  'temporal-frontend.temporal.svc.cluster.local:7233';
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE;
const TASK_QUEUE = process.env.TASK_QUEUE;

async function run() {
  if (!TEMPORAL_NAMESPACE) throw new Error('TEMPORAL_NAMESPACE environment variable is required');
  if (!TASK_QUEUE)         throw new Error('TASK_QUEUE environment variable is required');

  console.log('Starting Temporal worker...');
  console.log(`Temporal:   ${TEMPORAL_ADDRESS}`);
  console.log(`Namespace:  ${TEMPORAL_NAMESPACE}`);
  console.log(`Task queue: ${TASK_QUEUE}`);

  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS });
  console.log('✓ Connected to Temporal');

  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows/image-batch-workflow'),
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