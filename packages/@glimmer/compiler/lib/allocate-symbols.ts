import { ExpressionContext, Option } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { expect, NonemptyStack } from '@glimmer/util';
import {
  AllocateSymbolsOps,
  JavaScriptCompilerOps,
  Op,
  Opcode,
  Ops,
  PathHead,
  Processor,
  SourceLocation,
} from './compiler-ops';

export type InVariable = PathHead;
export type OutVariable = number;

export type Out = Ops<JavaScriptCompilerOps>;

export class SymbolAllocator implements Processor<AllocateSymbolsOps> {
  private _symbolStack: NonemptyStack<AST.Symbols> | null = null;

  constructor(
    private ops: readonly Ops<AllocateSymbolsOps>[],
    private locations: readonly Option<SourceLocation>[]
  ) {}

  process(): {
    ops: readonly Ops<JavaScriptCompilerOps>[];
    readonly locations: Option<SourceLocation>[];
  } {
    let out = [];
    let locations = [];
    let { ops } = this;

    for (let i = 0; i < ops.length; i++) {
      let op = ops[i];
      let location = this.locations ? this.locations[i] : null;
      let result = this.dispatch(op);

      out.push(result);
      locations.push(location);
    }

    return { ops: out, locations };
  }

  dispatch<O extends Ops<AllocateSymbolsOps>>(op: O): Ops<JavaScriptCompilerOps> {
    if (Array.isArray(op)) {
      let name = op[0];
      let operand = op[1];

      return (this[name] as any)(operand) || ((op as unknown) as Ops<JavaScriptCompilerOps>);
    } else {
      let opcode = (op as Opcode).opcode;
      let [name, operand] = opcode;
      console.log(opcode);

      return this[name](...operand) || opcode;
    }
  }

  get symbols(): AST.Symbols {
    return expect(this.symbolStack.current, 'Expected a symbol table on the stack');
  }

  get symbolStack(): NonemptyStack<AST.Symbols> {
    return expect(this._symbolStack, 'Expected a symbol table on the stack');
  }

  startProgram(op: AST.Template) {
    this._symbolStack = new NonemptyStack([
      expect(op.symbols, 'Expected program to have a symbol table'),
    ]);
  }

  endProgram() {
    // this.symbolStack.pop();
  }

  startBlock(op: AST.Block) {
    this.symbolStack.push(expect(op.symbols, 'Expected block to have a symbol table'));
  }

  endBlock() {
    this.symbolStack.pop();
  }

  openNamedBlock(op: AST.ElementNode) {
    this.symbolStack.push(expect(op.symbols, 'Expected named block to have a symbol table'));
  }

  closeNamedBlock(_op: AST.ElementNode) {
    this.symbolStack.pop();
  }

  flushElement(op: AST.ElementNode) {
    if (op.symbols) {
      this.symbolStack.push(op.symbols);
    }
  }

  closeElement(_op: AST.ElementNode) {
    this.symbolStack.pop();
  }

  closeComponent(_op: AST.ElementNode) {
    this.symbolStack.pop();
  }

  closeDynamicComponent(_op: AST.ElementNode) {
    this.symbolStack.pop();
  }

  attrSplat(): Op<JavaScriptCompilerOps, 'attrSplat'> {
    return ['attrSplat', this.symbols.allocateBlock('attrs')];
  }

  getFree(name: string): Op<JavaScriptCompilerOps, 'getFree'> {
    let symbol = this.symbols.allocateFree(name);
    return ['getFree', symbol];
  }

  getArg(name: string): Op<JavaScriptCompilerOps, 'getSymbol'> {
    let symbol = this.symbols.allocateNamed(name);
    return ['getSymbol', symbol];
  }

  getThis(): Op<JavaScriptCompilerOps, 'getSymbol'> {
    return ['getSymbol', 0];
  }

  getVar(
    name: string,
    context: ExpressionContext
  ): Op<JavaScriptCompilerOps, 'getSymbol' | 'getFree' | 'getFreeWithContext'> {
    if (this.symbols.has(name)) {
      let symbol = this.symbols.get(name);
      return ['getSymbol', symbol];
    } else {
      let symbol = this.symbols.allocateFree(name);
      return ['getFreeWithContext', [symbol, context]];
    }
  }

  getPath(rest: string[]): Op<JavaScriptCompilerOps, 'getPath'> {
    return ['getPath', rest];
  }

  yield(op: string): Op<JavaScriptCompilerOps, 'yield'> {
    return ['yield', this.symbols.allocateBlock(op)];
  }

  debugger(_op: Option<InVariable[]>): Op<JavaScriptCompilerOps, 'debugger'> {
    return ['debugger', [this.symbols.getEvalInfo()]];
  }

  hasBlock(op: InVariable): Op<JavaScriptCompilerOps, 'hasBlock'> {
    if (op === 0) {
      throw new Error('Cannot hasBlock this');
    }

    return ['hasBlock', this.symbols.allocateBlock(op)];
  }

  hasBlockParams(op: InVariable): Op<JavaScriptCompilerOps, 'hasBlockParams'> {
    if (op === 0) {
      throw new Error('Cannot hasBlockParams this');
    }

    return ['hasBlockParams', this.symbols.allocateBlock(op)];
  }

  partial(): Op<JavaScriptCompilerOps, 'partial'> {
    return ['partial', [this.symbols.getEvalInfo()]];
  }

  block(hasInverse: boolean): Op<JavaScriptCompilerOps, 'block'> {
    return ['block', hasInverse];
  }

  modifier(): Out {
    return ['modifier'];
  }

  helper(): Op<JavaScriptCompilerOps, 'helper'> {
    return ['helper'];
  }

  text(content: string): Out {
    return ['text', content];
  }

  comment(comment: string): Out {
    return ['comment', comment];
  }

  openComponent(element: AST.ElementNode): Out {
    return ['openComponent', element];
  }

  openElement(element: AST.ElementNode, simple: boolean): Out {
    return ['openElement', [element, simple]];
  }

  staticArg(name: string) {
    return ['staticArg', name];
  }

  dynamicArg(name: string) {
    return ['dynamicArg', name];
  }

  staticAttr(name: string, ns: Option<string>) {
    return ['staticAttr', [name, ns]];
  }

  staticComponentAttr(name: string, ns: Option<string>) {
    return ['staticComponentAttr', [name, ns]];
  }

  trustingAttr(name: string, ns: Option<string>) {
    return ['trustingAttr', [name, ns]];
  }

  dynamicAttr(name: string, ns: Option<string>) {
    return ['dynamicAttr', [name, ns]];
  }

  componentAttr(name: string, ns: Option<string>) {
    return ['componentAttr', [name, ns]];
  }

  trustingComponentAttr(name: string, ns: Option<string>) {
    return ['trustingComponentAttr', [name, ns]];
  }

  append(trusted: boolean) {
    return ['append', trusted];
  }

  literal(value: string | boolean | number | null | undefined): Op<AllocateSymbolsOps, 'literal'> {
    return ['literal', value];
  }

  prepareArray(count: number) {
    return ['prepareArray', count];
  }

  prepareObject(count: number) {
    return ['prepareObject', count];
  }

  concat() {
    return ['concat'];
  }
}
