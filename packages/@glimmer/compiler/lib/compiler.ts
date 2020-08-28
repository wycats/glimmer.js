import { preprocess } from '@glimmer/syntax';
import {
  Option,
  TemplateJavascript,
  SerializedTemplateWithLazyBlock,
  SerializedTemplate,
} from '@glimmer/interfaces';
import { PreprocessOptions } from '@glimmer/syntax';
import { process } from './pass2';
import { LOCAL_SHOULD_LOG } from '@glimmer/local-debug-flags';
import { visit } from './pass1/index';
import { allocate } from './pass2/old';

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
export function precompileJSON(
  source: string,
  options?: PrecompileOptions
): SerializedTemplate<unknown>;
export function precompileJSON(
  string: string,
  options: PrecompileOptions = defaultOptions
): SerializedTemplate<unknown> {
  let ast = preprocess(string, options);
  let { meta } = options;
  let opcodes = visit(string, ast);
  let ops = allocate(opcodes, string);

  let template = process(ops, ast.symbols!, string, options);

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
  source: string,
  options: PrecompileOptions = defaultOptions
): TemplateJavascript {
  let ast = preprocess(source, options);
  let { meta } = options;
  let opcodes = visit(source, ast);
  let ops = allocate(opcodes, source);

  let template = process(ops, ast.symbols!, source, options);

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
