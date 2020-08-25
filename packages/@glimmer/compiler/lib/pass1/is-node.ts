import { ExpressionContext } from '@glimmer/interfaces';
import { AST, builders, SyntaxError } from '@glimmer/syntax';
import { Pass2Op } from '../pass2/ops';
import { Context } from './context';

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

interface KeywordPathNode<K extends string> extends AST.PathExpression {
  original: K;
}

interface KeywordStatementNode<K extends string> extends HelperStatement {
  path: KeywordPathNode<K>;
}

interface KeywordDelegate<N extends AST.BaseNode, V> {
  assert(node: N): V;
  opcode(node: N, ctx: Context, param: V): Pass2Op[];
}

interface KeywordBlockNode<K extends string> extends HelperBlock {
  path: KeywordPathNode<K>;
}

class KeywordBlock<K extends string, V> {
  constructor(private keyword: K, private delegate: KeywordDelegate<KeywordBlockNode<K>, V>) {}

  match(mustache: AST.BlockStatement): mustache is KeywordBlockNode<K> {
    if (mustache.path.type === 'PathExpression') {
      return mustache.path.original === this.keyword;
    } else {
      return false;
    }
  }

  opcode(mustache: KeywordBlockNode<K>, ctx: Context): Pass2Op[] {
    let param = this.delegate.assert(mustache);
    return this.delegate.opcode(mustache, ctx, param);
  }
}

class KeywordStatement<K extends string, V> {
  constructor(private keyword: K, private delegate: KeywordDelegate<KeywordStatementNode<K>, V>) {}

  match(mustache: HelperStatement): mustache is KeywordStatementNode<K> {
    return mustache.path.original === this.keyword;
  }

  opcode(mustache: KeywordStatementNode<K>, ctx: Context): Pass2Op[] {
    let param = this.delegate.assert(mustache);
    return this.delegate.opcode(mustache, ctx, param);
  }
}

interface KeywordExpressionNode<K extends string> extends HelperExpression {
  path: KeywordPathNode<K>;
}

class KeywordExpression<K extends string, V> {
  constructor(private keyword: K, private delegate: KeywordDelegate<KeywordExpressionNode<K>, V>) {}

  match(mustache: HelperExpression): mustache is KeywordExpressionNode<K> {
    return mustache.path.original === this.keyword;
  }

  opcode(mustache: KeywordExpressionNode<K>, ctx: Context): Pass2Op[] {
    let param = this.delegate.assert(mustache);
    return this.delegate.opcode(mustache, ctx, param);
  }
}

export const IN_ELEMENT = new KeywordBlock('in-element', {
  assert(statement: KeywordBlockNode<'in-element'>): boolean {
    let { hash } = statement;

    let hasInsertBefore = false;

    for (let { key, value } of hash.pairs) {
      if (key === 'guid') {
        throw new SyntaxError(
          `Cannot pass \`guid\` to \`{{#in-element}}\` on line ${value.loc.start.line}.`,
          value.loc
        );
      }

      if (key === 'insertBefore') {
        hasInsertBefore = true;
      }
    }

    return hasInsertBefore;
  },

  opcode(block: KeywordBlockNode<'in-element'>, ctx: Context, hasInsertBefore: boolean): Pass2Op[] {
    let pairs = [...block.hash.pairs];

    pairs.push(builders.pair('guid', builders.string(ctx.cursor())));

    if (!hasInsertBefore) {
      pairs.push(builders.pair('insertBefore', builders.undefined()));
    }

    return ctx.ops(
      ctx.helper.args({
        path: block.path,
        params: block.params,
        hash: builders.hash(pairs, block.hash.loc),
      }),
      ctx.expr(block.path, ExpressionContext.BlockHead),
      ctx.stmt(block.inverse || null),
      ctx.stmt(block.program),
      ctx.op('block', !!block.inverse).loc(block)
    );
  },
});

export const YIELD = new KeywordStatement('yield', {
  assert(statement: KeywordStatementNode<'yield'>): string {
    let { pairs } = statement.hash;

    if (isPresent(pairs)) {
      let first = pairs[0];

      if (first.key !== 'to' || pairs.length > 1) {
        throw new SyntaxError(`yield only takes a single named argument: 'to'`, first.loc);
      }

      let target = first.value;

      if (target.type !== 'StringLiteral') {
        throw new SyntaxError(`you can only yield to a literal value`, target.loc);
      }

      return target.value;
    } else {
      return 'default';
    }
  },

  opcode(statement: KeywordStatementNode<'yield'>, ctx: Context, param: string): Pass2Op[] {
    return [...ctx.helper.params(statement), ctx.op('yield', param).loc(statement)];
  },
});

export const PARTIAL = new KeywordStatement('partial', {
  assert(statement: KeywordStatementNode<'partial'>): void {
    let {
      params,
      hash: { pairs },
      escaped,
      loc,
    } = statement;

    if (isPresent(params) && params.length !== 1) {
      throw new SyntaxError(
        `Partial found with ${params.length} arguments. You must specify a template name. (on line ${loc.start.line})`,
        statement.loc
      );
    }

    if (isPresent(pairs)) {
      throw new SyntaxError(
        `Partial found with no arguments. You must specify a template name. (on line ${loc.start.line})`,
        statement.loc
      );
    }

    if (!escaped) {
      throw new SyntaxError(
        `{{{partial ...}}} is not supported, please use {{partial ...}} instead (on line ${loc.start.line})`,
        statement.loc
      );
    }
  },

  opcode(statement: KeywordStatementNode<'partial'>, ctx: Context): Pass2Op[] {
    return [...ctx.helper.params(statement), ctx.op('partial').loc(statement)];
  },
});

export const DEBUGGER = new KeywordStatement('debugger', {
  assert(statement: KeywordStatementNode<'debugger'>): void {
    let {
      params,
      hash: { pairs },
    } = statement;

    if (isPresent(pairs)) {
      throw new SyntaxError(`debugger does not take any named arguments`, statement.loc);
    }

    if (isPresent(params)) {
      throw new SyntaxError(`debugger does not take any positional arguments`, statement.loc);
    }
  },

  opcode(statement: KeywordStatementNode<'debugger'>, ctx: Context): Pass2Op[] {
    return [ctx.op('debugger', null).loc(statement)];
  },
});

export const HAS_BLOCK = new KeywordExpression('has-block', {
  assert(node: KeywordExpressionNode<'has-block'>): string {
    return assertValidHasBlockUsage('has-block', node);
  },
  opcode(node: KeywordExpressionNode<'has-block'>, ctx: Context, param: string): Pass2Op[] {
    return [ctx.op('hasBlock', param).loc(node)];
  },
});

export const HAS_BLOCK_PARAMS = new KeywordExpression('has-block-params', {
  assert(node: KeywordExpressionNode<'has-block-params'>): string {
    return assertValidHasBlockUsage('has-block-params', node);
  },
  opcode(node: KeywordExpressionNode<'has-block-params'>, ctx: Context, target: string): Pass2Op[] {
    return [ctx.op('hasBlockParams', target).loc(node)];
  },
});

export function assertValidHasBlockUsage(type: string, call: AST.Call): string {
  let { params, hash, loc } = call;

  if (hash && hash.pairs.length > 0) {
    throw new SyntaxError(`${type} does not take any named arguments`, call.loc);
  }

  if (params.length === 0) {
    return 'default';
  } else if (params.length === 1) {
    let param = params[0];
    if (param.type === 'StringLiteral') {
      return param.value;
    } else {
      throw new SyntaxError(
        `you can only yield to a literal value (on line ${loc.start.line})`,
        call.loc
      );
    }
  } else {
    throw new SyntaxError(
      `${type} only takes a single positional argument (on line ${loc.start.line})`,
      call.loc
    );
  }
}
