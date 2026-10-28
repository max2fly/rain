import { after } from "@api/patcher";
import { findByName } from "@metro";
import { ReactNative } from "@metro/common";

import { COLORS } from "../constants";
import { deletedIds, ghostParent, highlightOff } from "../state";

const RowManager = findByName("RowManager");

function hasAttachments(m: any): boolean {
    return Array.isArray(m?.attachments) && m.attachments.length > 0;
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
            }
        } catch {
            /* never break rendering */
        }
    }));

    return () => {
        for (const u of unpatches) u();
    };
}
