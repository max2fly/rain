import { findByProps } from "@metro";
import { MessageStore } from "@metro/common/stores";

import { GHOST_ID_BASE } from "./constants";
import { channelsWithGhosts, ghostParent } from "./state";
import { getChannelHistory } from "./store";

const FluxDispatcher = findByProps("dispatch", "_subscriptions");
const RERENDER_FLAG = 1 << 23; // toggled to force a MessageStore commit (new ref) → re-render

// Incremented each rebuild and baked into ghost flags so RowManager (which caches rows by
// id) re-generates them — needed when only the ghost's COLOR changes (e.g. highlight toggle),
// since id + content are unchanged.
let rebuildNonce = 0;

// emitChange() doesn't re-render (the collection ref is unchanged after in-place mutation).
// A flag-bit toggle on the parent forces the store to commit a NEW collection — which is
// cloned from the (ghost-containing) _array — so the list re-runs createRows. (Same trick
// the delete path uses.)
function forceRerender(parentRecord: any): void {
    try {
        if (!parentRecord || !FluxDispatcher) return;
        FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            rainBypass: true,
            message: { ...parentRecord, flags: (parentRecord.flags || 0) ^ RERENDER_FLAG },
        });
    } catch {
        /* ignore */
    }
}

// Build a synthetic "ghost" MessageRecord for an old version, cloned from the parent
// record (preserves author/timestamp/type so it groups as a continuation). offset =
// how far before the parent (1 = closest/newest-old, N = furthest/oldest).
function makeGhostRecord(parentRecord: any, oldContent: string, offset: number): any {
    const ghostId = String(BigInt(parentRecord.id) - BigInt(offset));
    ghostParent.set(ghostId, String(parentRecord.id));
    let g = parentRecord.set("id", ghostId).set("content", oldContent).set("editedTimestamp", null)
        .set("flags", ((parentRecord.flags || 0) & 0xFFFFFF) | ((rebuildNonce & 0x7F) << 24));
    try {
        g = g.set("embeds", []).set("attachments", []).set("components", []);
    } catch {
        /* some fields may be immutable-typed; ignore */
    }
    return g;
}

// Raw-API ghost (for splicing into LOAD_MESSAGES_SUCCESS.messages, which are raw).
export function makeGhostRaw(parentRaw: any, oldContent: string, offset: number): any {
    const ghostId = String(BigInt(parentRaw.id) - BigInt(offset));
    ghostParent.set(ghostId, String(parentRaw.id));
    return {
        ...parentRaw,
        id: ghostId,
        content: oldContent,
        edited_timestamp: null,
        embeds: [],
        attachments: [],
        reactions: [],
        components: [],
    };
}

// Remove this parent's ghost records from the live collection + registry (no emit).
function clearGhosts(coll: any, parentId: string): void {
    const gids = [...ghostParent.entries()].filter(([, pid]) => pid === parentId).map(([gid]) => gid);
    if (!gids.length) return;
    coll._array = coll._array.filter((r: any) => !gids.includes(String(r.id)));
    for (const gid of gids) {
        delete coll._map[gid];
        ghostParent.delete(gid);
    }
}

// Rebuild all ghost rows for a message from its stored edit history and re-render locally.
export function rebuildGhosts(channelId: string, parentId: string): void {
    try {
        rebuildNonce = (rebuildNonce + 1) & 0x7F;
        const coll: any = MessageStore.getMessages?.(channelId);
        if (!coll?._array || !coll._map) return;

        clearGhosts(coll, parentId);

        const parentRecord = coll._map[parentId];
        const rec = getChannelHistory(channelId).edited.find(e => e.currentMessageId === parentId);
        const hist = rec?.editHistory ?? [];

        let ghosts: any[] = [];
        if (parentRecord && hist.length) {
            // Stable id per version (GHOST_ID_BASE - i): oldest (i=0) → largest offset →
            // smallest id → furthest up; content per id never changes → no stale row cache.
            ghosts = hist.map((e, i) => makeGhostRecord(parentRecord, e.content, GHOST_ID_BASE - i));
            const pIdx = coll._array.findIndex((r: any) => String(r.id) === parentId);
            if (pIdx !== -1) {
                coll._array.splice(pIdx, 0, ...ghosts);
                for (const g of ghosts) coll._map[g.id] = g;
                channelsWithGhosts.add(channelId);
            }
        }
        // Re-generate the parent AND each ghost row (RowManager caches per-id, and a
        // parent-only update won't re-generate the ghost rows — needed when ghost COLOR changes).
        forceRerender(parentRecord);
        for (const g of ghosts) forceRerender(g);
    } catch {
        /* ignore */
    }
}

// Remove a message's ghosts entirely (context-menu "clear history") and re-render.
export function removeGhostsFor(channelId: string, parentId: string): void {
    try {
        const coll: any = MessageStore.getMessages?.(channelId);
        if (!coll?._array) return;
        clearGhosts(coll, parentId);
        forceRerender(coll._map?.[parentId]);
    } catch {
        /* ignore */
    }
}

// Remove ALL injected ghost records from every channel's collection (plugin stop), so the
// synthetic rows don't linger as if they were real messages.
export function removeAllGhosts(): void {
    const ghostIds = new Set([...ghostParent.keys()]);
    if (!ghostIds.size) return;
    for (const channelId of [...channelsWithGhosts]) {
        try {
            const coll: any = MessageStore.getMessages?.(channelId);
            if (!coll?._array) continue;
            const anyReal = coll._array.find((r: any) => !ghostIds.has(String(r.id)));
            coll._array = coll._array.filter((r: any) => !ghostIds.has(String(r.id)));
            for (const gid of ghostIds) delete coll._map[gid];
            forceRerender(anyReal);
        } catch {
            /* ignore */
        }
    }
}
