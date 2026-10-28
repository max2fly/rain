import { findAssetId } from "@api/assets";
import { after, before } from "@api/patcher";
import { findInReactTree } from "@lib/utils";
import { findByProps } from "@metro";
import { React } from "@metro/common";
import { MessageStore } from "@metro/common/stores";

import { rebuildGhosts, removeGhostsFor } from "../ghosts";
import { deletedIds, ghostParent, highlightOff } from "../state";
import { clearEdits, getChannelHistory, removeDeleted } from "../store";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
const FluxDispatcher = findByProps("dispatch", "_subscriptions");

function isEdited(channelId: string, id: string): boolean {
    return getChannelHistory(channelId).edited.some(e => e.currentMessageId === id);
}

function makeRow(label: string, iconNames: string[], onPress: () => void) {
    let icon: any;
    for (const n of iconNames) {
        icon = findAssetId(n);
        if (icon) break;
    }
    return (
        <ActionSheetRow
            label={label}
            icon={<ActionSheetRow.Icon source={icon} />}
            onPress={() => {
                LazyActionSheet.hideActionSheet?.();
                onPress();
            }}
        />
    );
}

export function patchActionSheet(): () => void {
    if (!LazyActionSheet) return () => {};

    return before("openLazy", LazyActionSheet, (args: any[]) => {
        const key = args?.[1];
        const props = args?.[2];
        if (key !== "MessageLongPressActionSheet" || !props?.message) return;

        // Redirect a ghost (edit-history) row to the original message.
        const pressedId = String(props.message.id);
        if (ghostParent.has(pressedId)) {
            const parentId = ghostParent.get(pressedId)!;
            const parent = MessageStore.getMessage?.(props.channel?.id ?? props.message.channel_id, parentId);
            if (parent) props.message = parent;
        }

        const message = props.message;
        const channelId = props.channel?.id ?? message.channel_id;
        const id = String(message.id);
        const deleted = deletedIds.has(id);
        const edited = isEdited(channelId, id);
        if (!deleted && !edited) return;

        args[0].then((instance: any) => {
            const unpatch = after("default", instance, (_: any, res: any) => {
                React.useEffect(() => () => { unpatch(); }, []);

                // Operate at the group level so we can replace all groups (deleted) or add a
                // new group below the first one (edited).
                const groups = findInReactTree(res, (x: any) => Array.isArray(x) && x[0]?.type?.name === "ActionSheetRowGroup");
                if (!groups) return;

                const clearRow = makeRow("Clear message history", ["TrashIcon", "ic_message_delete_24px", "ic_trash_filled_24px"], () => {
                    if (deleted) {
                        deletedIds.delete(id);
                        removeDeleted(channelId, id);
                        removeGhostsFor(channelId, id);
                        FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId, id, rainBypass: true });
                    } else {
                        clearEdits(channelId, id);
                        removeGhostsFor(channelId, id);
                    }
                });

                if (deleted) {
                    const toggleRow = makeRow("Toggle deleted highlight", ["EyeIcon", "ic_eye_hidden", "ic_eye"], () => {
                        if (highlightOff.has(id)) highlightOff.delete(id);
                        else highlightOff.add(id);
                        rebuildGhosts(channelId, id); // forces a re-render of the message
                    });
                    groups.splice(0, groups.length, <ActionSheetRow.Group>{toggleRow}{clearRow}</ActionSheetRow.Group>);
                } else {
                    // insert as its own group just before the last (so it sits above the
                    // "Delete message" group); only shifts that last group, not others'.
                    groups.splice(Math.max(1, groups.length - 1), 0, <ActionSheetRow.Group>{clearRow}</ActionSheetRow.Group>);
                }
            });
        });
    });
}
