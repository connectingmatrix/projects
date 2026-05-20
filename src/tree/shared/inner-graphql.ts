import { GraphQLOperationType, getCustomResolvers } from '@connectingmatrix/graphql-parser';
import { Request } from 'express';
import { BadRequestError } from 'routing-controllers';
import { Container } from 'typedi';
import { runResolverAccessMiddleware } from '@gigav2/manifest/manifest';
import { withEntityRequestContext } from '@gigav2/services/graphql/entity-request-context';
import type { AgentActionRuntime } from '@gigav2/types/agent.types';
import type { GraphqlProxyBody, GraphqlResolverContext } from '@gigav2/types/graphql.types';

type ResolverFn = (root: unknown, payload: Record<string, unknown>, context: GraphqlResolverContext, info: unknown) => unknown | Promise<unknown>;
type RequestWithGraphql = Request & { context?: unknown; effectiveRoot?: boolean };

let resolverMaps: { query: Record<string, ResolverFn>; mutation: Record<string, ResolverFn> } | null = null;

const graphqlContext = (runtime: AgentActionRuntime, operationName: string, payload: Record<string, unknown>): GraphqlResolverContext => {
  const request = runtime.request as RequestWithGraphql;
  const body: GraphqlProxyBody = { operationName, query: '', variables: payload };
  return {
    request,
    supabase: runtime.supabase,
    body,
    graphqlContext: (request?.context as GraphqlResolverContext['graphqlContext']) || null,
    userId: runtime.userId || null,
    effectiveRoot: request?.effectiveRoot === true,
  };
};

const resolveMap = async (operationType: GraphQLOperationType) => {
  if (!resolverMaps) {
    const { FactoryService } = await import('@gigav2/services/graphql/factory.service');
    const factory = Container.get(FactoryService);
    resolverMaps = {
      query: getCustomResolvers(factory, GraphQLOperationType.QUERY) as Record<string, ResolverFn>,
      mutation: getCustomResolvers(factory, GraphQLOperationType.MUTATION) as Record<string, ResolverFn>,
    };
  }
  return operationType === GraphQLOperationType.QUERY ? resolverMaps.query : resolverMaps.mutation;
};

async function executeGraphqlOperation<T>(
  operationType: GraphQLOperationType,
  operationName: string,
  runtime: AgentActionRuntime,
  payload: Record<string, unknown>,
) {
  const resolver = (await resolveMap(operationType))[operationName];
  if (!resolver) throw new BadRequestError(`Unsupported inner graphql operation "${operationName}".`);
  const context = graphqlContext(runtime, operationName, payload);
  await runResolverAccessMiddleware(operationName, context, payload);
  return withEntityRequestContext(context, payload, async () => (await resolver({}, payload, context, {})) as T);
}

export const executeTreeQuery = <T>(runtime: AgentActionRuntime, operationName: string, payload: Record<string, unknown>) =>
  executeGraphqlOperation<T>(GraphQLOperationType.QUERY, operationName, runtime, payload);

export const executeTreeMutation = <T>(runtime: AgentActionRuntime, operationName: string, payload: Record<string, unknown>) =>
  executeGraphqlOperation<T>(GraphQLOperationType.MUTATION, operationName, runtime, payload);

export const executeTreeOrm = <T>(
  runtime: AgentActionRuntime,
  operationName: string,
  payload: Record<string, unknown>,
  callback: () => Promise<T> | T,
) => withEntityRequestContext(graphqlContext(runtime, operationName, payload), payload, callback);
