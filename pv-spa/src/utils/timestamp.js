const ISO_WITH_OFFSET_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const isValidDate = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Formats timestamps while preserving the original timezone offset's wall-clock time.
 * Example: "2025-12-11T08:56:30+03:00" -> "11/12/2025 08:56"
 */
export const formatMetadataTimestamp = (timestamp) => {
  if (!timestamp) return "No date";

  const match = String(timestamp).match(ISO_WITH_OFFSET_PATTERN);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${day}/${month}/${year} ${hour}:${minute}`;
  }

  const parsedDate = new Date(timestamp);
  if (!isValidDate(parsedDate)) {
    return "Invalid date";
  }

  return (
    parsedDate.toLocaleDateString("en-GB") +
    " " +
    parsedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
};

export const toDatetimeLocalPreservingOffset = (timestamp) => {
  if (!timestamp) return "";

  const match = String(timestamp).match(ISO_WITH_OFFSET_PATTERN);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  const parsedDate = new Date(timestamp);
  if (!isValidDate(parsedDate)) return "";

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  const hours = String(parsedDate.getHours()).padStart(2, "0");
  const minutes = String(parsedDate.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const fromDatetimeLocalPreservingOffset = (datetimeLocal, originalTimestamp) => {
  if (!datetimeLocal) return "";

  const originalMatch = String(originalTimestamp || "").match(ISO_WITH_OFFSET_PATTERN);
  if (originalMatch) {
    const offset = originalMatch[6];
    return `${datetimeLocal}:00${offset}`;
  }

  const parsedDate = new Date(datetimeLocal);
  if (!isValidDate(parsedDate)) return "";
  return parsedDate.toISOString();
};
