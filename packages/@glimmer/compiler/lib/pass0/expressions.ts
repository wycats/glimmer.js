import { ExpressionContext } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { assign } from '@glimmer/util';
import * as pass1 from '../pass1/ops';
import { Context, Pass0Visitor } from './context';
import { isKeywordCall } from './is-node';

type Pass0ExpressionsVisitor = Pass0Visitor['expressions'];

class Pass0Expressions implements Pass0ExpressionsVisitor {
  PathExpression(path: AST.PathExpression, ctx: Context): pass1.Expr {
    return ctx.helper.pathWithContext(path, ExpressionContext.Expression);
  }

  StringLiteral(literal: AST.StringLiteral, ctx: Context): pass1.Expr {
    return ctx.expr(pass1.Literal, literal).loc(literal);
  }

  BooleanLiteral(literal: AST.BooleanLiteral, ctx: Context): pass1.Expr {
    return ctx.expr(pass1.Literal, literal).loc(literal);
  }

  NumberLiteral(literal: AST.NumberLiteral, ctx: Context): pass1.Expr {
    return ctx.expr(pass1.Literal, literal).loc(literal);
  }

  NullLiteral(literal: AST.NullLiteral, ctx: Context): pass1.Expr {
    return ctx.expr(pass1.Literal, literal).loc(literal);
  }

  UndefinedLiteral(literal: AST.UndefinedLiteral, ctx: Context): pass1.Expr {
    return ctx.expr(pass1.Literal, literal).loc(literal);
  }

  ConcatStatement(concat: AST.ConcatStatement, ctx: Context): pass1.Expr {
    return ctx.helper.concat(concat);
  }

  SubExpression(expr: AST.SubExpression, ctx: Context): pass1.Expr {
    if (isKeywordCall(expr)) {
      return ctx.helper.keyword(expr);
    } else {
      return ctx
        .expr(
          pass1.SubExpression,
          assign(
            {
              head: ctx.helper.visitExpr(expr.path, ExpressionContext.CallHead),
            },
            ctx.helper.args(expr)
          )
        )
        .loc(expr);
    }
  }
}

export const EXPRESSIONS = new Pass0Expressions();
