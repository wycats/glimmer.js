import { ExpressionContext } from '@glimmer/interfaces';
import { AST, SyntaxError } from '@glimmer/syntax';
import { assertNever } from '@glimmer/util';
import { located, Pass1Expr, Pass1Statement } from '../pass1/ops';
import { ProgramSymbolTable } from '../template-visitor';
import { getAttrNamespace } from '../utils';
import { Context } from './context';
import { EXPRESSIONS } from './expressions';
import {
  assertIsSimpleHelper,
  isHelperInvocation,
  IsKeywordCall,
  isKeywordCall,
  isSimplePath,
} from './is-node';
import { HAS_BLOCK, HAS_BLOCK_PARAMS } from './keywords';
import { offsetsForHashKey, paramsOffsets } from './location';
import { STATEMENTS } from './statements';

export function visit(source: string, root: AST.Template): Pass1Statement[] {
  let ctx = new Context(source, {
    expressions: EXPRESSIONS,
    statements: STATEMENTS,
  });

  root.symbols = ctx.symbols.current as ProgramSymbolTable;

  return ctx.mapIntoStatements(root.body, stmt => ctx.visitStmt(stmt));
}

/**
 * All state in this object must be readonly, and this object is just for
 * convenience.
 *
 * It is possible to implement pieces of the compilation as functions that
 * take the compiler context, but since that's so common, we group those
 * function here. (and in fact, that's how keywords work)
 */
export class CompilerHelper {
  readonly ctx: Context;

  constructor(context: Context) {
    this.ctx = context;
  }

  visitExpr(node: AST.Expression, context: ExpressionContext): Pass1Expr {
    return this.ctx.visitExpr(node, context);
  }

  visitStmt<T extends AST.Statement>(node: T): Pass1Statement[] {
    return this.ctx.visitStmt(node);
  }

  attr(
    attr: AST.AttrNode,
    hasComponentFeatures: boolean,
    elementNode: AST.ElementNode
  ): Pass1Statement[] {
    assertValidArgumentName(attr, hasComponentFeatures, elementNode);

    let name = attr.name;
    let namespace = getAttrNamespace(name) || undefined;
    let { expr: value } = this.attrValue(attr.value);

    if (name[0] === '@') {
      // Arg
      return this.ctx.ops(this.ctx.op('Arg', { name: located(name, null), value }).loc(attr));
    }

    // Attr
    let isTrusting = isTrustingNode(attr.value);

    // splattributes
    if (name === '...attributes') {
      return this.ctx.ops(this.ctx.op('AttrSplat').loc(attr));
    }

    return this.ctx.ops(
      this.ctx
        .op('Attr', {
          name: located(name, null),
          value,
          namespace,
          kind: {
            trusting: isTrusting,
            component: hasComponentFeatures,
          },
        })
        .loc(attr)
    );
  }

  modifier(modifier: AST.ElementModifierStatement): Pass1Statement[] {
    return this.ctx.ops(
      this.ctx
        .op('Modifier', {
          head: this.visitExpr(modifier.path, ExpressionContext.ModifierHead),
          params: this.params({ path: modifier.path, params: modifier.params }),
          hash: this.hash(modifier.hash),
        })
        .loc(modifier)
    );
  }

  args({
    path,
    params,
    hash,
  }: {
    path: AST.Expression;
    params: AST.Expression[];
    hash: AST.Hash;
  }): { params: Pass1Expr<'Params'>; hash: Pass1Expr<'Hash'> } {
    return { params: this.params({ path, params }), hash: this.hash(hash) };
  }

  params({
    path,
    params: list,
  }: {
    path: AST.Expression;
    params: AST.Expression[];
  }): Pass1Expr<'Params'> {
    let offsets = paramsOffsets({ path, params: list }, this.ctx.source);

    if (!isPresent(list)) {
      return this.ctx.expr('Params', { list: [] }).offsets(offsets);
    }

    return this.ctx
      .expr('Params', {
        list: this.ctx.mapIntoExprs(list, expr => [
          this.visitExpr(expr, ExpressionContext.Expression),
        ]),
      })
      .offsets(offsets);
  }

  hash(hash: AST.Hash): Pass1Expr<'Hash'> {
    let pairs = hash.pairs;

    if (!isPresent(pairs)) {
      return this.ctx.expr('Hash', { pairs: [] }).loc(hash);
    }

    let mappedPairs = this.ctx.mapIntoExprs<'HashPair', AST.HashPair>(pairs, pair => [
      this.ctx
        .expr('HashPair', {
          key: located(pair.key, offsetsForHashKey(pair, this.ctx.source)),
          value: this.visitExpr(pair.value, ExpressionContext.Expression),
        })
        .loc(pair),
    ]);

    return this.ctx.expr('Hash', { pairs: mappedPairs }).loc(hash);
  }

  concat(concat: AST.ConcatStatement): Pass1Expr {
    let exprs = this.ctx.mapIntoExprs(assertPresent([...concat.parts].reverse()), part => [
      this.attrValue(part).expr,
    ]);
    return this.ctx.expr('Concat', { parts: exprs }).loc(concat);
  }

  simpleAttrValue(
    value: AST.TextNode | AST.MustacheStatement
  ): { expr: Pass1Expr; isStatic: boolean } {
    // returns the static value if the value is static
    if (value.type === 'TextNode') {
      return { expr: this.ctx.expr('Literal', { value: value.chars }).loc(value), isStatic: true };
    }

    if (isKeywordCall(value)) {
      return { expr: this.keyword(value), isStatic: false };
    }

    if (isHelperInvocation(value)) {
      assertIsSimpleHelper(value, value.loc, 'helper');

      return {
        expr: this.ctx
          .expr('SubExpression', {
            head: this.ctx.visitExpr(value.path, ExpressionContext.CallHead),
            ...this.args(value),
          })
          .loc(value),
        isStatic: false,
      };
    }

    if (value.path.type === 'PathExpression' && isSimplePath(value.path)) {
      // x={{simple}}
      return {
        expr: this.visitExpr(value.path, ExpressionContext.AppendSingleId),
        isStatic: false,
      };
    } else {
      // x={{simple.value}}
      return { expr: this.visitExpr(value.path, ExpressionContext.Expression), isStatic: false };
    }
  }

  attrValue(
    value: AST.TextNode | AST.MustacheStatement | AST.ConcatStatement
  ): { expr: Pass1Expr; isStatic: boolean } {
    if (value.type === 'ConcatStatement') {
      return {
        expr: this.concat(value),
        isStatic: false,
      };
    }

    return this.simpleAttrValue(value);
  }

  keyword(call: IsKeywordCall): Pass1Expr {
    if (HAS_BLOCK.match(call)) {
      return HAS_BLOCK.translate(call, this.ctx);
    } else if (HAS_BLOCK_PARAMS.match(call)) {
      return HAS_BLOCK_PARAMS.translate(call, this.ctx);
    } else {
      return assertNever(call);
    }
  }

  pathWithContext(path: AST.PathExpression, context: ExpressionContext): Pass1Expr {
    let { parts } = path;
    if (path.data) {
      return this.argPath(`@${parts[0]}`, parts.slice(1), path);
    } else if (path.this) {
      return this.thisPath(parts, path);
    } else {
      return this.varPath(parts[0], parts.slice(1), path, context);
    }
  }

  path(head: Pass1Expr, tail: string[], node: AST.BaseNode): Pass1Expr {
    if (tail.length === 0) {
      return head;
    } else {
      return this.ctx.expr('Path', { head, tail: tail.map(e => located(e, null)) }).loc(node);
    }
  }

  argPath(head: string, tail: string[], node: AST.BaseNode): Pass1Expr {
    return this.path(this.ctx.expr('GetArg', { name: head }).offsets(null), tail, node);
  }

  varPath(head: string, tail: string[], node: AST.BaseNode, context: ExpressionContext): Pass1Expr {
    return this.path(this.ctx.expr('GetVar', { name: head, context }).offsets(null), tail, node);
  }

  thisPath(tail: string[], node: AST.BaseNode): Pass1Expr {
    return this.path(this.ctx.expr('GetThis').offsets(null), tail, node);
  }
}

function assertValidArgumentName(
  attribute: AST.AttrNode,
  isComponent: boolean,
  elementNode: AST.ElementNode
) {
  if (!isComponent && attribute.name[0] === '@') {
    throw new SyntaxError(
      `${attribute.name} is not a valid attribute name. @arguments are only allowed on components, but the tag for this element (\`${elementNode.tag}\`) is a regular, non-component HTML element.`,
      attribute.loc
    );
  }
}

/**
 * This function is checking whether an AST node is a triple-curly, which means that it's
 * a "trusting" node. In the Handlebars AST, this is indicated by the `escaped` flag, which
 * is a bit of a double-negative, so we change the terminology here for clarity.
 */
function isTrustingNode(value: AST.MustacheStatement | AST.TextNode | AST.ConcatStatement) {
  if (value.type === 'MustacheStatement') {
    return !value.escaped;
  } else {
    return false;
  }
}

function isPresent<T>(list: T[]): list is [T, ...T[]] {
  return list.length > 0;
}

function assertPresent<T>(list: T[]): [T, ...T[]] {
  if (isPresent(list)) {
    return list;
  } else {
    throw new Error(`unexpected empty list`);
  }
}
