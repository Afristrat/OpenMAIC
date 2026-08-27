import type { Document, Element } from '@xmldom/xmldom';

export interface MathmlElement extends Element {
  readonly outerHTML?: string;
  toString(): string;
}

/** Convert a parsed Office MathML document into a MathML element. */
declare function omml2mathml(omml: Document): MathmlElement;

export = omml2mathml;
