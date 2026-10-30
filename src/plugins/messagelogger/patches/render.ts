import { after } from "@api/patcher";
import { findByName } from "@metro";
import { ReactNative } from "@metro/common";

import { COLORS, MESSAGE_TYPE_DEFAULT, MESSAGE_TYPE_REPLY } from "../constants";
import { deletedIds, ghostParent, highlightOff } from "../state";

const RowManager = findByName("RowManager");

function hasAttachments(m: any): boolean {
    return Array.isArray(m?.attachments) && m.attachments.length > 0;
}

// Is this ghost the oldest version in its stack? (Oldest = smallest id among the parent's
// ghosts — it renders furthest up and is the row that keeps the reply header.)
function isOldestGhost(ghostId: string, parentId: string): boolean {
    let min: bigint | null = null;
    for (const [gid, pid] of ghostParent) {
        if (pid !== parentId) continue;
        const n = BigInt(gid);
        if (min === null || n < min) min = n;
    }
    try {
        return min !== null && BigInt(ghostId) === min;
    } catch {
        return false;
    }
}

// Does this (live) message id have any edit-history ghosts pointing at it?
function hasGhosts(parentId: string): boolean {
    for (const pid of ghostParent.values()) if (pid === parentId) return true;
    return false;
}

// Render this row (output view object) as a grouped continuation line — matching the exact
// shape Discord gives a real continuation: no header (avatar/name/timestamp) and no reply
// reference. Render-only; the stored record is untouched.
function collapseToContinuation(m: any): void {
    m.isFirst = false;
    m.avatarURL = null;
    m.timestamp = null;
    if (m.type === MESSAGE_TYPE_REPLY) {
        m.type = MESSAGE_TYPE_DEFAULT;
        m.referencedMessage = null;
    }
}

export function patchRender(): () => void {
    if (!RowManager) return () => {};

    // Row background highlight style for deleted messages with attachments (the base logger's
    // mark — inline media can't be dimmed/grayed). Colors are processColor ints (the native
    // row bridge rejects string/other-typed colors).
    // Red row highlight (same shape Discord uses for @mentions): translucent fill + left gutter.
    const DELETED_HIGHLIGHT = {
        backgroundColor: ReactNative.processColor("rgba(240,71,71,0.15)"),
        gutterColor: ReactNative.processColor(COLORS.deleted),
    };

    const unpatches: Array<() => void> = [];

    // Text coloring: deleted red; edit-history ghost gray (or dark red when its parent is
    // deleted). Deleted messages WITH attachments also get a red row background highlight
    // (inline media can't be dimmed) via the native BackgroundHighlight object.
    unpatches.push(after("generate", RowManager.prototype, (args: any[], ret: any) => {
        try {
            const inRow = args[0];
            if (inRow?.rowType !== 1) return;
            const outMsg = ret?.message;
            if (!outMsg) return;

            const id = String(outMsg.id ?? inRow.message?.id ?? "");
            if (!id) return;

            if (deletedIds.has(id) && !highlightOff.has(id)) {
                outMsg.textColor = ReactNative.processColor(COLORS.deleted);
                if (hasAttachments(inRow.message)) {
                    ret.backgroundHighlight = DELETED_HIGHLIGHT;
                }
            }

            if (ghostParent.has(id)) {
                const parentId = ghostParent.get(id)!;
                const darkRed = deletedIds.has(parentId) && !highlightOff.has(parentId);
                outMsg.textColor = ReactNative.processColor(darkRed ? COLORS.ghostDeleted : COLORS.ghost);

                // Collapse every ghost except the oldest into a grouped continuation line, so the
                // single author header + reply reference render once, on the top (oldest) row.
                if (!isOldestGhost(id, parentId)) {
                    collapseToContinuation(outMsg);
                }
            } else if (hasGhosts(id)) {
                // The live message of an edit stack collapses into a continuation line too, so it
                // joins the group beneath its ghosts (its reactions are left intact).
                collapseToContinuation(outMsg);
            }
        } catch {
            /* never break rendering */
        }
    }));

    return () => {
        for (const u of unpatches) u();
    };
}
