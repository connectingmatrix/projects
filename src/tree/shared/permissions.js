"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_MATRIX = void 0;
exports.permission = permission;
require("reflect-metadata");
const resolve_1 = require("./resolve");
exports.PERMISSION_MATRIX = {
    CHANNEL: {
        READ: 'CAN_READ_CHANNEL',
        CREATE: 'CAN_CREATE_CHANNEL',
        UPDATE: 'CAN_UPDATE_CHANNEL',
        DELETE: 'CAN_DELETE_CHANNEL',
        LINK: 'CAN_UPDATE_LINKING',
        UNLINK: 'CAN_UPDATE_LINKING',
    },
    CATEGORY: {
        READ: 'CAN_READ_CATEGORY',
        CREATE: 'CAN_CREATE_CATEGORY',
        UPDATE: 'CAN_UPDATE_CATEGORY',
        DELETE: 'CAN_DELETE_CATEGORY',
        LINK: 'CAN_UPDATE_LINKING',
        UNLINK: 'CAN_UPDATE_LINKING',
    },
    SUBJECT: {
        READ: 'CAN_READ_SUBJECT',
        CREATE: 'CAN_CREATE_SUBJECT',
        UPDATE: 'CAN_UPDATE_SUBJECT',
        DELETE: 'CAN_DELETE_SUBJECT',
        LINK: 'CAN_UPDATE_LINKING',
        UNLINK: 'CAN_UPDATE_LINKING',
    },
    POST: {
        READ: 'CAN_READ_POST',
        CREATE: 'CAN_CREATE_POST',
        UPDATE: 'CAN_UPDATE_POST',
        DELETE: 'CAN_DELETE_POST',
        LINK: 'CAN_UPDATE_LINKING',
        ATTACHMENTS: 'CAN_READ_POST',
    },
};
function permission(capability) {
    return (_target, propertyKey, descriptor) => {
        const original = descriptor.value;
        if (typeof original !== 'function')
            throw new Error(`@permission can be used only on methods. Received ${String(propertyKey)}.`);
        descriptor.value = async function (...args) {
            const runtime = args[0];
            await (0, resolve_1.requireCapability)(runtime, capability, String(capability));
            return original.apply(this, args);
        };
        return descriptor;
    };
}
