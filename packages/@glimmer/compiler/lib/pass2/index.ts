import { ExpressionContext } from '@glimmer/interfaces';
import { AST } from '../../../syntax';
import { PathHead } from '../compiler-ops';
import { Pass3Op } from '../pass3/ops';
import { CompilerContext, UnlocatedCompilerContext } from './context';
import { Pass2Op, Pass2Ops, Pass2OpTable } from './ops';

export type InVariable = PathHead;
export type OutVariable = number;

type Visitor = {
  [P in keyof Pass2OpTable]?: (ctx: CompilerContext, args: Pass2OpTable[P]) => Pass3Op | void;
};

class Pass2Visitor implements Visitor {
  startProgram(ctx: CompilerContext, symbols: AST.ProgramSymbols): void {
    ctx.push(symbols);
  }

  startBlock(ctx: CompilerContext, op: AST.Block): void {
    ctx.push(op.symbols);
  }

  endBlock(ctx: CompilerContext): void {
    ctx.pop();
  }

  openNamedBlock(ctx: CompilerContext, element: AST.ElementNode): void {
    ctx.push(element.symbols);
  }

  closeNamedBlock(ctx: CompilerContext): void {
    ctx.pop();
  }

  flushElement(ctx: CompilerContext, element: AST.ElementNode): void {
    if (element.symbols) {
      ctx.push(element.symbols);
    }
  }

  closeElement(ctx: CompilerContext): void {
    ctx.pop();
  }

  closeComponent(ctx: CompilerContext): void {
    ctx.pop();
  }

  closeDynamicComponent(ctx: CompilerContext): void {
    ctx.pop();
  }

  attrSplat(ctx: CompilerContext): Pass3Op {
    return ctx.op('attrSplat', ctx.table.allocateBlock('attrs'));
  }

  getArg(ctx: CompilerContext, name: string): Pass3Op {
    let symbol = ctx.table.allocateNamed(name);
    return ctx.op('getSymbol', symbol);
  }

  getThis(ctx: CompilerContext): Pass3Op {
    return ctx.op('getSymbol', 0);
  }

  getVar(
    ctx: CompilerContext,
    { var: name, context }: { var: string; context: ExpressionContext }
  ): Pass3Op {
    if (ctx.table.has(name)) {
      let symbol = ctx.table.get(name);
      return ctx.op('getSymbol', symbol);
    } else {
      // this will be different in strict mode
      let symbol = ctx.table.allocateFree(name);
      return ctx.op('getFreeWithContext', { var: symbol, context });
    }
  }

  yield(ctx: CompilerContext, op: string): Pass3Op {
    return ctx.op('yield', ctx.table.allocateBlock(op));
  }

  debugger(ctx: CompilerContext): Pass3Op {
    return ctx.op('debugger', ctx.table.getEvalInfo());
  }

  hasBlock(ctx: CompilerContext, op: PathHead): Pass3Op {
    if (op === 0) {
      return ctx.error('Cannot hasBlock this');
    }

    return ctx.op('hasBlock', ctx.table.allocateBlock(op));
  }

  hasBlockParams(ctx: CompilerContext, op: PathHead): Pass3Op {
    if (op === 0) {
      return ctx.error('Cannot hasBlockParams this');
    }

    return ctx.op('hasBlockParams', ctx.table.allocateBlock(op));
  }

  partial(ctx: CompilerContext): Pass3Op {
    return ctx.op('partial', ctx.table.getEvalInfo());
  }
}

const VISITOR: Visitor & Pass2Visitor = new Pass2Visitor();

export function allocate(ops: Pass2Op[], source: string) {
  let context = new UnlocatedCompilerContext(source);

  let out: Pass3Op[] = [];

  for (let op of ops) {
    out.push(dispatch(context, op));
  }

  return out;
}

function shouldVisit<N extends keyof Pass2Ops>(
  visitor: Visitor,
  op: Pass2Op<N> | { name: any }
): op is {
  name: N & keyof Pass2Visitor;
  args: Pass2Ops[N]['args'];
} {
  return op.name in visitor;
}

function dispatch<O extends Pass2Op>(context: UnlocatedCompilerContext, op: O): Pass3Op {
  let ctx = context.forOffsets(op.offsets);

  if (shouldVisit(VISITOR, op)) {
    let visit = VISITOR[op.name] as (
      ctx: CompilerContext,
      args: typeof op['args']
    ) => void | Pass3Op;

    let result = visit(ctx, op.args);
    if (result) {
      return result;
    }
  }

  return op as Pass3Op;
}
