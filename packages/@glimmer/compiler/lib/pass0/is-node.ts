import { ExpressionContext } from '@glimmer/interfaces';
import { AST, builders, SyntaxError } from '@glimmer/syntax';
import { Pass1Expr, Pass1Statement } from '../pass1/ops';
import { Pass2Op } from '../pass2/ops';
import { Context } from './context';
import { HAS_BLOCK, HAS_BLOCK_PARAMS, KeywordExpressionNode } from './keywords';

export type Keyword = 'has-block' | 'has-block-params';

export interface KeywordPath<K extends Keyword> extends AST.PathExpression {
  original: K;
}

export type IsKeywordPath = KeywordPath<'has-block'> | KeywordPath<'has-block-params'>;

export interface KeywordCall<K extends Keyword> extends AST.Call {
  path: KeywordPath<K>;
}

export type IsKeywordCall =
  | KeywordExpressionNode<'has-block'>
  | KeywordExpressionNode<'has-block-params'>;

export function isKeywordCall(node: AST.Call): node is IsKeywordCall {
  return hasPath(node) && (HAS_BLOCK.match(node) || HAS_BLOCK_PARAMS.match(node));
}

export function isPath(node: AST.Node | AST.PathExpression): node is AST.PathExpression {
  return node.type === 'PathExpression';
}

export function isCall(node: AST.Node | AST.Call): node is AST.Call {
  return node.type === 'SubExpression' || node.type === 'MustacheStatement';
}

export interface HelperInvocation extends AST.Call {
  path: AST.PathExpression;
}

export type HelperStatement = HelperInvocation & AST.MustacheStatement;
export type HelperExpression = HelperInvocation & AST.Call;
export type HelperBlock = HelperInvocation & AST.BlockStatement;

export function hasPath(node: AST.Call): node is HelperInvocation {
  return node.path.type === 'PathExpression';
}

export function isHelperInvocation(node: AST.Call): node is HelperInvocation {
  // if (mustache.type !== 'SubExpression' && mustache.type !== 'MustacheStatement') {
  //   return false;
  // }

  return (node.params && node.params.length > 0) || (node.hash && node.hash.pairs.length > 0);
}

export interface SimplePath extends AST.PathExpression {
  parts: [string];
  data: false;
  this: false;
}

export interface SimpleHelper extends HelperInvocation {
  path: SimplePath;
}

export function isSimplePath(path: AST.PathExpression): path is SimplePath {
  let { data, this: isThis, parts } = path;

  return !data && !isThis && parts.length === 1;
}

export function assertIsSimpleHelper(
  helper: HelperInvocation,
  loc: AST.SourceLocation,
  context: string
): asserts helper is SimpleHelper {
  if (!isSimplePath(helper.path)) {
    throw new SyntaxError(
      `\`${helper.path.original}\` is not a valid name for a ${context} on line ${loc.start.line}.`,
      helper.loc
    );
  }
}

export function isPresent<T>(values: T[]): values is [T, ...T[]] {
  return values.length > 0;
}
