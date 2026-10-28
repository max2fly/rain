import { before } from "@api/patcher";
import { findByProps } from "@metro";

import { GHOST_ID_BASE } from "../constants";
import { makeGhostRaw } from "../ghosts";
import { channelsWithGhosts, deletedIds } from "../state";
import { getChannelHistory } from "../store";

const FluxDispatcher = findByProps("dispatch", "_subscriptions");

function toBig(id: any): bigint | null {
    try {
        return BigInt(String(id));
    } catch {
        return null;
    }
}

// On channel load, re-inject stored history for that channel: deleted messages (→ red) and
// edit-history ghosts (→ gray). This makes history survive scroll/reopen (in-memory) and,
// with persistence on, app restart. ev.messages is raw and ordered newest→oldest.
export function patchLoad(): () => void {
    if (!FluxDispatcher) return () => {};

    return before("dispatch", FluxDispatcher, (args: any[]) => {
        try {
            const ev = args[0];
            if (ev?.type !== "LOAD_MESSAGES_SUCCESS" || ev.rainBypass) return args;
            const channelId = ev.channelId;
            const msgs = ev.messages;
            if (!Array.isArray(msgs) || !msgs.length || !channelId) return args;

            const hist = getChannelHistory(channelId);
            if (!hist.deleted.length && !hist.edited.length) return args;

            const present = new Set(msgs.map((m: any) => String(m.id)));
            const nums = msgs.map((m: any) => toBig(m.id)).filter((n): n is bigint => n != null);
            if (!nums.length) return args;
            const minId = nums.reduce((a, b) => (a < b ? a : b));

            // Deleted: re-insert each deleted message at its id-ordered position; messages
            // older than the loaded page wait for the covering page.
            for (const d of hist.deleted) {
                const idStr = String(d.raw?.id);
                if (!idStr || idStr === "undefined") continue;
                if (present.has(idStr)) {
                    deletedIds.add(idStr);
                    continue;
                }
                const idn = toBig(idStr);
                if (idn == null || idn < minId) continue; // older than loaded page → covering page handles it
                // Insert at the id-ordered position (array is newest→oldest). This also handles
                // messages newer than the whole page, and keeps multiple re-injected deletes in
                // the right order regardless of deletion order.
                let at = msgs.findIndex((m: any) => {
                    const mn = toBig(m.id);
                    return mn != null && mn < idn;
                });
                if (at === -1) at = msgs.length;
                msgs.splice(at, 0, d.raw);
                present.add(idStr);
                deletedIds.add(idStr);
            }

            // Edited: add gray ghosts just before (above) each still-present current message.
            for (const e of hist.edited) {
                const pIdx = msgs.findIndex((m: any) => String(m.id) === e.currentMessageId);
                if (pIdx === -1) continue;
                const parentRaw = msgs[pIdx];
                // stable id per version (GHOST_ID_BASE - i); reversed so newest-old goes first
                // after the parent in the newest→oldest array (oldest ends up furthest up).
                const ghosts = e.editHistory.map((h, i) => makeGhostRaw(parentRaw, h.content, GHOST_ID_BASE - i)).reverse();
                const toAdd = ghosts.filter((g: any) => !present.has(String(g.id)));
                if (toAdd.length) {
                    msgs.splice(pIdx + 1, 0, ...toAdd);
                    for (const g of toAdd) present.add(String(g.id));
                    channelsWithGhosts.add(channelId);
                }
            }
        } catch {
            /* ignore */
        }
        return args;
    });
}
