import { WireFormat } from '@glimmer/interfaces';

export interface Check<T> {
  name: string;
  match(value: unknown): value is T;
}

export const ANY: Check<unknown> = {
  name: 'any',
  match(value: unknown): value is unknown {
    return true;
  },
};

export const EXPR: Check<WireFormat.Expression> = {
  name: 'Expression',
  match(value: unknown): value is WireFormat.Expression {
    return true;
  },
};

export const PARAMS: Check<WireFormat.Core.Params> = {
  name: 'Params',
  match(value: unknown): value is WireFormat.Core.Params {
    return true;
  },
};

export const CONCAT_PARAMS: Check<WireFormat.Core.ConcatParams> = {
  name: 'ConcatParams',
  match(value: unknown): value is WireFormat.Core.ConcatParams {
    return true;
  },
};

export const HASH: Check<WireFormat.Core.Hash> = {
  name: 'Hash',
  match(value: unknown): value is WireFormat.Core.Hash {
    return true;
  },
};

export const GET: Check<WireFormat.Get> = {
  name: 'WireFormat.Get',
  match(value: unknown): value is WireFormat.Get {
    return true;
  },
};

export const STRING: Check<string> = {
  name: 'string',
  match(value: unknown): value is string {
    return typeof value === 'string';
  },
};
