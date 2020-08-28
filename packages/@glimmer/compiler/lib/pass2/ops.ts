import { ExpressionContext, WireFormat } from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import * as pass1 from '../pass1/ops';
import { op, OpsTable } from '../shared/op';

export interface Attr {
  name: pass1.SourceSlice;
  namespace?: string;
}

export class InElement extends op('InElement').args<{
  destination?: pass1.Expr;
  guid: string;
  insertBefore?: pass1.Expr;
}>() {}

export class StartProgram extends op('StartProgram').args<AST.ProgramSymbols>() {}
export class EndProgram extends op('EndProgram').void() {}
export class StartBlock extends op('StartBlock').args<AST.BlockSymbols>() {}
export class EndBlock extends op('EndBlock').void() {}
export class AppendTrustedHTML extends op('AppendTrustedHTML').void() {}
export class AppendTextNode extends op('AppendTextNode').void() {}
export class OpenComponent extends op('OpenComponent').args<{
  symbols: AST.BlockSymbols;
}>() {}
export class StaticArg extends op('StaticArg').args<{ symbol: number }>() {}
export class DynamicArg extends op('DynamicArg').args<{ symbol: number }>() {}
export class StaticAttr extends op('StaticAttr').args<Attr>() {}
export class StaticComponentAttr extends op('StaticComponentAttr').args<Attr>() {}
export class ComponentAttr extends op('ComponentAttr').args<Attr>() {}
export class DynamicAttr extends op('DynamicAttr').args<Attr>() {}
export class TrustingComponentAttr extends op('TrustingComponentAttr').args<Attr>() {}
export class TrustingAttr extends op('TrustingAttr').args<Attr>() {}
export class FlushElement extends op('FlushElement').void() {}

export class Yield extends op('Yield').args<{ symbol: number }>() {}
export class Partial extends op('Partial').void() {}
export class Debugger extends op('Debugger').void() {}

export class Helper extends op('Helper').void() {}
export class Modifier extends op('Modifier').void() {}
export class InvokeBlock extends op('InvokeBlock').args<{ hasInverse: boolean }>() {}
export class AttrSplat extends op('AttrSplat').args<{ symbol: number }>() {}
export class GetPath extends op('GetPath').args<pass1.SourceSlice[]>() {}
export class GetSymbol extends op('GetSymbol').args<{ symbol: number }>() {}
export class GetFreeWithContext extends op('GetFreeWithContext').args<{
  symbol: number;
  context: ExpressionContext;
}>() {}
/** strict mode */
export class GetFree extends op('GetFree').args<{
  symbol: number;
}>() {}

export class Literal extends op('Literal').args<{
  type: AST.Literal['type'];
  value: AST.Literal['value'];
}>() {}
export class Concat extends op('Concat').void() {}
export class HasBlock extends op('HasBlock').args<{ symbol: number }>() {}
export class HasBlockParams extends op('HasBlockParams').args<{ symbol: number }>() {}
export class PrepareArray extends op('PrepareArray').args<{ entries: number }>() {}
export class EmptyParams extends op('EmptyParams').void() {}
export class PrepareObject extends op('PrepareObject').args<{ entries: number }>() {}

export type AnyArg = StaticArg | DynamicArg;

export type AnyAttr =
  | TrustingComponentAttr
  | TrustingAttr
  | ComponentAttr
  | DynamicAttr
  | StaticAttr
  | StaticComponentAttr;

// pass through
export import AppendComment = pass1.AppendComment;
export import OpenNamedBlock = pass1.OpenNamedBlock;
export import OpenSimpleElement = pass1.OpenSimpleElement;
export import OpenElementWithDynamicFeatures = pass1.OpenElementWithDynamicFeatures;
export import CloseElement = pass1.CloseElement;
export import CloseComponent = pass1.CloseComponent;
export import CloseNamedBlock = pass1.CloseNamedBlock;
export import CloseDynamicComponent = pass1.CloseDynamicComponent;

export type Expr =
  | Literal
  | GetPath
  | GetSymbol
  | GetFree
  | GetFreeWithContext
  | Concat
  | Helper
  | HasBlock
  | HasBlockParams;
export type Internal = PrepareArray | PrepareObject | EmptyParams;
export type Statement =
  | StartProgram
  | EndProgram
  | StartBlock
  | EndBlock
  | Debugger
  | Yield
  | AppendTrustedHTML
  | AppendTextNode
  | OpenComponent
  | StaticArg
  | DynamicArg
  | StaticAttr
  | StaticComponentAttr
  | ComponentAttr
  | DynamicAttr
  | TrustingComponentAttr
  | TrustingAttr
  | FlushElement
  | Modifier
  | InvokeBlock
  | AttrSplat
  | Partial
  | InElement
  | AppendComment
  | OpenNamedBlock
  | OpenSimpleElement
  | OpenElementWithDynamicFeatures
  | CloseElement
  | CloseComponent
  | CloseNamedBlock
  | CloseDynamicComponent;

export type Op = Expr | Internal | Statement;

export type OpTable = OpsTable<Op>;
export type ExprTable = OpsTable<Expr>;
export type InternalTable = OpsTable<Internal>;
export type StatementTable = OpsTable<Statement>;