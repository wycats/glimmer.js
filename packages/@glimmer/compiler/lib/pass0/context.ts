import { ExpressionContext } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { NonemptyStack } from '@glimmer/util';
import { Op, OpFactory, Ops, UnlocatedOp } from '../shared/ops';
import { Pass2Op, Pass2OpTable } from '../pass2/ops';
import { SymbolTable } from '../template-visitor';
import { CompilerHelper } from './index';
import {
  Located,
  located,
  Pass1Expr,
  Pass1Exprs,
  Pass1ExprTable,
  Pass1Statement,
  Pass1StatementTable,
  UnlocatedPass1Statement,
} from '../pass1/ops';
import { isPresent } from '../pass1/is-node';
import { offsetsForHashKey, SourceOffsets } from '../pass1/location';
import { CompilerContext } from '../pass3/context';

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

export type StatementVisitors = Visitors<AST.Statement, Pass1Statement>;

export interface Pass0Visitor {
  expressions: OneToOneVisitors<AST.Expression | AST.ConcatStatement, Pass1Expr>;
  statements: StatementVisitors;
}

type StatementName = keyof Pass1StatementTable;
type StatementMap = Pass1StatementTable;

type ExprName = keyof Pass1ExprTable;
type ExprMap = Pass1ExprTable;

/**
 * All state in this object except the CompilerState must be readonly.
 *
 * This object, and not a copy of it, must be passed around to helper functions. The
 * `CompilerHelper`, on the other hand, does not need to share an identity since it
 * has no mutable state at all.
 */
export class Context {
  readonly statements: StatementVisitors;
  readonly expressions: OneToOneVisitors<AST.Expression | AST.ConcatStatement, Pass1Expr>;
  readonly state = new CompilerState();
  readonly helper: CompilerHelper;
  private opFactory: OpFactory<StatementName, StatementMap>;
  private exprFactory: OpFactory<ExprName, ExprMap>;

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

  op<N extends StatementName, Map extends StatementMap[N] & void>(
    name: N
  ): UnlocatedOp<N, StatementMap>;
  op<N extends StatementName>(
    name: N,
    args: Omit<StatementMap[N], 'type'>
  ): UnlocatedOp<N, StatementMap>;
  op<N extends StatementName>(
    name: N,
    args?: Omit<StatementMap[N], 'type'>
  ): UnlocatedOp<N, StatementMap> {
    args = args !== undefined ? { ...args, type: name } : undefined;
    return this.opFactory.op(name, args as StatementMap[N]) as UnlocatedOp<N, StatementMap>;
  }

  expr<N extends ExprName, Map extends ExprMap[N] & void>(name: N): UnlocatedOp<N, ExprMap>;
  expr<N extends ExprName>(name: N, args: Omit<ExprMap[N], 'type'>): UnlocatedOp<N, ExprMap>;
  expr<N extends ExprName>(
    name: N,
    args?: Omit<ExprMap[N], 'type'>
  ): UnlocatedOp<ExprName, ExprMap> {
    args = args !== undefined ? { ...args, type: name } : undefined;
    return this.exprFactory.op(name, args as ExprMap[N]);
  }

  ops(...ops: Ops<StatementName, StatementMap>[]): Op<StatementName, StatementMap>[] {
    return this.opFactory.ops(...ops);
  }

  exprs(...ops: Ops<ExprName, ExprMap>[]): Op<ExprName, ExprMap>[] {
    return this.exprFactory.ops(...ops);
  }

  mapIntoStatements<T>(
    input: T[],
    callback: (input: T) => Op<StatementName, StatementMap>[]
  ): Op<StatementName, StatementMap>[] {
    return this.opFactory.map(input, callback);
  }

  appendExpr(
    expr: AST.Expression,
    {
      context = ExpressionContext.Expression,
      trusted,
    }: { trusted: boolean; context?: ExpressionContext }
  ): UnlocatedPass1Statement {
    if (trusted) {
      return this.op('AppendTrustedHTML', {
        value: this.visitExpr(expr, context),
      });
    } else {
      return this.op('AppendTextNode', {
        value: this.visitExpr(expr, context),
      });
    }
  }

  append(expr: Pass1Expr, { trusted }: { trusted: boolean }): UnlocatedPass1Statement {
    if (trusted) {
      return this.op('AppendTrustedHTML', {
        value: expr,
      });
    } else {
      return this.op('AppendTextNode', {
        value: expr,
      });
    }
  }

  params(input: AST.Expression[]): Pass1Expr<'Params'> {
    let out: Pass1Expr[] = [];

    for (let expr of input) {
      out.push(this.visitExpr(expr, ExpressionContext.Expression));
    }

    let params = this.expr('Params', { list: out });

    if (isPresent(out)) {
      let first = out[0];
      let last = out[out.length - 1];

      return params.offsets(range(first, last));
    } else {
      return params.offsets(null);
    }
  }

  hash(input: AST.Hash): Pass1Expr {
    let out: Pass1Expr<'HashPair'>[] = [];

    for (let pair of input.pairs) {
      let keyOffsets = offsetsForHashKey(pair, this.source);
      let outPair = this.expr('HashPair', {
        key: located(pair.key, keyOffsets),
        value: this.visitExpr(pair.value, ExpressionContext.Expression),
      }).loc(pair);

      out.push(outPair);
    }

    return this.expr('Hash', { pairs: out }).loc(input);
  }

  mapIntoExprs<N extends ExprName, T>(
    input: [T, ...T[]],
    callback: (input: T) => Op<N, ExprMap>[]
  ): [Op<N, ExprMap>, ...Op<N, ExprMap>[]] {
    return this.exprFactory.map<T, N>(input, callback) as [Op<N, ExprMap>, ...Op<N, ExprMap>[]];
  }

  startBlock(block: AST.Block | AST.ElementNode): [] {
    let child = this.symbols.current.child(block.blockParams);
    block.symbols = child;
    this.symbols.push(child);

    return [];
  }

  endBlock(): [] {
    this.symbols.pop();
    return [];
  }

  visitExpr(node: AST.Expression, context: ExpressionContext): Pass1Expr {
    if (node.type === 'PathExpression') {
      return this.helper.pathWithContext(node, context);
    } else {
      return visitExpr(this.expressions, node, this);
    }
  }

  visitStmt<T extends AST.Statement>(node: T | null): Pass1Statement[] {
    if (node === null) {
      return [];
    } else {
      return visit(this.statements, node, this);
    }
  }

  visitBlock(name: Located<string>, node: null): null;
  visitBlock(name: Located<string>, node: AST.Block): Pass1Statement<'Block'>;
  visitBlock(name: Located<string>, node: AST.Block | null): Pass1Statement<'Block'> | null {
    if (node === null) {
      return null;
    } else {
      return this.op('Block', {
        name,
        symbols: node.symbols,
        body: this.mapIntoStatements(node.body, stmt => this.visitStmt(stmt)),
      }).loc(node) as Pass1Statement<'Block'>;
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
