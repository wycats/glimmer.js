import { AST, SyntaxError } from '@glimmer/syntax';
import { expect, NonemptyStack } from '@glimmer/util';
import { offsetsToLocation } from '../location';
import { OpFactory, Ops } from '../ops/ops';
import { SourceOffsets } from '../pass1/location';
import { Pass3Op, Pass3OpsTable } from '../pass3/ops';
import { SymbolTable } from '../template-visitor';

export type SymbolStack = NonemptyStack<AST.Symbols>;

type OpName = keyof Pass3OpsTable;
type OpMap = Pass3OpsTable;

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

  op<N extends OpName>(name: N, args: OpMap[N]): Pass3Op {
    return this.#factory.op(name, args).offsets(this.#offsets);
  }

  ops(...ops: Ops<OpName, OpMap>[]): Pass3Op[] {
    return this.#factory.ops(...ops);
  }

  map<T>(input: T[], callback: (input: T) => Pass3Op[]): Pass3Op[] {
    return this.#factory.map(input, callback);
  }
}
