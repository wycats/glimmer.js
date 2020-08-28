import { ExpressionContext, SexpOpcodes as WireOp } from '@glimmer/interfaces';
import { exhausted } from '@glimmer/util';
import { Visitors } from './visitors';
import { OpArgs } from '../shared/op';
import { CONCAT_PARAMS, EXPR, GET, HASH, PARAMS, STRING } from './checks';
import { Context } from './context';
import * as pass2 from './ops';
import * as out from './out';

class InternalVisitors implements Visitors<pass2.InternalTable> {
  PrepareArray({ entries }: OpArgs<pass2.PrepareArray>, ctx: Context): void {
    ctx.assertStackHas(entries);

    let values: out.Expr[] = [];

    for (let i = 0; i < entries; i++) {
      values.push(ctx.popValue(EXPR));
    }

    ctx.pushValue(out.Params, { list: values });
  }

  EmptyParams(_: OpArgs<pass2.EmptyParams>, ctx: Context): void {
    ctx.pushValue(out.EmptyParams);
  }

  PrepareObject({ entries }: OpArgs<pass2.PrepareObject>, ctx: Context): void {
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

    ctx.pushValue(out.Hash, { pairs });
  }
}

class ExpressionVisitors implements Visitors<pass2.ExprTable> {
  Literal({ value }: OpArgs<pass2.Literal>, ctx: Context): void {
    if (value === undefined) {
      ctx.pushValue(out.Undefined);
    } else {
      ctx.pushValue(out.Value, { value });
    }
  }

  GetFreeWithContext({ symbol, context }: OpArgs<pass2.GetFreeWithContext>, ctx: Context): void {
    ctx.pushValue(out.GetContextualFree, { symbol, context: expressionContextOp(context) });
  }

  GetFree({ symbol }: OpArgs<pass2.GetFree>, ctx: Context): void {
    ctx.pushValue(out.GetFree, { symbol });
  }

  GetSymbol({ symbol }: OpArgs<pass2.GetSymbol>, ctx: Context): void {
    ctx.pushValue(out.GetSymbol, { symbol });
  }

  GetPath(tail: OpArgs<pass2.GetPath>, ctx: Context): void {
    let head = ctx.popValue(GET);
    ctx.pushValue(out.GetPath, { head, tail });
  }

  Concat(_: OpArgs<pass2.Concat>, ctx: Context): void {
    ctx.pushValue(out.Concat, { parts: ctx.popValue(CONCAT_PARAMS) });
  }

  Helper(_: OpArgs<pass2.Helper>, ctx: Context): void {
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
