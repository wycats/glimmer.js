import { ExpressionContext, Option } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { expect, NonemptyStack } from '@glimmer/util';
import {
  JavaScriptCompilerOp,
  JavaScriptCompilerOps,
  NewAllocateSymbolsOps,
  Opcode,
  Ops,
  PathHead,
  SourceLocation,
} from './compiler-ops';
import { SymbolTable } from './template-visitor';

export type InVariable = PathHead;
export type OutVariable = number;

export type Out = Ops<JavaScriptCompilerOps>;

export type SymbolStack = NonemptyStack<AST.Symbols>;

type CompilerVisitor = {
  [P in keyof NewAllocateSymbolsOps]?: (
    symbols: SymbolStack,
    ...args: NewAllocateSymbolsOps[P]
  ) => JavaScriptCompilerOp | void;
};

const SymbolVisitor: CompilerVisitor = {
  startProgram(symbols: SymbolStack, template: AST.Template) {
    symbols.push(expect(template.symbols, 'Expected template to have symbols'));
  },

  startBlock(symbols: SymbolStack, op: AST.Block) {
    symbols.push(expect(op.symbols, 'Expected block to have a symbol table'));
  },

  endBlock(symbols: SymbolStack) {
    symbols.pop();
  },

  openNamedBlock(symbols: SymbolStack, op: AST.ElementNode) {
    symbols.push(expect(op.symbols, 'Expected named block to have a symbol table'));
  },

  closeNamedBlock(symbols: SymbolStack, _op: AST.ElementNode) {
    symbols.pop();
  },

  flushElement(symbols: SymbolStack, op: AST.ElementNode) {
    if (op.symbols) {
      symbols.push(op.symbols);
    }
  },

  closeElement(symbols: SymbolStack, _op: AST.ElementNode) {
    symbols.pop();
  },

  closeComponent(symbols: SymbolStack, _op: AST.ElementNode) {
    symbols.pop();
  },

  closeDynamicComponent(symbols: SymbolStack, _op: AST.ElementNode) {
    symbols.pop();
  },

  attrSplat(symbols: SymbolStack): ['attrSplat', number | null] {
    return ['attrSplat', symbols.current.allocateBlock('attrs')];
  },

  getFree(symbols: SymbolStack, name: string): JavaScriptCompilerOp<'getFree'> {
    let symbol = symbols.current.allocateFree(name);
    return ['getFree', symbol];
  },

  getArg(symbols: SymbolStack, name: string): JavaScriptCompilerOp<'getSymbol'> {
    let symbol = symbols.current.allocateNamed(name);
    return ['getSymbol', symbol];
  },

  getThis(): JavaScriptCompilerOp<'getSymbol'> {
    return ['getSymbol', 0];
  },

  getVar(
    symbols: SymbolStack,
    name: string,
    context: ExpressionContext
  ): JavaScriptCompilerOp<'getSymbol' | 'getFree' | 'getFreeWithContext'> {
    if (symbols.current.has(name)) {
      let symbol = symbols.current.get(name);
      return ['getSymbol', symbol];
    } else {
      let symbol = symbols.current.allocateFree(name);
      return ['getFreeWithContext', symbol, context];
    }
  },

  yield(symbols: SymbolStack, op: string): JavaScriptCompilerOp<'yield'> {
    return ['yield', symbols.current.allocateBlock(op)];
  },

  debugger(symbols: SymbolStack, _op: Option<InVariable[]>): JavaScriptCompilerOp<'debugger'> {
    return ['debugger', symbols.current.getEvalInfo()];
  },

  hasBlock(symbols: SymbolStack, op: InVariable): JavaScriptCompilerOp<'hasBlock'> {
    if (op === 0) {
      throw new Error('Cannot hasBlock this');
    }

    return ['hasBlock', symbols.current.allocateBlock(op)];
  },

  hasBlockParams(symbols: SymbolStack, op: InVariable): JavaScriptCompilerOp<'hasBlockParams'> {
    if (op === 0) {
      throw new Error('Cannot hasBlockParams this');
    }

    return ['hasBlockParams', symbols.current.allocateBlock(op)];
  },

  partial(symbols: SymbolStack): JavaScriptCompilerOp<'partial'> {
    return ['partial', symbols.current.getEvalInfo()];
  },
};

export class SymbolAllocator {
  private _symbolStack: NonemptyStack<AST.Symbols> = new NonemptyStack([SymbolTable.top()]);

  constructor(
    private ops: readonly Opcode[],
    private locations: readonly Option<SourceLocation>[] | null
  ) {}

  process(): {
    ops: readonly JavaScriptCompilerOp[];
    readonly locations: Option<SourceLocation>[];
  } {
    let out: JavaScriptCompilerOp[] = [];
    let locations: Option<SourceLocation>[] = [];
    let { ops } = this;

    for (let op of ops) {
      out.push(this.dispatch(op));
    }

    // for (let i = 0; i < ops.length; i++) {
    //   let op = ops[i];
    //   let location = this.locations ? this.locations[i] : null;
    //   let result = this.dispatch(op);

    //   out.push(result);
    //   locations.push(location);
    // }

    return { ops: out, locations };
  }

  dispatch<O extends Opcode>(op: O): JavaScriptCompilerOp {
    let [name, operand] = op.opcode;

    if (name in SymbolVisitor) {
      let visit = SymbolVisitor[name];

      let result = (visit as any)(this.symbolStack, ...(operand as any));
      return result || [name as any, ...(operand as any)];
    } else {
      return [name as JavaScriptCompilerOp[0], ...(operand as any)] as JavaScriptCompilerOp;
    }
  }

  get symbols(): AST.Symbols {
    return expect(this.symbolStack.current, 'Expected a symbol table on the stack');
  }

  get symbolStack(): NonemptyStack<AST.Symbols> {
    return expect(this._symbolStack, 'Expected a symbol table on the stack');
  }
}
