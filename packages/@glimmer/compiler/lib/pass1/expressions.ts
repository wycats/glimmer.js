import { ExpressionContext } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { Pass2Op } from '../pass2/ops';
import { CompilerContext, Pass1Visitor } from './context';

export const HirExpressions: Pass1Visitor['expressions'] = {
  PathExpression(path: AST.PathExpression, ctx: CompilerContext): Pass2Op[] {
    return ctx.helper.pathWithContext(path, ExpressionContext.Expression);
  },

  StringLiteral(literal: AST.StringLiteral, ctx: CompilerContext): Pass2Op {
    return ctx.op('literal', literal.value).loc(literal);
  },

  BooleanLiteral(literal: AST.BooleanLiteral, ctx: CompilerContext): Pass2Op {
    return ctx.op('literal', literal.value).loc(literal);
  },

  NumberLiteral(literal: AST.NumberLiteral, ctx: CompilerContext): Pass2Op {
    return ctx.op('literal', literal.value).loc(literal);
  },

  NullLiteral(literal: AST.NullLiteral, ctx: CompilerContext): Pass2Op {
    return ctx.op('literal', literal.value).loc(literal);
  },

  UndefinedLiteral(literal: AST.UndefinedLiteral, ctx: CompilerContext): Pass2Op {
    return ctx.op('literal', literal.value).loc(literal);
  },

  ConcatStatement(concat: AST.ConcatStatement, ctx: CompilerContext): Pass2Op[] {
    return ctx.helper.concat(concat);
  },

  SubExpression(expr: AST.SubExpression, ctx: CompilerContext): Pass2Op[] {
    return ctx.helper.sexp(expr);
  },
};
