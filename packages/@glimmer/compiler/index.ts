export { defaultId, precompile, precompileJSON, PrecompileOptions } from './lib/compiler';
export {
  ProgramSymbols,
  buildStatement,
  buildStatements,
  s,
  c,
  unicode,
  NEWLINE,
} from './lib/builder';
export { BuilderStatement, Builder } from './lib/builder-interface';

// exported only for tests
export { default as WireFormatDebugger } from './lib/wire-format-debug';

export * from './lib/location';
