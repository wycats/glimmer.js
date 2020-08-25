import {
  SerializedInlineBlock,
  SerializedTemplateBlock,
  WireFormat as WF,
} from '@glimmer/interfaces';
import { AST } from '@glimmer/syntax';
import { DictSet } from '@glimmer/util';
import { isArgument, isAttribute, isFlushElement } from '@glimmer/wire-format';

export abstract class Block {
  public statements: WF.Statement[] = [];

  abstract toJSON(): Object;

  push(...statements: WF.Statement[]) {
    this.statements.push(...statements);
  }
}

export class InlineBlock extends Block {
  constructor(public table: AST.BlockSymbols) {
    super();
  }

  toJSON(): SerializedInlineBlock {
    return {
      statements: this.statements,
      parameters: this.table.slots,
    };
  }
}

export class NamedBlock extends InlineBlock {
  constructor(public name: string, table: AST.BlockSymbols) {
    super(table);
  }
}

export class TemplateBlock extends Block {
  public type = 'template';
  public yields = new DictSet<string>();
  public named = new DictSet<string>();
  public blocks: SerializedInlineBlock[] = [];
  public hasEval = false;

  constructor(private symbolTable: AST.ProgramSymbols) {
    super();
  }

  toJSON(): SerializedTemplateBlock {
    return {
      symbols: this.symbolTable.symbols,
      statements: this.statements,
      hasEval: this.hasEval,
      upvars: this.symbolTable.freeVariables,
    };
  }
}

export class ComponentBlock extends Block {
  public attributes: WF.Statements.Attribute[] = [];
  public arguments: WF.Statements.Argument[] = [];
  private inParams = true;
  public positionals: number[] = [];
  public blocks: Array<[string, SerializedInlineBlock]> = [];

  constructor(private tag: string, private table: AST.BlockSymbols, private selfClosing: boolean) {
    super();
  }

  push(...statements: WF.Statement[]) {
    for (let statement of statements) {
      if (this.inParams) {
        if (isFlushElement(statement)) {
          this.inParams = false;
        } else if (isArgument(statement)) {
          this.arguments.push(statement);
        } else if (isAttribute(statement)) {
          this.attributes.push(statement);
        } else {
          throw new Error('Compile Error: only parameters allowed before flush-element');
        }
      } else {
        this.statements.push(statement);
      }
    }
  }

  pushBlock(name: string, block: SerializedInlineBlock) {
    this.blocks.push([name, block]);
  }

  toJSON(): [string, WF.Statements.Attribute[], WF.Core.Hash, WF.Core.Blocks] {
    let blocks: WF.Core.Blocks;
    let args = this.arguments;
    let keys = args.map(arg => arg[1]);
    let values = args.map(arg => arg[2]);

    if (this.selfClosing) {
      blocks = null;
    } else if (this.blocks.length > 0) {
      let keys: string[] = [];
      let values: SerializedInlineBlock[] = [];

      for (let i = 0; i < this.blocks.length; i++) {
        let [key, value] = this.blocks[i];
        keys.push(key.slice(1));
        values.push(value);
      }
      blocks = [keys, values];
    } else {
      blocks = [
        ['default'],
        [
          {
            statements: this.statements,
            parameters: this.table.slots,
          },
        ],
      ];
    }

    return [this.tag, this.attributes, [keys, values], blocks];
  }
}

export class Template {
  public block: TemplateBlock;

  constructor(symbols: AST.ProgramSymbols) {
    this.block = new TemplateBlock(symbols);
  }

  toJSON(): SerializedTemplateBlock {
    return this.block.toJSON();
  }
}
