// MessageLogger shared constants.

// Content colors (applied via ReactNative.processColor in the render patch).
export const COLORS = {
    deleted: "#f04747", // deleted message text
    ghost: "#949ba4", // edit-history ghost (normal)
    ghostDeleted: "#a84444", // edit-history ghost whose parent message is deleted
} as const;

// An otherwise-unused high flag bit. OR-ing it onto a message's flags produces a
// real diff so MessageStore commits a forced MESSAGE_UPDATE and the row regenerates.
export const DELETED_MARKER_FLAG = 1 << 22;

// Event type we swap a swallowed MESSAGE_DELETE to, so no store removes the message.
export const NOOP_EVENT_TYPE = "MESSAGE_LOGGER_SWALLOW_NOOP";

// Ghost (edit-history) row ids are `parentId - (GHOST_ID_BASE - versionIndex)`, so each
// edit version gets a STABLE unique id (its content never changes) — avoiding RowManager's
// per-id row cache returning a stale version. Oldest version has the smallest id (renders
// furthest up). MAX_EDIT_HISTORY must stay below GHOST_ID_BASE so offsets stay positive and
// below the parent (snowflake gaps to the previous message are far larger, so no collision).
export const GHOST_ID_BASE = 100;
export const MAX_EDIT_HISTORY = 90;
