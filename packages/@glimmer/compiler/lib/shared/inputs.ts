import { AST } from '@glimmer/syntax';

export interface AstExpressionOps {
  PathExpression: [path: AST.PathExpression];
  StringLiteral: [literal: AST.StringLiteral];
  BooleanLiteral: [literal: AST.BooleanLiteral];
  NumberLiteral: [literal: AST.NumberLiteral];
  NullLiteral: [literal: AST.NullLiteral];
  UndefinedLiteral: [literal: AST.UndefinedLiteral];
  ConcatStatement: [concat: AST.ConcatStatement];
  SubExpression: [sexp: AST.SubExpression];
}

export interface AstStatementOps {
  PartialStatement: [partial: AST.PartialStatement];
  Template: [template: AST.Template];
  Block: [block: AST.Block];
  BlockStatement: [block: AST.BlockStatement];
  ElementNode: [element: AST.ElementNode];
  MustacheCommentStatement: [comment: AST.MustacheCommentStatement];
  MustacheStatement: [comment: AST.MustacheStatement];
  TextNode: [text: AST.TextNode];
  CommentStatement: [comment: AST.CommentStatement];
}
