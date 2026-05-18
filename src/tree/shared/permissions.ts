import 'reflect-metadata';
import { AgentActionCapability, AgentActionRuntime } from '@gigav2/types/agent.types';
import { requireCapability } from './resolve';

export const PERMISSION_MATRIX = {
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
} as const;

export function permission(capability: AgentActionCapability): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as ((runtime: AgentActionRuntime, ...args: any[]) => Promise<unknown>) | undefined;
    if (typeof original !== 'function') throw new Error(`@permission can be used only on methods. Received ${String(propertyKey)}.`);
    descriptor.value = async function (...args: any[]) {
      const runtime = args[0] as AgentActionRuntime;
      await requireCapability(runtime, capability, String(capability));
      return original.apply(this, args);
    };
    return descriptor;
  };
}
