import { AST } from '@glimmer/syntax';
import { ExpressionContext, Option } from '@glimmer/interfaces';
import { Op, OpFactory } from './ops';

export interface AllocateSymbolsOpTable {
  startProgram: [AST.Template];
  endProgram: [];
  startBlock: [AST.Block];
  endBlock: [];
  append: [boolean];
  text: [string];
  comment: [string];
  block: [boolean /* has inverse */];
  yield: [string];
  debugger: [null];
  hasBlock: [string];
  hasBlockParams: [string];
  partial: [];

  openElement: [AST.ElementNode, boolean];
  closeElement: [AST.ElementNode];
  openComponent: [AST.ElementNode];
  closeComponent: [AST.ElementNode];
  openNamedBlock: [AST.ElementNode];
  closeNamedBlock: [AST.ElementNode];
  closeDynamicComponent: [AST.ElementNode];
  flushElement: [AST.ElementNode];

  staticArg: [string];
  dynamicArg: [string];
  staticAttr: [string, Option<string>];
  staticComponentAttr: [string, Option<string>];
  componentAttr: [string, Option<string>];
  dynamicAttr: [string, Option<string>];
  trustingComponentAttr: [string, Option<string>];
  trustingAttr: [string, Option<string>];
  attrSplat: [];

  getVar: [string, ExpressionContext];
  getArg: [string];
  getFree: [string];
  getThis: [];

  getPath: [string[]];

  modifier: [];
  helper: [];

  literal: [string | boolean | number | null | undefined];
  concat: [];

  prepareArray: [number];
  prepareObject: [number];
}

export type AllocateSymbolsOps = {
  [P in keyof AllocateSymbolsOpTable]: Op<P, AllocateSymbolsOpTable>;
};

export type AllocateSymbolsOp<
  P extends keyof AllocateSymbolsOps = keyof AllocateSymbolsOps
> = AllocateSymbolsOps[P];
