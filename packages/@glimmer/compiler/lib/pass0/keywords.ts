import { AST, builders, SyntaxError } from '@glimmer/syntax';
import { ExpressionContext } from '../../../interfaces';
import { located, Pass1Expr, Pass1Statement } from '../pass1/ops';
import { Context } from './context';
import { HelperBlock, HelperExpression, HelperStatement, isPresent } from './is-node';

interface KeywordPathNode<K extends string> extends AST.PathExpression {
  original: K;
}

interface KeywordStatementNode<K extends string> extends HelperStatement {
  path: KeywordPathNode<K>;
}

interface KeywordDelegate<N extends AST.BaseNode, V, Out> {
  assert(node: N): V;
  translate(node: N, ctx: Context, param: V): Out;
}

interface KeywordBlockNode<K extends string> extends HelperBlock {
  path: KeywordPathNode<K>;
}

class KeywordBlock<K extends string, V> {
  constructor(
    private keyword: K,
    private delegate: KeywordDelegate<KeywordBlockNode<K>, V, Pass1Statement>
  ) {}

  match(mustache: AST.BlockStatement): mustache is KeywordBlockNode<K> {
    if (mustache.path.type === 'PathExpression') {
      return mustache.path.original === this.keyword;
    } else {
      return false;
    }
  }

  translate(mustache: KeywordBlockNode<K>, ctx: Context): Pass1Statement {
    let param = this.delegate.assert(mustache);
    return this.delegate.translate(mustache, ctx, param);
  }
}

class KeywordStatement<K extends string, V> {
  constructor(
    private keyword: K,
    private delegate: KeywordDelegate<KeywordStatementNode<K>, V, Pass1Statement>
  ) {}

  match(mustache: HelperStatement): mustache is KeywordStatementNode<K> {
    return mustache.path.original === this.keyword;
  }

  translate(mustache: KeywordStatementNode<K>, ctx: Context): Pass1Statement {
    let param = this.delegate.assert(mustache);
    return this.delegate.translate(mustache, ctx, param);
  }
}

export interface KeywordExpressionNode<K extends string> extends HelperExpression {
  path: KeywordPathNode<K>;
}

class KeywordExpression<K extends string, V> {
  constructor(
    private keyword: K,
    private delegate: KeywordDelegate<KeywordExpressionNode<K>, V, Pass1Expr>
  ) {}

  match(mustache: HelperExpression): mustache is KeywordExpressionNode<K> {
    return mustache.path.original === this.keyword;
  }

  translate(mustache: KeywordExpressionNode<K>, ctx: Context): Pass1Expr {
    let param = this.delegate.assert(mustache);
    return this.delegate.translate(mustache, ctx, param);
  }
}

export const IN_ELEMENT = new KeywordBlock('in-element', {
  assert(
    statement: KeywordBlockNode<'in-element'>
  ): { insertBefore?: AST.Expression; destination?: AST.Expression } {
    let { hash } = statement;

    let insertBefore: AST.Expression | undefined = undefined;
    let destination: AST.Expression | undefined = undefined;

    for (let { key, value } of hash.pairs) {
      if (key === 'guid') {
        throw new SyntaxError(
          `Cannot pass \`guid\` to \`{{#in-element}}\` on line ${value.loc.start.line}.`,
          value.loc
        );
      }

      if (key === 'insertBefore') {
        insertBefore = value;
      }
    }

    if (isPresent(statement.params)) {
      destination = statement.params[0];
    }

    // TODO: Better syntax checks

    return { insertBefore, destination };
  },

  translate(
    block: KeywordBlockNode<'in-element'>,
    ctx: Context,
    { insertBefore, destination }: { insertBefore?: AST.Expression; destination?: AST.Expression }
  ): Pass1Statement {
    let guid = ctx.cursor();

    return ctx
      .op('InElement', {
        insertBefore: insertBefore
          ? ctx.visitExpr(insertBefore, ExpressionContext.Expression)
          : undefined,
        guid,
        destination: destination
          ? ctx.visitExpr(destination, ExpressionContext.Expression)
          : undefined,
      })
      .loc(block);
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

  translate(
    statement: KeywordStatementNode<'yield'>,
    ctx: Context,
    target: string
  ): Pass1Statement {
    return ctx.op('Yield', { target: located(target, null) }).loc(statement);
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

  translate(statement: KeywordStatementNode<'partial'>, ctx: Context): Pass1Statement {
    return ctx.op('Partial', { params: ctx.helper.params(statement) }).loc(statement);
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

  translate(statement: KeywordStatementNode<'debugger'>, ctx: Context): Pass1Statement {
    return ctx.op('Debugger').loc(statement);
  },
});

export const HAS_BLOCK = new KeywordExpression('has-block', {
  assert(node: KeywordExpressionNode<'has-block'>): string {
    return assertValidHasBlockUsage('has-block', node);
  },
  translate(node: KeywordExpressionNode<'has-block'>, ctx: Context, target: string): Pass1Expr {
    return ctx.expr('HasBlock', { target }).loc(node);
  },
});

export const HAS_BLOCK_PARAMS = new KeywordExpression('has-block-params', {
  assert(node: KeywordExpressionNode<'has-block-params'>): string {
    return assertValidHasBlockUsage('has-block-params', node);
  },
  translate(
    node: KeywordExpressionNode<'has-block-params'>,
    ctx: Context,
    target: string
  ): Pass1Expr {
    return ctx.expr('HasBlockParams', { target }).loc(node);
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
