import { SupabaseClient } from '@supabase/supabase-js';
import { GraphEntity } from '@gigav2/repositories/GraphEntity';
import { GRAPH_LABELS, GraphCommitOptions, GraphRelationDirection, GraphRelationToken } from '@gigav2/types/graph.types';
import { deleteAiCategoryBranch, deleteAiChannelBranch } from '../deleteOwnedBranch';
import type { DataRecord } from '@gigav2/types/graph.types';

export class TreeEntity<TNode extends DataRecord> extends GraphEntity<TNode> {
  protected async beforeCommit() {
    await Promise.resolve();
  }

  protected async checkAlreadyExist() {
    await Promise.resolve();
  }

  protected async afterCommit() {
    await Promise.resolve();
  }

  public async commit(options: GraphCommitOptions = {}) {
    await this.beforeCommit();
    await this.checkAlreadyExist();
    await super.commit(options);
    await this.afterCommit();
    return this;
  }

  public async find() {
    return this.load();
  }

  public async create(payload: Partial<TNode>) {
    this.parse(payload);
    await this.commit();
    return this.load();
  }

  public async update(payload: Partial<TNode>) {
    const current = await this.load();
    if (!current) throw new Error(`${this.type} ${this.id} was not found.`);
    this.populate({ ...current, ...payload });
    await this.commit({ includeRelations: false });
    return this.load();
  }

  public async link(target: GraphEntity<DataRecord>, relation: GraphRelationToken, direction: GraphRelationDirection = 'out') {
    this.createRelation(target, { relation, direction, properties: { updatedAt: new Date().toISOString() } });
    await this.commit();
    return true;
  }

  public async unlink(target: GraphEntity<DataRecord>, relation: GraphRelationToken, direction: GraphRelationDirection = 'out') {
    return this.deleteRelation(target, { relation, direction });
  }

  public async deleteOwnedBranch(supabase: SupabaseClient, userPermissionsId: string) {
    if (this.type === GRAPH_LABELS.channel) return deleteAiChannelBranch(supabase, { channelId: this.id, userPermissionsId });
    if (this.type === GRAPH_LABELS.category) return deleteAiCategoryBranch(supabase, { categoryId: this.id, userPermissionsId });
    throw new Error(`deleteOwnedBranch is not supported for ${this.type}.`);
  }
}
