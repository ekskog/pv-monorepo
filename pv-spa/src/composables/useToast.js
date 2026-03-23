import { reactive } from 'vue';

const state = reactive({
  toasts: [],
});

function showToast(message, options = {}) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const toast = {
    id,
    message,
    duration: options.duration || 4000,
    type: options.type || 'info',
  };
  state.toasts.push(toast);
  setTimeout(() => {
    const idx = state.toasts.findIndex((t) => t.id === id);
    if (idx !== -1) state.toasts.splice(idx, 1);
  }, toast.duration);
  return id;
}

export function useToast() {
  return {
    toasts: state.toasts,
    showToast,
  };
}
