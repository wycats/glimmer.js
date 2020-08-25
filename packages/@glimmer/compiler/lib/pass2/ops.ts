import { ExpressionContext, Option } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { Op } from '../shared/ops';

export interface Pass2OpTable {
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
  staticAttr: { name: string; namespace: Option<string> };
  staticComponentAttr: { name: string; namespace: Option<string> };
  componentAttr: { name: string; namespace: Option<string> };
  dynamicAttr: { name: string; namespace: Option<string> };
  trustingComponentAttr: { name: string; namespace: Option<string> };
  trustingAttr: { name: string; namespace: Option<string> };

  helper: {};
  modifier: {};
  block: boolean /* has inverse */;
  attrSplat: {};
  getPath: string[];
  getVar: { var: string; context: ExpressionContext };
  getArg: string;
  getThis: {};
  yield: string;

  literal: string | boolean | number | null | undefined;
  concat: {};

  hasBlock: string | 0;
  hasBlockParams: string | 0;

  debugger: null;
  partial: {};

  prepareArray: number;
  prepareObject: number;
}

export type Pass2Ops = {
  [P in keyof Pass2OpTable]: Op<P, Pass2OpTable>;
};

export type Pass2Op<P extends keyof Pass2Ops = keyof Pass2Ops> = Pass2Ops[P];
