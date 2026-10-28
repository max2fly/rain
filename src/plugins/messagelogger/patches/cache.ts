import { before } from "@api/patcher";
import { findByProps } from "@metro";

import { cacheMessage } from "../state";

const FluxDispatcher = findByProps("dispatch", "_subscriptions");

// Caches raw (API-shape) messages as they arrive so delete/edit records carry a
// re-injectable raw message and old-content is available at edit time.
export function patchCache(): () => void {
    if (!FluxDispatcher) return () => {};

    return before("dispatch", FluxDispatcher, (args: any[]) => {
        try {
            const ev = args[0];
            if (!ev || ev.rainBypass) return args; // our own forced re-renders carry a camelCase record
            if (ev.type === "MESSAGE_CREATE" && ev.message) {
                cacheMessage(ev.message);
            } else if (ev.type === "MESSAGE_UPDATE" && typeof ev.message?.content === "string") {
                // keep the cached content current (so a later delete records the final edited
                // content), but ignore partial updates (e.g. embeds-only) that lack content.
                cacheMessage(ev.message);
            } else if (ev.type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(ev.messages)) {
                for (const m of ev.messages) cacheMessage(m);
            }
        } catch {
            /* ignore */
        }
        return args;
    });
}
