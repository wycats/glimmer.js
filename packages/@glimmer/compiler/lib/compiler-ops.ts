import { AST } from '@glimmer/syntax';
import { Option, WireFormat, ExpressionContext } from '@glimmer/interfaces';

/**
  - 0 - represents `this`
  - string - represents any other path
 */
export type PathHead = string | 0;

export interface SourceLocation {
  source: string | null;
  start: number;
  end: number;
}

export interface InputOps {
  startProgram: [AST.Template];
  endProgram: [AST.Template];
  startBlock: [AST.Block];
  endBlock: [AST.Block];
  block: [AST.BlockStatement];
  mustache: [AST.MustacheStatement];
  openElement: [AST.ElementNode];
  closeElement: [AST.ElementNode];
  text: [AST.TextNode];
  comment: [AST.CommentStatement];
}

export interface AllocateSymbolsOps {
  startProgram: AST.Template;
  endProgram: void;
  startBlock: AST.Block;
  endBlock: void;
  append: boolean;
  text: string;
  comment: string;
  block: boolean;
  yield: string;
  debugger: null;
  hasBlock: string;
  hasBlockParams: string;
  partial: void;

  openElement: [AST.ElementNode, boolean];
  closeElement: AST.ElementNode;
  openComponent: AST.ElementNode;
  closeComponent: AST.ElementNode;
  openNamedBlock: AST.ElementNode;
  closeNamedBlock: AST.ElementNode;
  closeDynamicComponent: AST.ElementNode;
  flushElement: AST.ElementNode;

  staticArg: string;
  dynamicArg: string;
  staticAttr: [string, Option<string>];
  staticComponentAttr: [string, Option<string>];
  componentAttr: [string, Option<string>];
  dynamicAttr: [string, Option<string>];
  trustingComponentAttr: [string, Option<string>];
  trustingAttr: [string, Option<string>];
  attrSplat: void;

  getVar: [string, ExpressionContext];
  getArg: string;
  getFree: string;
  getThis: void;

  getPath: string[];

  modifier: void;
  helper: void;

  literal: string | boolean | number | null | undefined;
  concat: void;

  prepareArray: number;
  prepareObject: number;
}

export interface Opcode<T extends keyof NewAllocateSymbolsOps = keyof NewAllocateSymbolsOps> {
  opcode: AllocateSymbolsOp<T>;
  location: SourceLocation | null;
}

export type OpFor<O extends Opcode<keyof NewAllocateSymbolsOps>> = O extends Opcode<infer K>
  ? K
  : never;

type HeadOp = Opcode<'getVar' | 'getArg' | 'getFree' | 'getThis'>;

// TODO: A more sensible phase 1 pass would just triage things like the Mustache statements,
// and other things that could be keywords. That's a good step 2 after collapsing away the
// visitor and TemplateCompiler

export interface HirStatementOps {
  // Program: Program;
  Template: Opcode[];
  // Block: Opcode[];
  CommentStatement: Opcode<'comment'>;
  MustacheCommentStatement: [];
  TextNode: Opcode<'text'>;
  MustacheStatement: Opcode[];
  ElementModifierStatement: Opcode[];
  // BlockStatement: BlockStatement;
  PartialStatement: never;
  // ElementNode: ElementNode;
  // AttrNode: [
  //   Opcode<
  //     | 'staticArg'
  //     | 'dynamicArg'
  //     | 'attrSplat'
  //     | 'staticComponentAttr'
  //     | 'staticArg'
  //     | 'trustingAttr'
  //     | 'trustingComponentAttr'
  //     | 'componentAttr'
  //     | 'dynamicAttr'
  //   >
  // ];
}

export type HirStatementName = keyof HirStatementOps;

export type HirStatementOp<K extends HirStatementName> = HirStatementOps[K] extends
  | Opcode
  | Opcode[]
  ? HirStatementOps[K]
  : never;

export interface HirExpressionOps {
  PathExpression: [HeadOp, Opcode<'getPath'>] | [HeadOp];
  StringLiteral: Opcode<'literal'>;
  BooleanLiteral: Opcode<'literal'>;
  NumberLiteral: Opcode<'literal'>;
  NullLiteral: Opcode<'literal'>;
  UndefinedLiteral: Opcode<'literal'>;

  // TODO: Be more explicit about which opcodes are expected
  ConcatStatement: Opcode[];
  SubExpression: Opcode[];
}

export type HirExpressionName = keyof HirExpressionOps;

export type HirExpressionOp<K extends HirExpressionName> = HirExpressionOps[K] extends
  | Opcode
  | Opcode[]
  ? HirExpressionOps[K]
  : never;

export interface NewAllocateSymbolsOps {
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

export type SimpleOpName = {
  [P in keyof NewAllocateSymbolsOps]: NewAllocateSymbolsOps[P] extends [] ? P : never;
}[keyof NewAllocateSymbolsOps];

export type AllocateSymbolsOp<
  K extends keyof NewAllocateSymbolsOps
> = NewAllocateSymbolsOps[K] extends unknown[] ? [K, ...NewAllocateSymbolsOps[K]] : never;

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
> = [K, ...JavaScriptCompilerOps[K]];

// export interface JavaScriptCompilerOps {
//   text: string;
//   comment: string;

//   openElement: [AST.ElementNode, boolean];
//   closeElement: AST.ElementNode;
//   openComponent: AST.ElementNode;
//   closeComponent: AST.ElementNode;
//   openNamedBlock: AST.ElementNode;
//   closeNamedBlock: AST.ElementNode;
//   closeDynamicComponent: AST.ElementNode;
//   flushElement: AST.ElementNode;

//   staticAttr: [string, string?];
//   staticComponentAttr: [string, string?];
//   componentAttr: [string, string?];
//   dynamicAttr: [string, string?];
//   trustingComponentAttr: [string, string?];
//   trustingAttr: [string, string?];

//   helper: void;
//   modifier: void;
//   block: boolean /* has inverse */;
//   attrSplat: Option<number>;
//   getPath: string[];
//   getSymbol: number;
//   getFree: number;
//   getFreeWithContext: [number, ExpressionContext];
//   yield: number;

//   hasBlock: number;
//   hasBlockParams: number;

//   debugger: WireFormat.Core.EvalInfo;
//   partial: WireFormat.Core.EvalInfo;
// }

export type Processor<InOps extends PipelineOps> = {
  [P in keyof InOps]: InOps[P] extends void ? () => void : (op: InOps[P]) => void;
};

export type PipelineOps =
  | InputOps
  | AllocateSymbolsOps
  | NewAllocateSymbolsOps
  | JavaScriptCompilerOps;

export type OpsDict<O extends PipelineOps> = {
  [K in keyof O]: O[K] extends void ? [K] : [K, O[K]];
};
export type Ops<O extends PipelineOps> = OpsDict<O>[keyof O];
export type Op<O extends PipelineOps, K extends keyof O> = OpsDict<O>[K];
