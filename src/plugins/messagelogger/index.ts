import { definePlugin } from "@plugins";
import { Contributors, Developers } from "@rain/Developers";

import { removeAllGhosts } from "./ghosts";
import { patchActionSheet } from "./patches/actionsheet";
import { patchCache } from "./patches/cache";
import { patchDelete } from "./patches/delete";
import { patchEdit } from "./patches/edit";
import { patchLoad } from "./patches/load";
import { patchRedirect } from "./patches/redirect";
import { patchRender } from "./patches/render";
import Settings from "./settings";
import { clearState } from "./state";
import { loadStore } from "./store";

let patches: Array<() => void> = [];

export default definePlugin({
    name: "MessageLogger",
    description: "Keeps deleted messages (red) and edit history (grayscale) visible, with optional persistence.",
    author: [Contributors.LampDelivery, Developers.kmmiio99o, { name: "max2fly", id: 236950175480807424n }],
    id: "messagelogger",
    version: "4.0.0",
    settings: Settings,
    start() {
        if (patches.length) return; // guard against double-apply
        void loadStore();
        patches.push(patchCache());
        patches.push(patchLoad());
        patches.push(patchRender());
        patches.push(patchDelete());
        patches.push(patchEdit());
        patches.push(patchActionSheet());
        patches.push(patchRedirect());
    },
    stop() {
        for (const unpatch of patches) {
            try {
                unpatch();
            } catch {
                /* ignore */
            }
        }
        patches = [];
        removeAllGhosts();
        clearState();
    },
});
