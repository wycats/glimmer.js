import { SourceLocation, SourcePosition } from '@glimmer/syntax';
import { positionToOffset } from '../location';
import { SourceOffsets } from './location';
import { LocatedWithOffsets, LocatedWithPositions } from './ops';

export type OpsTable<O extends Op> = {
  [P in O['name']]: O extends { name: P } ? O : never;
};

export abstract class Op<Args = unknown> {
  abstract readonly name: string;
  constructor(readonly offsets: SourceOffsets | null, readonly args: Args) {}
}

export type OpName<O extends Op> = O['name'];
export type OpArgs<O extends Op> = O extends Op<infer Args> ? Args : never;
export type InputOpArgs<O extends Op<any>> = O extends Op<infer Args>
  ? Args extends void
    ? []
    : [Args]
  : never;

export function toArgs<O extends Op>(args: InputOpArgs<O>): OpArgs<O> {
  if ((args as any).length === 0) {
    return undefined as OpArgs<O>;
  } else {
    return args[0] as OpArgs<O>;
  }
}

export type OpConstructor<O extends Op> = O extends Op<infer Args>
  ? {
      new (offsets: SourceOffsets | null, args: Args): O;
    }
  : never;

export function op<N extends string>(
  name: N
): {
  args: <Args>() => OpConstructor<Op<Args> & { name: N }>;
  void(): OpConstructor<Op<void> & { name: N }>;
} {
  return {
    args: <Args>() =>
      class extends Op<Args> {
        readonly name: N = name;
      },

    void: () =>
      class extends Op<void> {
        readonly name: N = name;
      },
  };
}

export function range(
  first: SourcePosition,
  last: SourcePosition,
  source: string
): SourceOffsets | null {
  let start = positionToOffset(source, { line: first.line, column: first.column });
  let end = positionToOffset(source, { line: last.line, column: last.column });

  if (start === null || end === null) {
    return null;
  } else {
    return { start, end };
  }
}

export class UnlocatedOp<O extends Op> {
  constructor(private Class: OpConstructor<O>, private args: OpArgs<O>, private source: string) {}

  loc(
    location:
      | SourceLocation
      | LocatedWithPositions
      | [LocatedWithPositions, ...LocatedWithPositions[]]
  ): O {
    if (Array.isArray(location)) {
      let first = location[0];
      let last = location[location.length - 1];

      return new this.Class(range(first.loc.start, last.loc.end, this.source), ...this.args);
    } else {
      let loc = 'loc' in location ? location.loc : location;
      return new this.Class(range(loc.start, loc.end, this.source), ...this.args);
    }
  }

  offsets(
    location:
      | SourceOffsets
      | LocatedWithOffsets
      | [LocatedWithOffsets, ...LocatedWithOffsets[]]
      | null
  ): O {
    if (location !== null) {
      if ('offsets' in location) {
        return new this.Class(this.args, location.offsets);
      } else if (Array.isArray(location)) {
        let start = location[0];
        let end = location[location.length - 1];

        let startOffset = start.offsets.start;
        let endOffset = end.offsets.end;

        return new this.Class(this.args, { start: startOffset, end: endOffset });
      } else {
        return new this.Class(this.args, location);
      }
    } else {
      return new this.Class(this.args, null);
    }
  }
}
