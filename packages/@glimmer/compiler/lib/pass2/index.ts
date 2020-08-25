import { ExpressionContext } from '@glimmer/interfaces';
import { PathHead } from '../compiler-ops';
import { Opcode } from '../pass1/context';
import { JavaScriptCompilerOp } from '../pass3/ops';
import { CompilerContext, UnlocatedCompilerContext } from './context';
import { AllocateSymbolsOpTable } from './ops';

export type InVariable = PathHead;
export type OutVariable = number;

type Visitor = {
  [P in keyof AllocateSymbolsOpTable]?: (
    ctx: CompilerContext,
    ...args: AllocateSymbolsOpTable[P]
  ) => JavaScriptCompilerOp | void;
};

type Op = JavaScriptCompilerOp;

const SymbolVisitor: Visitor = {
  startProgram(ctx, template) {
    ctx.push(template.symbols);
  },

  startBlock(ctx, op) {
    ctx.push(op.symbols);
  },

  endBlock(ctx) {
    ctx.pop();
  },

  openNamedBlock(ctx, element) {
    ctx.push(element.symbols);
  },

  closeNamedBlock(ctx) {
    ctx.pop();
  },

  flushElement(ctx, element) {
    if (element.symbols) {
      ctx.push(element.symbols);
    }
  },

  closeElement(ctx) {
    ctx.pop();
  },

  closeComponent(ctx) {
    ctx.pop();
  },

  closeDynamicComponent(ctx) {
    ctx.pop();
  },

  attrSplat(ctx): Op {
    return ctx.op('attrSplat', ctx.table.allocateBlock('attrs'));
  },

  getFree(ctx: CompilerContext, name: string): Op {
    let symbol = ctx.table.allocateFree(name);
    return ctx.op('getFree', symbol);
  },

  getArg(ctx: CompilerContext, name: string): Op {
    let symbol = ctx.table.allocateNamed(name);
    return ctx.op('getSymbol', symbol);
  },

  getThis(ctx): Op {
    return ctx.op('getSymbol', 0);
  },

  getVar(ctx: CompilerContext, name: string, context: ExpressionContext): Op {
    if (ctx.table.has(name)) {
      let symbol = ctx.table.get(name);
      return ctx.op('getSymbol', symbol);
    } else {
      // this will be different in strict mode
      let symbol = ctx.table.allocateFree(name);
      return ctx.op('getFreeWithContext', symbol, context);
    }
  },

  yield(ctx, op): Op {
    return ctx.op('yield', ctx.table.allocateBlock(op));
  },

  debugger(ctx): Op {
    return ctx.op('debugger', ctx.table.getEvalInfo());
  },

  hasBlock(ctx, op: PathHead): Op {
    if (op === 0) {
      return ctx.error('Cannot hasBlock this');
    }

    return ctx.op('hasBlock', ctx.table.allocateBlock(op));
  },

  hasBlockParams(ctx: CompilerContext, op: PathHead): JavaScriptCompilerOp {
    if (op === 0) {
      return ctx.error('Cannot hasBlockParams this');
    }

    return ctx.op('hasBlockParams', ctx.table.allocateBlock(op));
  },

  partial(ctx: CompilerContext): JavaScriptCompilerOp {
    return ctx.op('partial', ctx.table.getEvalInfo());
  },
};

export function allocate(ops: Opcode[], source: string) {
  let context = new UnlocatedCompilerContext(source);

  let out: JavaScriptCompilerOp[] = [];

  for (let op of ops) {
    out.push(dispatch(context, op));
  }

  return out;
}

function dispatch(context: UnlocatedCompilerContext, op: Opcode): Op {
  let { name, args, offsets } = op;
  let ctx = context.forOffsets(offsets);

  if (name in SymbolVisitor) {
    let visit = SymbolVisitor[name];

    let result = (visit as any)(ctx, ...(args as any));
    if (result) {
      return result;
    }
  }

  return ctx.op(name as Op['name'], ...(args as Op['args'])) as Op;
}
