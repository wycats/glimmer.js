import { ExpressionContext, Option } from '@glimmer/interfaces';
import { AST, isLiteral } from '@glimmer/syntax';
import { ProgramSymbolTable, SymbolTable } from '../template-visitor';
import { CompilerContext, Opcode, Pass1Visitor } from './context';
import {
  DEBUGGER,
  hasPath,
  IN_ELEMENT,
  isHelperInvocation,
  isKeywordCall,
  PARTIAL,
  YIELD,
} from './is-node';

/**
 * In reality, AttrNode does not appear as a statement in top-level content, but rather
 * only nested inside of a specific part of the ElementNode, so we can handle it (in
 * context) there and not have to worry about generically seeing one of them in content.
 */
type TopLevelStatement = AST.Statement | AST.Template | AST.Block;

export const HirStatements: Pass1Visitor['statements'] = {
  PartialStatement(): never {
    throw new Error(`Handlebars partials are not supported in Glimmer`);
  },

  Template(program: AST.Template, ctx: CompilerContext): Opcode[] {
    program.symbols = ctx.symbols.current as ProgramSymbolTable;
    return ctx.ops(
      ctx.op('startProgram', program).loc(program),
      ctx.map(program.body as TopLevelStatement[], statement => ctx.stmt(statement)),
      ctx.op('endProgram').loc(program)
    );
  },

  Block(block: AST.Block, ctx: CompilerContext): Opcode[] {
    return ctx.ops(
      ctx.startBlock(block),
      ctx.op('startBlock', block).loc(block),
      ctx.map(block.body as TopLevelStatement[], statement => ctx.stmt(statement)),
      ctx.op('endBlock').loc(block),
      ctx.endBlock()
    );
  },

  BlockStatement(block: AST.BlockStatement, ctx: CompilerContext): Opcode[] {
    if (IN_ELEMENT.match(block)) {
      return IN_ELEMENT.opcode(block, ctx);
    } else {
      return ctx.ops(
        ctx.helper.args(block),
        ctx.expr(block.path, ExpressionContext.BlockHead),
        ctx.stmt(block.inverse || null),
        ctx.stmt(block.program),
        ctx.op('block', !!block.inverse).loc(block)
      );
    }
  },

  ElementNode(element: AST.ElementNode, ctx: CompilerContext): Opcode[] {
    let classify = classifyElement(element, ctx.symbols.current);

    // are `@args` are allowed?
    let hasComponentFeatures =
      classify.is === 'component' || classify.is === 'dynamic' || classify.is === 'dynamic-tag';

    function open(): Opcode[] {
      switch (classify.is) {
        case 'dynamic-tag':
          return ctx.ops(
            ctx.expr(classify.path, ExpressionContext.ComponentHead),
            ctx.op('openComponent', element).loc(element)
          );

        case 'named-block':
          return ctx.ops(ctx.op('openNamedBlock', element).loc(element));

        case 'component':
          return ctx.ops(ctx.op('openComponent', element).loc(element));

        case 'dynamic':
          return ctx.ops(ctx.op('openElement', element, false).loc(element));

        case 'html':
          return ctx.ops(ctx.op('openElement', element, true).loc(element));
      }
    }

    let opcodes = open();

    function close(): Opcode {
      switch (classify.is) {
        case 'dynamic-tag':
          return ctx.op('closeDynamicComponent', element).loc(element);

        case 'named-block':
          return ctx.op('closeNamedBlock', element).loc(element);

        case 'component':
          return ctx.op('closeComponent', element).loc(element);

        case 'dynamic':
        case 'html':
          return ctx.op('closeElement', element).loc(element);
      }
    }

    if (classify.is !== 'named-block') {
      opcodes.push(
        ...ctx.ops(
          ctx.map(attributes(element.attributes), attr =>
            ctx.helper.attr(attr, hasComponentFeatures, element)
          ),
          ctx.map(element.modifiers, modifier => ctx.helper.modifier(modifier)),
          ctx.op('flushElement', element).loc(element)
        )
      );
    }

    return ctx.ops(
      opcodes,
      ctx.startBlock(element),
      ctx.map(element.children as TopLevelStatement[], stmt => ctx.stmt(stmt)),
      ctx.endBlock(),
      close()
    );
  },

  MustacheCommentStatement(): [] {
    return [];
  },

  MustacheStatement(mustache: AST.MustacheStatement, ctx: CompilerContext): Opcode[] {
    let { path } = mustache;

    if (isLiteral(path)) {
      return [
        ...ctx.expr(path, ExpressionContext.Expression),
        ctx.op('append', !mustache.escaped).loc(mustache),
      ];
    }

    if (hasPath(mustache)) {
      if (YIELD.match(mustache)) {
        return YIELD.opcode(mustache, ctx);
      }

      if (PARTIAL.match(mustache)) {
        return PARTIAL.opcode(mustache, ctx);
      }

      if (DEBUGGER.match(mustache)) {
        return DEBUGGER.opcode(mustache, ctx);
      }
    }

    // {{has-block}} or {{has-block-params}}
    if (isKeywordCall(mustache)) {
      return [...ctx.helper.keyword(mustache), ctx.op('append', !mustache.escaped).loc(mustache)];
    }

    if (!isHelperInvocation(mustache)) {
      return ctx.ops(
        ctx.expr(mustache.path, mustacheContext(mustache.path)),
        ctx.op('append', !mustache.escaped).loc(mustache)
      );
    }

    return ctx.ops(
      ctx.helper.args(mustache),
      ctx.expr(mustache.path, ExpressionContext.CallHead),
      ctx.op('helper').loc(mustache),
      ctx.op('append', !mustache.escaped).loc(mustache)
    );
  },

  TextNode(text: AST.TextNode, ctx: CompilerContext): Opcode {
    return ctx.op('text', text.chars).loc(text);
  },

  CommentStatement(comment: AST.CommentStatement, ctx: CompilerContext): Opcode {
    return ctx.op('comment', comment.value).loc(comment);
  },
};

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
  // let isLocal = symbols.has(maybeLocal);
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
