import { AST, builders, SyntaxError } from '@glimmer/syntax';
import { ExpressionContext, Option } from '@glimmer/interfaces';
import * as pass1 from '../pass1/ops';
import { Context, ImmutableContext } from './context';
import { HelperBlock, HelperExpression, HelperStatement, isPresent } from './is-node';
import { assertPresent, mapPresent, PresentArray, toPresentOption } from '@glimmer/util';

interface KeywordPathNode<K extends string> extends AST.PathExpression {
  original: K;
}

interface KeywordStatementNode<K extends string> extends HelperStatement {
  path: KeywordPathNode<K>;
}

interface KeywordDelegate<N extends AST.BaseNode, V, Out> {
  assert(node: N, ctx: ImmutableContext): V;
  translate(node: N, ctx: Context, param: V): Out;
}

interface KeywordBlockNode<K extends string> extends HelperBlock {
  path: KeywordPathNode<K>;
}

class KeywordBlock<K extends string, V> {
  constructor(
    private keyword: K,
    private delegate: KeywordDelegate<KeywordBlockNode<K>, V, pass1.Statement>
  ) {}

  match(mustache: AST.BlockStatement): mustache is KeywordBlockNode<K> {
    if (mustache.path.type === 'PathExpression') {
      return mustache.path.original === this.keyword;
    } else {
      return false;
    }
  }

  translate(mustache: KeywordBlockNode<K>, ctx: Context): pass1.Statement {
    let param = this.delegate.assert(mustache, ctx);
    return this.delegate.translate(mustache, ctx, param);
  }
}

class KeywordStatement<K extends string, V> {
  constructor(
    private keyword: K,
    private delegate: KeywordDelegate<KeywordStatementNode<K>, V, pass1.Statement>
  ) {}

  match(mustache: HelperStatement): mustache is KeywordStatementNode<K> {
    return mustache.path.original === this.keyword;
  }

  translate(mustache: KeywordStatementNode<K>, ctx: Context): pass1.Statement {
    let param = this.delegate.assert(mustache, ctx);
    return this.delegate.translate(mustache, ctx, param);
  }
}

export interface KeywordExpressionNode<K extends string> extends HelperExpression {
  path: KeywordPathNode<K>;
}

class KeywordExpression<K extends string, V> {
  constructor(
    private keyword: K,
    private delegate: KeywordDelegate<KeywordExpressionNode<K>, V, pass1.Expr>
  ) {}

  match(mustache: HelperExpression): mustache is KeywordExpressionNode<K> {
    return mustache.path.original === this.keyword;
  }

  translate(mustache: KeywordExpressionNode<K>, ctx: Context): pass1.Expr {
    let param = this.delegate.assert(mustache, ctx);
    return this.delegate.translate(mustache, ctx, param);
  }
}

export const IN_ELEMENT = new KeywordBlock('in-element', {
  assert(
    statement: KeywordBlockNode<'in-element'>
  ): { insertBefore?: AST.Expression; destination: AST.Expression } {
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

    destination = assertPresent(statement.params)[0];

    // TODO Better syntax checks

    return { insertBefore, destination };
  },

  translate(
    block: KeywordBlockNode<'in-element'>,
    ctx: Context,
    { insertBefore, destination }: { insertBefore?: AST.Expression; destination: AST.Expression }
  ): pass1.Statement {
    let guid = ctx.cursor();

    return ctx
      .op(pass1.InElement, {
        block: ctx.visitBlock(ctx.slice('default').offsets(null), block.program),
        insertBefore: insertBefore
          ? ctx.visitExpr(insertBefore, ExpressionContext.Expression)
          : undefined,
        guid,
        destination: ctx.visitExpr(destination, ExpressionContext.Expression),
      })
      .loc(block);
  },
});

export const YIELD = new KeywordStatement('yield', {
  assert(
    statement: KeywordStatementNode<'yield'>
  ): { target: AST.StringLiteral; params: Option<PresentArray<AST.Expression>> } {
    let { pairs } = statement.hash;
    let params = toPresentOption(statement.params);

    if (isPresent(pairs)) {
      let first = pairs[0];

      if (first.key !== 'to' || pairs.length > 1) {
        throw new SyntaxError(`yield only takes a single named argument: 'to'`, first.loc);
      }

      let target = first.value;

      if (target.type !== 'StringLiteral') {
        throw new SyntaxError(`you can only yield to a literal value`, target.loc);
      }

      return { target, params };
    } else {
      return { target: builders.string('default'), params };
    }
  },

  translate(
    statement: KeywordStatementNode<'yield'>,
    ctx: Context,
    {
      target,
      params: astParams,
    }: { target: AST.StringLiteral; params: Option<PresentArray<AST.Expression>> }
  ): pass1.Statement {
    let params = mapPresent(astParams, expr => ctx.visitExpr(expr));
    return ctx
      .op(pass1.Yield, {
        target: ctx.slice(target.value).loc(target),
        params: ctx.expr(pass1.Params, { list: params }).loc(astParams),
      })
      .loc(statement);
  },
});

export const PARTIAL = new KeywordStatement('partial', {
  assert(statement: KeywordStatementNode<'partial'>): AST.Expression | undefined {
    let {
      params,
      hash: { pairs },
      escaped,
      loc,
    } = statement;

    let hasParams = isPresent(params);

    if (!hasParams) {
      throw new SyntaxError(
        `Partial found with no arguments. You must specify a template name. (on line ${loc.start.line})`,
        statement.loc
      );
    }

    if (hasParams && params.length !== 1) {
      throw new SyntaxError(
        `Partial found with ${params.length} arguments. You must specify a template name. (on line ${loc.start.line})`,
        statement.loc
      );
    }

    if (isPresent(pairs)) {
      throw new SyntaxError(
        `Partial does not take any named arguments (on line ${loc.start.line})`,
        statement.loc
      );
    }

    if (!escaped) {
      throw new SyntaxError(
        `{{{partial ...}}} is not supported, please use {{partial ...}} instead (on line ${loc.start.line})`,
        statement.loc
      );
    }

    return params[0];
  },

  translate(
    statement: KeywordStatementNode<'partial'>,
    ctx: Context,
    expr: AST.Expression | undefined
  ): pass1.Statement {
    return ctx
      .op(pass1.Partial, {
        expr:
          expr === undefined
            ? ctx.visitExpr(builders.undefined(), ExpressionContext.Expression)
            : ctx.visitExpr(expr, ExpressionContext.Expression),
      })
      .loc(statement);
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

  translate(statement: KeywordStatementNode<'debugger'>, ctx: Context): pass1.Statement {
    return ctx.op(pass1.Debugger).loc(statement);
  },
});

export const HAS_BLOCK = new KeywordExpression('has-block', {
  assert(node: KeywordExpressionNode<'has-block'>, ctx: Context): pass1.SourceSlice {
    return assertValidHasBlockUsage('has-block', node, ctx);
  },
  translate(
    node: KeywordExpressionNode<'has-block'>,
    ctx: Context,
    target: pass1.SourceSlice
  ): pass1.Expr {
    return ctx.expr(pass1.HasBlock, { target }).loc(node);
  },
});

export const HAS_BLOCK_PARAMS = new KeywordExpression('has-block-params', {
  assert(
    node: KeywordExpressionNode<'has-block-params'>,
    ctx: ImmutableContext
  ): pass1.SourceSlice {
    return assertValidHasBlockUsage('has-block-params', node, ctx);
  },
  translate(
    node: KeywordExpressionNode<'has-block-params'>,
    ctx: Context,
    target: pass1.SourceSlice
  ): pass1.Expr {
    return ctx.expr(pass1.HasBlockParams, { target }).loc(node);
  },
});

export function assertValidHasBlockUsage(
  type: string,
  call: AST.Call,
  ctx: ImmutableContext
): pass1.SourceSlice {
  let { params, hash, loc } = call;

  if (hash && hash.pairs.length > 0) {
    throw new SyntaxError(`${type} does not take any named arguments`, call.loc);
  }

  if (params.length === 0) {
    return ctx.slice('default').offsets(null);
  } else if (params.length === 1) {
    let param = params[0];
    if (param.type === 'StringLiteral') {
      return ctx.slice(param.value).offsets(null);
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
