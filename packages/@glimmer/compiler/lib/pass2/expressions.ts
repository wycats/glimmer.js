import { ExpressionContext, SexpOpcodes as WireOp } from '@glimmer/interfaces';
import { exhausted } from '@glimmer/util';
import { Visitors } from './visitors';
import { OpArgs } from '../shared/op';
import { CONCAT_PARAMS, EXPR, GET, HASH, PARAMS, STRING } from './checks';
import { Context } from './context';
import * as pass2 from './ops';
import * as out from './out';
import { isPresent } from '../shared/utils';

class InternalVisitors implements Visitors<pass2.InternalTable> {
  PrepareArray(ctx: Context, { entries }: OpArgs<pass2.PrepareArray>): void {
    ctx.assertStackHas(entries);

    let values: out.Expr[] = [];

    for (let i = 0; i < entries; i++) {
      values.push(ctx.popValue(EXPR));
    }

    if (isPresent(values)) {
      ctx.pushValue(out.Params, { list: values });
    } else {
      ctx.pushValue(out.EmptyParams);
    }
  }

  EmptyParams(ctx: Context): void {
    ctx.pushValue(out.EmptyParams);
  }

  PrepareObject(ctx: Context, { entries }: OpArgs<pass2.PrepareObject>): void {
    if (entries === 0) {
      ctx.pushValue(out.EmptyHash);
    }

    ctx.assertStackHas(entries);

    let pairs: out.HashPair[] = [];

    for (let i = 0; i < entries; i++) {
      let key = ctx.popValue(STRING);
      let value = ctx.popValue(EXPR);
      pairs.push(ctx.stackValue(out.HashPair, { key, value }));
    }

    if (isPresent(pairs)) {
      ctx.pushValue(out.Hash, { pairs });
    } else {
      ctx.pushValue(out.EmptyHash);
    }
  }
}

class ExpressionVisitors implements Visitors<pass2.ExprTable> {
  Literal(ctx: Context, { value }: OpArgs<pass2.Literal>): void {
    if (value === undefined) {
      ctx.pushValue(out.Undefined);
    } else {
      ctx.pushValue(out.Value, { value });
    }
  }

  HasBlock(ctx: Context, { symbol }: OpArgs<pass2.HasBlock>): void {
    ctx.pushValue(out.HasBlock, { symbol });
  }

  HasBlockParams(ctx: Context, { symbol }: OpArgs<pass2.HasBlockParams>): void {
    ctx.pushValue(out.HasBlockParams, { symbol });
  }

  GetFreeWithContext(ctx: Context, { symbol, context }: OpArgs<pass2.GetFreeWithContext>): void {
    ctx.pushValue(out.GetContextualFree, { symbol, context: expressionContextOp(context) });
  }

  GetFree(ctx: Context, { symbol }: OpArgs<pass2.GetFree>): void {
    ctx.pushValue(out.GetFree, { symbol });
  }

  GetSymbol(ctx: Context, { symbol }: OpArgs<pass2.GetSymbol>): void {
    ctx.pushValue(out.GetSymbol, { symbol });
  }

  GetPath(ctx: Context, tail: OpArgs<pass2.GetPath>): void {
    let head = ctx.popValue(GET);
    ctx.pushValue(out.GetPath, { head, tail });
  }

  Concat(ctx: Context): void {
    ctx.pushValue(out.Concat, { parts: ctx.popValue(CONCAT_PARAMS) });
  }

  Helper(ctx: Context): void {
    let head = ctx.popValue(EXPR);
    let params = ctx.popValue(PARAMS);
    let hash = ctx.popValue(HASH);

    ctx.pushValue(out.Call, { head, params, hash });
  }
}

export function expressionContextOp(context: ExpressionContext) {
  switch (context) {
    case ExpressionContext.AppendSingleId:
      return WireOp.GetFreeInAppendSingleId;
    case ExpressionContext.Expression:
      return WireOp.GetFreeInExpression;
    case ExpressionContext.CallHead:
      return WireOp.GetFreeInCallHead;
    case ExpressionContext.BlockHead:
      return WireOp.GetFreeInBlockHead;
    case ExpressionContext.ModifierHead:
      return WireOp.GetFreeInModifierHead;
    case ExpressionContext.ComponentHead:
      return WireOp.GetFreeInComponentHead;
    default:
      return exhausted(context);
  }
}

export const EXPRESSIONS = new ExpressionVisitors();
