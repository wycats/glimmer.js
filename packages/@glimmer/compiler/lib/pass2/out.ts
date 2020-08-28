import { ExpressionContext, Expressions, SexpOpcodes as WireOp } from '@glimmer/interfaces';
import { SourceSlice } from '../pass1/ops';
import * as shared from '../shared/op';

/** UTILITY TYPES */
export type SexpExpressionContext =
  | WireOp.GetFreeInAppendSingleId
  | WireOp.GetFreeInExpression
  | WireOp.GetFreeInCallHead
  | WireOp.GetFreeInBlockHead
  | WireOp.GetFreeInModifierHead
  | WireOp.GetFreeInComponentHead;

/** -- TEMPORARY -- */

export class Params extends shared.op('Params').args<{ list: Expr[] }>() {}
export class EmptyParams extends shared.op('EmptyParams').void() {}
export class Hash extends shared.op('Hash').args<{ pairs: HashPair[] }>() {}
export class HashPair extends shared.op('HashPair').args<{ key: SourceSlice; value: Expr }>() {}
export class EmptyHash extends shared.op('EmptyHash').void() {}

export type AnyParams = Params | EmptyParams;
export type AnyHash = Hash | EmptyHash;
export type Temporary = Params | EmptyParams | Hash | HashPair | EmptyHash | SourceSlice;

/** -- EXPRESSIONS -- */

export class Undefined extends shared.op('Undefined').void() {}
export class Value extends shared.op('Value').args<{ value: Expressions.Value }>() {}

export class GetSymbol extends shared.op('GetSymbol').args<{ symbol: number }>() {}
export class GetContextualFree extends shared
  .op('GetContextualFree')
  .args<{ symbol: number; context: SexpExpressionContext }>() {}
export class GetPath extends shared.op('GetPath').args<{ head: Expr; tail: SourceSlice[] }>() {}

export class Concat extends shared.op('Concat').args<{ parts: Params }>() {}
export class Call extends shared
  .op('Call')
  .args<{ head: Expr; params: AnyParams; hash: AnyHash }>() {}

/** strict mode */
export class GetFree extends shared.op('GetFree').args<{ symbol: number }>() {}

export type Expr =
  | Undefined
  | Value
  | GetSymbol
  | GetContextualFree
  | GetFree
  | GetPath
  | Concat
  | Call;

/** -- STATEMENTS -- */

export class TrustingAppend extends shared.op('TrustingAppend').args<{ value: Expr }>() {}
export class Append extends shared.op('Append').args<{ value: Expr }>() {}

export type Statement = TrustingAppend | Append;

/** -- GROUPINGS -- */

export type GetVar = GetSymbol | GetFree | GetContextualFree;
export type StackValue = Temporary | Expr;
export type Op = Statement | Expr;
