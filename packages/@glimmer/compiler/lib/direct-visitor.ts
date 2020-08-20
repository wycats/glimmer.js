import { ExpressionContext } from '@glimmer/interfaces';
import { AST, isLiteral } from '@glimmer/syntax';
import { assert, assertNever, NonemptyStack } from '@glimmer/util';
import {
  AllocateSymbolsOp,
  HirExpressionOp,
  HirExpressionOps,
  HirStatementOp,
  HirStatementOps,
  NewAllocateSymbolsOps,
  Opcode,
  SourceLocation,
} from './compiler-ops';
import {
  assertIsSimpleHelper,
  DEBUGGER,
  HAS_BLOCK,
  HAS_BLOCK_PARAMS,
  isHelperInvocation,
  isKeywordCall,
  IsKeywordCall,
  isPresent,
  isSimplePath,
  PARTIAL,
  YIELD,
} from './is-node';
import { locationToOffset } from './location';
import { ProgramSymbolTable, SymbolTable } from './template-visitor';

type HirStatements = {
  [P in keyof HirStatementOps]: (node: AST.Nodes[P], source: string) => HirStatementOp<P>;
};

type HirExpressions = {
  [P in keyof HirExpressionOps]: (node: AST.Nodes[P], source: string) => HirExpressionOp<P>;
};

function flatMap<T, U>(input: Iterable<T>, callback: (input: T) => U[]): U[] {
  let out: U[] = [];

  for (let item of input) {
    out.push(...callback(item));
  }

  return out;
}

const HirExpressions: CompilerVisitor<AST.Expression | AST.ConcatStatement> = {
  PathExpression(
    path: AST.PathExpression,
    ctx: CompilerContext
  ): HirExpressionOp<'PathExpression'> {
    return ctx.helper.pathWithContext(path, ExpressionContext.Expression);
  },

  StringLiteral(literal: AST.StringLiteral, ctx: CompilerContext): Opcode<'literal'> {
    return ctx.opcode(literal, 'literal', literal.value);
  },

  BooleanLiteral(literal: AST.BooleanLiteral, ctx: CompilerContext): Opcode<'literal'> {
    return ctx.opcode(literal, 'literal', literal.value);
  },

  NumberLiteral(literal: AST.NumberLiteral, ctx: CompilerContext): Opcode<'literal'> {
    return ctx.opcode(literal, 'literal', literal.value);
  },

  NullLiteral(literal: AST.NullLiteral, ctx: CompilerContext): Opcode<'literal'> {
    return ctx.opcode(literal, 'literal', literal.value);
  },

  UndefinedLiteral(literal: AST.UndefinedLiteral, ctx: CompilerContext): Opcode<'literal'> {
    return ctx.opcode(literal, 'literal', literal.value);
  },

  ConcatStatement(
    concat: AST.ConcatStatement,
    ctx: CompilerContext
  ): HirExpressionOp<'ConcatStatement'> {
    return ctx.helper.concat(concat);
  },

  SubExpression(expr: AST.SubExpression, ctx: CompilerContext): HirExpressionOp<'SubExpression'> {
    return ctx.helper.sexp(expr);
  },
};

const HirStatements: CompilerVisitor<AST.TopLevelStatement | AST.Template> = {
  PartialStatement(): never {
    throw new Error(`Handlebars partials are not supported in Glimmer`);
  },

  Template(program: AST.Template, ctx: CompilerContext): Opcode[] {
    program.symbols = ctx.symbols.current as ProgramSymbolTable;
    return ops(
      ctx.opcode(program, 'startProgram', program),
      flatMap(program.body, statement => ctx.stmt(statement)),
      ctx.opcode(program, 'endProgram')
    );
  },

  Block(block: AST.Block, ctx: CompilerContext): Opcode[] {
    return [
      ...ctx.startBlock(block),
      ctx.opcode(block, 'startBlock', block),
      ...flatMap(block.body, statement => ctx.stmt(statement)),
      ctx.opcode(block, 'endBlock'),
      ...ctx.endBlock(),
    ];
  },

  AttrNode(block: AST.AttrNode, ctx: CompilerContext): Opcode[] {
    throw new Error('not implemented');
  },

  BlockStatement(block: AST.BlockStatement, ctx: CompilerContext): Opcode[] {
    return [
      ...ctx.helper.args(block, 'block'),
      ...ctx.expr(block.path, ExpressionContext.BlockHead),
      ...ctx.stmt(block.inverse || null),
      ...ctx.stmt(block.program),
      ctx.opcode(block, 'block', !!block.inverse),
    ];
  },

  ElementNode(element: AST.ElementNode, ctx: CompilerContext): Opcode[] {
    return [
      ctx.opcode(element, 'openElement', element, true),
      ctx.opcode(element, 'flushElement', element),
      ...ctx.startBlock(element),
      ...flatMap(element.children, statement => ctx.stmt(statement)),
      ctx.opcode(element, 'closeElement', element),
      ...ctx.endBlock(),
    ];
  },

  MustacheCommentStatement(): [] {
    return [];
  },

  MustacheStatement(mustache: AST.MustacheStatement, ctx: CompilerContext): Opcode[] {
    let { path } = mustache;

    if (isLiteral(path)) {
      return [
        ...ctx.expr(path, ExpressionContext.Expression),
        ctx.opcode(mustache, 'append', !mustache.escaped),
      ];
    }

    if (!isHelperInvocation(mustache)) {
      return [
        ...ctx.expr(mustache.path, mustacheContext(mustache.path)),
        ctx.opcode(mustache, 'append', !mustache.escaped),
      ];
    }

    if (YIELD.match(mustache)) {
      return YIELD.opcode(mustache, ctx);
    }

    if (PARTIAL.match(mustache)) {
      return PARTIAL.opcode(mustache, ctx);
    }

    if (DEBUGGER.match(mustache)) {
      return DEBUGGER.opcode(mustache, ctx);
    }

    // {{has-block}} or {{has-block-params}}
    if (isKeywordCall(mustache)) {
      return [...ctx.helper.keyword(mustache), ctx.opcode(mustache, 'append', !mustache.escaped)];
    }

    return [
      ...ctx.helper.args(mustache, 'helper'),
      ...ctx.expr(mustache.path, ExpressionContext.CallHead),
      ctx.opcode(mustache, 'helper'),
      ctx.opcode(mustache, 'append', !mustache.escaped),
    ];
  },

  TextNode(text: AST.TextNode, ctx: CompilerContext): Opcode<'text'> {
    return ctx.opcode(text, 'text', text.chars);
  },

  CommentStatement(comment: AST.CommentStatement, ctx: CompilerContext): Opcode<'comment'> {
    return ctx.opcode(comment, 'comment', comment.value);
  },
};

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

type Opcodes = Opcode | Opcodes[];

function ops(opcode: Opcode): Opcode[];
function ops(...opcodes: Opcodes[]): Opcode[];
function ops(first: Opcodes, ...opcodes: Opcodes[]): Opcode[] {
  let out: Opcode[] = [];

  if (Array.isArray(first)) {
    out.push(...ops(...first));
  } else {
    out.push(first);
  }

  for (let opcode of opcodes) {
    out.push(...ops(opcode));
  }

  return out;
}

type SelectNode<N extends AST.Node, K extends N['type']> = N extends { type: K } ? N : never;

type CompilerVisitor<N extends AST.Node> = {
  [P in N['type']]: (value: SelectNode<N, P>, ctx: CompilerContext) => Opcode | Opcode[];
};

class HirVisitor<N extends AST.Node> {
  constructor(private statements: CompilerVisitor<N>) {}

  visit<T extends N>(node: T, ctx: CompilerContext): Opcode[] {
    let t = node.type as T['type'];
    let visit = this.statements[t];
    // let visit = this.statements[node.type] as (value: AST.Nodes[K], source: string) => Opcode[];
    let opcodes = visit((node as unknown) as SelectNode<N, T['type']>, ctx);

    return Array.isArray(opcodes) ? opcodes : [opcodes];
  }
}

/**
 * All state in this object except the symbol table must be readonly.
 *
 * This object, and not a copy of it, must be passed around to helper functions. The
 * `CompilerHelper`, on the other hand, does not need to share an identity since it
 * has no mutable state at all.
 */
export class CompilerContext {
  readonly statements: HirVisitor<AST.TopLevelStatement>;
  readonly expressions: HirVisitor<AST.Expression>;
  readonly symbols: NonemptyStack<SymbolTable> = new NonemptyStack([SymbolTable.top()]);

  readonly helper = new CompilerHelper(this);

  constructor(readonly source: string) {
    this.statements = new HirVisitor(HirStatements);
    this.expressions = new HirVisitor(HirExpressions);
  }

  startBlock(block: AST.Block | AST.ElementNode): [] {
    let child = this.symbols.current.child(block.blockParams);
    block.symbols = child;
    this.symbols.push(child);

    return [];
  }

  endBlock(): [] {
    this.symbols.pop();
    return [];
  }

  // startBlock(block: AST.Block): Opcode {
  //   let child = this.symbols.current.child(block.blockParams);
  //   block.symbols = child;
  //   this.symbols.push(child);
  //   return this.opcode(block, 'startBlock', block);
  // }

  // endBlock(block: AST.Block): Opcode {
  //   this.symbols.pop();
  //   return this.opcode(block, 'endBlock');
  // }

  expr(node: AST.Expression | null, context: ExpressionContext): Opcode[] {
    if (node === null) {
      return [];
    } else if (node.type === 'PathExpression') {
      return this.helper.pathWithContext(node, context);
    } else {
      return this.expressions.visit(node, this);
    }
  }

  stmt<T extends AST.TopLevelStatement>(node: T | null): Opcode[] {
    if (node === null) {
      return [];
    } else {
      return this.statements.visit(node, this);
    }
  }

  opcode<K extends keyof NewAllocateSymbolsOps, O extends AllocateSymbolsOp<K>>(
    node: NodeWithLocation | AST.BaseNode | [AST.BaseNode, ...AST.BaseNode[]],
    key: K,
    ...rest: Tail<O>
  ): Opcode<K> {
    let opcode = ([key, ...rest] as unknown) as AllocateSymbolsOp<K>;

    if ('type' in node || Array.isArray(node)) {
      return { opcode, location: sourceLocation(node, this.source) };
    } else {
      return { opcode, location: node.loc };
    }
  }
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
  static forSource(source: string): CompilerHelper {
    return new CompilerHelper(new CompilerContext(source));
  }

  readonly ctx: CompilerContext;

  constructor(context: CompilerContext) {
    this.ctx = context;
  }

  root(node: AST.Template): Opcode[] {
    return this.ctx.stmt(node);
  }

  opcode<K extends keyof NewAllocateSymbolsOps, O extends AllocateSymbolsOp<K>>(
    node: NodeWithLocation | AST.BaseNode | [AST.BaseNode, ...AST.BaseNode[]],
    key: K,
    ...rest: Tail<O>
  ): Opcode<K> {
    return this.ctx.opcode(node, key, ...rest);
  }

  expr(node: AST.Expression, context: ExpressionContext): Opcode[] {
    return this.ctx.expr(node, context);
  }

  stmt<T extends AST.Statement>(node: T): Opcode[] {
    return this.ctx.stmt(node);
  }

  modifier(modifier: AST.ElementModifierStatement): Opcode[] {
    return [
      ...this.args(modifier, 'modifier'),
      ...this.ctx.expr(modifier.path, ExpressionContext.ModifierHead),
      this.opcode(modifier, 'modifier'),
    ];
  }

  args(helper: AST.Call, context: 'helper' | 'modifier' | 'block' | 'in-element'): Opcode[] {
    let opcodes: Opcode[] = [];
    opcodes.push(...this.hash(helper.hash, context));
    opcodes.push(...this.params(helper));

    return opcodes;
  }

  params(call: AST.Call): Opcode[] {
    let params = { list: call.params, loc: paramsLoc(call, this.ctx.source) };

    if (params.list.length === 0) {
      return [this.opcode(params, 'literal', null)];
    }

    let opcodes = flatMap([...params.list].reverse(), expr =>
      this.expr(expr, ExpressionContext.Expression)
    );

    opcodes.push(this.opcode(params, 'prepareArray', params.list.length));

    return opcodes;
  }

  hash(hash: AST.Hash, context: 'helper' | 'modifier' | 'block' | 'in-element'): Opcode[] {
    let pairs = hash.pairs;

    if (pairs.length === 0) {
      return [this.opcode(hash, 'literal', null)];
    }

    let opcodes = flatMap([...pairs].reverse(), pair => {
      return [
        ...this.expr(pair.value, ExpressionContext.Expression),
        this.opcode({ loc: locationForHashKey(pair, this.ctx.source) }, 'literal', pair.key),
      ];
    });

    opcodes.push(this.opcode(hash, 'prepareObject', pairs.length));
    return opcodes;
  }

  sexp(expr: AST.SubExpression): Opcode[] {
    if (isKeywordCall(expr)) {
      return this.keyword(expr);
    } else {
      let opcodes: Opcode[] = [];

      opcodes.push(...this.args(expr, 'helper'));

      // TODO: We need to pass ExpressionContext through here or find an alternative path
      opcodes.push(...this.expr(expr.path, ExpressionContext.CallHead));
      opcodes.push(this.opcode(expr, 'helper'));

      return opcodes;
    }
  }

  concat(concat: AST.ConcatStatement): Opcode[] {
    let opcodes = flatMap(concat.parts, part => this.mustacheAttrValue(part));

    opcodes.push(this.opcode(concat, 'prepareArray', concat.parts.length));
    return opcodes;
  }

  mustacheAttrValue(value: AST.TextNode | AST.MustacheStatement): Opcode[] {
    if (value.type === 'TextNode') {
      return [this.opcode(value, 'literal', value.chars)];
    }

    if (isKeywordCall(value)) {
      return this.keyword(value);
    }

    if (isHelperInvocation(value)) {
      assertIsSimpleHelper(value, value.loc, 'helper');

      return this.args(value, 'helper');
    }

    if (value.path.type === 'PathExpression' && isSimplePath(value.path)) {
      // x={{simple}}
      return this.expr(value.path, ExpressionContext.AppendSingleId);
    } else {
      // x={{simple.value}}
      return this.expr(value.path, ExpressionContext.Expression);
    }
  }

  keyword(call: IsKeywordCall): Opcode[] {
    if (HAS_BLOCK.match(call)) {
      return HAS_BLOCK.opcode(call, this.ctx);
    } else if (HAS_BLOCK_PARAMS.match(call)) {
      return HAS_BLOCK_PARAMS.opcode(call, this.ctx);
    } else {
      return assertNever(call);
    }
  }

  pathWithContext(
    path: AST.PathExpression,
    context: ExpressionContext
  ): HirExpressionOp<'PathExpression'> {
    let { parts } = path;
    if (path.data) {
      return this.argPath(`@${parts[0]}`, parts.slice(1), path);
    } else if (path.this) {
      return this.thisPath(parts, path);
    } else {
      return this.varPath(parts[0], parts.slice(1), path, context);
    }
  }

  path(
    head: Opcode<'getArg' | 'getVar' | 'getThis'>,
    rest: string[],
    node: AST.BaseNode
  ): HirExpressionOp<'PathExpression'> {
    if (rest.length === 0) {
      return [head];
    } else {
      let tailOp = this.opcode(node, 'getPath', rest);
      return [head, tailOp];
    }
  }

  argPath(head: string, rest: string[], node: AST.BaseNode): HirExpressionOp<'PathExpression'> {
    let headOp = this.opcode(node, 'getArg', head);
    return this.path(headOp, rest, node);
  }

  varPath(
    head: string,
    rest: string[],
    node: AST.BaseNode,
    context: ExpressionContext
  ): HirExpressionOp<'PathExpression'> {
    let headOp = this.opcode(node, 'getVar', head, context);
    return this.path(headOp, rest, node);
  }

  thisPath(rest: string[], node: AST.BaseNode): HirExpressionOp<'PathExpression'> {
    let headOp = this.opcode(node, 'getThis');
    return this.path(headOp, rest, node);
  }
}

export function visit2(ast: AST.Template, source: string): Opcode[] {
  let compiler = CompilerHelper.forSource(source);
  return compiler.root(ast);
}

function locationForHashKey(pair: AST.HashPair, source: string): SourceLocation {
  let pairLoc = sourceLocation(pair, source);
  let valueLoc = sourceLocation(pair.value, source);

  assert(pairLoc !== null && valueLoc !== null, `unexpected missing location in HashPair`);

  return {
    source,
    start: pairLoc.start,
    // the grammar requires `key=value` with no whitespace around the `=`
    end: valueLoc.start - 1,
  };
}

type Tail<A extends any[]> = ((...args: A) => any) extends (h: any, ...t: infer T) => any
  ? T
  : never;

interface NodeWithLocation {
  loc: SourceLocation;
}

function sourceLocation(
  node: AST.BaseNode | [AST.BaseNode, ...AST.BaseNode[]],
  source: string
): SourceLocation {
  if (Array.isArray(node)) {
    let start = node[0];
    let end = node[node.length - 1];

    let startOffset = sourceLocation(start, source)?.start;
    let endOffset = sourceLocation(end, source)?.start;

    assert(
      startOffset !== undefined && endOffset !== undefined,
      `unexpectedly missing source offsets`
    );

    return {
      source: source || null,
      start: startOffset,
      end: endOffset,
    };
  }

  let loc = node.loc;

  let { start, end } = loc;
  let startOffset = locationToOffset(source, start.line - 1, start.column);

  // TODO: Is it important to support buggy transformations? Should we have a strict mode to start ferreting them out?
  assert(
    startOffset !== null,
    `unexpected offset (${start.line}:${start.column}) that didn't correspond to a source location`
  );
  let endOffset = locationToOffset(source, end.line - 1, end.column);
  assert(
    endOffset !== null,
    `unexpected offset (${end.line}:${end.column}) that didn't correspond to a source location`
  );

  return {
    source: source || null,
    start: startOffset,
    end: endOffset,
  };
}

function paramsLoc(helper: AST.Call, source: string): SourceLocation {
  let { path, params } = helper;

  if (isPresent(params)) {
    return sourceLocation(params as [AST.Expression, ...AST.Expression[]], source);
  } else {
    // position empty params after the first space after the path expression
    let pos = sourceLocation(path, source).end + 1;
    return { source, start: pos, end: pos };
  }
}
