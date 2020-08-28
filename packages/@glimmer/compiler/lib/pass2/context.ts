import { assert, expect, Stack } from '@glimmer/util';
import { SourceOffsets } from '../shared/location';
import { InputOpArgs, OpConstructor, UnlocatedOp } from '../shared/op';
import { OpFactory, Ops } from '../shared/ops';
import { BlockSymbolTable } from '../template-visitor';
import { Block, ComponentBlock, InlineBlock, Template } from './blocks';
import * as out from './out';
import { Check } from './checks';

export class CompilerContext {
  readonly options: CompileOptions | undefined;
  readonly factory: OpFactory<out.Op>;
  readonly valueFactory: OpFactory<out.StackValue>;

  constructor(source: string, options?: CompileOptions) {
    this.options = options;
    this.factory = new OpFactory(source);
    this.valueFactory = new OpFactory(source);
  }

  helpers(state: MutableState, offsets: SourceOffsets | null): Context {
    return new Context(this, state, offsets);
  }
}

export class MutableState {
  readonly template: Template;
  readonly values: out.StackValue[] = [];
  readonly blocks = new Stack<Block>();

  constructor(template: Template) {
    this.template = template;
  }

  push(...statements: out.Statement[]) {
    this.blocks.current!.push(...statements);
  }
}

export class Context {
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

  op<O extends out.Op>(name: OpConstructor<O>, ...args: InputOpArgs<O>): O {
    return this.unlocatedOp(name, ...args).offsets(this.#offsets);
  }

  unlocatedOp<O extends out.Op>(name: OpConstructor<O>, ...args: InputOpArgs<O>): UnlocatedOp<O> {
    return this.#ctx.factory.op(name, ...args);
  }

  ops(...ops: Ops<out.Op>[]): out.Op[] {
    return this.#ctx.factory.ops(...ops);
  }

  map<T>(input: T[], callback: (input: T) => out.Op[]): out.Op[] {
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

  // endComponent(): [string, WF.Statements.Attribute[], WF.Core.Hash, WF.Core.Blocks] {
  //   let component = this.#state.blocks.pop();
  //   assert(
  //     component instanceof ComponentBlock,
  //     'Compiler bug: endComponent() should end a component'
  //   );

  //   return (component as ComponentBlock).toJSON();
  // }

  startBlock(block: Block): void {
    this.#state.blocks.push(block);
  }

  startInlineBlock(symbols: BlockSymbolTable) {
    let block: Block = new InlineBlock(symbols);
    this.#state.blocks.push(block);
  }

  endInlineBlock(): void {
    let blocks = this.#state.blocks;
    let block = blocks.pop() as InlineBlock;
    this.template.block.blocks.push(block.toJSON());
  }

  unlocatedStackValue<O extends out.StackValue>(
    name: OpConstructor<O>,
    ...args: InputOpArgs<O>
  ): UnlocatedOp<O> {
    return this.#ctx.valueFactory.op(name, ...args);
  }

  stackValue<O extends out.StackValue>(name: OpConstructor<O>, ...args: InputOpArgs<O>): O {
    return this.unlocatedStackValue(name, ...args).offsets(this.#offsets);
  }

  pushValue<O extends out.StackValue>(name: OpConstructor<O>, ...args: InputOpArgs<O>): O {
    let val = this.stackValue(name, ...args);
    this.#state.values.push(val);
    return val;
  }

  // pushValue<S extends out.StackValue>(val: S) {
  //   this.#state.values.push(val);
  // }

  popValue<T extends out.StackValue>(check: Check<T>): T {
    let value = this.#state.values.pop();

    if (check.match(value)) {
      return value;
    } else {
      throw new Error(`unexpected ${typeof value}, expected ${check.name}`);
    }
  }
}
