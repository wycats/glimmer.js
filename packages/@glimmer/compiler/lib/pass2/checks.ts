import { SourceSlice } from '../pass1/ops';
import * as out from './out';

export interface Check<T extends out.StackValue> {
  name: string;
  match(value: out.StackValue): value is T;
}

export const ANY: Check<out.StackValue> = {
  name: 'any',
  match(value: out.StackValue): value is out.StackValue {
    return true;
  },
};

export const EXPR: Check<out.Expr> = {
  name: 'Expr',
  match(value: out.StackValue): value is out.Expr {
    switch (value.name) {
      case 'Undefined':
      case 'Value':
      case 'GetSymbol':
      case 'GetContextualFree':
      case 'GetFree':
      case 'GetPath':
      case 'Concat':
      case 'Call':
        return true;
      default:
        return false;
    }
  },
};

export const PARAMS: Check<out.AnyParams> = {
  name: 'Params',
  match(value: out.StackValue): value is out.AnyParams {
    return value.name === 'Params' || value.name === 'EmptyParams';
  },
};

export const CONCAT_PARAMS: Check<out.Params> = {
  name: 'ConcatParams',
  match(value: out.StackValue): value is out.Params {
    return value.name === 'Params';
  },
};

export const HASH: Check<out.AnyHash> = {
  name: 'Hash',
  match(value: out.StackValue): value is out.AnyHash {
    return value.name === 'Hash' || value.name === 'EmptyHash';
  },
};

export const GET: Check<out.GetVar> = {
  name: 'GetVar',
  match(value: out.StackValue): value is out.GetVar {
    return (
      value.name === 'GetSymbol' || value.name === 'GetFree' || value.name === 'GetContextualFree'
    );
  },
};

export const STRING: Check<SourceSlice> = {
  name: 'SourceSlice',
  match(value: out.StackValue): value is SourceSlice {
    return value.name === 'SourceSlice';
  },
};
