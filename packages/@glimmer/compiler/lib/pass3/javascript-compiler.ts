import {
  ExpressionContext,
  Expressions,
  SexpOpcodes,
  Statements,
  WireFormat,
} from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { assert, expect, Option } from '@glimmer/util';
import { expressionContextOp } from '../builder';
import { Op } from '../ops/ops';
import { deflateAttrName } from '../utils';
import { Block, ComponentBlock, InlineBlock, NamedBlock, Template } from './blocks';
import { ANY, CONCAT_PARAMS, EXPR, GET, HASH, PARAMS, STRING } from './checks';
import { CompilerContext, CompilerHelpers, MutableState, OpMap, OpName } from './context';
import { JavaScriptCompilerOp, JavaScriptCompilerOps } from './ops';

export type str = string;
import Core = WireFormat.Core;
export type Params = WireFormat.Core.Params;
export type ConcatParams = WireFormat.Core.ConcatParams;
export type Hash = WireFormat.Core.Hash;
export type Path = WireFormat.Core.Path;
export type StackValue = WireFormat.Expression | Params | Hash | str;

export type OutOp = Op<OpName, OpMap>;

type Visitor = {
  [P in keyof JavaScriptCompilerOps]: (
    helpers: CompilerHelpers,
    ...args: JavaScriptCompilerOps[P]
  ) => OutOp | OutOp[] | void;
};

export function process(
  opcodes: readonly JavaScriptCompilerOp[],
  symbols: AST.ProgramSymbols,
  source: string,
  options?: CompileOptions
): Template {
  let context = new CompilerContext(opcodes, source, options);
  let state = new MutableState(new Template(symbols));

  for (let op of opcodes) {
    let helpers = context.helpers(state, op.offsets);
    let fn = WireFormatVisitor[op.name];

    assert(fn !== undefined, `WireFormatVisitor didn't implement ${op.name}`);

    let result = fn(helpers, ...op.args);

    if (result !== undefined) {
      if (Array.isArray(result)) {
        for (let op of result) {
          state.push([op.name, ...op.args]);
        }
      } else {
        state.push([result.name, ...result.args]);
      }
    }
  }

  console.log(state.template);
  return state.template;
}

const WireFormatVisitor: Visitor = {
  /// Nesting

  startBlock(helpers: CompilerHelpers, program: AST.Block) {
    helpers.startBlock(new InlineBlock(program.symbols!));
    // state.startInlineBlock(program.symbols!);
  },

  endBlock(helpers: CompilerHelpers) {
    let block = helpers.endInlineBlock();
    helpers.template.block.blocks.push(block);
  },

  startProgram(helpers: CompilerHelpers) {
    helpers.startBlock(helpers.template.block);
  },

  endProgram() {},

  /// Statements

  text(helpers, content: string) {
    return helpers.op(SexpOpcodes.TrustingAppend, content);
  },

  append(helpers: CompilerHelpers, trusted: boolean) {
    return helpers.op(
      trusted ? SexpOpcodes.TrustingAppend : SexpOpcodes.Append,
      helpers.popValue(EXPR)
    );
  },

  comment(helpers: CompilerHelpers, value: string) {
    return helpers.op(SexpOpcodes.Comment, value);
  },

  modifier(helpers: CompilerHelpers) {
    let name = helpers.popValue(EXPR);
    let params = helpers.popValue(PARAMS);
    let hash = helpers.popValue(HASH);

    return helpers.op(SexpOpcodes.Modifier, name, params, hash);
  },

  block(helpers: CompilerHelpers, hasInverse: boolean) {
    let head = helpers.popValue(EXPR);
    let params = helpers.popValue(PARAMS);
    let hash = helpers.popValue(HASH);

    let template = helpers.template.block.blocks.pop();
    assert(template !== undefined, `expected an inverse block, but none was pushed on the stack`);

    let inverse = hasInverse ? helpers.template.block.blocks.pop() : undefined;
    assert(
      !hasInverse || inverse !== undefined,
      `expected an inverse block, but none was pushed on the stack`
    );

    // let blocks = this.template.block.blocks;
    // assert(
    //   typeof template !== 'number' || blocks[template] !== null,
    //   'missing block in the compiler'
    // );
    // assert(
    //   typeof inverse !== 'number' || blocks[inverse] !== null,
    //   'missing block in the compiler'
    // );

    let namedBlocks: Option<Core.Blocks>;

    if (template === null && inverse === null) {
      namedBlocks = null;
    } else if (inverse === undefined) {
      namedBlocks = [['default'], [template]];
    } else {
      namedBlocks = [
        ['default', 'else'],
        [template, inverse],
      ];
    }

    // assert(head[]);

    return helpers.op(SexpOpcodes.Block, head, params, hash, namedBlocks);
  },

  openComponent(helpers: CompilerHelpers, element: AST.ElementNode) {
    let tag =
      helpers.options && helpers.options.customizeComponentName
        ? helpers.options.customizeComponentName(element.tag)
        : element.tag;
    let component = new ComponentBlock(tag, element.symbols!, element.selfClosing);
    helpers.startBlock(component);
  },

  openNamedBlock(helpers: CompilerHelpers, element: AST.ElementNode) {
    let block: Block = new NamedBlock(element.tag, element.symbols!);
    helpers.startBlock(block);
  },

  openElement(helpers: CompilerHelpers, element: AST.ElementNode, simple: boolean) {
    let tag = element.tag;

    if (element.blockParams.length > 0) {
      throw new Error(
        `Compile Error: <${element.tag}> is not a component and doesn't support block parameters`
      );
    } else {
      return helpers.op(simple ? SexpOpcodes.OpenElement : SexpOpcodes.OpenElementWithSplat, tag);
    }
  },

  flushElement(helpers: CompilerHelpers) {
    return helpers.op(SexpOpcodes.FlushElement);
  },

  closeComponent(helpers: CompilerHelpers, _element: AST.ElementNode) {
    let [tag, attrs, args, blocks] = helpers.endComponent();

    return helpers.op(SexpOpcodes.Component, tag, attrs, args, blocks);
  },

  closeNamedBlock(helpers: CompilerHelpers, _element: AST.ElementNode) {
    let { blocks } = helpers;
    let block = expect(blocks.pop(), `Expected a named block on the stack`) as NamedBlock;

    helpers.currentComponent.pushBlock(block.name, block.toJSON());
  },

  closeDynamicComponent(helpers: CompilerHelpers, _element: AST.ElementNode) {
    let [, attrs, args, block] = helpers.endComponent();

    return helpers.op(SexpOpcodes.Component, helpers.popValue(EXPR), attrs, args, block);
  },

  closeElement(helpers: CompilerHelpers, _element: AST.ElementNode) {
    return helpers.op(SexpOpcodes.CloseElement);
  },

  staticAttr(helpers: CompilerHelpers, name: string, namespace?: string) {
    let value = helpers.popValue(STRING);

    let op: Statements.StaticAttr = [SexpOpcodes.StaticAttr, deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(...op);
  },

  staticComponentAttr(helpers: CompilerHelpers, name: string, namespace?: string) {
    let value = helpers.popValue(STRING);
    let op: Statements.StaticComponentAttr = [
      SexpOpcodes.StaticComponentAttr,
      deflateAttrName(name),
      value,
    ];
    if (namespace) op.push(namespace);
    return helpers.op(...op);
  },

  dynamicAttr(helpers: CompilerHelpers, name: string, namespace?: string) {
    let value = helpers.popValue(EXPR);
    let op: Statements.DynamicAttr = [SexpOpcodes.DynamicAttr, deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(...op);
  },

  componentAttr(helpers: CompilerHelpers, name: string, namespace?: string) {
    let value = helpers.popValue(EXPR);
    let op: Statements.ComponentAttr = [SexpOpcodes.ComponentAttr, deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(...op);
  },

  trustingAttr(helpers: CompilerHelpers, name: string, namespace?: string) {
    let value = helpers.popValue(EXPR);
    let op: Statements.TrustingAttr = [
      SexpOpcodes.TrustingDynamicAttr,
      deflateAttrName(name),
      value,
    ];
    if (namespace) op.push(namespace);
    return helpers.op(...op);
  },

  trustingComponentAttr(helpers: CompilerHelpers, name: string, namespace?: string) {
    let value = helpers.popValue(EXPR);
    let op: Statements.TrustingComponentAttr = [
      SexpOpcodes.TrustingComponentAttr,
      deflateAttrName(name),
      value,
    ];
    if (namespace) op.push(namespace);
    return helpers.op(...op);
  },

  staticArg(helpers: CompilerHelpers, name: str) {
    let value = helpers.popValue(EXPR);
    return helpers.op(SexpOpcodes.StaticArg, name, value);
  },

  dynamicArg(helpers: CompilerHelpers, name: str) {
    let value = helpers.popValue(EXPR);
    return helpers.op(SexpOpcodes.DynamicArg, name, value);
  },

  yield(helpers: CompilerHelpers, to: number) {
    let params = helpers.popValue(PARAMS);
    return helpers.op(SexpOpcodes.Yield, to, params);
  },

  attrSplat(helpers: CompilerHelpers, to: Option<number>) {
    // consume (and disregard) the value pushed for the
    // ...attributes attribute
    helpers.popValue(ANY);
    return helpers.op(SexpOpcodes.AttrSplat, to!);
  },

  debugger(helpers: CompilerHelpers, evalInfo: Option<Core.EvalInfo>) {
    helpers.template.block.hasEval = true;
    return helpers.op(SexpOpcodes.Debugger, evalInfo!);
  },

  hasBlock(helpers: CompilerHelpers, name: number) {
    return helpers.pushValue([SexpOpcodes.HasBlock, [SexpOpcodes.GetSymbol, name]]);
  },

  hasBlockParams(helpers: CompilerHelpers, name: number) {
    helpers.pushValue([SexpOpcodes.HasBlockParams, [SexpOpcodes.GetSymbol, name]]);
  },

  partial(helpers: CompilerHelpers, evalInfo: Option<Core.EvalInfo>) {
    let params = helpers.popValue(PARAMS);
    helpers.template.block.hasEval = true;
    return helpers.op(SexpOpcodes.Partial, params[0], evalInfo!);
  },

  /// Expressions

  literal(helpers: CompilerHelpers, value: Expressions.Value | undefined) {
    if (value === undefined) {
      helpers.pushValue<Expressions.Undefined>([SexpOpcodes.Undefined]);
    } else {
      helpers.pushValue<Expressions.Value>(value);
    }
  },

  getPath(helpers: CompilerHelpers, path: string[]) {
    let [op, sym] = helpers.popValue(GET);
    helpers.pushValue<Expressions.GetPath>([op, sym, path]);
  },

  getSymbol(helpers: CompilerHelpers, head: number) {
    helpers.pushValue<Expressions.GetSymbol>([SexpOpcodes.GetSymbol, head]);
  },

  getFree(helpers: CompilerHelpers, head: number) {
    helpers.pushValue<Expressions.GetFree>([SexpOpcodes.GetFree, head]);
  },

  getFreeWithContext(helpers: CompilerHelpers, head: number, context: ExpressionContext) {
    helpers.pushValue<Expressions.GetContextualFree>([expressionContextOp(context), head]);
  },

  concat(helpers: CompilerHelpers) {
    helpers.pushValue<Expressions.Concat>([SexpOpcodes.Concat, helpers.popValue(CONCAT_PARAMS)]);
  },

  helper(helpers: CompilerHelpers) {
    let head = helpers.popValue(EXPR);
    let params = helpers.popValue(PARAMS);
    let hash = helpers.popValue(HASH);

    helpers.pushValue<Expressions.Helper>([SexpOpcodes.Call, head, params, hash]);
  },

  prepareArray(helpers: CompilerHelpers, size: number) {
    let values: WireFormat.Expression[] = [];

    for (let i = 0; i < size; i++) {
      values.push(helpers.popValue(EXPR));
    }

    helpers.pushValue<WireFormat.Core.Params>(values);
  },

  prepareObject(helpers: CompilerHelpers, size: number) {
    helpers.assertStackHas(size);

    let keys: string[] = new Array(size);
    let values: WireFormat.Expression[] = new Array(size);

    for (let i = 0; i < size; i++) {
      keys[i] = helpers.popValue(STRING);
      values[i] = helpers.popValue(EXPR);
    }

    helpers.pushValue<WireFormat.Core.Hash>([keys, values]);
  },
};

// const WireFormatVisitor: Visitor = {};

// export default class JavaScriptCompiler {
//   static process(opcodes: Input, symbols: AST.ProgramSymbols, options?: CompileOptions): Template {
//     let compiler = new JavaScriptCompiler(opcodes, symbols, options);
//     return compiler.process();
//   }

//   private readonly template: Template;
//   private readonly blocks = new Stack<Block>();
//   private readonly opcodes: readonly JavaScriptCompilerOp[];
//   private readonly values: StackValue[] = [];
//   private readonly options: CompileOptions | undefined;

//   constructor(opcodes: Input, symbols: AST.ProgramSymbols, options?: CompileOptions) {
//     this.opcodes = opcodes;
//     this.template = new Template(symbols);
//     this.options = options;
//   }

//   process(): Template {
//     this.opcodes.forEach((op, i) => {
//       if (!this[op.name]) {
//         throw new Error(`unimplemented ${name} on JavaScriptCompiler`);
//       }

//       this[op.name](...op.args);
//     });
//     console.log(this.template);
//     return this.template;
//   }

//   /// Nesting

//   startBlock(program: AST.Block) {
//     this.startInlineBlock(program.symbols!);
//   }

//   endBlock() {
//     let block = this.endInlineBlock();
//     this.template.block.blocks.push(block);
//   }

//   startProgram() {
//     this.blocks.push(this.template.block);
//   }

//   endProgram() {}

//   /// Statements

//   text(content: string) {
//     this.push([SexpOpcodes.TrustingAppend, content]);
//   }

//   append(trusted: boolean) {
//     this.push([
//       trusted ? SexpOpcodes.TrustingAppend : SexpOpcodes.Append,
//       this.popValue<Expression>(),
//     ]);
//   }

//   comment(value: string) {
//     this.push([SexpOpcodes.Comment, value]);
//   }

//   modifier() {
//     let name = this.popValue<Expression>();
//     let params = this.popValue<Params>();
//     let hash = this.popValue<Hash>();
//     this.push([SexpOpcodes.Modifier, name, params, hash]);
//   }

//   block(hasInverse: boolean) {
//     let head = this.popValue<Expression>();
//     let params = this.popValue<Params>();
//     let hash = this.popValue<Hash>();

//     let template = this.template.block.blocks.pop();
//     assert(template !== undefined, `expected an inverse block, but none was pushed on the stack`);

//     let inverse = hasInverse ? this.template.block.blocks.pop() : undefined;
//     assert(
//       !hasInverse || inverse !== undefined,
//       `expected an inverse block, but none was pushed on the stack`
//     );

//     // let blocks = this.template.block.blocks;
//     // assert(
//     //   typeof template !== 'number' || blocks[template] !== null,
//     //   'missing block in the compiler'
//     // );
//     // assert(
//     //   typeof inverse !== 'number' || blocks[inverse] !== null,
//     //   'missing block in the compiler'
//     // );

//     let namedBlocks: Option<Core.Blocks>;

//     if (template === null && inverse === null) {
//       namedBlocks = null;
//     } else if (inverse === undefined) {
//       namedBlocks = [['default'], [template]];
//     } else {
//       namedBlocks = [
//         ['default', 'else'],
//         [template, inverse],
//       ];
//     }

//     // assert(head[]);

//     this.push([SexpOpcodes.Block, head, params, hash, namedBlocks]);
//   }

//   openComponent(element: AST.ElementNode) {
//     let tag =
//       this.options && this.options.customizeComponentName
//         ? this.options.customizeComponentName(element.tag)
//         : element.tag;
//     let component = new ComponentBlock(tag, element.symbols!, element.selfClosing);
//     this.blocks.push(component);
//   }

//   openNamedBlock(element: AST.ElementNode) {
//     let block: Block = new NamedBlock(element.tag, element.symbols!);
//     this.blocks.push(block);
//   }

//   openElement(element: AST.ElementNode, simple: boolean) {
//     let tag = element.tag;

//     if (element.blockParams.length > 0) {
//       throw new Error(
//         `Compile Error: <${element.tag}> is not a component and doesn't support block parameters`
//       );
//     } else {
//       this.push(simple ? [SexpOpcodes.OpenElement, tag] : [SexpOpcodes.OpenElementWithSplat, tag]);
//     }
//   }

//   flushElement() {
//     this.push([SexpOpcodes.FlushElement]);
//   }

//   closeComponent(_element: AST.ElementNode) {
//     let [tag, attrs, args, blocks] = this.endComponent();

//     this.push([SexpOpcodes.Component, tag, attrs, args, blocks]);
//   }

//   closeNamedBlock(_element: AST.ElementNode) {
//     let { blocks } = this;
//     let block = expect(blocks.pop(), `Expected a named block on the stack`) as NamedBlock;

//     this.currentComponent.pushBlock(block.name, block.toJSON());
//   }

//   closeDynamicComponent(_element: AST.ElementNode) {
//     let [, attrs, args, block] = this.endComponent();

//     this.push([SexpOpcodes.Component, this.popValue<Expression>(), attrs, args, block]);
//   }

//   closeElement(_element: AST.ElementNode) {
//     this.push([SexpOpcodes.CloseElement]);
//   }

//   staticAttr(name: string, namespace?: string) {
//     let value = this.popValue<string>();
//     let op: Statements.StaticAttr = [SexpOpcodes.StaticAttr, deflateAttrName(name), value];
//     if (namespace) op.push(namespace);
//     this.push(op);
//   }

//   staticComponentAttr(name: string, namespace?: string) {
//     let value = this.popValue<string>();
//     let op: Statements.StaticComponentAttr = [
//       SexpOpcodes.StaticComponentAttr,
//       deflateAttrName(name),
//       value,
//     ];
//     if (namespace) op.push(namespace);
//     this.push(op);
//   }

//   dynamicAttr(name: string, namespace?: string) {
//     let value = this.popValue<Expression>();
//     let op: Statements.DynamicAttr = [SexpOpcodes.DynamicAttr, deflateAttrName(name), value];
//     if (namespace) op.push(namespace);
//     this.push(op);
//   }

//   componentAttr(name: string, namespace?: string) {
//     let value = this.popValue<Expression>();
//     let op: Statements.ComponentAttr = [SexpOpcodes.ComponentAttr, deflateAttrName(name), value];
//     if (namespace) op.push(namespace);
//     this.push(op);
//   }

//   trustingAttr(name: string, namespace?: string) {
//     let value = this.popValue<Expression>();
//     let op: Statements.TrustingAttr = [
//       SexpOpcodes.TrustingDynamicAttr,
//       deflateAttrName(name),
//       value,
//     ];
//     if (namespace) op.push(namespace);
//     this.push(op);
//   }

//   trustingComponentAttr(name: string, namespace?: string) {
//     let value = this.popValue<Expression>();
//     let op: Statements.TrustingComponentAttr = [
//       SexpOpcodes.TrustingComponentAttr,
//       deflateAttrName(name),
//       value,
//     ];
//     if (namespace) op.push(namespace);
//     this.push(op);
//   }

//   staticArg(name: str) {
//     let value = this.popValue<Expression>();
//     this.push([SexpOpcodes.StaticArg, name, value]);
//   }

//   dynamicArg(name: str) {
//     let value = this.popValue<Expression>();
//     this.push([SexpOpcodes.DynamicArg, name, value]);
//   }

//   yield(to: number) {
//     let params = this.popValue<Params>();
//     this.push([SexpOpcodes.Yield, to, params]);
//   }

//   attrSplat(to: Option<number>) {
//     // consume (and disregard) the value pushed for the
//     // ...attributes attribute
//     this.popValue();
//     this.push([SexpOpcodes.AttrSplat, to!]);
//   }

//   debugger(evalInfo: Option<Core.EvalInfo>) {
//     this.push([SexpOpcodes.Debugger, evalInfo!]);
//     this.template.block.hasEval = true;
//   }

//   hasBlock(name: number) {
//     this.pushValue<Expressions.HasBlock>([SexpOpcodes.HasBlock, [SexpOpcodes.GetSymbol, name]]);
//   }

//   hasBlockParams(name: number) {
//     this.pushValue<Expressions.HasBlockParams>([
//       SexpOpcodes.HasBlockParams,
//       [SexpOpcodes.GetSymbol, name],
//     ]);
//   }

//   partial(evalInfo: Option<Core.EvalInfo>) {
//     let params = this.popValue<Params>();
//     this.push([SexpOpcodes.Partial, params[0], evalInfo!]);
//     this.template.block.hasEval = true;
//   }

//   /// Expressions

//   literal(value: Expressions.Value | undefined) {
//     if (value === undefined) {
//       this.pushValue<Expressions.Undefined>([SexpOpcodes.Undefined]);
//     } else {
//       this.pushValue<Expressions.Value>(value);
//     }
//   }

//   getPath(path: string[]) {
//     let [op, sym] = this.popValue<Expressions.Get>();
//     this.pushValue<Expressions.GetPath>([op, sym, path]);
//   }

//   getSymbol(head: number) {
//     this.pushValue<Expressions.GetSymbol>([SexpOpcodes.GetSymbol, head]);
//   }

//   getFree(head: number) {
//     this.pushValue<Expressions.GetFree>([SexpOpcodes.GetFree, head]);
//   }

//   getFreeWithContext(head: number, context: ExpressionContext) {
//     this.pushValue<Expressions.GetContextualFree>([expressionContextOp(context), head]);
//   }

//   concat() {
//     this.pushValue<Expressions.Concat>([SexpOpcodes.Concat, this.popValue<ConcatParams>()]);
//   }

//   helper() {
//     let { value: head } = this.popLocatedValue<Expression>();
//     let params = this.popValue<Params>();
//     let hash = this.popValue<Hash>();

//     this.pushValue<Expressions.Helper>([SexpOpcodes.Call, head, params, hash]);
//   }

//   /// Stack Management Opcodes

//   prepareArray(size: number) {
//     let values: Expression[] = [];

//     for (let i = 0; i < size; i++) {
//       values.push(this.popValue() as Expression);
//     }

//     this.pushValue<Params>(values);
//   }

//   prepareObject(size: number) {
//     assert(
//       this.values.length >= size,
//       `Expected ${size} values on the stack, found ${this.values.length}`
//     );

//     let keys: string[] = new Array(size);
//     let values: Expression[] = new Array(size);

//     for (let i = 0; i < size; i++) {
//       keys[i] = this.popValue<str>();
//       values[i] = this.popValue<Expression>();
//     }

//     this.pushValue<Hash>([keys, values]);
//   }

//   /// Utilities

//   endComponent(): [string, Statements.Attribute[], Core.Hash, Core.Blocks] {
//     let component = this.blocks.pop();
//     assert(
//       component instanceof ComponentBlock,
//       'Compiler bug: endComponent() should end a component'
//     );

//     return (component as ComponentBlock).toJSON();
//   }

//   startInlineBlock(symbols: AST.BlockSymbols) {
//     let block: Block = new InlineBlock(symbols);
//     this.blocks.push(block);
//   }

//   endInlineBlock(): SerializedInlineBlock {
//     let { blocks } = this;
//     let block = blocks.pop() as InlineBlock;
//     return block.toJSON();
//   }

//   push(args: Statement) {
//     this.currentBlock.push(args);
//   }

//   pushValue<S extends Expression | Params | Hash>(val: S) {
//     this.values.push(val);
//   }

//   popLocatedValue<T extends StackValue>(): { value: T; location: Option<SourceOffsets> } {
//     assert(this.values.length, 'No expression found on stack');
//     let value = this.values.pop() as T;

//     // if (location === undefined) {
//     //   throw new Error('Unbalanced location push and pop');
//     // }

//     return { value, location: null };
//   }

//   popValue<T extends StackValue>(): T {
//     return this.popLocatedValue<T>().value;
//   }
// }
