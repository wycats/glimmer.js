import { ExpressionContext } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { CompilerContext, Opcode, Pass1Visitor } from './context';

export const HirExpressions: Pass1Visitor['expressions'] = {
  PathExpression(path: AST.PathExpression, ctx: CompilerContext): Opcode[] {
    return ctx.helper.pathWithContext(path, ExpressionContext.Expression);
  },

  StringLiteral(literal: AST.StringLiteral, ctx: CompilerContext): Opcode {
    return ctx.op('literal', literal.value).loc(literal);
  },

  BooleanLiteral(literal: AST.BooleanLiteral, ctx: CompilerContext): Opcode {
    return ctx.op('literal', literal.value).loc(literal);
  },

  NumberLiteral(literal: AST.NumberLiteral, ctx: CompilerContext): Opcode {
    return ctx.op('literal', literal.value).loc(literal);
  },

  NullLiteral(literal: AST.NullLiteral, ctx: CompilerContext): Opcode {
    return ctx.op('literal', literal.value).loc(literal);
  },

  UndefinedLiteral(literal: AST.UndefinedLiteral, ctx: CompilerContext): Opcode {
    return ctx.op('literal', literal.value).loc(literal);
  },

  ConcatStatement(concat: AST.ConcatStatement, ctx: CompilerContext): Opcode[] {
    return ctx.helper.concat(concat);
  },

  SubExpression(expr: AST.SubExpression, ctx: CompilerContext): Opcode[] {
    return ctx.helper.sexp(expr);
  },
};
