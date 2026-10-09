import { isValidElement, type ReactElement, type ReactNode } from "react";

/** The props every element in a tree may carry, as specs read them. */
type AnyProps = Record<string, unknown> & { children?: ReactNode };

/**
 * Every element in the tree `node` describes, in document order: each
 * element, then the elements among its children. Components in the tree are
 * not rendered, so a spec reads the elements a hook-free component returns,
 * props and handlers included, and calls those handlers itself.
 *
 * @param node - A component's returned tree.
 */
export function elementsIn(node: ReactNode): ReactElement<AnyProps>[] {
  const found: ReactElement<AnyProps>[] = [];
  const visit = (child: ReactNode): void => {
    if (Array.isArray(child)) {
      for (const item of child) visit(item);
      return;
    }
    if (!isValidElement<AnyProps>(child)) return;
    found.push(child);
    visit(child.props.children);
  };
  visit(node);
  return found;
}

/**
 * The one element in the tree `node` describes that carries `testId` as its
 * `data-testid`. Throws when there is none, or more than one.
 *
 * @param node - A component's returned tree.
 * @param testId - The `data-testid` to find.
 */
export function elementByTestId(node: ReactNode, testId: string): ReactElement<AnyProps> {
  const matches = elementsIn(node).filter((element) => element.props["data-testid"] === testId);
  if (matches.length !== 1) {
    throw new Error(`expected one element with data-testid "${testId}", found ${matches.length}`);
  }
  return matches[0] as ReactElement<AnyProps>;
}
