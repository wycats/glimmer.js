import { AST, SyntaxError } from '@glimmer/syntax';
import * as pass2 from '../pass2/ops';
import { CompilerContext, Context } from './context';
import { STATEMENTS } from './statements';
import { EXPRESSIONS } from './expressions';
import * as pass1 from './ops';

export function visit(source: string, root: pass1.Template): pass2.Op[] {
  let compilerContext = new CompilerContext(source, {
    expressions: EXPRESSIONS,
    statements: STATEMENTS,
  });

  let ctx = compilerContext.forOffsets(root.offsets);

  return ctx.ops(
    ctx.op(pass2.StartProgram, root.args.symbols),
    ctx.map(root.args.body, stmt => ctx.visitStmt(stmt)),
    ctx.op(pass2.EndProgram)
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
  readonly ctx: Context;

  constructor(context: Context) {
    this.ctx = context;
  }

  visitExpr(node: pass1.Expr): pass2.Op[] {
    return this.ctx.visitExpr(node);
  }

  visitStmt<T extends pass1.Statement>(node: T): pass2.Op[] {
    return this.ctx.visitStmt(node);
  }

  args({ params, hash }: { params: pass1.Params; hash: pass1.Hash }): pass2.Op[] {
    return this.ctx.ops(this.visitExpr(hash), this.visitExpr(params));
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
