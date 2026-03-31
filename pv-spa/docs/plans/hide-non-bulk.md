## Plan: Hide Non-Bulk Panel

TL;DR - Comment out the right-side "Non-Bulk Live SSE" panel in the Monitor page so only Temporal Bulk Workflows are visible. Keep code intact (no deletions); use HTML comment markers so it can be easily restored.

**Steps**
1. Create a quick backup copy of the file to be edited.
2. Open pv-spa/src/components/BulkUploadJobs.vue and locate the right-panel markup that renders the Non-Bulk (legacy SSE) section.
3. Surround the entire right-panel block with HTML comment markers:
   - Insert <!-- HIDE_NON_BULK_START --> immediately before the panel's opening tag
   - Insert <!-- HIDE_NON_BULK_END --> immediately after the panel's closing tag
   - Alternatively, if the build or linter treats HTML comments differently, wrap the panel in <template v-if="false">...</template> instead.
4. Save changes and run the dev server (`npm run dev` from `pv-spa/`) to verify layout. If anything breaks, revert using the backup.
5. (Optional) If you want a permanent toggle later, replace the HTML comments with a config-driven `v-if` bound to a user setting.

**Relevant files**
- pv-spa/src/components/BulkUploadJobs.vue — primary file to edit (the two-column monitor layout).
- pv-spa/src/components/UploadProgress.vue — per-job UI (keep unchanged).
- pv-spa/src/services/uploadMonitor.js — monitoring service (no changes required).
- pv-spa/src/services/userSettings.js — controls user toggles (no changes required).

**Verification**
1. Open the Monitor page in the running dev server and confirm only the Temporal Bulk Workflows panel appears.
2. Confirm no console errors in the browser devtools related to missing refs or undefined variables.
3. Run `npm run lint` (if available) to check for unused-import warnings related to the commented-out panel.

**Decisions / Assumptions**
- Using HTML comments keeps the code visible and restorable; if the template compiler strips comments or causes issues, the fallback is `<template v-if="false">`.
- No code deletion will be performed; imports and services remain intact to avoid side effects.

**Further Considerations**
1. If linting flags unused imports after hiding the panel, you can either keep them (harmless) or comment out the related imports too (also with markers).
2. If you later want a runtime toggle, I recommend wiring `v-if="useUserSettings.monitorNonBulkUploads"` and exposing the toggle in Settings.
