import { before } from "@api/patcher";
import { findByProps } from "@metro";
import { MessageStore } from "@metro/common/stores";

import { ghostParent } from "../state";

const FluxDispatcher = findByProps("dispatch", "_subscriptions");

// Redirect interactions with a ghost (edit-history) row to the original message, so
// editing/replying/etc. on a ghost acts on the real message.
export function patchRedirect(): () => void {
    if (!FluxDispatcher) return () => {};

    return before("dispatch", FluxDispatcher, (args: any[]) => {
        try {
            const ev = args[0];
            if (!ev || ev.rainBypass) return args;

            // double-tap / start edit → edit the original instead of the ghost
            if (ev.type === "MESSAGE_START_EDIT" && ev.messageId && ghostParent.has(String(ev.messageId))) {
                const pid = ghostParent.get(String(ev.messageId))!;
                const parent = MessageStore.getMessage?.(ev.channelId, pid);
                if (parent) {
                    ev.messageId = pid;
                    ev.content = parent.content;
                }
            }

            // swipe / reply → reply to the original instead of the ghost
            if (ev.type === "CREATE_PENDING_REPLY" && ev.message && ghostParent.has(String(ev.message.id))) {
                const pid = ghostParent.get(String(ev.message.id))!;
                const parent = MessageStore.getMessage?.(ev.channel?.id ?? ev.channelId ?? ev.message.channel_id, pid);
                if (parent) {
                    ev.message = parent;
                }
            }
        } catch {
            /* ignore */
        }
        return args;
    });
}
