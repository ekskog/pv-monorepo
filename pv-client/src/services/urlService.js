export default {
  // Get current album from URL hash
getCurrentAlbumFromUrl() {
  const hash = window.location.hash;
  if (hash.startsWith('#/album/')) {
    return decodeURIComponent(hash.replace('#/album/', ''));
  }
  if (hash.startsWith('#/public/')) {
    return decodeURIComponent(hash.replace('#/public/', ''));
  }
  return null;
},

isPublicAlbumUrl() {
  return window.location.hash.startsWith('#/public/');
}
,

  // Set album in URL hash (for internal use)
  setAlbumInUrl(albumSlug) {
    const newHash = `#/album/${encodeURIComponent(albumSlug)}`;
    if (window.location.hash !== newHash) {
      window.history.pushState(null, "", newHash);
    }
  },

  // Set public album in URL hash (for sharing)
  setPublicAlbumInUrl(albumSlug) {
    const newHash = `#/public/${encodeURIComponent(albumSlug)}`;
    if (window.location.hash !== newHash) {
      window.history.pushState(null, "", newHash);
    }
  },

  // Clear album from URL
  clearAlbumFromUrl() {
    const hash = window.location.hash;
    if (hash.startsWith("#/album/") || hash.startsWith("#/public/")) {
      window.history.pushState(null, "", window.location.pathname);
    }
  },

  // Generate shareable URL (public version)
  generateShareableUrl(albumSlug, isPublic = false) {
    const baseUrl = window.location.origin + window.location.pathname;
    const prefix = isPublic ? "public" : "album";
    return `${baseUrl}#/${prefix}/${encodeURIComponent(albumSlug)}`;
  },

  // Listen for URL changes (browser back/forward)
  onUrlChange(callback) {
    const handler = () => {
      const albumFromUrl = this.getCurrentAlbumFromUrl();
      callback(albumFromUrl);
    };

    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);

    // Return cleanup function
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  },
};
