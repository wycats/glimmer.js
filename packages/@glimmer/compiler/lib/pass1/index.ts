import { ExpressionContext } from '@glimmer/interfaces';
import { AST, SyntaxError } from '@glimmer/syntax';
import { assertNever } from '@glimmer/util';
import { SymbolTable } from '../template-visitor';
import { getAttrNamespace } from '../utils';
import { CompilerContext, Opcode } from './context';
import { HirExpressions } from './expressions';
import {
  assertIsSimpleHelper,
  HAS_BLOCK,
  HAS_BLOCK_PARAMS,
  isHelperInvocation,
  IsKeywordCall,
  isKeywordCall,
  isSimplePath,
} from './is-node';
import { offsetsForHashKey, paramsOffsets } from './location';
import { HirStatements } from './statements';

/**
 * In reality, AttrNode does not appear as a statement in top-level content, but rather
 * only nested inside of a specific part of the ElementNode, so we can handle it (in
 * context) there and not have to worry about generically seeing one of them in content.
 */
type TopLevelStatement = AST.Statement | AST.Template | AST.Block;

export function visit(source: string, root: AST.Template): Opcode[] {
  let ctx = new CompilerContext(source, {
    expressions: HirExpressions,
    statements: HirStatements,
  });

  root.symbols = ctx.symbols.current as SymbolTable;

  return ctx.ops(
    ctx.op('startProgram', root).loc(root),
    ctx.map(root.body as TopLevelStatement[], stmt => ctx.stmt(stmt)),
    ctx.op('endProgram').loc(root)
  );
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
  readonly ctx: CompilerContext;

  constructor(context: CompilerContext) {
    this.ctx = context;
  }

  root(node: AST.Template): Opcode[] {
    return this.ctx.stmt(node);
  }

  expr(node: AST.Expression, context: ExpressionContext): Opcode[] {
    return this.ctx.expr(node, context);
  }

  stmt<T extends AST.Statement>(node: T): Opcode[] {
    return this.ctx.stmt(node);
  }

  attr(attr: AST.AttrNode, isComponent: boolean, elementNode: AST.ElementNode): Opcode[] {
    assertValidArgumentName(attr, isComponent, elementNode);
    let { name, value } = attr;

    let namespace = getAttrNamespace(name);
    let { opcodes, isStatic } = this.attrValue(value);

    if (name.charAt(0) === '@') {
      // Arguments
      if (isStatic) {
        return this.ctx.ops(opcodes, this.ctx.op('staticArg', name).loc(attr));
      } else {
        return this.ctx.ops(opcodes, this.ctx.op('dynamicArg', name).loc(attr));
      }
    } else {
      let isTrusting = isTrustedValue(value);

      if (isStatic) {
        if (name === '...attributes') {
          return this.ctx.ops(opcodes, this.ctx.op('attrSplat').loc(attr));
        } else if (isComponent) {
          return this.ctx.ops(
            opcodes,
            this.ctx.op('staticComponentAttr', name, namespace).loc(attr)
          );
        } else {
          return this.ctx.ops(opcodes, this.ctx.op('staticAttr', name, namespace).loc(attr));
        }
      } else if (isTrusting) {
        if (isComponent) {
          return this.ctx.ops(
            opcodes,
            this.ctx.op('trustingComponentAttr', name, namespace).loc(attr)
          );
        } else {
          return this.ctx.ops(opcodes, this.ctx.op('trustingAttr', name, namespace).loc(attr));
        }
      } else {
        if (isComponent) {
          return this.ctx.ops(opcodes, this.ctx.op('componentAttr', name, namespace).loc(attr));
        } else {
          return this.ctx.ops(opcodes, this.ctx.op('dynamicAttr', name, namespace).loc(attr));
        }
      }
    }
  }

  modifier(modifier: AST.ElementModifierStatement): Opcode[] {
    return this.ctx.ops(
      this.args(modifier),
      this.ctx.expr(modifier.path, ExpressionContext.ModifierHead),
      this.ctx.op('modifier').loc(modifier)
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
  }): Opcode[] {
    let opcodes: Opcode[] = [];
    opcodes.push(...this.hash(hash));
    opcodes.push(...this.params({ path, params }));

    return opcodes;
  }

  params({ path, params: list }: { path: AST.Expression; params: AST.Expression[] }): Opcode[] {
    let offsets = paramsOffsets({ path, params: list }, this.ctx.source);

    if (list.length === 0) {
      return [this.ctx.op('literal', null).offsets(offsets)];
    }

    return this.ctx.ops(
      this.ctx.map([...list].reverse(), expr => this.expr(expr, ExpressionContext.Expression)),
      this.ctx.op('prepareArray', list.length).offsets(offsets)
    );
  }

  hash(hash: AST.Hash): Opcode[] {
    let pairs = hash.pairs;

    if (pairs.length === 0) {
      return [this.ctx.op('literal', null).loc(hash)];
    }

    return this.ctx.ops(
      this.ctx.map([...pairs].reverse(), pair =>
        this.ctx.ops(
          this.expr(pair.value, ExpressionContext.Expression),
          this.ctx.op('literal', pair.key).offsets(offsetsForHashKey(pair, this.ctx.source))
        )
      ),
      this.ctx.op('prepareObject', pairs.length).loc(hash)
    );
  }

  sexp(expr: AST.SubExpression): Opcode[] {
    if (isKeywordCall(expr)) {
      return this.keyword(expr);
    } else {
      return this.ctx.ops(
        this.args(expr),
        this.expr(expr.path, ExpressionContext.CallHead),
        this.ctx.op('helper').loc(expr)
      );
    }
  }

  concat(concat: AST.ConcatStatement): Opcode[] {
    return this.ctx.ops(
      this.ctx.map([...concat.parts].reverse(), part => this.attrValue(part).opcodes),
      this.ctx.op('prepareArray', concat.parts.length).loc(concat)
    );
  }

  attrValue(
    value: AST.TextNode | AST.MustacheStatement | AST.ConcatStatement
  ): { opcodes: Opcode[]; isStatic: boolean } {
    if (value.type === 'ConcatStatement') {
      return {
        opcodes: this.ctx.ops(this.concat(value), this.ctx.op('concat').loc(value)),
        isStatic: false,
      };
    }

    // returns the static value if the value is static
    if (value.type === 'TextNode') {
      return { opcodes: [this.ctx.op('literal', value.chars).loc(value)], isStatic: true };
    }

    if (isKeywordCall(value)) {
      return { opcodes: this.keyword(value), isStatic: false };
    }

    if (isHelperInvocation(value)) {
      assertIsSimpleHelper(value, value.loc, 'helper');

      return {
        opcodes: this.ctx.ops(
          this.args(value),
          this.expr(value.path, ExpressionContext.CallHead),
          this.ctx.op('helper').loc(value)
        ),
        isStatic: false,
      };
    }

    if (value.path.type === 'PathExpression' && isSimplePath(value.path)) {
      // x={{simple}}
      return { opcodes: this.expr(value.path, ExpressionContext.AppendSingleId), isStatic: false };
    } else {
      // x={{simple.value}}
      return { opcodes: this.expr(value.path, ExpressionContext.Expression), isStatic: false };
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

  pathWithContext(path: AST.PathExpression, context: ExpressionContext): Opcode[] {
    let { parts } = path;
    if (path.data) {
      return this.argPath(`@${parts[0]}`, parts.slice(1), path);
    } else if (path.this) {
      return this.thisPath(parts, path);
    } else {
      if (context === undefined) {
        debugger;
      }
      return this.varPath(parts[0], parts.slice(1), path, context);
    }
  }

  path(head: Opcode, rest: string[], node: AST.BaseNode): Opcode[] {
    if (rest.length === 0) {
      return [head];
    } else {
      let tailOp = this.ctx.op('getPath', rest).loc(node);
      return [head, tailOp];
    }
  }

  argPath(head: string, rest: string[], node: AST.BaseNode): Opcode[] {
    let headOp = this.ctx.op('getArg', head).loc(node);
    return this.path(headOp, rest, node);
  }

  varPath(head: string, rest: string[], node: AST.BaseNode, context: ExpressionContext): Opcode[] {
    let headOp = this.ctx.op('getVar', head, context).loc(node);
    return this.path(headOp, rest, node);
  }

  thisPath(rest: string[], node: AST.BaseNode): Opcode[] {
    let headOp = this.ctx.op('getThis').loc(node);
    return this.path(headOp, rest, node);
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

function isTrustedValue(value: any) {
  return value.escaped !== undefined && !value.escaped;
}
