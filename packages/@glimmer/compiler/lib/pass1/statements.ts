import { ExpressionContext, Option } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { expect } from '@glimmer/util';
import * as pass1 from '../pass1/ops';
import * as pass2 from '../pass2/ops';
import { OpArgs, OpConstructor } from '../shared/op';
import { SymbolTable } from '../template-visitor';
import { Context, Pass1Visitor } from './context';

type Pass1StatementsVisitor = Pass1Visitor['statements'];

class Pass1Statements implements Pass1StatementsVisitor {
  Yield({ target }: OpArgs<pass1.Yield>, ctx: Context): pass2.Op {
    return ctx.op(pass2.Yield, { symbol: ctx.table.allocateBlock(target.getString()) });
  }

  Debugger(_: OpArgs<pass1.Debugger>, ctx: Context): pass2.Op {
    return ctx.op(pass2.Debugger);
  }

  InElement(_: OpArgs<pass1.InElement>, _ctx: Context): pass2.Op {
    // it really doesn't make sense to turn this back into something handled by a macro
    // downstream
    throw new Error('unimplemented');
  }

  Partial(_: OpArgs<pass1.Partial>, ctx: Context): pass2.Op {
    return ctx.op(pass2.Partial);
  }

  AppendTextNode({ value }: OpArgs<pass1.AppendTextNode>, ctx: Context): pass2.Op[] {
    return ctx.ops(ctx.visitExpr(value), ctx.op(pass2.AppendTextNode));
  }

  AppendTrustedHTML({ value }: OpArgs<pass1.AppendTrustedHTML>, ctx: Context): pass2.Op[] {
    return ctx.ops(ctx.visitExpr(value), ctx.op(pass2.AppendTrustedHTML));
  }

  AppendComment(args: OpArgs<pass1.AppendComment>, ctx: Context): pass2.Op {
    return ctx.op(pass2.AppendComment, args);
  }

  OpenNamedBlock({ tag, symbols }: OpArgs<pass1.OpenNamedBlock>, ctx: Context): pass2.Op {
    ctx.startBlock(symbols);
    return ctx.op(pass2.OpenNamedBlock, { tag, symbols });
  }

  OpenComponent({ tag, symbols }: OpArgs<pass1.OpenComponent>, ctx: Context): pass2.Op[] {
    return ctx.ops(ctx.visitExpr(tag), ctx.op(pass2.OpenComponent, { symbols }));
  }

  OpenSimpleElement(args: OpArgs<pass1.OpenSimpleElement>, ctx: Context): pass2.Op {
    return ctx.op(pass2.OpenSimpleElement, args);
  }

  CloseElementBlock(_: OpArgs<pass1.CloseElementBlock>, ctx: Context): pass2.Op[] {
    ctx.endBlock();
    return [];
  }

  CloseElement(_: OpArgs<pass1.CloseElement>, ctx: Context): pass2.Op {
    return ctx.op(pass2.CloseElement);
  }

  CloseNamedBlock(_: OpArgs<pass1.CloseNamedBlock>, ctx: Context): pass2.Op {
    ctx.endBlock();
    return ctx.op(pass2.CloseNamedBlock);
  }

  CloseComponent(_: OpArgs<pass1.CloseComponent>, ctx: Context): pass2.Op {
    return ctx.op(pass2.CloseComponent);
  }

  CloseDynamicComponent(args: OpArgs<pass1.CloseDynamicComponent>, ctx: Context): pass2.Op {
    return ctx.op(pass2.CloseDynamicComponent);
  }

  OpenElementWithDynamicFeatures(
    args: OpArgs<pass1.OpenElementWithDynamicFeatures>,
    ctx: Context
  ): pass2.Op {
    return ctx.op(pass2.OpenElementWithDynamicFeatures, args);
  }

  Modifier({ head, params, hash }: OpArgs<pass1.Modifier>, ctx: Context): pass2.Op[] {
    return ctx.ops(ctx.helper.args({ params, hash }), ctx.visitExpr(head), ctx.op(pass2.Modifier));
  }

  FlushElement({ symbols }: OpArgs<pass1.FlushElement>, ctx: Context): pass2.Op {
    ctx.startBlock(symbols);
    return ctx.op(pass2.FlushElement);
  }

  AttrSplat(_: OpArgs<pass1.AttrSplat>, ctx: Context): pass2.Op {
    return ctx.op(pass2.AttrSplat, { symbol: ctx.table.allocateBlock('attrs') });
  }

  Arg({ name, value }: OpArgs<pass1.Arg>, ctx: Context): pass2.Op[] {
    let argOp = value.name === 'Literal' ? pass2.StaticArg : pass2.DynamicArg;
    let symbol = ctx.table.allocateNamed(name.getString());

    return ctx.ops(
      ctx.visitExpr(value),
      ctx.op<pass2.AnyArg>(argOp, { symbol })
    );
  }

  Attr({ kind, name, value, namespace }: OpArgs<pass1.Attr>, ctx: Context): pass2.Op[] {
    let attr = classifyAttr(kind, value);

    return ctx.ops(
      ctx.visitExpr(value),
      ctx.op<pass2.AnyAttr>(attr, { name, namespace })
    );
  }

  Block({ symbols, body }: OpArgs<pass1.Block>, ctx: Context): pass2.Op[] {
    return ctx.ops(
      ctx.op(pass2.StartBlock, symbols),
      ctx.map(body, statement => ctx.visitStmt(statement)),
      ctx.op(pass2.EndBlock)
    );
  }

  BlockInvocation(
    { head, params, hash, blocks }: OpArgs<pass1.BlockInvocation>,
    ctx: Context
  ): pass2.Op[] {
    let inverseBlock = pass1.getBlock(blocks, 'inverse') || null;
    let defaultBlock = expect(pass1.getBlock(blocks, 'default'), 'expected a default block');

    return ctx.ops(
      ctx.helper.args({ params, hash }),
      ctx.visitExpr(head),
      ctx.visitStmt(inverseBlock),
      ctx.visitStmt(defaultBlock),
      ctx.op(pass2.InvokeBlock, { hasInverse: !!inverseBlock })
    );
  }
}

export const STATEMENTS = new Pass1Statements();

// export const HirStatements: Pass1Visitor['statements'] = {
// ElementNode(element: AST.ElementNode, ctx: Context): Pass2Op[] {
//   let classify = classifyElement(element, ctx.symbols.current);
//   // are `@args` are allowed?
//   let hasComponentFeatures =
//     classify.is === 'component' || classify.is === 'dynamic' || classify.is === 'dynamic-tag';
//   function open(): Pass2Op[] {
//     switch (classify.is) {
//       case 'dynamic-tag':
//         return ctx.ops(
//           ctx.visitExpr(classify.path, ExpressionContext.ComponentHead),
//           ctx.op('openComponent', element).loc(element)
//         );
//       case 'named-block':
//         return ctx.ops(ctx.op('openNamedBlock', element).loc(element));
//       case 'component':
//         return ctx.ops(ctx.op('openComponent', element).loc(element));
//       case 'dynamic':
//         return ctx.ops(ctx.op('openElement', { element, simple: false }).loc(element));
//       case 'html':
//         return ctx.ops(ctx.op('openElement', { element, simple: true }).loc(element));
//     }
//   }
//   let opcodes = open();
//   function close(): Pass2Op {
//     switch (classify.is) {
//       case 'dynamic-tag':
//         return ctx.op('closeDynamicComponent', element).loc(element);
//       case 'named-block':
//         return ctx.op('closeNamedBlock', element).loc(element);
//       case 'component':
//         return ctx.op('closeComponent', element).loc(element);
//       case 'dynamic':
//       case 'html':
//         return ctx.op('closeElement', element).loc(element);
//     }
//   }
//   if (classify.is !== 'named-block') {
//     opcodes.push(
//       ...ctx.ops(
//         ctx.map(attributes(element.attributes), attr =>
//           ctx.helper.attr(attr, hasComponentFeatures, element)
//         ),
//         ctx.map(element.modifiers, modifier => ctx.helper.modifier(modifier)),
//         ctx.op('flushElement', element).loc(element)
//       )
//     );
//   }
//   return ctx.ops(
//     opcodes,
//     ctx.startBlock(element),
//     ctx.map(element.children as TopLevelStatement[], stmt => ctx.visitStmt(stmt)),
//     ctx.endBlock(),
//     close()
//   );
// },
// MustacheStatement(mustache: AST.MustacheStatement, ctx: Context): Pass2Op[] {
//   let { path } = mustache;
//   if (isLiteral(path)) {
//     return [
//       ...ctx.visitExpr(path, ExpressionContext.Expression),
//       ctx.op('append', !mustache.escaped).loc(mustache),
//     ];
//   }
//   if (hasPath(mustache)) {
//     if (YIELD.match(mustache)) {
//       return YIELD.opcode(mustache, ctx);
//     }
//     if (PARTIAL.match(mustache)) {
//       return PARTIAL.opcode(mustache, ctx);
//     }
//     if (DEBUGGER.match(mustache)) {
//       return DEBUGGER.opcode(mustache, ctx);
//     }
//   }
//   // {{has-block}} or {{has-block-params}}
//   if (isKeywordCall(mustache)) {
//     return [...ctx.helper.keyword(mustache), ctx.op('append', !mustache.escaped).loc(mustache)];
//   }
//   if (!isHelperInvocation(mustache)) {
//     return ctx.ops(
//       ctx.visitExpr(mustache.path, mustacheContext(mustache.path)),
//       ctx.op('append', !mustache.escaped).loc(mustache)
//     );
//   }
//   return ctx.ops(
//     ctx.helper.args(mustache),
//     ctx.visitExpr(mustache.path, ExpressionContext.CallHead),
//     ctx.op('helper').loc(mustache),
//     ctx.op('append', !mustache.escaped).loc(mustache)
//   );
// },
// TextNode(text: AST.TextNode, ctx: Context): Pass2Op {
//   return ctx.op('text', text.chars).loc(text);
// },
// CommentStatement(comment: AST.CommentStatement, ctx: Context): Pass2Op {
//   return ctx.op('comment', comment.value).loc(comment);
// },
// };

function classifyAttr(kind: pass1.AttrKind, value: pass1.Expr): OpConstructor<pass2.AnyAttr> {
  if (value.name === 'Literal') {
    return kind.component ? pass2.StaticComponentAttr : pass2.StaticAttr;
  }

  if (kind.trusting) {
    return kind.component ? pass2.TrustingComponentAttr : pass2.TrustingAttr;
  } else {
    return kind.component ? pass2.ComponentAttr : pass2.DynamicAttr;
  }
}

type ClassifiedElement =
  | {
      is: 'dynamic-tag';
      path: AST.PathExpression;
    }
  | {
      is: 'component';
    }
  | { is: 'dynamic' }
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
    return { is: 'dynamic' };
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
