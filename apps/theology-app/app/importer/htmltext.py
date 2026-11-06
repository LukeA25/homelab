"""XHTML parsing helpers shared by the format adapters.

Content documents are parsed as XML rather than HTML on purpose. EPUB files use
self-closing anchors like `<a id="v48016024"/>` to mark verse boundaries, and an
HTML parser would reinterpret those as open tags and swallow the rest of the
paragraph into the anchor. Parsing as XML keeps the anchor empty and leaves the
verse text where it belongs, in the anchor's tail.
"""

from __future__ import annotations

import re
from typing import Callable, Iterator, Optional

from lxml import etree

_PARSER = etree.XMLParser(recover=True, resolve_entities=False, huge_tree=True)

# A handful of named entities that appear in EPUBs but are not defined in XML.
_NAMED_ENTITIES = {
    "&nbsp;": "\u00a0",
    "&mdash;": "\u2014",
    "&ndash;": "\u2013",
    "&ldquo;": "\u201c",
    "&rdquo;": "\u201d",
    "&lsquo;": "\u2018",
    "&rsquo;": "\u2019",
    "&hellip;": "\u2026",
    "&copy;": "\u00a9",
}

WHITESPACE_RE = re.compile(r"\s+")


def parse_xhtml(data: bytes) -> Optional[etree._Element]:
    """Parse a content document and strip namespaces so tags are plain names."""
    text = data.decode("utf-8", "replace")
    for entity, replacement in _NAMED_ENTITIES.items():
        text = text.replace(entity, replacement)

    root = etree.fromstring(text.encode("utf-8"), _PARSER)
    if root is None:
        return None

    for element in root.iter():
        if isinstance(element.tag, str) and "}" in element.tag:
            element.tag = element.tag.split("}", 1)[1]
        for key in list(element.attrib):
            if "}" in key:
                element.attrib[key.split("}", 1)[1]] = element.attrib.pop(key)
    etree.cleanup_namespaces(root)
    return root


def body_of(root: etree._Element) -> etree._Element:
    body = root.find(".//body")
    return body if body is not None else root


def normalize(text: str) -> str:
    """Collapse whitespace and tidy spacing before punctuation."""
    text = text.replace("\u00a0", " ")
    text = WHITESPACE_RE.sub(" ", text).strip()
    text = re.sub(r"\s+([,;:.!?])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return text


def element_text(element: etree._Element) -> str:
    return normalize("".join(element.itertext()))


def has_class(element: etree._Element, *names: str) -> bool:
    classes = (element.get("class") or "").split()
    return any(name in classes for name in names)


def iter_events(
    element: etree._Element,
    skip: Optional[Callable[[etree._Element], bool]] = None,
) -> Iterator[tuple[str, object]]:
    """Walk the tree in document order.

    Yields ("start", element), ("text", str) and ("end", element). Skipped
    elements are not descended into, but their tail text is still emitted,
    which is what lets us drop a `<sup>24</sup>` verse number while keeping the
    verse text that follows it.
    """
    if skip is not None and skip(element):
        return
    yield ("start", element)
    if element.text:
        yield ("text", element.text)
    for child in element:
        yield from iter_events(child, skip)
        if child.tail:
            yield ("text", child.tail)
    yield ("end", element)


def drop_keeping_tail(element: etree._Element) -> None:
    """Remove an element from the tree while preserving its tail text."""
    parent = element.getparent()
    if parent is None:
        return
    tail = element.tail or ""
    previous = element.getprevious()
    if previous is not None:
        previous.tail = (previous.tail or "") + tail
    else:
        parent.text = (parent.text or "") + tail
    parent.remove(element)
