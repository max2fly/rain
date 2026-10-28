import { before } from "@api/patcher";
import { findByProps } from "@metro";
import { MessageStore } from "@metro/common/stores";

import { rebuildGhosts } from "../ghosts";
import { shouldIgnore } from "../lib/filters";
import { useMessageLoggerSettings } from "../storage";
import { recordEdit } from "../store";

const FluxDispatcher = findByProps("dispatch", "_subscriptions");

// On a real edit: record the old content, then rebuild that message's gray ghost rows
// from the full edit history and re-render locally (no refetch).
export function patchEdit(): () => void {
    if (!FluxDispatcher) return () => {};

    return before("dispatch", FluxDispatcher, (args: any[]) => {
        try {
            const ev = args[0];
            if (ev?.type !== "MESSAGE_UPDATE" || !ev.message || ev.rainBypass) return args;
            if (!useMessageLoggerSettings.getState().edited?.enabled) return args;

            const m = ev.message;
            const chId = m.channel_id;
            const prev = MessageStore.getMessage?.(chId, m.id);
            const oldContent = prev?.content;
            if (typeof oldContent !== "string" || typeof m.content !== "string") return args;
            if (!oldContent.length || oldContent === m.content) return args;
            if (shouldIgnore(m, "edit")) return args;

            recordEdit(chId, m, oldContent);
            // let the MESSAGE_UPDATE apply first, then rebuild ghosts from the stored history
            setTimeout(() => rebuildGhosts(chId, String(m.id)), 0);
        } catch {
            /* ignore */
        }
        return args;
    });
}
