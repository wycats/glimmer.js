import { AST } from '@glimmer/syntax';
import { assert } from '@glimmer/util';
import { positionToOffset } from '../location';
import { isPresent } from './is-node';

export interface SourceOffsets {
  start: number;
  end: number;
}

function sourceOffsets(
  node: AST.BaseNode | [AST.BaseNode, ...AST.BaseNode[]],
  source: string
): SourceOffsets {
  if (Array.isArray(node)) {
    let start = node[0];
    let end = node[node.length - 1];

    let startOffset = sourceOffsets(start, source)?.start;
    let endOffset = sourceOffsets(end, source)?.start;

    assert(
      startOffset !== undefined && endOffset !== undefined,
      `unexpectedly missing source offsets`
    );

    return {
      start: startOffset,
      end: endOffset,
    };
  }

  let loc = node.loc;

  let { start, end } = loc;
  let startOffset = positionToOffset(source, { line: start.line - 1, column: start.column });

  // TODO: Is it important to support buggy transformations? Should we have a strict mode to start ferreting them out?
  // assert(
  //   startOffset !== null,
  //   `unexpected offset (${start.line}:${start.column}) that didn't correspond to a source location`
  // );
  let endOffset = positionToOffset(source, { line: end.line - 1, column: end.column });
  // assert(
  //   endOffset !== null,
  //   `unexpected offset (${end.line}:${end.column}) that didn't correspond to a source location`
  // );

  if (startOffset === null || endOffset === null) {
    return null;
  }

  return {
    start: startOffset,
    end: endOffset,
  };
}

export function paramsOffsets(
  { path, params }: { path: AST.Expression; params: AST.Expression[] },
  source: string
): SourceOffsets {
  if (isPresent(params)) {
    return sourceOffsets(params as [AST.Expression, ...AST.Expression[]], source);
  } else {
    // position empty params after the first space after the path expression
    let pos = sourceOffsets(path, source).end + 1;
    return { start: pos, end: pos };
  }
}

export function offsetsForHashKey(pair: AST.HashPair, source: string): SourceOffsets {
  let pairLoc = sourceOffsets(pair, source);
  let valueLoc = sourceOffsets(pair.value, source);

  assert(pairLoc !== null && valueLoc !== null, `unexpected missing location in HashPair`);

  return {
    start: pairLoc.start,
    // the grammar requires `key=value` with no whitespace around the `=`
    end: valueLoc.start - 1,
  };
}
