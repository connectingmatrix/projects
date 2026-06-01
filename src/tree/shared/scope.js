"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTreeScope = readTreeScope;
exports.sameTreeScope = sameTreeScope;
function readTreeScope(node) {
    return {
        organizationId: String((node === null || node === void 0 ? void 0 : node.organizationId) || '').trim() || null,
        createdBy: String((node === null || node === void 0 ? void 0 : node.createdBy) || '').trim() || null,
        isGlobal: (node === null || node === void 0 ? void 0 : node.isGlobal) === true,
    };
}
function sameTreeScope(leftNode, rightNode) {
    const left = readTreeScope(leftNode);
    const right = readTreeScope(rightNode);
    if (left.organizationId || right.organizationId) {
        return left.organizationId === right.organizationId;
    }
    if (left.isGlobal || right.isGlobal) {
        return left.isGlobal === right.isGlobal;
    }
    return left.createdBy === right.createdBy;
}
