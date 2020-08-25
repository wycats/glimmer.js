import type { AST } from '@glimmer/syntax';
import type { ExpressionContext, Option, WireFormat } from '@glimmer/interfaces';
import { Op, OpImpl } from '../shared/ops';

export interface Pass3OpsTable {
  startProgram: AST.Template;
  endProgram: void;
  startBlock: AST.Block;
  endBlock: void;
  append: boolean;

  text: string;
  comment: string;

  openElement: { element: AST.ElementNode; simple: boolean };
  closeElement: AST.ElementNode;
  openComponent: AST.ElementNode;
  closeComponent: AST.ElementNode;
  openNamedBlock: AST.ElementNode;
  closeNamedBlock: AST.ElementNode;
  closeDynamicComponent: AST.ElementNode;
  flushElement: AST.ElementNode;

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
