import { AST } from '@glimmer/syntax';
import { Op } from './ops';

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

export type AstExpressionOp = {
  [P in keyof AstExpressionOps]: Op<P, AstExpressionOps[P]>;
};

// export interface InputOps {
//   startProgram: [template: AST.Template];
//   endProgram: [template: AST.Template];
//   startBlock: [block: AST.Block];
//   endBlock: [block: AST.Block];
//   block: [block: AST.BlockStatement];
//   mustache: [curly: AST.MustacheStatement];
//   openElement: [element: AST.ElementNode];
//   closeElement: [element: AST.ElementNode];
//   text: [text: AST.TextNode];
//   comment: [comment: AST.CommentStatement];
// }

// export type InputOp = {
//   [P in keyof InputOps]: Op<P, InputOps[P]>;
// };
