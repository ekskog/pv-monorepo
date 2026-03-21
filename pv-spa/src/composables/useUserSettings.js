import { reactive, readonly } from 'vue';
import userSettings from '../services/userSettings';

const state = reactive({
  monitorNonBulkUploads: !!userSettings.get('monitorNonBulkUploads'),
});

if (typeof userSettings.onChange === 'function') {
  userSettings.onChange((newSettings) => {
    state.monitorNonBulkUploads = !!(newSettings && newSettings.monitorNonBulkUploads);
  });
}

function setMonitorNonBulkUploads(value) {
  const v = !!value;
  userSettings.set('monitorNonBulkUploads', v);
  state.monitorNonBulkUploads = v;
}

export function useUserSettings() {
  return {
    settings: readonly(state),
    setMonitorNonBulkUploads,
  };
}
