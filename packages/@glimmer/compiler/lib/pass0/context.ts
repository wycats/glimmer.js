import { ExpressionContext } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { assert, NonemptyStack } from '@glimmer/util';
import { positionToOffset } from '../location';
import { isPresent } from '../pass1/is-node';
import * as pass1 from '../pass1/ops';
import { SourceOffsets } from '../shared/location';
import { InputOpArgs, OpArgs, OpConstructor, UnlocatedOp } from '../shared/op';
import { OpFactory, Ops } from '../shared/ops';
import { BlockSymbolTable, SymbolTable } from '../template-visitor';
import { CompilerHelper } from './index';

/**
 * This is the mutable state for this compiler pass.
 */
export class CompilerState {
  readonly symbols: NonemptyStack<SymbolTable> = new NonemptyStack([SymbolTable.top()]);
  private cursorCount = 0;

  cursor() {
    return `%cursor:${this.cursorCount++}%`;
  }
}

type NodeFor<N extends AST.BaseNode, K extends N['type']> = N extends { type: K } ? N : never;

type Visitors<N extends AST.BaseNode, OpKind> = {
  [P in N['type']]: (node: NodeFor<N, P>, ctx: Context) => OpKind[] | OpKind;
};

type VisitorFunc<N extends AST.BaseNode, OpKind> = (node: N, ctx: Context) => OpKind[] | OpKind;

type OneToOneVisitors<N extends AST.BaseNode, OpKind> = {
  [P in N['type']]: (node: NodeFor<N, P>, ctx: Context) => OpKind;
};

type OneToOneVisitorFunc<N extends AST.BaseNode, OpKind> = (node: N, ctx: Context) => OpKind;

function visitExpr<N extends AST.Expression, Pass1Expr>(
  visitors: OneToOneVisitors<N, Pass1Expr>,
  node: N,
  ctx: Context
): Pass1Expr {
  let f = visitors[node.type as N['type']] as OneToOneVisitorFunc<N, Pass1Expr>;
  return f(node, ctx);
}

function visit<N extends AST.BaseNode, OpKind>(
  visitors: Visitors<N, OpKind>,
  node: N,
  ctx: Context
): OpKind[] {
  let f = visitors[node.type as N['type']] as VisitorFunc<N, OpKind>;
  let result = f(node, ctx);

  if (Array.isArray(result)) {
    return result;
  } else {
    return [result];
  }
}

export type StatementVisitors = Visitors<AST.Statement, pass1.Statement>;

export interface Pass0Visitor {
  expressions: OneToOneVisitors<AST.Expression | AST.ConcatStatement, pass1.Expr>;
  statements: StatementVisitors;
}

export interface ImmutableContext {
  slice(value: string): UnlocatedOp<pass1.SourceSlice>;
}

/**
 * All state in this object except the CompilerState must be readonly.
 *
 * This object, and not a copy of it, must be passed around to helper functions. The
 * `CompilerHelper`, on the other hand, does not need to share an identity since it
 * has no mutable state at all.
 */
export class Context {
  readonly statements: StatementVisitors;
  readonly expressions: OneToOneVisitors<AST.Expression | AST.ConcatStatement, pass1.Expr>;
  readonly state = new CompilerState();
  readonly helper: CompilerHelper;
  private opFactory: OpFactory<pass1.Statement>;
  private exprFactory: OpFactory<pass1.Expr>;

  constructor(readonly source: string, visitor: Pass0Visitor) {
    this.helper = new CompilerHelper(this);
    this.statements = visitor.statements;
    this.expressions = visitor.expressions;
    this.opFactory = new OpFactory(source);
    this.exprFactory = new OpFactory(source);
  }

  get symbols() {
    return this.state.symbols;
  }

  cursor(): string {
    return this.state.cursor();
  }

  op<O extends pass1.Statement>(name: OpConstructor<O>, ...args: InputOpArgs<O>): UnlocatedOp<O> {
    return this.opFactory.op(name, ...args);
  }

  expr<O extends pass1.Expr>(name: OpConstructor<O>, ...args: InputOpArgs<O>): UnlocatedOp<O> {
    return this.exprFactory.op(name, ...args);
  }

  slice(value: string): UnlocatedOp<pass1.SourceSlice> {
    return new UnlocatedOp(pass1.SourceSlice, { value }, this.source);
  }

  ops(...ops: Ops<pass1.Statement>[]): pass1.Statement[] {
    return this.opFactory.ops(...ops);
  }

  exprs(...ops: (pass1.Expr | pass1.Expr[])[]): pass1.Expr[] {
    return this.exprFactory.ops(...ops);
  }

  mapIntoStatements<T>(input: T[], callback: (input: T) => pass1.Statement[]): pass1.Statement[] {
    return this.opFactory.map(input, callback);
  }

  appendExpr(
    expr: AST.Expression,
    {
      context = ExpressionContext.Expression,
      trusted,
    }: { trusted: boolean; context?: ExpressionContext }
  ): UnlocatedOp<pass1.Statement> {
    if (trusted) {
      return this.op(pass1.AppendTrustedHTML, {
        value: this.visitExpr(expr, context),
      });
    } else {
      return this.op(pass1.AppendTextNode, {
        value: this.visitExpr(expr, context),
      });
    }
  }

  append(expr: pass1.Expr, { trusted }: { trusted: boolean }): UnlocatedOp<pass1.Statement> {
    if (trusted) {
      return this.op(pass1.AppendTrustedHTML, {
        value: expr,
      });
    } else {
      return this.op(pass1.AppendTextNode, {
        value: expr,
      });
    }
  }

  params(input: AST.Expression[]): pass1.Params {
    let out: pass1.Expr[] = [];

    for (let expr of input) {
      out.push(this.visitExpr(expr, ExpressionContext.Expression));
    }

    let params = this.expr(pass1.Params, { list: out });

    if (isPresent(out)) {
      let first = out[0];
      let last = out[out.length - 1];

      return params.offsets(range(first, last));
    } else {
      return params.offsets(null);
    }
  }

  hash(input: AST.Hash): pass1.Hash {
    let out: pass1.HashPair[] = [];

    for (let pair of input.pairs) {
      let keyOffsets = offsetsForHashKey(pair, this.source);
      let outPair = this.expr(pass1.HashPair, {
        key: this.slice(pair.key).offsets(keyOffsets),
        value: this.visitExpr(pair.value, ExpressionContext.Expression),
      }).loc(pair);

      out.push(outPair);
    }

    return this.expr(pass1.Hash, { pairs: out }).loc(input);
  }

  mapIntoExprs<E extends pass1.Expr, T>(
    input: [T, ...T[]],
    callback: (input: T) => E[]
  ): [E, ...E[]] {
    return this.exprFactory.map(input, callback) as [E, ...E[]];
  }

  withBlock<T>(
    block: AST.Block | AST.ElementNode,
    callback: (symbols: BlockSymbolTable, parent: SymbolTable) => T
  ): T {
    let parent = this.symbols.current;
    let child = this.symbols.current.child(block.blockParams);
    this.symbols.push(child);

    try {
      return callback(child, parent);
    } finally {
      this.symbols.pop();
    }
  }

  visitExpr(node: AST.Expression, context: ExpressionContext): pass1.Expr {
    if (node.type === 'PathExpression') {
      return this.helper.pathWithContext(node, context);
    } else {
      return visitExpr(this.expressions, node, this);
    }
  }

  visitStmt<T extends AST.Statement>(node: T | null): pass1.Statement[] {
    if (node === null) {
      return [];
    } else {
      return visit(this.statements, node, this);
    }
  }

  visitBlock(name: pass1.SourceSlice, node: null): null;
  visitBlock(name: pass1.SourceSlice, node: AST.Block): pass1.Block;
  visitBlock(name: pass1.SourceSlice, node: AST.Block | null): pass1.Block | null {
    if (node === null) {
      return null;
    } else {
      return this.withBlock(node, symbols =>
        this.op(pass1.Block, {
          name,
          symbols,
          body: this.mapIntoStatements(node.body, stmt => this.visitStmt(stmt)),
        }).loc(node)
      );
    }
  }
}

function range(
  first: { offsets: SourceOffsets | null },
  last: { offsets: SourceOffsets | null }
): SourceOffsets | null {
  if (first.offsets === null || last.offsets === null) {
    return null;
  }

  return { start: first.offsets.start, end: last.offsets.end };
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

export function sourceOffsets(
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
    // @ts-expect-error
    return null;
  }

  return {
    start: startOffset,
    end: endOffset,
  };
}
