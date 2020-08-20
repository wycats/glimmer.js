The Glimmer preprocessor is responsible for taking Handlebars templates and converting them into the Wire Format.

Today, it has three passes:

1. HIR (High-Level IR)
2. Symbol Allocation
3. MIR (Mid-Level IR)

# HIR

The high-level IR is a translation of the AST into a flatter structure.

Consider this Handlebars template:

```hbs
{{#if x.y}}
  hello
{{/if}}
```

Roughly speaking, it creates this AST:

```xml
<Template>
  <BlockStatement>
    <PathExpression original="if">
      <Part value="if" />
    </PathExpression>
    <Params>
      <PathExpression original="x.y">
        <Part value="x" />
        <Part value="y" />
      </PathExpression>
    </Params>
    <Hash />
    <Program>  hello&#10;</Program>
  </BlockStatement>
</Template>
```

The equivalent HIR looks like this:

```yaml
Root: &root
  size: 1

- startBlock: &Block
  blockParams: []
  symbols:
    parent: &root

- text:
  chars: "  hello\n"

- endBlock:
  for: &Block

- startProgram: &Program

```
