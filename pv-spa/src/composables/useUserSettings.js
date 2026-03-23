import { reactive, readonly } from 'vue';
import userSettings from '../services/userSettings';

const state = reactive({
  monitorNonBulkUploads: !!userSettings.get('monitorNonBulkUploads'),
  monitorBulkUploads: !!userSettings.get('monitorBulkUploads'),
});

if (typeof userSettings.onChange === 'function') {
  userSettings.onChange((newSettings) => {
    state.monitorNonBulkUploads = !!(newSettings && newSettings.monitorNonBulkUploads);
    state.monitorBulkUploads = !!(newSettings && newSettings.monitorBulkUploads);
  });
}

function setMonitorNonBulkUploads(value) {
  const v = !!value;
  userSettings.set('monitorNonBulkUploads', v);
  state.monitorNonBulkUploads = v;
}

function setMonitorBulkUploads(value) {
  const v = !!value;
  userSettings.set('monitorBulkUploads', v);
  state.monitorBulkUploads = v;
}

export function useUserSettings() {
  return {
    settings: readonly(state),
    setMonitorNonBulkUploads,
    setMonitorBulkUploads,
  };
}
