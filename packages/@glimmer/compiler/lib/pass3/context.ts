import { Block, ComponentBlock, InlineBlock, Template } from './blocks';
import { SerializedInlineBlock, WireFormat as WF, Option, WireFormat } from '@glimmer/interfaces';
import { JavaScriptCompilerOp } from './ops';
import { AST } from '@glimmer/syntax';
import { assert, expect, Stack } from '@glimmer/util';
import { SourceOffsets } from '../pass1/location';
import { Op, OpFactory, Ops } from '../ops/ops';
import { CompilerState } from '../pass1/context';
import { Check, EXPR, STRING } from './checks';

type Tail<T extends any[]> = ((...args: T) => void) extends (head: any, ...tail: infer U) => any
  ? U
  : never;

export type OpName = WireFormat.StatementSexpOpcode;
export type OpMap = {
  [P in keyof WireFormat.StatementSexpOpcodeMap]: Tail<WireFormat.StatementSexpOpcodeMap[P]>;
};

export class CompilerContext {
  readonly #opcodes: readonly JavaScriptCompilerOp[];
  readonly options: CompileOptions | undefined;
  readonly factory: OpFactory<OpName, OpMap>;

  constructor(opcodes: readonly JavaScriptCompilerOp[], source: string, options?: CompileOptions) {
    this.#opcodes = opcodes;
    this.options = options;
    this.factory = new OpFactory(source);
  }

  helpers(state: MutableState, offsets: SourceOffsets | null): CompilerHelpers {
    return new CompilerHelpers(this, state, offsets);
  }
}

// export class CompilerContext {
//   readonly #factory: OpFactory<OpName, OpMap>;
//   readonly #offsets: SourceOffsets | null;

//   constructor(factory: OpFactory<OpName, OpMap>, offsets: SourceOffsets | null) {
//     this.#factory = factory;
//     this.#offsets = offsets;
//   }

//   op<N extends OpName>(name: N, ...args: OpMap[N]): Op<OpName, OpMap> {
//     return this.#factory.op(name, ...args).offsets(this.#offsets);
//   }

//   ops(...ops: Ops<OpName, OpMap>[]): Op<OpName, OpMap>[] {
//     return this.#factory.ops(...ops);
//   }

//   map<T>(input: T[], callback: (input: T) => Op<OpName, OpMap>[]): Op<OpName, OpMap>[] {
//     return this.#factory.map(input, callback);
//   }
// }

export type StackValue =
  | WF.Expression
  | WF.Core.Params
  | WF.Core.ConcatParams
  | WF.Core.Hash
  | string;

export class MutableState {
  readonly template: Template;
  readonly values: StackValue[] = [];
  readonly blocks = new Stack<Block>();

  constructor(template: Template) {
    this.template = template;
  }

  push(...statements: WF.Statement[]) {
    this.blocks.current!.push(...statements);
  }
}

export class CompilerHelpers {
  readonly #ctx: CompilerContext;
  readonly #state: MutableState;
  readonly #offsets: SourceOffsets | null;

  constructor(ctx: CompilerContext, state: MutableState, offsets: SourceOffsets | null) {
    this.#ctx = ctx;
    this.#state = state;
    this.#offsets = offsets;
  }

  get options(): CompileOptions | undefined {
    return this.#ctx.options;
  }

  assertStackHas(size: number) {
    assert(
      this.#state.values.length >= size,
      `Expected ${size} values on the stack, found ${this.#state.values.length}`
    );
  }

  op<N extends OpName>(name: N, ...args: OpMap[N]): Op<OpName, OpMap> {
    return this.#ctx.factory.op(name, ...args).offsets(this.#offsets);
  }

  ops(...ops: Ops<OpName, OpMap>[]): Op<OpName, OpMap>[] {
    return this.#ctx.factory.ops(...ops);
  }

  map<T>(input: T[], callback: (input: T) => Op<OpName, OpMap>[]): Op<OpName, OpMap>[] {
    return this.#ctx.factory.map(input, callback);
  }

  // TODO: consider a more semantic approach here
  get blocks(): Stack<Block> {
    return this.#state.blocks;
  }

  get template(): Template {
    return this.#state.template;
  }

  get currentBlock(): Block {
    return expect(this.#state.blocks.current, 'Expected a block on the stack');
  }

  get currentComponent(): ComponentBlock {
    let block = this.currentBlock;

    if (block instanceof ComponentBlock) {
      return block;
    } else {
      throw new Error(`Expected ComponentBlock on stack, found ${block.constructor.name}`);
    }
  }

  /// Utilities

  endComponent(): [string, WF.Statements.Attribute[], WF.Core.Hash, WF.Core.Blocks] {
    let component = this.#state.blocks.pop();
    assert(
      component instanceof ComponentBlock,
      'Compiler bug: endComponent() should end a component'
    );

    return (component as ComponentBlock).toJSON();
  }

  startBlock(block: Block): void {
    this.#state.blocks.push(block);
  }

  startInlineBlock(symbols: AST.BlockSymbols) {
    let block: Block = new InlineBlock(symbols);
    this.#state.blocks.push(block);
  }

  endInlineBlock(): SerializedInlineBlock {
    let blocks = this.#state.blocks;
    let block = blocks.pop() as InlineBlock;
    return block.toJSON();
  }

  pushValue<S extends WF.Expression | WF.Core.Params | WF.Core.Hash>(val: S) {
    this.#state.values.push(val);
  }

  popLocatedValue<T extends StackValue>(): { value: T; location: Option<SourceOffsets> } {
    assert(this.#state.values.length, 'No expression found on stack');
    let value = this.#state.values.pop() as T;

    // if (location === undefined) {
    //   throw new Error('Unbalanced location push and pop');
    // }

    return { value, location: null };
  }

  popValue<T extends StackValue | unknown>(check: Check<T>): T {
    let value = this.popLocatedValue().value;

    if (check.match(value)) {
      return value;
    } else {
      throw new Error(`unexpected ${typeof value}, expected ${check.name}`);
    }
  }
}
