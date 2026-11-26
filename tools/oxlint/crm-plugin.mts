/**
 * Local Oxlint rules (loaded from .oxlintrc.json `jsPlugins`; Node strips the types).
 *
 * crm/no-direct-effect: no `useEffect` / `useLayoutEffect` / `useInsertionEffect` from React,
 * whether imported by name or reached through a namespace/default import (`React.useEffect`).
 * See the `no-use-effect` skill. The one sanctioned wrapper, `useMountEffect`, disables it inline.
 * (`no-restricted-imports` with `importNames` also rejects every `import * as React`, which the
 * shadcn components use, so it can't express this.)
 */

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);

const MESSAGE =
  "No direct effects (no-use-effect skill): derive values during render, act in event handlers, load data in route beforeLoad/loader or useQuery, reset with `key`. For mount-time subscriptions to external systems use useMountEffect from @crm/ui/hooks/use-mount-effect.";

/** The subset of ESTree this rule reads. */
interface NamedNode {
  type: string;
  name?: string;
}

interface ImportSpecifierNode {
  type: string;
  local: NamedNode;
  imported?: NamedNode;
}

interface ImportDeclarationNode {
  source: { value?: string };
  specifiers: ImportSpecifierNode[];
}

interface MemberExpressionNode {
  object: NamedNode;
  property: NamedNode;
}

interface RuleContext {
  report(descriptor: { node: object; message: string }): void;
}

const identifierName = (node: NamedNode | undefined) =>
  node?.type === "Identifier" ? node.name : undefined;

const noDirectEffect = {
  meta: {
    type: "problem",
    docs: { description: "Disallow React effect hooks; use useMountEffect" },
  },
  create(context: RuleContext) {
    const reactBindings = new Set<string>();

    return {
      ImportDeclaration(node: ImportDeclarationNode) {
        if (node.source.value !== "react") return;

        for (const specifier of node.specifiers) {
          const imported = identifierName(specifier.imported);

          if (specifier.type === "ImportSpecifier" && imported && EFFECT_HOOKS.has(imported)) {
            context.report({ node: specifier, message: MESSAGE });
          } else if (specifier.type !== "ImportSpecifier" && specifier.local.name) {
            reactBindings.add(specifier.local.name);
          }
        }
      },
      MemberExpression(node: MemberExpressionNode) {
        const object = identifierName(node.object);
        const property = identifierName(node.property);

        if (object && reactBindings.has(object) && property && EFFECT_HOOKS.has(property)) {
          context.report({ node, message: MESSAGE });
        }
      },
    };
  },
};

export default {
  meta: { name: "crm" },
  rules: { "no-direct-effect": noDirectEffect },
};
