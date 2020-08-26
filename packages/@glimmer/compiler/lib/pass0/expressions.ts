import { ExpressionContext } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { Pass1Expr } from '../pass1/ops';
import { Context, Pass0Visitor } from './context';
import { isKeywordCall } from './is-node';

type Pass0ExpressionsVisitor = Pass0Visitor['expressions'];

class Pass0Expressions implements Pass0ExpressionsVisitor {
  PathExpression(path: AST.PathExpression, ctx: Context): Pass1Expr {
    return ctx.helper.pathWithContext(path, ExpressionContext.Expression);
  }

  StringLiteral(literal: AST.StringLiteral, ctx: Context): Pass1Expr {
    return ctx.expr('Literal', { value: literal.value }).loc(literal);
  }

  BooleanLiteral(literal: AST.BooleanLiteral, ctx: Context): Pass1Expr {
    return ctx.expr('Literal', { value: literal.value }).loc(literal);
  }

  NumberLiteral(literal: AST.NumberLiteral, ctx: Context): Pass1Expr {
    return ctx.expr('Literal', { value: literal.value }).loc(literal);
  }

  NullLiteral(literal: AST.NullLiteral, ctx: Context): Pass1Expr {
    return ctx.expr('Literal', { value: literal.value }).loc(literal);
  }

  UndefinedLiteral(literal: AST.UndefinedLiteral, ctx: Context): Pass1Expr {
    return ctx.expr('Literal', { value: literal.value }).loc(literal);
  }

  ConcatStatement(concat: AST.ConcatStatement, ctx: Context): Pass1Expr {
    return ctx.helper.concat(concat);
  }

  SubExpression(expr: AST.SubExpression, ctx: Context): Pass1Expr {
    if (isKeywordCall(expr)) {
      return ctx.helper.keyword(expr);
    } else {
      return ctx
        .expr('SubExpression', {
          head: ctx.helper.visitExpr(expr.path, ExpressionContext.CallHead),
          ...ctx.helper.args(expr),
        })
        .loc(expr);
    }
  }
}

export const EXPRESSIONS = new Pass0Expressions();
