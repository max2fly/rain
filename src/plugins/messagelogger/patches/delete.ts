import { before } from "@api/patcher";
import { findByProps } from "@metro";
import { MessageStore } from "@metro/common/stores";

import { DELETED_MARKER_FLAG, NOOP_EVENT_TYPE } from "../constants";
import { rebuildGhosts } from "../ghosts";
import { shouldIgnore } from "../lib/filters";
import { cacheMessage, deletedIds, getCached } from "../state";
import { useMessageLoggerSettings } from "../storage";
import { recordDeleted } from "../store";

const FluxDispatcher = findByProps("dispatch", "_subscriptions");

// Record + keep a single deleted message. Returns true if we're keeping it
// (so the caller swallows the delete). Idempotent across the double MESSAGE_DELETE.
function keep(channelId: string, id: string): boolean {
    if (deletedIds.has(id)) return true;

    const msg = MessageStore.getMessage?.(channelId, id);
    if (!msg) return false;
    if (msg.state !== "SENT") return false; // leave failed/sending/local deletes alone
    if (shouldIgnore(msg, "delete")) return false;

    const raw = getCached(id)?.raw ?? msg;
    recordDeleted(channelId, raw);
    cacheMessage(raw);
    deletedIds.add(id);

    // A flag-bit diff forces MessageStore to commit → the row regenerates → red applies.
    // rebuildGhosts re-inserts any edit-history ghosts so they re-generate → dark red.
    setTimeout(() => {
        try {
            FluxDispatcher.dispatch({
                type: "MESSAGE_UPDATE",
                rainBypass: true,
                message: { ...msg, flags: (msg.flags || 0) | DELETED_MARKER_FLAG },
            });
            rebuildGhosts(channelId, id);
        } catch {
            /* ignore */
        }
    }, 50);

    return true;
}

export function patchDelete(): () => void {
    if (!FluxDispatcher) return () => {};

    return before("dispatch", FluxDispatcher, (args: any[]) => {
        try {
            const ev = args[0];
            if (!ev || ev.rainBypass) return args;
            if (!useMessageLoggerSettings.getState().deleted?.enabled) return args;

            if (ev.type === "MESSAGE_DELETE") {
                if (keep(ev.channelId, ev.id)) args[0] = { type: NOOP_EVENT_TYPE };
            } else if (ev.type === "MESSAGE_DELETE_BULK" && Array.isArray(ev.ids)) {
                const kept = ev.ids.filter((id: string) => keep(ev.channelId, id));
                if (kept.length === ev.ids.length) {
                    args[0] = { type: NOOP_EVENT_TYPE };
                } else if (kept.length) {
                    // let the non-kept ids delete; drop the kept ones from the bulk event
                    args[0] = { ...ev, ids: ev.ids.filter((id: string) => !kept.includes(id)) };
                }
            }
        } catch {
            /* ignore */
        }
        return args;
    });
}
