import { ExpressionContext, Option } from '@glimmer/interfaces';
import { AST, isLiteral } from '@glimmer/syntax';
import { locationToOffsets } from '../location';
import { located, Pass1Statement } from '../pass1/ops';
import { SymbolTable } from '../template-visitor';
import { Context, Pass0Visitor } from './context';
import { hasPath, isHelperInvocation, isKeywordCall } from './is-node';
import { DEBUGGER, IN_ELEMENT, PARTIAL, YIELD } from './keywords';

type Pass0StatementsVisitor = Pass0Visitor['statements'];

class Pass0Statements implements Pass0StatementsVisitor {
  PartialStatement(): never {
    throw new Error(`Handlebars partials are not supported in Glimmer`);
  }

  BlockStatement(block: AST.BlockStatement, ctx: Context): Pass1Statement {
    if (IN_ELEMENT.match(block)) {
      return IN_ELEMENT.translate(block, ctx);
    } else {
      let defaultBlock = ctx.visitBlock(located('default', null), block.program);
      let inverseBlock = block.inverse
        ? [ctx.visitBlock(located('inverse', null), block.inverse)]
        : [];
      let blocks = [defaultBlock, ...inverseBlock];

      return ctx
        .op('BlockInvocation', {
          head: ctx.visitExpr(block.path, ExpressionContext.BlockHead),
          ...ctx.helper.args(block),
          blocks,
        })
        .loc(block);
    }
  }

  ElementNode(element: AST.ElementNode, ctx: Context): Pass1Statement[] {
    let classify = classifyElement(element, ctx.symbols.current);

    // are `@args` are allowed?
    let hasComponentFeatures =
      classify.is === 'component' ||
      classify.is === 'has-dynamic-features' ||
      classify.is === 'dynamic-tag';

    function open(): Pass1Statement {
      switch (classify.is) {
        case 'dynamic-tag':
          return ctx
            .op('OpenComponent', {
              tag: ctx.visitExpr(classify.path, ExpressionContext.ComponentHead),
              selfClosing: element.selfClosing,
              symbols: element.symbols,
            })
            .loc(classify.path);
        case 'component':
          return ctx
            .op('OpenComponent', {
              tag: ctx
                .expr('GetVar', { name: element.tag, context: ExpressionContext.ComponentHead })
                .loc(element),
              selfClosing: element.selfClosing,
              symbols: element.symbols,
            })
            .loc(element);

        case 'named-block':
          return ctx
            .op('OpenNamedBlock', {
              tag: located(element.tag, locationToOffsets(ctx.source, element.loc)),
              symbols: element.symbols,
            })
            .loc(element);

        case 'has-dynamic-features':
          return ctx
            .op('OpenElementWithDynamicFeatures', {
              tag: located(element.tag, locationToOffsets(ctx.source, element.loc)),
            })
            .loc(element);

        case 'html':
          return ctx
            .op('OpenElementWithDynamicFeatures', {
              tag: located(element.tag, locationToOffsets(ctx.source, element.loc)),
            })
            .loc(element);
      }
    }

    function close(): Pass1Statement {
      switch (classify.is) {
        case 'dynamic-tag':
          return ctx.op('CloseDynamicComponent').loc(element);

        case 'named-block':
          return ctx.op('CloseNamedBlock').loc(element);

        case 'component':
          return ctx.op('CloseComponent').loc(element);

        case 'has-dynamic-features':
        case 'html':
          return ctx.op('CloseElement').loc(element);
      }
    }

    let opcodes: Pass1Statement[] = [open()];

    if (classify.is !== 'named-block') {
      opcodes.push(
        ...ctx.ops(
          ctx.mapIntoStatements(attributes(element.attributes), attr =>
            ctx.helper.attr(attr, hasComponentFeatures, element)
          ),
          ctx.mapIntoStatements(element.modifiers, modifier => ctx.helper.modifier(modifier)),
          ctx.op('FlushElement').loc(element)
        )
      );
    }

    return ctx.ops(
      opcodes,
      ctx.startBlock(element),
      ctx.mapIntoStatements(element.children, stmt => ctx.visitStmt(stmt)),
      ctx.endBlock(),
      close()
    );
  }

  MustacheCommentStatement(): [] {
    return [];
  }

  MustacheStatement(mustache: AST.MustacheStatement, ctx: Context): Pass1Statement {
    let { path } = mustache;

    if (isLiteral(path)) {
      return ctx.appendExpr(path, { trusted: !mustache.escaped }).loc(mustache);
    }

    if (hasPath(mustache)) {
      if (YIELD.match(mustache)) {
        return YIELD.translate(mustache, ctx);
      }

      if (PARTIAL.match(mustache)) {
        return PARTIAL.translate(mustache, ctx);
      }

      if (DEBUGGER.match(mustache)) {
        return DEBUGGER.translate(mustache, ctx);
      }
    }

    // {{has-block}} or {{has-block-params}}
    if (isKeywordCall(mustache)) {
      return ctx.append(ctx.helper.keyword(mustache), { trusted: !mustache.escaped }).loc(mustache);
    }

    if (!isHelperInvocation(mustache)) {
      return ctx
        .appendExpr(mustache.path, {
          trusted: !mustache.escaped,
          context: mustacheContext(mustache.path),
        })
        .loc(mustache);
    }

    return ctx
      .append(
        ctx
          .expr('SubExpression', {
            head: ctx.visitExpr(mustache.path, ExpressionContext.CallHead),
            ...ctx.helper.args(mustache),
          })
          .loc(mustache),
        {
          trusted: !mustache.escaped,
        }
      )
      .loc(mustache);
  }

  TextNode(text: AST.TextNode, ctx: Context): Pass1Statement {
    return ctx
      .op('AppendTextNode', {
        value: ctx.expr('Literal', { value: text.chars }).loc(text),
      })
      .loc(text);
  }

  CommentStatement(comment: AST.CommentStatement, ctx: Context): Pass1Statement {
    return ctx
      .op('AppendComment', {
        value: located(comment.value, locationToOffsets(ctx.source, comment.loc)),
      })
      .loc(comment);
  }
}

export const STATEMENTS = new Pass0Statements();

type ClassifiedElement =
  | {
      is: 'dynamic-tag';
      path: AST.PathExpression;
    }
  | {
      is: 'component';
    }
  | { is: 'has-dynamic-features' }
  | { is: 'named-block' }
  | { is: 'html' };

function classifyElement(element: AST.ElementNode, symbols: SymbolTable): ClassifiedElement {
  let open = element.tag.charAt(0);

  let [maybeLocal, ...rest] = element.tag.split('.');
  let isNamedArgument = open === '@';
  let isThisPath = maybeLocal === 'this';

  if (isNamedBlock(element)) {
    return { is: 'named-block' };
  }

  if (isNamedArgument) {
    return {
      is: 'dynamic-tag',
      path: {
        type: 'PathExpression',
        data: true,
        parts: [maybeLocal.slice(1), ...rest],
        this: false,
        original: element.tag,
        loc: element.loc,
      },
    };
  }

  if (isThisPath) {
    return {
      is: 'dynamic-tag',
      path: {
        type: 'PathExpression',
        data: false,
        parts: rest,
        this: true,
        original: element.tag,
        loc: element.loc,
      },
    };
  }

  if (symbols.has(maybeLocal)) {
    return {
      is: 'dynamic-tag',
      path: {
        type: 'PathExpression',
        data: false,
        parts: [maybeLocal, ...rest],
        this: false,
        original: element.tag,
        loc: element.loc,
      },
    };
  }

  if (open === open.toUpperCase() && open !== open.toLowerCase()) {
    return { is: 'component' };
  }

  if (isHTMLElement(element)) {
    // we're looking at an element with no component features
    // (no modifiers, no splattributes)
    return { is: 'html' };
  } else {
    return { is: 'has-dynamic-features' };
  }
}

function isHTMLElement(element: AST.ElementNode): boolean {
  let { attributes, modifiers } = element;

  if (modifiers.length > 0) {
    return false;
  }

  return !attributes.find(attr => attr.name === '...attributes');
}

function attributes(attrs: AST.AttrNode[]): AST.AttrNode[] {
  let out = [];
  let typeAttr: Option<AST.AttrNode> = null;

  for (let attr of attrs) {
    if (attr.name === 'type') {
      typeAttr = attr;
    } else {
      out.push(attr);
    }
  }

  if (typeAttr) {
    out.push(typeAttr);
  }

  return out;
}

function mustacheContext(body: AST.Expression): ExpressionContext {
  if (body.type === 'PathExpression') {
    if (body.parts.length > 1 || body.data) {
      return ExpressionContext.Expression;
    } else {
      return ExpressionContext.AppendSingleId;
    }
  } else {
    return ExpressionContext.Expression;
  }
}

function isNamedBlock(element: AST.ElementNode): boolean {
  return element.tag[0] === ':';
}
