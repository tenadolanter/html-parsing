import { escapeText, escapeAttribute } from "entities/lib/escape.js";
import { TAG_NAMES as $, NS, hasUnescapedText } from "../common";
import DefaultAdapter from "../adapter";

const VOID_ELEMENTS = new Set([
  $.AREA,
  $.BASE,
  $.BASEFONT,
  $.BGSOUND,
  $.BR,
  $.COL,
  $.EMBED,
  $.FRAME,
  $.HR,
  $.IMG,
  $.INPUT,
  $.KEYGEN,
  $.LINK,
  $.META,
  $.PARAM,
  $.SOURCE,
  $.TRACK,
  $.WBR,
]);

function isVoidElement(node, options) {
  return (
    options.treeAdapter.isElementNode(node) &&
    options.treeAdapter.getNamespaceURI(node) === NS.HTML &&
    VOID_ELEMENTS.has(options.treeAdapter.getTagName(node))
  );
}

const defaultOpts = { treeAdapter: DefaultAdapter, scriptingEnabled: true };

export default function serialize(node, options) {
  const opts = { ...defaultOpts, ...options };

  if (isVoidElement(node, opts)) {
    return "";
  }

  return serializeChildNodes(node, opts);
}

export function SerializeOuter(node, options) {
  const opts = { ...defaultOpts, ...options };
  return serializeNode(node, opts);
}

function serializeChildNodes(parentNode, options) {
  let html = "";
  const container =
    options.treeAdapter.isElementNode(parentNode) &&
    options.treeAdapter.getTagName(parentNode) === $.TEMPLATE &&
    options.treeAdapter.getNamespaceURI(parentNode) === NS.HTML
      ? options.treeAdapter.getTemplateContent(parentNode)
      : parentNode;
  const childNodes = options.treeAdapter.getChildNodes(container);

  if (childNodes) {
    for (const currentNode of childNodes) {
      html += serializeNode(currentNode, options);
    }
  }

  return html;
}

function serializeNode(node, options) {
  if (options.treeAdapter.isElementNode(node)) {
    return serializeElement(node, options);
  }
  if (options.treeAdapter.isTextNode(node)) {
    return serializeTextNode(node, options);
  }
  if (options.treeAdapter.isCommentNode(node)) {
    return serializeCommentNode(node, options);
  }
  if (options.treeAdapter.isDocumentTypeNode(node)) {
    return serializeDocumentTypeNode(node, options);
  }
  return "";
}

function serializeElement(node, options) {
  const tn = options.treeAdapter.getTagName(node);

  return `<${tn}${serializeAttributes(node, options)}>${
    isVoidElement(node, options)
      ? ""
      : `${serializeChildNodes(node, options)}</${tn}>`
  }`;
}

function serializeAttributes(node, { treeAdapter }) {
  let html = "";
  for (const attr of treeAdapter.getAttrList(node)) {
    html += " ";

    if (attr.namespace) {
      switch (attr.namespace) {
        case NS.XML: {
          html += `xml:${attr.name}`;
          break;
        }
        case NS.XMLNS: {
          if (attr.name !== "xmlns") {
            html += "xmlns:";
          }

          html += attr.name;
          break;
        }
        case NS.XLINK: {
          html += `xlink:${attr.name}`;
          break;
        }
        default: {
          html += `${attr.prefix}:${attr.name}`;
        }
      }
    } else {
      html += attr.name;
    }

    html += `="${escapeAttribute(attr.value)}"`;
  }

  return html;
}

function serializeTextNode(node, options) {
  const { treeAdapter } = options;
  const content = treeAdapter.getTextNodeContent(node);
  const parent = treeAdapter.getParentNode(node);
  const parentTn =
    parent &&
    treeAdapter.isElementNode(parent) &&
    treeAdapter.getTagName(parent);

  return parentTn &&
    treeAdapter.getNamespaceURI(parent) === NS.HTML &&
    hasUnescapedText(parentTn, options.scriptingEnabled)
    ? content
    : escapeText(content);
}

function serializeCommentNode(node, { treeAdapter }) {
  return `<!--${treeAdapter.getCommentNodeContent(node)}-->`;
}

function serializeDocumentTypeNode(node, { treeAdapter }) {
  return `<!DOCTYPE ${treeAdapter.getDocumentTypeNodeName(node)}>`;
}
