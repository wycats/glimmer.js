import { AST } from '@glimmer/syntax';
import { ExpressionContext } from '@glimmer/interfaces';
import { SourceOffsets } from './location';
import { Op, UnlocatedOp } from '../shared/ops';

export interface Located<T> {
  node: T;
  offsets: SourceOffsets | null;
}

export function located<T>(node: null, offsets: SourceOffsets | null): null;
export function located<T>(node: T, offsets: SourceOffsets | null): Located<T>;
export function located<T>(
  node: T,
  offsets: SourceOffsets | null
): T extends null ? null : Located<T> {
  if (node === null) {
    return null as T extends null ? null : Located<T>;
  } else {
    return {
      node,
      offsets,
    } as T extends null ? null : Located<T>;
  }
}

export interface AttrKind {
  // triple-curly
  trusting: boolean;
  // this attribute is on an element with component features:
  //   - <CapCase ...>
  //   - modifiers
  //   - <dynamic.tag ...>
  component: boolean;
}

/** EXPRESSIONS **/

export interface Literal {
  type: 'Literal';
  value: AST.Literal['value'];
}

export interface Path {
  type: 'Path';
  head: Pass1Expr;
  tail: Located<string>[];
}

export interface GetArg {
  type: 'GetArg';
  name: string;
}

export interface GetThis {
  type: 'ThisPath';
}

export interface GetVar {
  type: 'VarPath';
  name: string;
  context: ExpressionContext;
}

export interface HasBlock {
  type: 'HasBlock';
  target: string;
}

export interface HasBlockParams {
  type: 'HasBlockParams';
  target: string;
}

export interface Concat {
  type: 'Concat';
  parts: [Pass1Expr, ...Pass1Expr[]];
}

export interface SubExpression {
  type: 'SubExpression';
  head: Pass1Expr;
  params: Pass1Expr<'Params'>;
  hash: Pass1Expr<'Hash'>;
}

export interface Params {
  type: 'Params';
  list: Pass1Expr[];
}

export interface HashPair {
  type: 'HashPair';
  key: Located<string>;
  value: Pass1Expr;
}

export interface Hash {
  type: 'Hash';
  pairs: Pass1Expr<'HashPair'>[];
}

export type Expression =
  | Literal
  | Path
  | GetArg
  | GetThis
  | GetVar
  | HasBlock
  | HasBlockParams
  | SubExpression;

export interface Pass1ExprTable {
  Literal: Literal;
  Concat: Concat;
  Path: Path;
  GetArg: GetArg;
  GetThis: GetThis;
  GetVar: GetVar;
  HasBlock: HasBlock;
  HasBlockParams: HasBlockParams;
  SubExpression: SubExpression;

  Params: Params;
  Hash: Hash;
  HashPair: HashPair;
}

export type Pass1Exprs = {
  [P in keyof Pass1ExprTable]: Op<P, Pass1ExprTable>;
};

export type Pass1Expr<P extends keyof Pass1Exprs = keyof Pass1Exprs> = Pass1Exprs[P];

/** STATEMENTS **/

export interface Yield {
  type: 'Yield';
  target: Located<string>;
}

export interface Partial {
  type: 'Partial';
  params: Pass1Expr<'Params'>;
}

export interface Debugger {
  type: 'Debugger';
}

export interface InElement {
  type: 'InElement';
  destination?: Pass1Expr;
  guid: string;
  insertBefore?: Pass1Expr;
}

export interface AppendTextNode {
  type: 'AppendTextNode';
  value: Pass1Expr;
}

export interface AppendTrustedHTML {
  type: 'AppendTrustedHTML';
  value: Pass1Expr;
}

export interface AppendComment {
  type: 'AppendComment';
  value: Located<string>;
}

export interface BlockInvocation {
  type: 'BlockInvocation';
  head: Pass1Expr;
  params: Pass1Expr<'Params'>;
  hash: Pass1Expr<'Hash'>;
  blocks: Pass1Statement<'Block'>[];
}

export interface Block {
  type: 'Block';
  name: Located<string>;
  symbols: AST.BlockSymbols | undefined;
  body: Pass1Statement[];
}

// TODO: Make Component have the same structure as BlockInvocation, and
// make named blocks just normal blocks in the invocation
export interface OpenNamedBlock {
  type: 'OpenNamedBlock';
  tag: Located<string>;
  symbols: AST.BlockSymbols | undefined;
}

export interface OpenComponent {
  type: 'OpenComponent';
  tag: Pass1Expr;
  selfClosing: boolean;
  symbols: AST.BlockSymbols | undefined;
}

export interface OpenSimpleElement {
  type: 'OpenSimpleElement';
  tag: Located<string>;
}

export interface OpenElementWithDynamicFeatures {
  type: 'OpenElementWithDynamicFeatures';
  tag: Located<string>;
}

export interface FlushElement {
  type: 'FlushElement';
}

export interface CloseNamedBlock {
  type: 'CloseNamedBlock';
}

export interface CloseDynamicComponent {
  type: 'CloseDynamicComponent';
}

export interface CloseComponent {
  type: 'CloseComponent';
}

export interface CloseElement {
  type: 'CloseElement';
}

export interface Arg {
  type: 'Arg';
  name: Located<string>;
  value: Pass1Expr;
}

export interface AttrSplat {
  type: 'AttrSplat';
}

export interface Attr {
  type: 'Attr';
  kind: AttrKind;
  name: Located<string>;
  value: Pass1Expr;
  namespace?: string;
}

export interface Modifier {
  type: 'Modifier';
  head: Pass1Expr;
  params: Pass1Expr<'Params'>;
  hash: Pass1Expr<'Hash'>;
}

export interface Pass1StatementTable {
  Yield: Yield;
  Partial: Partial;
  Debugger: Debugger;
  InElement: InElement;

  BlockInvocation: BlockInvocation;
  Block: Block;

  AppendTextNode: AppendTextNode;
  AppendTrustedHTML: AppendTrustedHTML;
  AppendComment: AppendComment;

  OpenNamedBlock: OpenNamedBlock;
  OpenComponent: OpenComponent;
  OpenSimpleElement: OpenSimpleElement;
  OpenElementWithDynamicFeatures: OpenElementWithDynamicFeatures;

  FlushElement: FlushElement;

  CloseNamedBlock: CloseNamedBlock;
  CloseDynamicComponent: CloseDynamicComponent;
  CloseComponent: CloseComponent;
  CloseElement: CloseElement;

  Arg: Arg;
  AttrSplat: AttrSplat;
  Attr: Attr;
  Modifier: Modifier;
}

export type Pass1Statements = {
  [P in keyof Pass1StatementTable]: Op<P, Pass1StatementTable>;
};

export type Pass1Statement<
  P extends keyof Pass1Statements = keyof Pass1Statements
> = Pass1Statements[P];

export type UnlocatedPass1Statements = {
  [P in keyof Pass1StatementTable]: UnlocatedOp<P, Pass1StatementTable>;
};

export type UnlocatedPass1Statement<
  P extends keyof Pass1Statements = keyof Pass1Statements
> = UnlocatedPass1Statements[P];
