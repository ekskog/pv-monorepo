// Simple holder for the last startup dependency status
let last = null;

function set(status) {
  last = {
    timestamp: new Date().toISOString(),
    status: { ...status },
  };
}

function get() {
  return last;
}

module.exports = { set, get };
