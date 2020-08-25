import { ExpressionContext } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { NonemptyStack } from '@glimmer/util';
import { AllocateSymbolsOpTable } from '../pass2/ops';
import { Op, OpFactory, Ops, UnlocatedOp } from '../ops/ops';
import { SymbolTable } from '../template-visitor';
import { CompilerHelper } from './index';

/**
 * In reality, AttrNode does not appear as a statement in top-level content, but rather
 * only nested inside of a specific part of the ElementNode, so we can handle it (in
 * context) there and not have to worry about generically seeing one of them in content.
 */
type TopLevelStatement = AST.Statement | AST.Block;

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

export type Opcode = Op<keyof AllocateSymbolsOpTable, AllocateSymbolsOpTable>;

type NodeFor<N extends AST.BaseNode, K extends N['type']> = N extends { type: K } ? N : never;

type Visitors<N extends AST.BaseNode> = {
  [P in N['type']]: (node: NodeFor<N, P>, ctx: CompilerContext) => Opcode[] | Opcode;
};

function visit<N extends AST.BaseNode>(
  visitors: Visitors<N>,
  node: N,
  ctx: CompilerContext
): Opcode[] {
  let result = visitors[node.type](node, ctx);

  if (Array.isArray(result)) {
    return result;
  } else {
    return [result];
  }
}

export interface Pass1Visitor {
  expressions: Visitors<AST.Expression | AST.ConcatStatement>;
  statements: Visitors<TopLevelStatement>;
}

type OpName = keyof AllocateSymbolsOpTable;
type OpMap = AllocateSymbolsOpTable;

/**
 * All state in this object except the CompilerState must be readonly.
 *
 * This object, and not a copy of it, must be passed around to helper functions. The
 * `CompilerHelper`, on the other hand, does not need to share an identity since it
 * has no mutable state at all.
 */
export class CompilerContext {
  readonly statements: Visitors<TopLevelStatement>;
  readonly expressions: Visitors<AST.Expression | AST.ConcatStatement>;
  readonly state = new CompilerState();
  readonly helper: CompilerHelper;
  private factory: OpFactory<keyof AllocateSymbolsOpTable, AllocateSymbolsOpTable>;

  constructor(readonly source: string, visitor: Pass1Visitor) {
    this.helper = new CompilerHelper(this);
    this.statements = visitor.statements;
    this.expressions = visitor.expressions;
    this.factory = new OpFactory(source);
  }

  get symbols() {
    return this.state.symbols;
  }

  cursor(): string {
    return this.state.cursor();
  }

  op<N extends OpName>(name: N, ...args: OpMap[N]): UnlocatedOp<OpName, OpMap> {
    return this.factory.op(name, ...args);
  }

  ops(...ops: Ops<OpName, OpMap>[]): Op<OpName, OpMap>[] {
    return this.factory.ops(...ops);
  }

  map<T>(input: T[], callback: (input: T) => Op<OpName, OpMap>[]): Op<OpName, OpMap>[] {
    return this.factory.map(input, callback);
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

  expr(node: AST.Expression | null, context: ExpressionContext): Opcode[] {
    if (node === null) {
      return [];
    } else if (node.type === 'PathExpression') {
      return this.helper.pathWithContext(node, context);
    } else {
      return visit(this.expressions, node, this);
    }
  }

  stmt<T extends TopLevelStatement>(node: T | null): Opcode[] {
    if (node === null) {
      return [];
    } else {
      return visit(this.statements, node, this);
    }
  }
}
