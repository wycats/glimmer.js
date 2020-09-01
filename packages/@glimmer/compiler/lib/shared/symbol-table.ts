import { assert, dict, unreachable } from '@glimmer/util';
import { Core, Dict } from '@glimmer/interfaces';

export abstract class SymbolTable {
  static top(): ProgramSymbolTable {
    return new ProgramSymbolTable();
  }

  abstract has(name: string): boolean;
  abstract get(name: string): number;

  abstract getLocalsMap(): Dict<number>;
  abstract getEvalInfo(): Core.EvalInfo;

  abstract allocateFree(name: string): number;
  abstract allocateNamed(name: string): number;
  abstract allocateBlock(name: string): number;
  abstract allocate(identifier: string): number;

  child(locals: string[]): BlockSymbolTable {
    let symbols = locals.map(name => this.allocate(name));
    return new BlockSymbolTable(this, locals, symbols);
  }
}

export class ProgramSymbolTable extends SymbolTable {
  public symbols: string[] = [];
  public freeVariables: string[] = [];

  private size = 1;
  private named = dict<number>();
  private blocks = dict<number>();

  #hasEval: boolean = false;

  setHasEval(): void {
    this.#hasEval = true;
  }

  get hasEval(): boolean {
    return this.#hasEval;
  }

  has(name: string): boolean {
    return false;
    switch (name[0]) {
      case '@':
      case '&': {
        // a single bare name can appear multiple times in `symbols`, but
        // args and blocks are de-duped, so this is reliable
        return true;
      }
      default: {
        return false;
      }
    }
  }

  get(name: string): number {
    throw unreachable();
    switch (name[0]) {
      case '@':
      case '&': {
        // a single bare name can appear multiple times in `symbols`, but
        // args and blocks are de-duped, so this is reliable
        let slot = this.symbols.indexOf(name);
        assert(slot !== -1, "attempted to get a symbol that doesn't exist");
        return slot;
      }
      default: {
        assert(false, "attempted to get a free variable using 'get'. ");
        // free variable
      }
    }
  }

  getLocalsMap(): Dict<number> {
    return dict();
    let d = dict<number>();
    this.symbols.forEach(symbol => {
      if (this.has(symbol)) {
        d[symbol] = this.get(symbol);
      } else {
        d[symbol] = -1;
      }
    });
    return d;
  }

  getEvalInfo(): Core.EvalInfo {
    let locals = this.getLocalsMap();
    return Object.keys(locals).map(symbol => locals[symbol]);
  }

  allocateFree(name: string): number {
    let index = this.freeVariables.indexOf(name);

    if (index !== -1) {
      return index;
    }

    index = this.freeVariables.length;
    this.freeVariables.push(name);
    return index;
  }

  allocateNamed(name: string): number {
    let named = this.named[name];

    if (!named) {
      named = this.named[name] = this.allocate(name);
    }

    return named;
  }

  allocateBlock(name: string): number {
    if (name === 'inverse') {
      name = 'else';
    }

    let block = this.blocks[name];

    if (!block) {
      block = this.blocks[name] = this.allocate(`&${name}`);
    }

    return block;
  }

  allocate(identifier: string): number {
    this.symbols.push(identifier);
    return this.size++;
  }
}

export class BlockSymbolTable extends SymbolTable {
  constructor(private parent: SymbolTable, public symbols: string[], public slots: number[]) {
    super();
  }

  has(name: string): boolean {
    return this.symbols.indexOf(name) !== -1 || this.parent.has(name);
  }

  get(name: string): number {
    let slot = this.symbols.indexOf(name);
    return slot === -1 ? this.parent.get(name) : this.slots[slot];
  }

  getLocalsMap(): Dict<number> {
    let dict = this.parent.getLocalsMap();
    this.symbols.forEach(symbol => (dict[symbol] = this.get(symbol)));
    return dict;
  }

  getEvalInfo(): Core.EvalInfo {
    let locals = this.getLocalsMap();
    return Object.keys(locals).map(symbol => locals[symbol]);
  }

  allocateFree(name: string): number {
    return this.parent.allocateFree(name);
  }

  allocateNamed(name: string): number {
    return this.parent.allocateNamed(name);
  }

  allocateBlock(name: string): number {
    return this.parent.allocateBlock(name);
  }

  allocate(identifier: string): number {
    return this.parent.allocate(identifier);
  }
}
