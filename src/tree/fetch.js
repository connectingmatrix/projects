"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFetchUserTree = runFetchUserTree;
const fetchUserTree_1 = require("@gigav2/services/giga/tree/fetchUserTree");
const types_1 = require("./types");
const resolve_1 = require("./shared/resolve");
async function runFetchUserTree(runtime, input) {
    var _a, _b, _c;
    await (0, resolve_1.requireCapability)(runtime, 'CAN_READ_CHANNEL', 'channel read');
    const tree = await (0, fetchUserTree_1.fetchUserTree)(runtime.supabase, {
        userPermissionsId: runtime.userId,
        rootId: (0, resolve_1.optionalText)(input, 'root_id') || null,
        organizationId: (0, resolve_1.optionalText)(input, 'organization_id') || null,
    });
    const count = (((_a = tree.user) === null || _a === void 0 ? void 0 : _a.length) || 0) + (((_b = tree.organization) === null || _b === void 0 ? void 0 : _b.length) || 0) + (((_c = tree.global) === null || _c === void 0 ? void 0 : _c.length) || 0);
    return { summary: `Fetched ${count} tree root(s).`, data: { tree }, ...types_1.emptyActionArtifacts };
}
