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
import { OpImpl } from '../shared/ops';
import { deflateAttrName } from '../utils';
import { Block, ComponentBlock, InlineBlock, NamedBlock, Template } from './blocks';
import { ANY, CONCAT_PARAMS, EXPR, GET, HASH, PARAMS, STRING } from './checks';
import {
  CompilerContext,
  CompilerHelpers,
  MutableState,
  OutOpMap,
  OutOpName,
  Tail,
} from './context';
import { Pass3Op, Pass3OpsTable } from './ops';

export type str = string;
import Core = WireFormat.Core;
export type Params = WireFormat.Core.Params;
export type ConcatParams = WireFormat.Core.ConcatParams;
export type Hash = WireFormat.Core.Hash;
export type Path = WireFormat.Core.Path;
export type StackValue = WireFormat.Expression | Params | Hash | str;

export type OutOp = OpImpl<OutOpName, OutOpMap>;

type Visitor = {
  [P in keyof Pass3OpsTable]: (
    helpers: CompilerHelpers,
    args: Pass3OpsTable[P]
  ) => OutOp | OutOp[] | void;
};

export type VisitorFunction<O extends Pass3Op> = (
  helpers: CompilerHelpers,
  args: O['args']
) => OutOp | OutOp[] | void;

function visit<O extends Pass3Op>(op: O, helpers: CompilerHelpers): WireFormat.Statement[] {
  let fn = VISITOR[op.name] as VisitorFunction<O>;

  let result = fn(helpers, op.args);

  if (result === undefined) {
    return [];
  } else if (Array.isArray(result)) {
    return result.map(op => [op.name, ...op.args] as WireFormat.Statement);
  } else {
    return [[result.name, ...result.args] as WireFormat.Statement];
  }
}

export function process(
  opcodes: readonly Pass3Op[],
  symbols: AST.ProgramSymbols,
  source: string,
  options?: CompileOptions
): Template {
  let context = new CompilerContext(opcodes, source, options);
  let state = new MutableState(new Template(symbols));

  for (let op of opcodes) {
    let helpers = context.helpers(state, op.offsets);

    state.push(...visit(op, helpers));
  }

  console.log(state.template);
  return state.template;
}

class WFVisitor implements Visitor {
  /// Nesting

  startBlock(helpers: CompilerHelpers, program: AST.Block) {
    helpers.startBlock(new InlineBlock(program.symbols!));
  }

  endBlock(helpers: CompilerHelpers) {
    helpers.endInlineBlock();
  }

  startProgram(helpers: CompilerHelpers) {
    helpers.startBlock(helpers.template.block);
  }

  endProgram() {}

  /// Statements

  text(helpers: CompilerHelpers, content: string) {
    return helpers.op(SexpOpcodes.TrustingAppend, [content]);
  }

  appendTextNode(helpers: CompilerHelpers) {
    return helpers.op(SexpOpcodes.Append, [helpers.popValue(EXPR)]);
  }

  appendTrustedHTML(helpers: CompilerHelpers) {
    return helpers.op(SexpOpcodes.TrustingAppend, [helpers.popValue(EXPR)]);
  }

  comment(helpers: CompilerHelpers, value: string) {
    return helpers.op(SexpOpcodes.Comment, [value]);
  }

  modifier(helpers: CompilerHelpers) {
    let name = helpers.popValue(EXPR);
    let params = helpers.popValue(PARAMS);
    let hash = helpers.popValue(HASH);

    return helpers.op(SexpOpcodes.Modifier, [name, params, hash]);
  }

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

    return helpers.op(SexpOpcodes.Block, [head, params, hash, namedBlocks]);
  }

  openComponent(helpers: CompilerHelpers, element: AST.ElementNode) {
    let tag =
      helpers.options && helpers.options.customizeComponentName
        ? helpers.options.customizeComponentName(element.tag)
        : element.tag;
    let component = new ComponentBlock(tag, element.symbols!, element.selfClosing);
    helpers.startBlock(component);
  }

  openNamedBlock(
    helpers: CompilerHelpers,
    { tag, symbols }: { tag: string; symbols: AST.BlockSymbols }
  ) {
    let block: Block = new NamedBlock(tag, symbols);
    helpers.startBlock(block);
  }

  openSimpleElement(helpers: CompilerHelpers, { tag }: { tag: string }) {
    return helpers.op(SexpOpcodes.OpenElement, [tag]);
  }

  openElementWithDynamicFeatures(helpers: CompilerHelpers, { tag }: { tag: string }) {
    return helpers.op(SexpOpcodes.OpenElementWithSplat, [tag]);
  }

  flushElement(helpers: CompilerHelpers) {
    return helpers.op(SexpOpcodes.FlushElement);
  }

  closeComponent(helpers: CompilerHelpers, _element: AST.ElementNode) {
    let [tag, attrs, args, blocks] = helpers.endComponent();

    return helpers.op(SexpOpcodes.Component, [tag, attrs, args, blocks]);
  }

  closeNamedBlock(helpers: CompilerHelpers, _element: AST.ElementNode) {
    let { blocks } = helpers;
    let block = expect(blocks.pop(), `Expected a named block on the stack`) as NamedBlock;

    helpers.currentComponent.pushBlock(block.name, block.toJSON());
  }

  closeDynamicComponent(helpers: CompilerHelpers, _element: AST.ElementNode) {
    let [, attrs, args, block] = helpers.endComponent();

    return helpers.op(SexpOpcodes.Component, [helpers.popValue(EXPR), attrs, args, block]);
  }

  closeElement(helpers: CompilerHelpers, _element: AST.ElementNode) {
    return helpers.op(SexpOpcodes.CloseElement);
  }

  staticAttr(helpers: CompilerHelpers, { name, namespace }: { name: string; namespace?: string }) {
    let value = helpers.popValue(STRING);

    let op: Tail<Statements.StaticAttr> = [deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(SexpOpcodes.StaticAttr, op);
  }

  staticComponentAttr(
    helpers: CompilerHelpers,
    { name, namespace }: { name: string; namespace?: string }
  ) {
    let value = helpers.popValue(STRING);
    let op: Tail<Statements.StaticComponentAttr> = [deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(SexpOpcodes.StaticComponentAttr, op);
  }

  dynamicAttr(helpers: CompilerHelpers, { name, namespace }: { name: string; namespace?: string }) {
    let value = helpers.popValue(EXPR);
    let op: Tail<Statements.DynamicAttr> = [deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(SexpOpcodes.DynamicAttr, op);
  }

  componentAttr(
    helpers: CompilerHelpers,
    { name, namespace }: { name: string; namespace?: string }
  ) {
    let value = helpers.popValue(EXPR);
    let op: Tail<Statements.ComponentAttr> = [deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(SexpOpcodes.ComponentAttr, op);
  }

  trustingAttr(
    helpers: CompilerHelpers,
    { name, namespace }: { name: string; namespace?: string }
  ) {
    let value = helpers.popValue(EXPR);
    let op: Tail<Statements.TrustingAttr> = [deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(SexpOpcodes.TrustingDynamicAttr, op);
  }

  trustingComponentAttr(
    helpers: CompilerHelpers,
    { name, namespace }: { name: string; namespace?: string }
  ) {
    let value = helpers.popValue(EXPR);
    let op: Tail<Statements.TrustingComponentAttr> = [deflateAttrName(name), value];
    if (namespace) op.push(namespace);
    return helpers.op(SexpOpcodes.TrustingComponentAttr, op);
  }

  staticArg(helpers: CompilerHelpers, name: str) {
    let value = helpers.popValue(EXPR);
    return helpers.op(SexpOpcodes.StaticArg, [name, value]);
  }

  dynamicArg(helpers: CompilerHelpers, name: str) {
    let value = helpers.popValue(EXPR);
    return helpers.op(SexpOpcodes.DynamicArg, [name, value]);
  }

  yield(helpers: CompilerHelpers, to: number) {
    let params = helpers.popValue(PARAMS);
    return helpers.op(SexpOpcodes.Yield, [to, params]);
  }

  attrSplat(helpers: CompilerHelpers, to: Option<number>) {
    // consume (and disregard) the value pushed for the
    // ...attributes attribute
    helpers.popValue(ANY);
    return helpers.op(SexpOpcodes.AttrSplat, [to!]);
  }

  debugger(helpers: CompilerHelpers, evalInfo: Option<Core.EvalInfo>) {
    helpers.template.block.hasEval = true;
    return helpers.op(SexpOpcodes.Debugger, [evalInfo!]);
  }

  hasBlock(helpers: CompilerHelpers, name: number) {
    return helpers.pushValue([SexpOpcodes.HasBlock, [SexpOpcodes.GetSymbol, name]]);
  }

  hasBlockParams(helpers: CompilerHelpers, name: number) {
    helpers.pushValue([SexpOpcodes.HasBlockParams, [SexpOpcodes.GetSymbol, name]]);
  }

  partial(helpers: CompilerHelpers, evalInfo: Option<Core.EvalInfo>) {
    let params = helpers.popValue(PARAMS);
    helpers.template.block.hasEval = true;
    return helpers.op(SexpOpcodes.Partial, [params[0], evalInfo!]);
  }

  /// Expressions

  literal(helpers: CompilerHelpers, value: Expressions.Value | undefined) {
    if (value === undefined) {
      helpers.pushValue<Expressions.Undefined>([SexpOpcodes.Undefined]);
    } else {
      helpers.pushValue<Expressions.Value>(value);
    }
  }

  getPath(helpers: CompilerHelpers, path: string[]) {
    let [op, sym] = helpers.popValue(GET);
    helpers.pushValue<Expressions.GetPath>([op, sym, path]);
  }

  getSymbol(helpers: CompilerHelpers, head: number) {
    helpers.pushValue<Expressions.GetSymbol>([SexpOpcodes.GetSymbol, head]);
  }

  getFree(helpers: CompilerHelpers, head: number) {
    helpers.pushValue<Expressions.GetFree>([SexpOpcodes.GetFree, head]);
  }

  getFreeWithContext(
    helpers: CompilerHelpers,
    { var: head, context }: { var: number; context: ExpressionContext }
  ) {
    helpers.pushValue<Expressions.GetContextualFree>([expressionContextOp(context), head]);
  }

  concat(helpers: CompilerHelpers) {
    helpers.pushValue<Expressions.Concat>([SexpOpcodes.Concat, helpers.popValue(CONCAT_PARAMS)]);
  }

  helper(helpers: CompilerHelpers) {
    let head = helpers.popValue(EXPR);
    let params = helpers.popValue(PARAMS);
    let hash = helpers.popValue(HASH);

    helpers.pushValue<Expressions.Helper>([SexpOpcodes.Call, head, params, hash]);
  }

  prepareArray(helpers: CompilerHelpers, size: number) {
    let values: WireFormat.Expression[] = [];

    for (let i = 0; i < size; i++) {
      values.push(helpers.popValue(EXPR));
    }

    helpers.pushValue<WireFormat.Core.Params>(values);
  }

  prepareObject(helpers: CompilerHelpers, size: number) {
    helpers.assertStackHas(size);

    let keys: string[] = new Array(size);
    let values: WireFormat.Expression[] = new Array(size);

    for (let i = 0; i < size; i++) {
      keys[i] = helpers.popValue(STRING);
      values[i] = helpers.popValue(EXPR);
    }

    helpers.pushValue<WireFormat.Core.Hash>([keys, values]);
  }
}

const VISITOR: Visitor = new WFVisitor();
