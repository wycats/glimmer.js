import { Op, OpArgs } from '../shared/op';
import { ComponentBlock, NamedBlock } from './blocks';
import { check, EXPR, HASH, MAYBE_NAMED_BLOCK, NAMED_BLOCK, PARAMS } from './checks';
import { Context } from './context';
import * as pass1 from '../pass1/ops';
import * as pass2 from './ops';
import * as out from './out';
import { Visitors } from './visitors';
import { isPresent } from '../shared/utils';

class StatementsVisitor implements Visitors<pass2.StatementTable> {
  StartProgram(): void {
    // ctx.startBlock(new Template(symbols));
  }

  EndProgram(): void {}

  StartBlock(ctx: Context, { name, symbols }: OpArgs<pass2.StartBlock>): void {
    ctx.startBlock(new NamedBlock(name, symbols));
  }

  EndBlock(ctx: Context): void {
    ctx.addBlock(ctx.popBlock(NAMED_BLOCK));
  }

  Partial(ctx: Context): out.Op {
    let expr = ctx.popValue(EXPR);
    return ctx.op(out.Partial, { expr, info: ctx.template.evalInfo });
  }

  Debugger(ctx: Context): out.Op {
    return ctx.op(out.Debugger, { info: ctx.template.evalInfo });
  }

  Yield(ctx: Context, { symbol }: OpArgs<pass2.Yield>): out.Op {
    return ctx.op(out.Yield, { to: symbol, params: ctx.popValue(PARAMS) });
  }

  InvokeBlock(ctx: Context, { hasInverse }: OpArgs<pass2.InvokeBlock>): out.Op {
    let head = ctx.popValue(EXPR);
    let params = ctx.popValue(PARAMS);
    let hash = ctx.popValue(HASH);

    let blocks: [NamedBlock, ...NamedBlock[]] = [ctx.popBlock(NAMED_BLOCK)];

    if (hasInverse) {
      blocks.push(ctx.popBlock(NAMED_BLOCK));
    }

    return ctx.op(out.InvokeBlock, {
      head,
      params,
      hash,
      blocks: ctx.op(out.NamedBlocks, { blocks }),
    });
  }

  AppendTrustedHTML(ctx: Context): out.Op {
    return ctx.op(out.TrustingAppend, { value: ctx.popValue(EXPR) });
  }

  AppendTextNode(ctx: Context): out.Op {
    return ctx.op(out.Append, { value: ctx.popValue(EXPR) });
  }

  AppendComment(ctx: Context, { value }: OpArgs<pass2.AppendComment>): out.Op {
    return ctx.op(out.AppendComment, { value });
  }

  Modifier(ctx: Context): out.Op {
    let head = ctx.popValue(EXPR);
    let params = ctx.popValue(PARAMS);
    let hash = ctx.popValue(HASH);

    return ctx.op(out.Modifier, { head, params, hash });
  }

  OpenNamedBlock(ctx: Context, { tag, symbols }: OpArgs<pass2.OpenNamedBlock>): void {
    ctx.startBlock(new NamedBlock(tag, symbols));
  }

  CloseNamedBlock(ctx: Context): void {
    let block = check(ctx.blocks.pop(), NAMED_BLOCK) as NamedBlock;

    ctx.currentComponent.pushBlock(block);
  }

  OpenSimpleElement(ctx: Context, { tag }: OpArgs<pass2.OpenSimpleElement>): out.Op {
    return ctx.op(out.OpenElement, { tag });
  }

  OpenElementWithDynamicFeatures(ctx: Context, { tag }: OpArgs<pass2.OpenSimpleElement>): out.Op {
    return ctx.op(out.OpenElementWithSplat, { tag });
  }

  CloseElement(ctx: Context): out.Op {
    return ctx.op(out.CloseElement);
  }

  OpenComponent(ctx: Context, { symbols, selfClosing }: OpArgs<pass2.OpenComponent>): void {
    let tag = ctx.popValue(EXPR);

    // TODO customizeComponentName -- this belongs in pass0

    ctx.startBlock(new ComponentBlock(tag, symbols, selfClosing));
  }

  CloseComponent(ctx: Context): out.Op {
    return ctx.op(out.InvokeComponent, { block: ctx.endComponent() });
  }

  StaticArg(ctx: Context, { name }: OpArgs<pass2.StaticArg>): out.Op {
    return ctx.op(out.StaticArg, { name, value: ctx.popValue(EXPR) });
  }

  DynamicArg(ctx: Context, { name }: OpArgs<pass2.DynamicArg>): out.Op {
    return ctx.op(out.DynamicArg, { name, value: ctx.popValue(EXPR) });
  }

  StaticAttr(ctx: Context, args: OpArgs<pass2.StaticAttr>): out.Op {
    return ctx.op(out.StaticAttr, attr(ctx, args));
  }

  StaticComponentAttr(ctx: Context, args: OpArgs<pass2.StaticComponentAttr>): out.Op {
    return ctx.op(out.StaticComponentAttr, attr(ctx, args));
  }

  ComponentAttr(ctx: Context, args: OpArgs<pass2.ComponentAttr>): out.Op {
    return ctx.op(out.ComponentAttr, attr(ctx, args));
  }

  DynamicAttr(ctx: Context, args: OpArgs<pass2.DynamicAttr>): out.Op {
    return ctx.op(out.DynamicAttr, attr(ctx, args));
  }

  TrustingComponentAttr(ctx: Context, args: OpArgs<pass2.TrustingComponentAttr>): out.Op {
    return ctx.op(out.TrustingComponentAttr, attr(ctx, args));
  }

  TrustingAttr(ctx: Context, args: OpArgs<pass2.TrustingAttr>): out.Op {
    return ctx.op(out.TrustingComponentAttr, attr(ctx, args));
  }

  AttrSplat(ctx: Context, args: OpArgs<pass2.AttrSplat>): out.Op {
    return ctx.op(out.AttrSplat, args);
  }

  FlushElement(ctx: Context): out.Op {
    return ctx.op(out.FlushElement);
  }
}

function attr(
  ctx: Context,
  { name, namespace }: { name: pass1.SourceSlice; namespace?: string }
): { name: pass1.SourceSlice; value: out.Expr; namespace?: string } {
  // deflateAttrName is an encoding concern

  let value = ctx.popValue(EXPR);

  return { name, value, namespace };
}
