import * as shared from '../shared/op';
import { OpArgs } from '../shared/op';
import { Context } from './context';
import * as out from './out';

export type Visitors<O extends { [key: string]: shared.Op }> = {
  [P in keyof O]: (args: OpArgs<O[P]>, ctx: Context) => void | out.Op | out.Op[];
};
