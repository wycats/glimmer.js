import { NonemptyStack } from '@glimmer/util';
import * as pass2 from '../pass2/ops';
import { SourceOffsets } from '../shared/location';
import { InputOpArgs, Op, OpArgs, OpConstructor, UnlocatedOp } from '../shared/op';
import { OpFactory, Ops } from '../shared/ops';
import { SymbolTable } from '../template-visitor';
import { CompilerHelper } from './index';
import * as pass1 from './ops';

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

type Visitors<O extends pass1.AnyOp> = {
  [P in O['name']]: (
    op: O extends infer ThisOp & { name: P }
      ? ThisOp extends Op<unknown>
        ? OpArgs<ThisOp>
        : never
      : never,
    ctx: Context
  ) => pass2.Op[] | pass2.Op;
};

type VisitorFunc<N extends pass1.AnyOp> = (op: N['args'], ctx: Context) => pass2.Op[] | pass2.Op;

function visit<N extends pass1.AnyOp>(visitors: Visitors<N>, node: N, ctx: Context): pass2.Op[] {
  let f = visitors[node.name as N['name']] as VisitorFunc<pass1.AnyOp>;
  let result = f(node.args, ctx);

  if (Array.isArray(result)) {
    return result;
  } else {
    return [result];
  }
}

export interface Pass1Visitor {
  expressions: Visitors<pass1.Expr>;
  statements: Visitors<pass1.Statement>;
}

export class CompilerContext {
  readonly state = new CompilerState();
  readonly factory: OpFactory<pass2.Op>;

  constructor(readonly source: string, readonly visitor: Pass1Visitor) {
    this.factory = new OpFactory(source);
  }

  forOffsets(offsets: SourceOffsets | null): Context {
    return new Context(this, offsets);
  }
}

/**
 * All state in this object except the CompilerState must be readonly.
 *
 * This object, and not a copy of it, must be passed around to helper functions. The
 * `CompilerHelper`, on the other hand, does not need to share an identity since it
 * has no mutable state at all.
 */
export class Context {
  readonly helper: CompilerHelper;

  constructor(readonly ctx: CompilerContext, readonly offsets: SourceOffsets | null) {
    this.helper = new CompilerHelper(this);
  }

  get symbols() {
    return this.ctx.state.symbols;
  }

  get table() {
    return this.symbols.current;
  }

  cursor(): string {
    return this.ctx.state.cursor();
  }

  op<O extends pass2.Op>(name: OpConstructor<O>, ...args: InputOpArgs<O>): O {
    return this.unlocatedOp(name, ...args).offsets(this.offsets);
  }

  unlocatedOp<O extends pass2.Op>(name: OpConstructor<O>, ...args: InputOpArgs<O>): UnlocatedOp<O> {
    return this.ctx.factory.op(name, ...args);
  }

  ops(...ops: Ops<pass2.Op>[]): pass2.Op[] {
    return this.ctx.factory.ops(...ops);
  }

  map<T>(input: T[], callback: (input: T) => pass2.Op[]): pass2.Op[] {
    return this.ctx.factory.map(input, callback);
  }

  withBlock<T>(symbols: SymbolTable, callback: () => T): T {
    this.symbols.push(symbols);

    try {
      return callback();
    } finally {
      this.symbols.pop();
    }
  }

  startBlock(symbols: SymbolTable): void {
    this.symbols.push(symbols);
  }

  endBlock(): void {
    this.symbols.pop();
  }

  visitExpr(node: pass1.Expr | null): pass2.Op[] {
    if (node === null) {
      return [];
    } else {
      return visit(this.ctx.visitor.expressions, node, this);
    }
  }

  visitStmt<T extends pass1.Statement>(node: T | null): pass2.Op[] {
    if (node === null) {
      return [];
    } else {
      return visit(this.ctx.visitor.statements, node, this);
    }
  }
}