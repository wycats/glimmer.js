import { SourceLocation, SourcePosition } from '@glimmer/syntax';
import { SourceOffsets } from '../../pass1/location';
import { locationToOffset } from '../location';

export type ArgsMap<K extends string> = {
  [P in K]: unknown[];
};

export type Ops<K extends string, Map extends ArgsMap<K>> = Op<K, Map> | Op<K, Map>[];

export type AllUnlocatedOps<K extends string, Map extends ArgsMap<K>> = K extends string
  ? UnlocatedOp<K, Map>
  : never;

export type AllOps<K extends string, Map extends ArgsMap<K>> = K extends string
  ? Op<K, Map>
  : never;

export class OpFactory<K extends string, Map extends ArgsMap<K>> {
  constructor(private source: string) {}

  op<N extends K>(name: N, ...args: Map[N]): UnlocatedOp<K, Map> {
    return new UnlocatedOp<K, Map>(name, args, this.source);
  }

  ops(...ops: Ops<K, Map>[]): Op<K, Map>[] {
    let out: Op<K, Map>[] = [];

    for (let op of ops) {
      if (Array.isArray(op)) {
        out.push(...op);
      } else {
        out.push(op);
      }
    }

    return out;
  }

  map<T>(input: T[], callback: (input: T) => Op<K, Map>[]): Op<K, Map>[] {
    let out = [];

    for (let v of input) {
      out.push(...callback(v));
    }

    return out;
  }
}

export type LocatedWithOffsets = { offsets: SourceOffsets };
export type LocatedWithPositions = { loc: SourceLocation };

function range(first: SourcePosition, last: SourcePosition, source: string): SourceOffsets | null {
  let start = locationToOffset(source, first.line, first.column);
  let end = locationToOffset(source, last.line, last.column);

  if (start === null || end === null) {
    return null;
  } else {
    return { start, end };
  }
}

export class UnlocatedOp<K extends string, Map extends ArgsMap<K>> {
  constructor(readonly name: K, readonly args: Map[K], private source: string) {}

  loc(
    location:
      | SourceLocation
      | LocatedWithPositions
      | [LocatedWithPositions, ...LocatedWithPositions[]]
  ): Op<K, Map> {
    if (Array.isArray(location)) {
      let first = location[0];
      let last = location[location.length - 1];

      return new Op(this.name, this.args, range(first.loc.start, last.loc.end, this.source));
    } else {
      let loc = 'loc' in location ? location.loc : location;
      return new Op(this.name, this.args, range(loc.start, loc.end, this.source));
    }
  }

  offsets(
    location:
      | SourceOffsets
      | LocatedWithOffsets
      | [LocatedWithOffsets, ...LocatedWithOffsets[]]
      | null
  ): Op<K, Map> {
    if (location !== null) {
      if ('offsets' in location) {
        return new Op(this.name, this.args, location.offsets);
      } else if (Array.isArray(location)) {
        let start = location[0];
        let end = location[location.length - 1];

        let startOffset = start.offsets.start;
        let endOffset = end.offsets.end;

        return new Op(this.name, this.args, { start: startOffset, end: endOffset });
      } else {
        return new Op(this.name, this.args, location);
      }
    } else {
      return new Op(this.name, this.args, null);
    }
  }
}

export class Op<K extends string, Map extends ArgsMap<K>> {
  constructor(readonly name: K, readonly args: Map[K], readonly loc: SourceOffsets | null) {}
}
