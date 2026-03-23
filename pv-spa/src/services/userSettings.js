// Simple user settings stored in localStorage with change events
const STORAGE_KEY = 'pv_user_settings_v1';

const DEFAULTS = {
  monitorNonBulkUploads: false,
  monitorBulkUploads: false,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    console.warn('Failed to load user settings, using defaults', e);
    return { ...DEFAULTS };
  }
}

function save(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    // Emit a simple event so components can react
    try {
      window.dispatchEvent(new CustomEvent('pv:userSettingsChanged', { detail: { ...obj } }));
    } catch (e) {
      // ignore
    }
    return true;
  } catch (e) {
    console.error('Failed to save user settings', e);
    return false;
  }
}

const state = load();

export default {
  get(key) {
    if (!key) return { ...state };
    return state[key];
  },
  set(key, value) {
    state[key] = value;
    return save(state);
  },
  getAll() {
    return { ...state };
  },
  onChange(cb) {
    const handler = (e) => cb(e.detail);
    window.addEventListener('pv:userSettingsChanged', handler);
    return () => window.removeEventListener('pv:userSettingsChanged', handler);
  },
};
