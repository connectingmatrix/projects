import { getENTITY, getFIELDFields } from '@gigav2/repositories/GraphEntityDecorator';

type EntityRecord = Record<string, unknown>;

export abstract class BaseEntity<TPayload extends EntityRecord, TResult = TPayload> {
  protected record: Partial<TPayload> = {};

  protected supabase: any = null;

  protected parse(input: TPayload): this {
    const fields = getFIELDFields(this);
    const allowed = new Set(Object.keys(fields));
    for (const key of Object.keys(input || {})) {
      if (!allowed.has(key)) throw new Error(`Invalid field "${key}" for ${this.constructor.name}.`);
      const field = key as keyof TPayload;
      this.record[field] = input[field];
    }
    return this;
  }

  protected extract(): TPayload {
    const payload = {} as TPayload;
    for (const field of Object.keys(getFIELDFields(this))) {
      const value = this.record[field as keyof TPayload];
      if (value === undefined) continue;
      payload[field as keyof TPayload] = value as TPayload[keyof TPayload];
    }
    return payload;
  }

  protected bind(supabase: any): this {
    this.supabase = supabase;
    return this;
  }

  protected tableName(): string {
    const options = getENTITY(this);
    return String(options.table || options.label || '').trim();
  }

  protected relationSelect(): string {
    const fields = getFIELDFields(this);
    const relations = Object.entries(fields)
      .filter(([, options]) => options.type === 'relation')
      .map(([field]) => `${field}(*)`);
    return ['*', ...relations].join(',');
  }

  protected valid(payload: TPayload): true {
    for (const [field, options] of Object.entries(getFIELDFields(this))) {
      if (options.required !== true) continue;
      const value = payload[field];
      if (value === null || value === undefined || value === '') throw new Error(`${this.constructor.name}.${field} is required.`);
    }
    return true;
  }

  protected async beforeCommit(_payload: TPayload) {}

  protected async checkAlreadyExist(_payload: TPayload) {}

  protected async afterCommit(_result: TResult, _payload: TPayload) {}

  protected abstract commit(payload: TPayload): Promise<TResult>;

  public async create(input: TPayload): Promise<TResult> {
    this.parse(input);
    const payload = this.extract();
    this.valid(payload);
    await this.beforeCommit(payload);
    await this.checkAlreadyExist(payload);
    const result = await this.commit(payload);
    await this.afterCommit(result, payload);
    return result;
  }

  public async createRow(input: TPayload): Promise<TResult> {
    const table = this.tableName();
    if (!table) throw new Error(`${this.constructor.name} is missing @ENTITY({ table }).`);
    if (!this.supabase) throw new Error(`${this.constructor.name}.bind(supabase) is required.`);
    this.parse(input);
    const payload = this.extract();
    this.valid(payload);
    const { data, error } = await this.supabase.from(table).insert(payload).select(this.relationSelect()).single();
    if (error) throw error;
    return data as TResult;
  }

  public async findRowById(id: string): Promise<TResult | null> {
    const table = this.tableName();
    if (!table) throw new Error(`${this.constructor.name} is missing @ENTITY({ table }).`);
    if (!this.supabase) throw new Error(`${this.constructor.name}.bind(supabase) is required.`);
    const { data, error } = await this.supabase.from(table).select(this.relationSelect()).eq('id', id).maybeSingle();
    if (error) throw error;
    return (data || null) as TResult | null;
  }

  public async updateRow(id: string, input: Partial<TPayload>): Promise<TResult> {
    const table = this.tableName();
    if (!table) throw new Error(`${this.constructor.name} is missing @ENTITY({ table }).`);
    if (!this.supabase) throw new Error(`${this.constructor.name}.bind(supabase) is required.`);
    const payload = {} as TPayload;
    for (const field of Object.keys(getFIELDFields(this))) {
      const value = input[field as keyof TPayload];
      if (value === undefined) continue;
      payload[field as keyof TPayload] = value as TPayload[keyof TPayload];
    }
    const { data, error } = await this.supabase.from(table).update(payload).eq('id', id).select(this.relationSelect()).single();
    if (error) throw error;
    return data as TResult;
  }

  public async deleteRow(id: string): Promise<boolean> {
    const table = this.tableName();
    if (!table) throw new Error(`${this.constructor.name} is missing @ENTITY({ table }).`);
    if (!this.supabase) throw new Error(`${this.constructor.name}.bind(supabase) is required.`);
    const { error } = await this.supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    return true;
  }
}
