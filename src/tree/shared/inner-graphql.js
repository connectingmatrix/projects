"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTreeOrm = exports.executeTreeMutation = exports.executeTreeQuery = void 0;
const graphql_parser_1 = require("@connectingmatrix/graphql-parser");
const routing_controllers_1 = require("routing-controllers");
const typedi_1 = require("typedi");
const manifest_1 = require("@gigav2/manifest/manifest");
const entity_request_context_1 = require("@gigav2/services/graphql/entity-request-context");
let resolverMaps = null;
const graphqlContext = (runtime, operationName, payload) => {
    const request = runtime.request;
    const body = { operationName, query: '', variables: payload };
    return {
        request,
        supabase: runtime.supabase,
        body,
        graphqlContext: (request === null || request === void 0 ? void 0 : request.context) || null,
        userId: runtime.userId || null,
        effectiveRoot: (request === null || request === void 0 ? void 0 : request.effectiveRoot) === true,
    };
};
const resolveMap = async (operationType) => {
    if (!resolverMaps) {
        const { FactoryService } = await Promise.resolve().then(() => __importStar(require('@gigav2/services/graphql/factory.service')));
        const factory = typedi_1.Container.get(FactoryService);
        resolverMaps = {
            query: (0, graphql_parser_1.getCustomResolvers)(factory, graphql_parser_1.GraphQLOperationType.QUERY),
            mutation: (0, graphql_parser_1.getCustomResolvers)(factory, graphql_parser_1.GraphQLOperationType.MUTATION),
        };
    }
    return operationType === graphql_parser_1.GraphQLOperationType.QUERY ? resolverMaps.query : resolverMaps.mutation;
};
async function executeGraphqlOperation(operationType, operationName, runtime, payload) {
    const resolver = (await resolveMap(operationType))[operationName];
    if (!resolver)
        throw new routing_controllers_1.BadRequestError(`Unsupported inner graphql operation "${operationName}".`);
    const context = graphqlContext(runtime, operationName, payload);
    await (0, manifest_1.runResolverAccessMiddleware)(operationName, context, payload);
    return (0, entity_request_context_1.withEntityRequestContext)(context, payload, async () => (await resolver({}, payload, context, {})));
}
const executeTreeQuery = (runtime, operationName, payload) => executeGraphqlOperation(graphql_parser_1.GraphQLOperationType.QUERY, operationName, runtime, payload);
exports.executeTreeQuery = executeTreeQuery;
const executeTreeMutation = (runtime, operationName, payload) => executeGraphqlOperation(graphql_parser_1.GraphQLOperationType.MUTATION, operationName, runtime, payload);
exports.executeTreeMutation = executeTreeMutation;
const executeTreeOrm = (runtime, operationName, payload, callback) => (0, entity_request_context_1.withEntityRequestContext)(graphqlContext(runtime, operationName, payload), payload, callback);
exports.executeTreeOrm = executeTreeOrm;
