import type { AST } from '@glimmer/syntax';
import type { ExpressionContext, Option, WireFormat } from '@glimmer/interfaces';
import { Op } from '../ops/ops';

export interface JavaScriptCompilerOps {
  text: [string];
  comment: [string];

  openElement: [AST.ElementNode, boolean];
  closeElement: [AST.ElementNode];
  openComponent: [AST.ElementNode];
  closeComponent: [AST.ElementNode];
  openNamedBlock: [AST.ElementNode];
  closeNamedBlock: [AST.ElementNode];
  closeDynamicComponent: [AST.ElementNode];
  flushElement: [AST.ElementNode];

  staticAttr: [string, string?];
  staticComponentAttr: [string, string?];
  componentAttr: [string, string?];
  dynamicAttr: [string, string?];
  trustingComponentAttr: [string, string?];
  trustingAttr: [string, string?];

  helper: [];
  modifier: [];
  block: [boolean] /* has inverse */;
  attrSplat: [Option<number>];
  getPath: [string[]];
  getSymbol: [number];
  getFree: [number];
  getFreeWithContext: [number, ExpressionContext];
  yield: [number];

  hasBlock: [number];
  hasBlockParams: [number];

  debugger: [WireFormat.Core.EvalInfo];
  partial: [WireFormat.Core.EvalInfo];
}

export type JavaScriptCompilerOp<
  K extends keyof JavaScriptCompilerOps = keyof JavaScriptCompilerOps
> = Op<K, JavaScriptCompilerOps>;
