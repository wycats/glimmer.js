import { preprocess } from '@glimmer/syntax';
import TemplateCompiler, { CompileOptions } from './template-compiler';
import {
  Option,
  TemplateJavascript,
  SerializedTemplateWithLazyBlock,
  SerializedTemplate,
} from '@glimmer/interfaces';
import { PreprocessOptions } from '@glimmer/syntax';
import { SymbolAllocator } from './allocate-symbols';
import JavaScriptCompiler from './javascript-compiler';
import { LOCAL_SHOULD_LOG } from '@glimmer/local-debug-flags';
import { visit } from './pass1/index';

export interface TemplateIdFn {
  (src: string): Option<string>;
}

export interface PrecompileOptions extends CompileOptions, PreprocessOptions {
  id?: TemplateIdFn;
}

declare function require(id: string): any;

export const defaultId: TemplateIdFn = (() => {
  if (typeof require === 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require('crypto');

      let idFn: TemplateIdFn = (src) => {
        let hash = crypto.createHash('sha1');
        hash.update(src, 'utf8');
        // trim to 6 bytes of data (2^48 - 1)
        return hash.digest('base64').substring(0, 8);
      };

      idFn('test');

      return idFn;
    } catch (e) {}
  }

  return function idFn() {
    return null;
  };
})();

const defaultOptions: PrecompileOptions = {
  id: defaultId,
  meta: {},
};

/*
 * Compile a string into a template javascript string.
 *
 * Example usage:
 *     import { precompile } from '@glimmer/compiler';
 *     import { templateFactory } from 'glimer-runtime';
 *     let templateJs = precompile("Howdy {{name}}");
 *     let factory = templateFactory(new Function("return " + templateJs)());
 *     let template = factory.create(env);
 *
 * @method precompile
 * @param {string} string a Glimmer template string
 * @return {string} a template javascript string
 */
export function precompile1(string: string, options?: PrecompileOptions): TemplateJavascript;
export function precompile1(
  string: string,
  options: PrecompileOptions = defaultOptions
): TemplateJavascript {
  let ast = preprocess(string, options);
  let { meta } = options;
  let { block } = TemplateCompiler.compile(ast, string, options);
  let idFn = options.id || defaultId;
  let blockJSON = JSON.stringify(block.toJSON());
  let templateJSONObject: SerializedTemplateWithLazyBlock<unknown> = {
    id: idFn(JSON.stringify(meta) + blockJSON),
    block: blockJSON,
    meta,
  };

  // JSON is javascript
  return JSON.stringify(templateJSONObject);
}

/*
 * Compile a string into a template javascript string.
 *
 * Example usage:
 *     import { precompile } from '@glimmer/compiler';
 *     import { templateFactory } from 'glimer-runtime';
 *     let templateJs = precompile("Howdy {{name}}");
 *     let factory = templateFactory(new Function("return " + templateJs)());
 *     let template = factory.create(env);
 *
 * @method precompile
 * @param {string} string a Glimmer template string
 * @return {string} a template javascript string
 */
export function precompileJSON(
  string: string,
  options?: PrecompileOptions
): SerializedTemplate<unknown>;
export function precompileJSON(
  string: string,
  options: PrecompileOptions = defaultOptions
): SerializedTemplate<unknown> {
  let ast = preprocess(string, options);
  let { meta } = options;
  let opcodes = visit(string, ast);
  let { ops } = new SymbolAllocator(opcodes, null).process();

  let template = JavaScriptCompiler.process(ops, [], ast.symbols!, options);

  if (LOCAL_SHOULD_LOG) {
    console.log(`Template ->`, template);
  }

  return {
    block: template.block.toJSON(),
    meta,
  };
}

/*
 * Compile a string into a template javascript string.
 *
 * Example usage:
 *     import { precompile } from '@glimmer/compiler';
 *     import { templateFactory } from 'glimer-runtime';
 *     let templateJs = precompile("Howdy {{name}}");
 *     let factory = templateFactory(new Function("return " + templateJs)());
 *     let template = factory.create(env);
 *
 * @method precompile
 * @param {string} string a Glimmer template string
 * @return {string} a template javascript string
 */
export function precompile(string: string, options?: PrecompileOptions): TemplateJavascript;
export function precompile(
  string: string,
  options: PrecompileOptions = defaultOptions
): TemplateJavascript {
  let ast = preprocess(string, options);
  let { meta } = options;
  let opcodes = visit(string, ast);
  let { ops } = new SymbolAllocator(opcodes, null).process();

  let template = JavaScriptCompiler.process(ops, [], ast.symbols!, options);

  if (LOCAL_SHOULD_LOG) {
    console.log(`Template ->`, template);
  }

  let idFn = options.id || defaultId;
  let blockJSON = JSON.stringify(template.block.toJSON());
  let templateJSONObject: SerializedTemplateWithLazyBlock<unknown> = {
    id: idFn(JSON.stringify(meta) + blockJSON),
    block: blockJSON,
    meta,
  };

  // JSON is javascript
  return JSON.stringify(templateJSONObject);
}
