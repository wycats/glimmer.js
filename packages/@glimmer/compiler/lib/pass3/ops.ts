import type { AST } from '@glimmer/syntax';
import type { ExpressionContext, Option, WireFormat } from '@glimmer/interfaces';
import { Op, OpImpl } from '../shared/ops';
import { OpenBlockComponent, OpenBlockElement, OpenElement } from '../pass2/ops';

export interface Pass3OpsTable {
  startProgram: AST.Template;
  endProgram: void;
  startBlock: AST.Block;
  endBlock: void;
  appendTrustedHTML: void;
  appendTextNode: void;

  text: string;
  comment: string;

  openSimpleElement: OpenElement;
  openElementWithDynamicFeatures: OpenElement;
  closeElement: void;
  openComponent: OpenBlockComponent;
  closeComponent: void;
  openNamedBlock: OpenBlockElement;
  closeNamedBlock: void;
  closeDynamicComponent: void;
  flushElement: void;

  staticArg: string;
  dynamicArg: string;
  staticAttr: { name: string; namespace?: string };
  staticComponentAttr: { name: string; namespace?: string };
  componentAttr: { name: string; namespace?: string };
  dynamicAttr: { name: string; namespace?: string };
  trustingComponentAttr: { name: string; namespace?: string };
  trustingAttr: { name: string; namespace?: string };

  helper: void;
  modifier: void;
  block: boolean /* has inverse */;
  attrSplat: Option<number>;
  getPath: string[];
  getSymbol: number;
  getFree: number;
  getFreeWithContext: { var: number; context: ExpressionContext };
  yield: number;

  literal: string | boolean | number | null | undefined;
  concat: void;

  hasBlock: number;
  hasBlockParams: number;

  debugger: WireFormat.Core.EvalInfo;
  partial: WireFormat.Core.EvalInfo;

  prepareArray: number;
  prepareObject: number;
}

export type Pass3Ops = {
  [P in keyof Pass3OpsTable]: Op<P, Pass3OpsTable>;
};

export type Pass3Op<P extends keyof Pass3Ops = keyof Pass3Ops> = Pass3Ops[P];
