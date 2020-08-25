import { AST, SyntaxError } from '@glimmer/syntax';
import { expect, NonemptyStack } from '@glimmer/util';
import { JavaScriptCompilerOps } from '../compiler-ops';
import { offsetsToLocation } from '../location';
import { Op, OpFactory, Ops } from '../ops/ops';
import { SourceOffsets } from '../pass1/location';
import { SymbolTable } from '../template-visitor';

export type SymbolStack = NonemptyStack<AST.Symbols>;

type OpName = keyof JavaScriptCompilerOps;
type OpMap = JavaScriptCompilerOps;

export class UnlocatedCompilerContext {
  readonly symbols: SymbolStack = new NonemptyStack([SymbolTable.top()]);
  #factory: OpFactory<OpName, OpMap>;
  #source: string;

  constructor(source: string) {
    this.#factory = new OpFactory(source);
    this.#source = source;
  }

  forOffsets(offsets: SourceOffsets | null): CompilerContext {
    return new CompilerContext(this.#source, this.symbols, this.#factory, offsets);
  }
}

export class CompilerContext {
  readonly #source: string;
  readonly #symbols: SymbolStack;
  readonly #factory: OpFactory<OpName, OpMap>;
  readonly #offsets: SourceOffsets | null;

  constructor(
    source: string,
    symbols: SymbolStack,
    factory: OpFactory<OpName, OpMap>,
    offsets: SourceOffsets | null
  ) {
    this.#source = source;
    this.#symbols = symbols;
    this.#factory = factory;
    this.#offsets = offsets;
  }

  get table(): AST.Symbols {
    return this.#symbols.current;
  }

  error(message: string): never {
    if (this.#offsets === null) {
      throw new SyntaxError(message, null);
    } else {
      throw new SyntaxError(message, offsetsToLocation(this.#source, this.#offsets));
    }
  }

  push(symbols: AST.Symbols | undefined): void {
    this.#symbols.push(expect(symbols, 'expected symbols'));
  }

  pop(): void {
    this.#symbols.pop();
  }

  op<N extends OpName>(name: N, ...args: OpMap[N]): Op<OpName, OpMap> {
    return this.#factory.op(name, ...args).offsets(this.#offsets);
  }

  ops(...ops: Ops<OpName, OpMap>[]): Op<OpName, OpMap>[] {
    return this.#factory.ops(...ops);
  }

  map<T>(input: T[], callback: (input: T) => Op<OpName, OpMap>[]): Op<OpName, OpMap>[] {
    return this.#factory.map(input, callback);
  }
}
